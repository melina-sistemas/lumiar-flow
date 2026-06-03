import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { URL } from "node:url";
import { loadEnvFile } from "./config/load-env.js";
import { getSupabaseConfig } from "./config/supabase-config.js";
import { createAdminStateStore } from "./data/admin-state-store.js";
import { createDevelopmentPlanCatalog } from "./data/development-plan-data.js";
import { createLoan } from "./modules/loans/runtime/create-loan.js";
import { InMemoryLoanRepository } from "./modules/loans/runtime/in-memory-loan-repository.js";
import { returnLoan } from "./modules/loans/runtime/return-loan.js";
import { SupabaseLoanRepository } from "./modules/loans/runtime/supabase-loan-repository.js";
import { initServerMonitoring } from "./monitoring/sentry.js";
import {
  buildAuthCookie,
  buildClearedAuthCookie,
  getAuthConfig,
  getSessionTokenFromRequest,
  hashPassword,
  issueSessionToken,
  normalizeUserRole,
  normalizeUserStatus,
  sanitizeUser,
  verifyPassword,
  verifySessionToken
} from "./security/auth.js";

loadEnvFile();
const sentry = initServerMonitoring();

const repository = createRepository();
const adminStateStore = createAdminStateStore();
await ensureBootstrapAdmin(adminStateStore);
const server = createApiServer(repository, adminStateStore);

export { server };
export default server;

