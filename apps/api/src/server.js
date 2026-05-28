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

        return sendUseCaseResult(response, result, 201);
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

  if (!email || !password) {
    return sendJson(response, 400, {
      success: false,
      error: {
        code: "invalid_request",
        message: "Informe e-mail e senha."
      }
    });
  }

  const currentState = await adminStateStore.read();
  const user = findUserRecord(currentState.state.users, email);

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
  const isPasswordValid = hasSecurePassword
    ? verifyPassword(password, user.passwordHash, user.passwordSalt)
    : String(user.password ?? "").trim() === password;

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

      const repositoryUser = await repository.findUserById(user.id);
      if (repositoryUser) {
        await repository.updateUser(user);
      }
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
  const existing = findUserRecord(currentState.state.users, bootstrapEmail);

  if (existing) {
    return;
  }

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

  await adminStateStore.write({
    ...currentState.state,
    users: [adminUser, ...(currentState.state.users ?? [])]
  });
}

function sendUseCaseResult(response, result, successStatus) {
  if (result.success) {
    return sendJson(response, successStatus, result);
  }

  return sendJson(response, mapErrorToStatus(result.error.code), result);
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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