export function createApiServer(repository, adminStateStore) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = normalizeRequestPath(url.pathname);
    response.__corsOrigin = resolveCorsOrigin(request.headers.origin ?? request.headers.Origin ?? "");

    try {
      if (request.method === "OPTIONS") {
        return sendJson(response, 204, null);
      }

      if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
        return sendJson(response, 200, {
          status: "ok",
          message: "API da biblioteca ativa."
        });
      }

      if (request.method === "POST" && pathname === "/auth/register") {
        const body = await readJsonBody(request);
        return handleRegister(response, body, adminStateStore, repository);
      }

      if (request.method === "POST" && pathname === "/auth/login") {
        const body = await readJsonBody(request);
        return handleLogin(response, body, adminStateStore);
      }

      if (request.method === "POST" && pathname === "/auth/logout") {
        return handleLogout(response);
      }

      if (request.method === "GET" && pathname === "/auth/me") {
        return handleCurrentSession(response, request, adminStateStore);
      }

      if (request.method === "GET" && pathname === "/seed") {
        const snapshot = await repository.getLibrarySnapshot();
        const persistedAdminState = await adminStateStore.read();
        const mergedBooks = mergeBooks(snapshot.books, persistedAdminState.state.books);

        return sendJson(response, 200, {
          ...snapshot,
          books: mergedBooks,
          adminState: persistedAdminState.state,
          adminStateUpdatedAt: persistedAdminState.updatedAt
        });
      }

      if (request.method === "GET" && pathname === "/admin/users/pending") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const persistedAdminState = await adminStateStore.read();
        const pendingUsers = persistedAdminState.state.users.filter(
          (user) => normalizeUserStatus(user.status ?? user.accessStatus) === "pending"
        );

        return sendJson(response, 200, {
          success: true,
          users: pendingUsers.map(sanitizeUser)
        });
      }

      if (request.method === "GET" && pathname === "/admin/state") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);

        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const persistedAdminState = await adminStateStore.read();

        return sendJson(response, 200, {
          success: true,
          adminState: persistedAdminState.state,
          adminStateUpdatedAt: persistedAdminState.updatedAt
        });
      }

      if (request.method === "POST" && pathname === "/loans") {
        const body = await readJsonBody(request);
        const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
          allowPending: false
        });

        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        if (!body.userId || !body.bookId) {
          return sendJson(response, 400, {
            success: false,
            error: {
              code: "invalid_request",
              message: "Informe userId e bookId."
            }
          });
        }

        if (
          currentUser.user.role !== "admin" &&
          String(body.userId) !== String(currentUser.user.id)
        ) {
          return sendJson(response, 403, {
            success: false,
            error: {
              code: "forbidden",
              message: "Voce so pode criar emprestimos para o seu proprio usuario."
            }
          });
        }

        const result = await createLoan(
          {
            userId: body.userId,
            bookId: body.bookId,
            borrowedAt: body.borrowedAt
          },
          {
            repository: createAuthenticatedRepository(repository, adminStateStore)
          }
        );

        if (result.success) {
          try {
            await mirrorLoanRequestIntoAdminState(adminStateStore, body, result.data.loan);
          } catch (error) {
            sentry.captureException(error);
          }
        }

        return sendUseCaseResult(response, result, 201);
      }

      const confirmPickupMatch = pathname.match(/^\/loans\/([^/]+)\/confirm-pickup$/);

      if (request.method === "POST" && confirmPickupMatch) {
        const body = await readJsonBody(request);
        const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
          allowPending: false
        });

        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const currentState = await adminStateStore.read();
        const normalizedState = normalizeAdminState(currentState.state);
        const targetLoan = (Array.isArray(normalizedState.loans) ? normalizedState.loans : []).find(
          (loan) => String(loan.id) === String(confirmPickupMatch[1])
        );

        if (!targetLoan) {
          return sendJson(response, 404, {
            success: false,
            error: {
              code: "loan_not_found",
              message: "Empréstimo não encontrado."
            }
          });
        }

        if (
          currentUser.user.role !== "admin" &&
          String(currentUser.user.id) !== String(targetLoan.userId)
        ) {
          return sendJson(response, 403, {
            success: false,
            error: {
              code: "forbidden",
              message: "Você só pode confirmar a retirada do seu próprio livro."
            }
          });
        }

        const normalizedLoan = normalizeAdminLoan(targetLoan);
        if (
          !["AGUARDANDO_RETIRADA", "AGUARDANDO_CONFIRMACAO"].includes(
            normalizeLoanStatus(normalizedLoan.status)
          )
        ) {
          return sendJson(response, 400, {
            success: false,
            error: {
              code: "invalid_loan_status",
              message: "Este empréstimo ainda não está liberado para confirmação."
            }
          });
        }

        const confirmedAt = String(body.confirmedAt ?? new Date().toISOString()).trim();
        const updatedLoan = normalizeAdminLoan({
          ...normalizedLoan,
          status: "EMPRESTADO",
          borrowedAt: confirmedAt,
          returnedAt: ""
        });

        await repository.saveLoan(updatedLoan);
        await mirrorLoanPickupIntoAdminState(adminStateStore, updatedLoan, currentUser.user);

        return sendJson(response, 200, {
          success: true,
          loan: updatedLoan,
          message: "Retirada confirmada com sucesso."
        });
      }

      const returnMatch = pathname.match(/^\/loans\/([^/]+)\/return$/);

      if (request.method === "POST" && returnMatch) {
        const body = await readJsonBody(request);
        const answers = normalizeAnswers(body);
        const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
          allowPending: false
        });

        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const result = await returnLoan(
          {
            loanId: returnMatch[1],
            returnedAt: body.returnedAt,
            answers
          },
          {
            repository: createAuthenticatedRepository(repository, adminStateStore)
          }
        );

        return sendUseCaseResult(response, result, 200);
      }

      if (request.method === "POST" && pathname === "/waitlists") {
        const body = await readJsonBody(request);
        return handleJoinWaitlist(response, body, adminStateStore, repository, request);
      }

      const waitlistMatch = pathname.match(/^\/waitlists\/([^/]+)$/);

      if (request.method === "DELETE" && waitlistMatch) {
        return handleRemoveWaitlistEntry(response, waitlistMatch[1], adminStateStore, repository, request);
      }

      if (request.method === "POST" && pathname === "/admin/books/import-pdf") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);

        if (!body.extractedText && !body.pdfUrl) {
          return sendJson(response, 400, {
            success: false,
            error: {
              code: "invalid_request",
              message: "Envie extractedText ou pdfUrl para importar os livros."
            }
          });
        }

        const importedBooks = await importBooksFromImportedPdfText(body);

        return sendJson(response, 200, {
          success: true,
          importedBooks
        });
      }

      if (request.method === "POST" && pathname === "/admin/books/sync") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        const nextBooks = Array.isArray(body.books) ? body.books : [];

        const currentState = await adminStateStore.read();
        const nextState = {
          ...currentState.state,
          books: nextBooks
        };
        const savedState = await adminStateStore.write(nextState);

        return sendJson(response, 200, {
          success: true,
          books: nextBooks.length,
          adminStateUpdatedAt: savedState.updatedAt
        });
      }

      if (request.method === "POST" && pathname === "/admin/state") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        const nextState = normalizeAdminState(body.state ?? body);
        const baseUpdatedAt = String(body.baseUpdatedAt ?? body.adminStateUpdatedAt ?? "").trim();
        const currentState = await adminStateStore.read();

        if (currentState.updatedAt && baseUpdatedAt !== currentState.updatedAt) {
          return sendJson(response, 409, {
            success: false,
            error: {
              code: "stale_admin_state",
              message:
                "O painel administrativo foi atualizado em outro navegador. Recarregue a página para sincronizar as alterações."
            }
          });
        }

        const savedState = await adminStateStore.write(nextState);

        return sendJson(response, 200, {
          success: true,
          adminStateUpdatedAt: savedState.updatedAt
        });
      }

      const approveMatch = pathname.match(/^\/admin\/users\/([^/]+)\/approve$/);

      if (request.method === "POST" && approveMatch) {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        const updatedUser = await updateAdminStateUser(adminStateStore, approveMatch[1], (user) => ({
          ...user,
          role: normalizeUserRole(user.role),
          status: "approved",
          accessStatus: "approved",
          approvedAt: new Date().toISOString(),
          rejectedAt: null,
          rejectionReason: "",
          updatedAt: new Date().toISOString(),
          approvedBy: currentUser.user.id,
          approvalNote: body.note ?? ""
        }));

        if (!updatedUser) {
          return sendJson(response, 404, {
            success: false,
            error: {
              code: "user_not_found",
              message: "Usuario nao encontrado."
            }
          });
        }

        return sendJson(response, 200, {
          success: true,
          user: sanitizeUser(updatedUser)
        });
      }

      const rejectMatch = pathname.match(/^\/admin\/users\/([^/]+)\/reject$/);

      if (request.method === "POST" && rejectMatch) {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        const updatedUser = await updateAdminStateUser(adminStateStore, rejectMatch[1], (user) => ({
          ...user,
          status: "rejected",
          accessStatus: "rejected",
          rejectedAt: new Date().toISOString(),
          approvedAt: null,
          rejectionReason: body.reason ?? "",
          updatedAt: new Date().toISOString(),
          rejectedBy: currentUser.user.id
        }));

        if (!updatedUser) {
          return sendJson(response, 404, {
            success: false,
            error: {
              code: "user_not_found",
              message: "Usuario nao encontrado."
            }
          });
        }

        return sendJson(response, 200, {
          success: true,
          user: sanitizeUser(updatedUser)
        });
      }

      if (request.method === "POST" && pathname === "/auth/password") {
        const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
          allowPending: false
        });

        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        const newPassword = String(body.newPassword ?? "").trim();

        if (newPassword.length < 8) {
          return sendJson(response, 400, {
            success: false,
            error: {
              code: "invalid_request",
              message: "A nova senha precisa ter pelo menos 8 caracteres."
            }
          });
        }

        const updatedUser = await updateAdminStateUser(adminStateStore, currentUser.user.id, (user) => {
          const nextPassword = hashPassword(newPassword);

          return {
            ...user,
            ...nextPassword,
            mustChangePassword: false,
            tokenVersion: Number(user.tokenVersion ?? 0) + 1,
            updatedAt: new Date().toISOString()
          };
        });

        if (!updatedUser) {
          return sendJson(response, 404, {
            success: false,
            error: {
              code: "user_not_found",
              message: "Usuario nao encontrado."
            }
          });
        }

        const session = issueSessionToken(updatedUser, getAuthConfig());
        response.setHeader("Set-Cookie", buildAuthCookie(session.token, getAuthConfig()));

        return sendJson(response, 200, {
          success: true,
          user: sanitizeUser(updatedUser),
          session: {
            token: session.token,
            expiresAt: session.expiresAt,
            status: updatedUser.status ?? updatedUser.accessStatus
          }
        });
      }

      if (request.method === "POST" && pathname === "/admin/users") {
        const currentUser = await requireAuthenticatedAdmin(request, adminStateStore, repository);
        if (!currentUser.ok) {
          return sendJson(response, currentUser.statusCode, currentUser.payload);
        }

        const body = await readJsonBody(request);
        return handleCreateManagedUser(response, body, adminStateStore, repository, currentUser.user);
      }

      return sendJson(response, 404, {
        success: false,
        error: {
          code: "not_found",
          message: "Rota nao encontrada."
        }
      });
    } catch (error) {
      sentry?.captureException(error);

      return sendJson(response, 500, {
        success: false,
        error: {
          code: "internal_error",
          message: "Erro interno da API.",
          details: {
            message: error instanceof Error ? error.message : String(error)
          }
        }
      });
    }
  });
}

function normalizeRequestPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/api") {
    return "/";
  }

  if (normalized.startsWith("/api/")) {
    return normalized.slice(4) || "/";
  }

  return normalized;
}

function normalizeAnswers(body) {
  if (body.answers && typeof body.answers === "object") {
    return body.answers;
  }

  return {
    learning: body.learning ?? "",
    application: body.application ?? "",
    example: body.example ?? ""
  };
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody);
}

async function handleRegister(response, body, adminStateStore, repository) {
  const fullName = String(body.fullName ?? body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();

  if (!fullName || !email || !password) {
    return sendJson(response, 400, {
      success: false,
      error: {
        code: "invalid_request",
        message: "Informe nome, email e senha para criar a conta."
      }
    });
  }

  const currentState = await adminStateStore.read();
  const existingUser = findUserRecord(currentState.state.users, email);
  const snapshot = await repository.getLibrarySnapshot();
  const repositoryUser = findUserRecord(snapshot.users, email);

  if (existingUser || repositoryUser) {
    return sendJson(response, 409, {
      success: false,
      error: {
        code: "duplicate_user",
        message: "Ja existe um cadastro com este e-mail."
      }
    });
  }

  const nextUser = createAuthUserRecord({
    id: `user-${randomUUID()}`,
    name: fullName,
    email,
    company: String(body.company ?? "").trim(),
    department: String(body.department ?? "").trim(),
    cpf: String(body.cpf ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    birthDate: String(body.birthDate ?? "").trim(),
    role: "user",
    level: "bronze",
    status: "pending",
    password,
    createdByAdmin: false,
    mustChangePassword: false
  });

  const nextState = {
    ...currentState.state,
    users: [nextUser, ...(currentState.state.users ?? [])]
  };
  const savedState = await adminStateStore.write(nextState);
  const session = issueSessionToken(nextUser, getAuthConfig());

  response.setHeader("Set-Cookie", buildAuthCookie(session.token, getAuthConfig()));

  return sendJson(response, 201, {
    success: true,
    user: sanitizeUser(nextUser),
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
      status: nextUser.status
    },
    adminStateUpdatedAt: savedState.updatedAt,
    message: "Seu cadastro está aguardando aprovação do administrador."
  });
}

async function handleLogin(response, body, adminStateStore) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  const bootstrapEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "").trim();
  const canRepairBootstrapAdmin =
    Boolean(bootstrapEmail) &&
    Boolean(bootstrapPassword) &&
    email === bootstrapEmail;

  if (!email || !password) {
    return sendJson(response, 400, {
      success: false,
      error: {
        code: "invalid_request",
        message: "Informe e-mail e senha."
      }
    });
  }

  let currentState = await adminStateStore.read();
  let user = findUserRecord(currentState.state.users, email);

  if (!user && canRepairBootstrapAdmin) {
    await ensureBootstrapAdmin(adminStateStore);
    currentState = await adminStateStore.read();
    user = findUserRecord(currentState.state.users, email);
  }

  if (!user) {
    return sendJson(response, 401, {
      success: false,
      error: {
        code: "invalid_credentials",
        message: "E-mail ou senha inválidos."
      }
    });
  }

  const hasSecurePassword = Boolean(user.passwordHash && user.passwordSalt);
  let isPasswordValid = hasSecurePassword
    ? verifyPassword(password, user.passwordHash, user.passwordSalt)
    : String(user.password ?? "").trim() === password;

  if (!isPasswordValid && canRepairBootstrapAdmin) {
    await ensureBootstrapAdmin(adminStateStore);
    currentState = await adminStateStore.read();
    user = findUserRecord(currentState.state.users, email);
    const repairedHasSecurePassword = Boolean(user?.passwordHash && user?.passwordSalt);

    isPasswordValid = repairedHasSecurePassword
      ? verifyPassword(password, user.passwordHash, user.passwordSalt)
      : String(user?.password ?? "").trim() === password;
  }

  if (!isPasswordValid) {
    return sendJson(response, 401, {
      success: false,
      error: {
        code: "invalid_credentials",
        message: "E-mail ou senha inválidos."
      }
    });
  }

  const status = normalizeUserStatus(user.status ?? user.accessStatus);

  if (status === "blocked" || status === "rejected") {
    return sendJson(response, 403, {
      success: false,
      error: {
        code: "account_blocked",
        message:
          status === "blocked"
            ? "Seu acesso está bloqueado no momento."
            : "Seu cadastro foi recusado pelo administrador."
      }
    });
  }

  const normalizedUser = {
    ...user,
    status,
    accessStatus: status,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await adminStateStore.write({
    ...currentState.state,
    users: upsertUserRecord(currentState.state.users, normalizedUser)
  });

  const session = issueSessionToken(normalizedUser, getAuthConfig());
  response.setHeader("Set-Cookie", buildAuthCookie(session.token, getAuthConfig()));

  return sendJson(response, 200, {
    success: true,
    user: sanitizeUser(normalizedUser),
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
      status
    },
    message:
      status === "pending"
        ? "Seu cadastro está aguardando aprovação do administrador."
        : "Login realizado com sucesso."
  });
}

function handleLogout(response) {
  response.setHeader("Set-Cookie", buildClearedAuthCookie(getAuthConfig()));

  return sendJson(response, 200, {
    success: true,
    message: "Voce saiu da sua conta."
  });
}

async function handleCurrentSession(response, request, adminStateStore) {
  const session = await resolveSessionFromRequest(request, adminStateStore);

  if (!session.ok) {
    if (session.clearCookie) {
      response.setHeader("Set-Cookie", buildClearedAuthCookie(getAuthConfig()));
    }

    return sendJson(response, 200, {
      success: true,
      user: null,
      session: null
    });
  }

  return sendJson(response, 200, {
    success: true,
    user: sanitizeUser(session.user),
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
      status: session.user.status ?? session.user.accessStatus
    }
  });
}

async function handleCreateManagedUser(response, body, adminStateStore, repository, currentAdminUser) {
  const name = String(body.name ?? body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const temporaryPassword = String(body.password ?? body.cpf ?? body.temporaryPassword ?? "").trim();

  if (!name || !email || !temporaryPassword) {
    return sendJson(response, 400, {
      success: false,
      error: {
        code: "invalid_request",
        message: "Informe nome, email e senha temporaria para criar o usuário."
      }
    });
  }

  const currentState = await adminStateStore.read();
  const existingUser = findUserRecord(currentState.state.users, email);
  const snapshot = await repository.getLibrarySnapshot();
  const repositoryUser = findUserRecord(snapshot.users, email);

  if (existingUser || repositoryUser) {
    return sendJson(response, 409, {
      success: false,
      error: {
        code: "duplicate_user",
        message: "Ja existe um cadastro com este e-mail."
      }
    });
  }

  const nextUser = createAuthUserRecord({
    id: `user-${randomUUID()}`,
    name,
    email,
    cpf: String(body.cpf ?? "").trim(),
    company: String(body.company ?? "").trim(),
    department: String(body.department ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    birthDate: String(body.birthDate ?? "").trim(),
    role: normalizeUserRole(body.role),
    level: body.level ?? "bronze",
    status: "approved",
    password: temporaryPassword,
    createdByAdmin: true,
    mustChangePassword: true,
    approvedAt: new Date().toISOString(),
    approvedBy: currentAdminUser.id
  });

  await adminStateStore.write({
    ...currentState.state,
    users: [nextUser, ...(currentState.state.users ?? [])]
  });

  return sendJson(response, 201, {
    success: true,
    user: sanitizeUser(nextUser),
    message: "Usuário criado com sucesso. Ele deverá trocar a senha no primeiro acesso."
  });
}

async function requireAuthenticatedUser(request, adminStateStore, repository, options = {}) {
  const session = await resolveSessionFromRequest(request, adminStateStore);

  if (!session.ok) {
    return {
      ok: false,
      statusCode: 401,
      payload: {
        success: false,
        error: {
          code: "unauthorized",
          message: "Faça login para continuar."
        }
      }
    };
  }

  const userStatus = normalizeUserStatus(session.user.status ?? session.user.accessStatus);

  if (!options.allowPending && userStatus === "pending") {
    return {
      ok: false,
      statusCode: 403,
      payload: {
        success: false,
        error: {
          code: "pending_approval",
          message: "Seu cadastro está aguardando aprovação do administrador."
        }
      }
    };
  }

  if (userStatus === "blocked" || userStatus === "rejected") {
    return {
      ok: false,
      statusCode: 403,
      payload: {
        success: false,
        error: {
          code: "account_blocked",
          message:
            userStatus === "blocked"
              ? "Seu acesso está bloqueado no momento."
              : "Seu cadastro foi recusado pelo administrador."
        }
      }
    };
  }

  return {
    ok: true,
    user: session.user,
    session: session.session,
    repository: createAuthenticatedRepository(repository, adminStateStore)
  };
}

async function requireAuthenticatedAdmin(request, adminStateStore, repository) {
  const current = await requireAuthenticatedUser(request, adminStateStore, repository, {
    allowPending: false
  });

  if (!current.ok) {
    return current;
  }

  const role = normalizeUserRole(current.user.role);

  if (role !== "admin") {
    return {
      ok: false,
      statusCode: 403,
      payload: {
        success: false,
        error: {
          code: "forbidden",
          message: "Apenas administradores podem acessar esta área."
        }
      }
    };
  }

  return current;
}

async function resolveSessionFromRequest(request, adminStateStore) {
  const authConfig = getAuthConfig();
  const token = getSessionTokenFromRequest(request, authConfig);
  const payload = verifySessionToken(token, authConfig);

  if (!payload?.sub) {
    return {
      ok: false,
      clearCookie: Boolean(token)
    };
  }

  const currentState = await adminStateStore.read();
  const user = findUserRecord(currentState.state.users, payload.sub);

  if (!user) {
    return {
      ok: false,
      clearCookie: true
    };
  }

  if (Number(user.tokenVersion ?? 0) !== Number(payload.tokenVersion ?? 0)) {
    return {
      ok: false,
      clearCookie: true
    };
  }

  const sessionUser = {
    ...user,
    status: normalizeUserStatus(user.status ?? user.accessStatus),
    accessStatus: normalizeUserStatus(user.accessStatus ?? user.status)
  };

  const status = normalizeUserStatus(sessionUser.status ?? sessionUser.accessStatus);

  if (status === "blocked" || status === "rejected") {
    return {
      ok: false,
      clearCookie: true
    };
  }

  return {
    ok: true,
    user: sessionUser,
    session: {
      token,
      expiresAt: new Date(Number(payload.exp) * 1000).toISOString()
    }
  };
}

function createAuthenticatedRepository(repository, adminStateStore) {
  return {
    async findUserById(userId) {
      const currentState = await adminStateStore.read();
      const adminUser = findUserRecord(currentState.state.users, userId);

      if (adminUser) {
        await repository.updateUser(adminUser);
        return adminUser;
      }

      return repository.findUserById(userId);
    },
    async findBookById(bookId) {
      return repository.findBookById(bookId);
    },
    async findLoanById(loanId) {
      return repository.findLoanById(loanId);
    },
    async getLibrarySnapshot() {
      return repository.getLibrarySnapshot();
    },
    async saveLoan(loan) {
      return repository.saveLoan(loan);
    },
    async saveLoanReturn(returnRecord) {
      return repository.saveLoanReturn(returnRecord);
    },
    async updateUser(user) {
      const currentState = await adminStateStore.read();
      const users = upsertUserRecord(currentState.state.users, user);

      await adminStateStore.write({
        ...currentState.state,
        users
      });

      await repository.updateUser(user);
    },
    async updateBook(book) {
      return repository.updateBook(book);
    }
  };
}

async function updateAdminStateUser(adminStateStore, userIdOrEmail, updater) {
  const currentState = await adminStateStore.read();
  const index = currentState.state.users.findIndex((user) => {
    const normalizedEmail = String(user.email ?? "").trim().toLowerCase();
    return String(user.id) === String(userIdOrEmail) || normalizedEmail === String(userIdOrEmail).trim().toLowerCase();
  });

  if (index < 0) {
    return null;
  }

  const currentUser = currentState.state.users[index];
  const nextUser = {
    ...currentUser,
    ...updater(currentUser)
  };
  const nextUsers = currentState.state.users.slice();
  nextUsers[index] = nextUser;

  await adminStateStore.write({
    ...currentState.state,
    users: nextUsers
  });

  return nextUser;
}

function findUserRecord(users = [], identifier = "") {
  const normalized = String(identifier ?? "").trim().toLowerCase();

  return (
    users.find((user) => String(user.id) === String(identifier)) ??
    users.find((user) => String(user.email ?? "").trim().toLowerCase() === normalized) ??
    null
  );
}

function upsertUserRecord(users = [], user) {
  const nextUsers = Array.isArray(users) ? users.slice() : [];
  const index = nextUsers.findIndex(
    (item) =>
      String(item.id) === String(user.id) ||
      String(item.email ?? "").trim().toLowerCase() === String(user.email ?? "").trim().toLowerCase()
  );

  if (index >= 0) {
    nextUsers[index] = {
      ...nextUsers[index],
      ...user
    };
    return nextUsers;
  }

  return [user, ...nextUsers];
}

function createAuthUserRecord(input) {
  const now = new Date().toISOString();
  const passwordData = hashPassword(input.password);
  const status = normalizeUserStatus(input.status);
  const role = normalizeUserRole(input.role);

  return {
    id: input.id ?? `user-${randomUUID()}`,
    name: String(input.name ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    role,
    level: input.level ?? "bronze",
    readingScore: Number(input.readingScore ?? 0),
    activeLoanId: input.activeLoanId ?? null,
    completedLoansCount: Number(input.completedLoansCount ?? 0),
    status,
    accessStatus: status,
    company: String(input.company ?? "").trim(),
    department: String(input.department ?? "").trim(),
    cpf: String(input.cpf ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    birthDate: String(input.birthDate ?? "").trim(),
    createdByAdmin: Boolean(input.createdByAdmin),
    mustChangePassword: Boolean(input.mustChangePassword),
    approvedAt: input.approvedAt ?? null,
    approvedBy: input.approvedBy ?? null,
    rejectedAt: input.rejectedAt ?? null,
    rejectedBy: input.rejectedBy ?? null,
    rejectionReason: input.rejectionReason ?? "",
    lastLoginAt: input.lastLoginAt ?? null,
    tokenVersion: Number(input.tokenVersion ?? 0),
    updatedAt: input.updatedAt ?? now,
    createdAt: input.createdAt ?? now,
    ...passwordData
  };
}

async function ensureBootstrapAdmin(adminStateStore) {
  const bootstrapEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "").trim();
  const bootstrapName = String(process.env.BOOTSTRAP_ADMIN_NAME ?? "Melina Abreu").trim();

  if (!bootstrapEmail || !bootstrapPassword) {
    return;
  }

  const currentState = await adminStateStore.read();
  const adminUser = createAuthUserRecord({
    id: "bootstrap-admin-melina",
    name: bootstrapName,
    email: bootstrapEmail,
    role: "admin",
    level: "gold",
    status: "approved",
    password: bootstrapPassword,
    createdByAdmin: true,
    mustChangePassword: false
  });
  const nextUsers = upsertUserRecord(currentState.state.users, adminUser);

  if (areUsersEquivalent(findUserRecord(currentState.state.users, bootstrapEmail), adminUser)) {
    return;
  }

  await adminStateStore.write({
    ...currentState.state,
    users: nextUsers
  });
}

function sendUseCaseResult(response, result, successStatus) {
  if (result.success) {
    return sendJson(response, successStatus, result);
  }

  return sendJson(response, mapErrorToStatus(result.error.code), result);
}

async function handleJoinWaitlist(response, body, adminStateStore, repository, request) {
  const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
    allowPending: false
  });

  if (!currentUser.ok) {
    return sendJson(response, currentUser.statusCode, currentUser.payload);
  }

  const userId = String(body.userId ?? "").trim();
  const bookId = String(body.bookId ?? "").trim();

  if (!userId || !bookId) {
    return sendJson(response, 400, {
      success: false,
      error: {
        code: "invalid_request",
        message: "Informe userId e bookId."
      }
    });
  }

  if (currentUser.user.role !== "admin" && String(currentUser.user.id) !== userId) {
    return sendJson(response, 403, {
      success: false,
      error: {
        code: "forbidden",
        message: "Voce so pode entrar na fila do seu proprio usuario."
      }
    });
  }

  const lookupRepository = createAuthenticatedRepository(repository, adminStateStore);
  const [book, user] = await Promise.all([
    lookupRepository.findBookById(bookId),
    lookupRepository.findUserById(userId)
  ]);

  if (!book || !user) {
    return sendJson(response, 404, {
      success: false,
      error: {
        code: "book_not_found",
        message: "Livro ou usuario nao encontrado."
      }
    });
  }

  const currentState = await adminStateStore.read();
  const normalizedWaitlists = normalizeAdminWaitlists(currentState.state.waitlists);
  const existing = normalizedWaitlists.find(
    (entry) =>
      String(entry.bookId) === bookId &&
      String(entry.userId) === userId &&
      entry.status === "AGUARDANDO_FILA"
  );

  if (existing) {
    return sendJson(response, 200, {
      success: true,
      waitlist: existing,
      waitlistPosition: getWaitlistPosition(normalizedWaitlists, bookId, userId),
      message: `Você já está na fila deste livro na posição ${getWaitlistPosition(
        normalizedWaitlists,
        bookId,
        userId
      )}.`
    });
  }

  const userWaitlistCount = countUserWaitlistEntries(normalizedWaitlists, userId);
  if (userWaitlistCount >= 5) {
    return sendJson(response, 409, {
      success: false,
      error: {
        code: "waitlist_limit_reached",
        message: "Você já possui 5 livros na fila de espera. Remova algum antes de adicionar outro."
      }
    });
  }

  const waitlist = normalizeAdminWaitlistEntry({
    id: `waitlist-${randomUUID()}`,
    bookId,
    userId,
    requestedAt: new Date().toISOString(),
    status: "AGUARDANDO_FILA"
  });
  const waitlistPosition = getWaitlistPosition([...normalizedWaitlists, waitlist], bookId, userId);
  const notifications = pushWaitlistNotification(
    currentState.state.notifications,
    book,
    user,
    waitlist,
    waitlistPosition
  );
  const nextState = {
    ...currentState.state,
    waitlists: [waitlist, ...normalizedWaitlists],
    notifications
  };
  const savedState = await adminStateStore.write(nextState);

  return sendJson(response, 201, {
    success: true,
    waitlist,
    waitlistPosition,
    message: `Você entrou na fila de espera na posição ${getWaitlistPosition(
      nextState.waitlists,
      bookId,
      userId
    )}.`,
    adminStateUpdatedAt: savedState.updatedAt
  });
}

async function handleRemoveWaitlistEntry(response, waitlistId, adminStateStore, repository, request) {
  const currentUser = await requireAuthenticatedUser(request, adminStateStore, repository, {
    allowPending: false
  });

  if (!currentUser.ok) {
    return sendJson(response, currentUser.statusCode, currentUser.payload);
  }

  const currentState = await adminStateStore.read();
  const normalizedWaitlists = normalizeAdminWaitlists(currentState.state.waitlists);
  const target = normalizedWaitlists.find((entry) => String(entry.id) === String(waitlistId));

  if (!target) {
    return sendJson(response, 404, {
      success: false,
      error: {
        code: "waitlist_not_found",
        message: "Fila nao encontrada."
      }
    });
  }

  if (currentUser.user.role !== "admin" && String(target.userId) !== String(currentUser.user.id)) {
    return sendJson(response, 403, {
      success: false,
      error: {
        code: "forbidden",
        message: "Voce so pode remover sua propria inscricao na fila."
      }
    });
  }

  const nextWaitlists = normalizedWaitlists.filter((entry) => String(entry.id) !== String(waitlistId));
  const nextNotifications = Array.isArray(currentState.state.notifications)
    ? currentState.state.notifications.filter(
        (notification) => notification.metadata?.waitlistId !== waitlistId
      )
    : [];
  const savedState = await adminStateStore.write({
    ...currentState.state,
    waitlists: nextWaitlists,
    notifications: nextNotifications
  });

  return sendJson(response, 200, {
    success: true,
    message: "Você saiu da fila de espera.",
    adminStateUpdatedAt: savedState.updatedAt
  });
}

async function mirrorLoanRequestIntoAdminState(adminStateStore, body, loan) {
  const currentState = await adminStateStore.read();
  const normalizedState = normalizeAdminState(currentState.state);
  const currentUsers = Array.isArray(normalizedState.users) ? normalizedState.users : [];
  const currentLoans = Array.isArray(normalizedState.loans) ? normalizedState.loans : [];
  const currentBooks = Array.isArray(normalizedState.books) ? normalizedState.books : [];
  const currentNotifications = Array.isArray(normalizedState.notifications)
    ? normalizedState.notifications
    : [];

  const book = currentBooks.find((item) => String(item.id) === String(loan.bookId));
  const user = currentUsers.find((item) => String(item.id) === String(loan.userId));

  if (!book || !user) {
    return;
  }

  const normalizedLoan = normalizeAdminLoan({
    ...loan,
    requesterId: loan.requesterId ?? loan.userId,
    requestedAt: loan.requestedAt ?? loan.borrowedAt ?? new Date().toISOString(),
    type: String(body?.type ?? loan.type ?? book.type ?? "").trim().toLowerCase() === "digital"
      ? "digital"
      : "physical",
    notes: body?.notes ?? loan.notes ?? ""
  });

  const nextLoans = upsertLoanRecord(currentLoans, normalizedLoan);
  const nextUsers = syncUsersWithLoans(
    upsertReadingListForUser(currentUsers, normalizedLoan.userId, normalizedLoan.bookId),
    nextLoans
  );
  const nextNotifications = pushLoanCreationNotifications(
    currentNotifications,
    nextUsers,
    book,
    user,
    normalizedLoan
  );

  await adminStateStore.write({
    ...normalizedState,
    users: nextUsers,
    loans: nextLoans,
    notifications: nextNotifications
  });
}

async function mirrorLoanPickupIntoAdminState(adminStateStore, loan) {
  const currentState = await adminStateStore.read();
  const normalizedState = normalizeAdminState(currentState.state);
  const currentUsers = Array.isArray(normalizedState.users) ? normalizedState.users : [];
  const currentLoans = Array.isArray(normalizedState.loans) ? normalizedState.loans : [];
  const currentBooks = Array.isArray(normalizedState.books) ? normalizedState.books : [];
  const currentNotifications = Array.isArray(normalizedState.notifications)
    ? normalizedState.notifications
    : [];

  const book = currentBooks.find((item) => String(item.id) === String(loan.bookId));
  const user = currentUsers.find((item) => String(item.id) === String(loan.userId));

  if (!book || !user) {
    return;
  }

  const nextLoan = normalizeAdminLoan({
    ...loan,
    status: "EMPRESTADO",
    borrowedAt: loan.borrowedAt ?? new Date().toISOString(),
    returnedAt: ""
  });

  const nextLoans = upsertLoanRecord(currentLoans, nextLoan);
  const nextUsers = syncUsersWithLoans(currentUsers, nextLoans);
  const notificationId = `notification-${nextLoan.id}-pickup`;
  const filteredNotifications = currentNotifications.filter(
    (notification) => notification.id !== notificationId
  );

  filteredNotifications.unshift(
    normalizeNotification({
      id: notificationId,
      userId: user.id,
      bookId: book.id,
      type: "loan",
      title: "Retirada confirmada",
      message: `Seu livro "${book.title}" já está liberado para leitura.`,
      actionLabel: "Abrir livro",
      actionTarget: "/livros",
      createdAt: new Date().toISOString(),
      metadata: {
        loanId: nextLoan.id,
        requesterId: user.id
      }
    })
  );

  await adminStateStore.write({
    ...normalizedState,
    users: nextUsers,
    loans: nextLoans,
    notifications: filteredNotifications
  });
}

function normalizeAdminLoan(loan) {
  return {
    id: loan?.id ?? `loan-${randomUUID()}`,
    userId: String(loan?.userId ?? ""),
    bookId: String(loan?.bookId ?? ""),
    requesterId: String(loan?.requesterId ?? loan?.userId ?? ""),
    requestedAt: loan?.requestedAt ?? loan?.borrowedAt ?? new Date().toISOString(),
    type: String(loan?.type ?? "").trim().toLowerCase() === "digital" ? "digital" : "physical",
    status: normalizeLoanStatus(loan?.status),
    responsible: loan?.responsible ?? "",
    location: loan?.location ?? "",
    dueAt: loan?.dueAt ?? "",
    readyUntil: loan?.readyUntil ?? "",
    approvedAt: loan?.approvedAt ?? "",
    rejectedAt: loan?.rejectedAt ?? "",
    borrowedAt: loan?.borrowedAt ?? "",
    returnedAt: loan?.returnedAt ?? "",
    notes: loan?.notes ?? ""
  };
}

function normalizeLoanStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();

  switch (normalized) {
    case "DISPONIVEL":
    case "AVAILABLE":
    case "EXPIRED":
      return "DISPONIVEL";
    case "READY_FOR_PICKUP":
      return "AGUARDANDO_CONFIRMACAO";
    case "PENDING_APPROVAL":
    case "PENDENTE_APROVACAO":
    case "PENDENTE DE APROVACAO":
      return "PENDENTE_APROVACAO";
    case "AGUARDANDO_RETIRADA":
      return "AGUARDANDO_RETIRADA";
    case "AGUARDANDO_CONFIRMACAO":
      return "AGUARDANDO_CONFIRMACAO";
    case "BORROWED":
    case "ACTIVE":
    case "OVERDUE":
    case "EMPRESTADO":
    case "RETURN_REQUESTED":
      return "EMPRESTADO";
    case "WAITING":
    case "AGUARDANDO_FILA":
    case "READY":
      return "AGUARDANDO_FILA";
    case "RETURNED":
    case "DEVOLVIDO":
      return "DEVOLVIDO";
    case "REJECTED":
    case "REJEITADO":
      return "RECUSADO";
    case "CANCELLED":
    case "CANCELADO":
      return "CANCELADO";
    default:
      return "DISPONIVEL";
  }
}

function isActiveLoanStatus(status) {
  const normalized = normalizeLoanStatus(status);

  return (
    normalized === "PENDENTE_APROVACAO" ||
    normalized === "AGUARDANDO_RETIRADA" ||
    normalized === "AGUARDANDO_CONFIRMACAO" ||
    normalized === "EMPRESTADO" ||
    normalized === "AGUARDANDO_FILA"
  );
}

function syncUsersWithLoans(users, loans) {
  return (Array.isArray(users) ? users : []).map((user) => {
    const activeLoan = (Array.isArray(loans) ? loans : []).find(
      (loan) =>
        String(loan.userId) === String(user.id) &&
        loan.type !== "digital" &&
        isActiveLoanStatus(loan.status)
    );

    return {
      ...user,
      activeLoanId: activeLoan?.id ?? null
    };
  });
}

function upsertReadingListForUser(users, userId, bookId) {
  return (Array.isArray(users) ? users : []).map((user) => {
    if (String(user.id) !== String(userId)) {
      return user;
    }

    const readingList = Array.isArray(user.readingList) ? user.readingList : [];
    const nextReadingList = readingList.includes(bookId) ? readingList : [...readingList, bookId];

    return {
      ...user,
      readingList: nextReadingList
    };
  });
}

function upsertLoanRecord(loans, loan) {
  const next = Array.isArray(loans) ? loans.slice() : [];
  const index = next.findIndex((item) => String(item.id) === String(loan.id));
  if (index >= 0) {
    next[index] = loan;
  } else {
    next.unshift(loan);
  }
  return next;
}

function pushLoanCreationNotifications(notifications, users, book, user, loan) {
  const next = Array.isArray(notifications) ? notifications.slice() : [];
  const normalizedLoan = normalizeAdminLoan(loan);

  const filtered = next.filter((entry) => {
    if (entry.id === `notification-${normalizedLoan.id}`) {
      return false;
    }

    if (String(normalizedLoan.type) !== "digital") {
      return !users.some(
        (admin) =>
          admin.role === "admin" &&
          admin.accessStatus !== "blocked" &&
          entry.id === `notification-${normalizedLoan.id}-${admin.id}`
      );
    }

    return true;
  });

  if (normalizedLoan.type === "digital") {
    filtered.unshift(
      normalizeNotification({
        id: `notification-${normalizedLoan.id}`,
        userId: user.id,
        bookId: book.id,
        type: "loan",
        title: "Acesso liberado",
        message: `O livro "${book.title}" foi liberado para leitura.`,
        actionLabel: "Abrir livro",
        actionTarget: "/livros",
        createdAt: new Date().toISOString(),
        metadata: {
          loanId: normalizedLoan.id,
          requesterId: user.id
        }
      })
    );

    return filtered;
  }

  filtered.unshift(
    normalizeNotification({
      id: `notification-${normalizedLoan.id}`,
      userId: user.id,
      bookId: book.id,
      type: "loan",
      title: "Solicitação enviada",
      message: `Sua solicitação para "${book.title}" foi enviada para aprovação.`,
      actionLabel: "Ver livro",
      actionTarget: "/livros",
      createdAt: new Date().toISOString(),
      metadata: {
        loanId: normalizedLoan.id,
        requesterId: user.id
      }
    })
  );

  for (const admin of users.filter((item) => item.role === "admin" && item.accessStatus !== "blocked")) {
    filtered.unshift(
      normalizeNotification({
        id: `notification-${normalizedLoan.id}-${admin.id}`,
        userId: admin.id,
        bookId: book.id,
        type: "loan-approval",
        title: "Nova solicitação de empréstimo",
        message: `${user.name} solicitou "${book.title}".`,
        actionLabel: "Abrir solicitações",
        actionTarget: "/admin/requests",
        createdAt: new Date().toISOString(),
        metadata: {
          loanId: normalizedLoan.id,
          requesterId: user.id
        }
      })
    );
  }

  return filtered;
}

function areUsersEquivalent(left, right) {
  if (!left || !right) {
    return false;
  }

  const comparableKeys = [
    "id",
    "name",
    "email",
    "role",
    "level",
    "status",
    "accessStatus",
    "createdByAdmin",
    "mustChangePassword",
    "passwordHash",
    "passwordSalt"
  ];

  return comparableKeys.every((key) => String(left[key] ?? "") === String(right[key] ?? ""));
}

function mapErrorToStatus(code) {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
    case "account_blocked":
    case "pending_approval":
      return 403;
    case "user_not_found":
    case "book_not_found":
    case "loan_not_found":
      return 404;
    case "invalid_return_answers":
      return 422;
    case "premium_book_requires_gold":
      return 403;
    case "user_has_active_loan":
    case "book_inactive":
    case "book_unavailable":
    case "loan_already_returned":
      return 409;
    default:
      return 400;
  }
}

function sendJson(response, statusCode, payload) {
  const allowedOrigin =
    response.__corsOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:3000";

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin"
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(payload, null, 2));
}

function resolveCorsOrigin(requestOrigin) {
  const fallbackOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const normalizedRequestOrigin = String(requestOrigin ?? "").trim();

  if (!normalizedRequestOrigin) {
    return fallbackOrigin;
  }

  const allowedOrigins = new Set([
    fallbackOrigin,
    ...parseOriginList(process.env.WEB_ORIGIN_ALLOWLIST)
  ]);

  if (allowedOrigins.has(normalizedRequestOrigin)) {
    return normalizedRequestOrigin;
  }

  if (isAllowedVercelPreviewOrigin(normalizedRequestOrigin)) {
    return normalizedRequestOrigin;
  }

  return fallbackOrigin;
}

function parseOriginList(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedVercelPreviewOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function normalizeAdminState(state) {
  if (!state || typeof state !== "object") {
    return {
      books: [],
      users: [],
      loans: [],
      waitlists: [],
      notifications: []
    };
  }

  return {
    ...state,
    books: Array.isArray(state.books) ? state.books : [],
    users: Array.isArray(state.users) ? state.users : [],
    loans: Array.isArray(state.loans) ? state.loans : [],
    waitlists: Array.isArray(state.waitlists) ? state.waitlists : [],
    notifications: Array.isArray(state.notifications) ? state.notifications : []
  };
}

function normalizeAdminWaitlists(waitlists = []) {
  return (Array.isArray(waitlists) ? waitlists : []).map((entry) => normalizeAdminWaitlistEntry(entry));
}

function normalizeAdminWaitlistEntry(entry) {
  return {
    id: entry?.id ?? `waitlist-${randomUUID()}`,
    bookId: String(entry?.bookId ?? ""),
    userId: String(entry?.userId ?? ""),
    requestedAt: entry?.requestedAt ?? new Date().toISOString(),
    status: normalizeWaitlistStatus(entry?.status),
    readyAt: entry?.readyAt ?? "",
    readyUntil: entry?.readyUntil ?? "",
    notificationId: entry?.notificationId ?? "",
    loanId: entry?.loanId ?? ""
  };
}

function normalizeWaitlistStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();

  if (normalized === "AGUARDANDO_CONFIRMACAO") {
    return "AGUARDANDO_CONFIRMACAO";
  }

  if (normalized === "CANCELADO" || normalized === "CANCELLED" || normalized === "EXPIRED") {
    return "CANCELADO";
  }

  return "AGUARDANDO_FILA";
}

function countUserWaitlistEntries(waitlists, userId) {
  const seen = new Set();

  for (const entry of Array.isArray(waitlists) ? waitlists : []) {
    if (String(entry.userId) !== String(userId) || entry.status !== "AGUARDANDO_FILA") {
      continue;
    }

    seen.add(String(entry.bookId));
  }

  return seen.size;
}

function getWaitlistPosition(waitlists, bookId, userId) {
  const queue = (Array.isArray(waitlists) ? waitlists : [])
    .filter((entry) => String(entry.bookId) === String(bookId) && entry.status !== "CANCELADO")
    .sort((left, right) => new Date(left.requestedAt || 0).getTime() - new Date(right.requestedAt || 0).getTime());
  const index = queue.findIndex((entry) => String(entry.userId) === String(userId));

  return index >= 0 ? index + 1 : queue.length + 1;
}

function pushWaitlistNotification(notifications, book, user, waitlist) {
  const next = Array.isArray(notifications) ? notifications.filter((entry) => entry.id !== `notification-${waitlist.id}`) : [];
  next.unshift(
    normalizeNotification({
      id: `notification-${waitlist.id}`,
      userId: user.id,
      bookId: book.id,
      type: "waitlist",
      title: "Você entrou na fila",
      message: `O livro "${book.title}" foi adicionado à fila de espera. Você está na posição ${getWaitlistPosition(
        [waitlist, ...(Array.isArray(notifications) ? [] : [])],
        book.id,
        user.id
      )}.`,
      actionLabel: "Ver livro",
      actionTarget: "/livros",
      createdAt: new Date().toISOString(),
      metadata: {
        waitlistId: waitlist.id
      }
    })
  );
  return next;
}

function normalizeNotification(notification) {
  return {
    id: notification?.id ?? `notification-${randomUUID()}`,
    userId: String(notification?.userId ?? ""),
    bookId: String(notification?.bookId ?? ""),
    type: notification?.type ?? "info",
    title: notification?.title ?? "",
    message: notification?.message ?? "",
    actionLabel: notification?.actionLabel ?? "",
    actionTarget: notification?.actionTarget ?? "",
    createdAt: notification?.createdAt ?? new Date().toISOString(),
    readAt: notification?.readAt ?? "",
    dismissedAt: notification?.dismissedAt ?? "",
    metadata: notification?.metadata ?? {}
  };
}

function mergeBooks(baseBooks = [], adminBooks = []) {
  const map = new Map();

  for (const book of baseBooks) {
    map.set(book.id, book);
  }

  for (const book of adminBooks) {
    map.set(book.id, {
      ...map.get(book.id),
      ...book
    });
  }

  return Array.from(map.values()).sort((left, right) =>
    String(left.title || "").localeCompare(String(right.title || ""), "pt-BR")
  );
}

async function importBooksFromImportedPdfText(body) {
  const text = String(body.extractedText ?? "").replace(/\r/g, "");

  if (!text.trim()) {
    return [];
  }

  if (
    text.includes("PLANO DE DESENVOLVIMENTO") &&
    text.includes("CONSOLIDA")
  ) {
    return buildBooksFromDevelopmentPlan();
  }

  return parseImportedBooksText(text);
}

function buildBooksFromDevelopmentPlan() {
  const catalog = createDevelopmentPlanCatalog();
  const recommendationMap = new Map();

  for (const recommendation of catalog.recommendations) {
    const bucket = recommendationMap.get(recommendation.bookId) ?? [];
    bucket.push(recommendation);
    recommendationMap.set(recommendation.bookId, bucket);
  }

  return catalog.books.map((book) => {
    const relatedRecommendations = recommendationMap.get(book.id) ?? [];
    const summary = relatedRecommendations
      .slice(0, 2)
      .map((item) => item.strategicJustification)
      .filter(Boolean)
      .join(" ");

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      summary,
      category: book.category,
      coverUrl: "",
      type: "physical",
      totalQuantity: book.totalCopies,
      availableQuantity: book.availableCopies,
      isPremium: book.isPremium,
      isActive: book.isActive
    };
  });
}

function parseImportedBooksText(text) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const imported = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      continue;
    }

    const title = lines[0];
    const authorLine =
      lines.find((line) => /^autor[:\-]/i.test(line)) ??
      lines.find((line) => /por\s+/i.test(line)) ??
      lines[1];
    const author = authorLine
      .replace(/^autor[:\-]\s*/i, "")
      .replace(/^por\s+/i, "")
      .trim();
    const summary = lines.slice(2).join(" ").trim();

    if (!looksLikeBookTitle(title) || !author) {
      continue;
    }

    imported.push({
      id: `imported-${slugify(`${title}-${author}`)}`,
      title,
      author,
      summary,
      category: inferCategory(lines, summary),
      coverUrl: "",
      type: "physical",
      totalQuantity: 1,
      availableQuantity: 1,
      isPremium: false,
      isActive: true
    });
  }

  return dedupeImportedBooks(imported);
}

function inferCategory(lines, summary) {
  const joined = `${lines.join(" ")} ${summary}`.toLowerCase();

  if (joined.includes("engenharia")) {
    return "Engenharia";
  }

  if (joined.includes("lider") || joined.includes("lideranca")) {
    return "Lideranca";
  }

  if (joined.includes("comunica")) {
    return "Comunicacao";
  }

  if (joined.includes("estrat")) {
    return "Pensamento estrategico";
  }

  if (joined.includes("soft")) {
    return "Soft skills";
  }

  return "";
}

function looksLikeBookTitle(value) {
  return value.length >= 3 && !/^p[aá]gina\s+\d+/i.test(value);
}

function dedupeImportedBooks(books) {
  const map = new Map();

  for (const book of books) {
    const key = `${book.title}:${book.author}`.toLowerCase();

    if (!map.has(key)) {
      map.set(key, book);
    }
  }

  return Array.from(map.values());
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const isMainModule =
  process.argv[1] &&
  new URL(`file:${process.argv[1].replace(/\\/g, "/")}`).pathname.endsWith(
    "/server.js"
  );

if (isMainModule) {
  try {
    const port = Number(process.env.PORT ?? 3001);
    server.listen(port, "0.0.0.0", () => {
      console.log(`Biblioteca API rodando em http://localhost:${port}`);
      for (const address of getLocalAddresses()) {
        console.log(`Biblioteca API em rede local: http://${address}:${port}`);
      }
      console.log("Rotas disponiveis:");
      console.log("POST /loans");
      console.log("POST /loans/:loanId/return");
      console.log("POST /admin/books/import-pdf");
      console.log("GET /health");
      console.log("GET /seed");
    });
  } catch (error) {
    console.error("Nao foi possivel iniciar a API.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function getLocalAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const group of Object.values(interfaces)) {
    for (const item of group ?? []) {
      if (item.family === "IPv4" && !item.internal) {
        addresses.push(item.address);
      }
    }
  }

  return [...new Set(addresses)];
}

function createRepository() {
  const hasSupabaseConfig =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (hasSupabaseConfig) {
    return new SupabaseLoanRepository(getSupabaseConfig());
  }

  console.warn(
    "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes. Usando repositorio em memoria."
  );

  return new InMemoryLoanRepository();
}
