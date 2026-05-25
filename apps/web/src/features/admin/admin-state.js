import React, { useEffect, useMemo, useRef, useState } from "react";
import { createAdminApiClient } from "../../services/admin-api.js";
import { DEFAULT_BRAND_SETTINGS } from "../branding/brand-theme.js";

const STORAGE_KEY = "lumiar-flow-admin-panel-v1";
const BOOTSTRAP_USERS = [
  {
    id: "bootstrap-admin-melina",
    name: "Melina Abreu",
    email: "melina@powercrm.com.br",
    cpf: "123.456.789-10",
    role: "admin",
    level: "gold",
    accessStatus: "approved",
    status: "approved",
    createdByAdmin: true,
    mustChangePassword: false,
    readingList: [],
    tokenVersion: 0
  }
];

const DEFAULT_RULES = {
  readingTimeByCategory: {
    soft_skills: 7,
    engenharia: 14
  },
  pointsPerBook: 20,
  difficultyMultiplier: 1.5
};

const DEFAULT_GAMIFICATION = {
  rewards: {
    top1: "Voucher premium",
    top3: "Reconhecimento mensal",
    top10: "Badge destaque"
  },
  penalties: {
    atraso: -5,
    resposta_ruim: -3,
    dano_livro: -10
  }
};

const DEFAULT_SETTINGS = {
  ...DEFAULT_BRAND_SETTINGS,
  loanLimit: 1,
  globalMaxDays: 30,
  reservationWindowHours: 42
};

function normalizeAccessLevel(level) {
  const normalized = String(level ?? "").trim().toLowerCase();

  switch (normalized) {
    case "ouro":
    case "gold":
      return "gold";
    case "prata":
    case "silver":
      return "silver";
    case "bronze":
      return "bronze";
    default:
      return normalized || "bronze";
  }
}

function normalizeUserRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();

  if (normalized === "admin") {
    return "admin";
  }

  return "user";
}

function normalizeUserAccessStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();

  switch (normalized) {
    case "approved":
    case "active":
    case "aprovado":
    case "ativo":
      return "approved";
    case "pendente":
    case "em aprovacao":
    case "em aprovação":
    case "aguardando aprovacao":
    case "aguardando aprovação":
      return "pending";
    case "pending":
    case "rejected":
    case "blocked":
    case "recusado":
    case "rejeitado":
    case "bloqueado":
      return normalized;
    default:
      return "pending";
  }
}

function canAccessPremium(level) {
  return normalizeAccessLevel(level) === "gold";
}

function normalizeCpf(cpf) {
  const value = String(cpf ?? "").trim();
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 11) {
    return "";
  }

  return value;
}

const stabilizeAdminState = (rawState = {}) => {
  const state = createAdminState(rawState);
  const normalized = {
    ...state,
    books: state.books.map(normalizeAdminBook),
    users: state.users.map(normalizeAdminUser),
    loans: state.loans.map(normalizeAdminLoan),
    waitlists: state.waitlists.map(normalizeWaitlistEntry),
    notifications: state.notifications.map(normalizeNotification)
  };
  const expired = expireReservations(normalized);
  const promoted = promoteWaitlistAfterReturn({
    state: {
      ...normalized,
      books: expired.books,
      loans: expired.loans,
      waitlists: expired.waitlists,
      notifications: expired.notifications
    },
    bookId: null
  });
  const finalBooks = promoted.books;
  const finalLoans = promoted.loans;
  const finalWaitlists = promoted.waitlists;
  const finalNotifications = promoted.notifications;

  async function submitRegistrationRequestSecure(input) {
    const normalizedEmail = String(input.email || "").trim().toLowerCase();

    if (
      state.users.some((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail)
    ) {
      return {
        success: false,
        message: "Ja existe um cadastro com este e-mail."
      };
    }

    if (!adminApi || typeof adminApi.registerUser !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.registerUser(input);
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message:
          result.message ??
          "Solicitação enviada com sucesso. Aguarde a aprovação do administrador.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel enviar sua solicitacao."
      };
    }
  }

  async function createManagedUserSecure(input) {
    if (!adminApi || typeof adminApi.createManagedUser !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.createManagedUser(input);
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message:
          result.message ??
          "Usuario criado com sucesso. A senha inicial foi registrada no servidor.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel cadastrar o usuario."
      };
    }
  }

  async function changePasswordSecure(userId, newPassword) {
    if (!adminApi || typeof adminApi.changePassword !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.changePassword({ userId, newPassword });
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message: result.message ?? "Senha atualizada com sucesso.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel atualizar a senha."
      };
    }
  }

  return {
    ...state,
    books: finalBooks,
    users: syncUsersWithLoans(normalized.users, finalLoans),
    loans: finalLoans,
    waitlists: finalWaitlists,
    notifications: finalNotifications
  };
};

export function useAdminPanel(catalog, currentUser = null, apiBaseUrl = "", catalogReady = false) {
  const [state, setState] = useState(() =>
    stabilizeAdminState(createAdminState(readAdminState()))
  );
  const syncReadyRef = useRef(false);
  const adminApi = useMemo(
    () => (apiBaseUrl ? createAdminApiClient(apiBaseUrl) : null),
    [apiBaseUrl]
  );

  useEffect(() => {
    if (!catalogReady) {
      return;
    }

    const persistedState = catalog.adminStateUpdatedAt ? catalog.adminState : readAdminState();

    setState((current) =>
      stabilizeAdminState(
        mergeCatalogIntoState(catalog, persistedState && Object.keys(persistedState).length > 0 ? persistedState : current)
      )
    );
    syncReadyRef.current = true;
  }, [catalog, catalogReady]);

  useEffect(() => {
    writeAdminState(state);
  }, [state]);

  useEffect(() => {
    if (!adminApi) {
      return undefined;
    }

    const canSyncCurrentUser =
      currentUser?.role === "admin" &&
      normalizeUserAccessStatus(currentUser?.status ?? currentUser?.accessStatus) === "approved";

    if (!canSyncCurrentUser) {
      return undefined;
    }

    if (!syncReadyRef.current) {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      if (typeof adminApi.syncState !== "function" && typeof adminApi.syncBooks !== "function") {
        return;
      }

      const syncState = typeof adminApi.syncState === "function" ? adminApi.syncState.bind(adminApi) : null;
      const syncBooks = typeof adminApi.syncBooks === "function" ? adminApi.syncBooks.bind(adminApi) : null;

      if (syncState) {
        syncState(state).catch(() => {
          if (syncBooks) {
            syncBooks(state.books).catch(() => {});
          }
        });
      } else if (syncBooks) {
        syncBooks(state.books).catch(() => {});
      }
    }, 150);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [adminApi, currentUser, state]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setState((current) => stabilizeAdminState(current));
    }, 60 * 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);

  const monitoring = useMemo(
    () => buildMonitoring(state, catalog),
    [catalog, state]
  );

  async function submitRegistrationRequestSecure(input) {
    const normalizedEmail = String(input.email || "").trim().toLowerCase();

    if (
      state.users.some((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail)
    ) {
      return {
        success: false,
        message: "Ja existe um cadastro com este e-mail."
      };
    }

    if (!adminApi || typeof adminApi.registerUser !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.registerUser(input);
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message:
          result.message ??
          "Solicitação enviada com sucesso. Aguarde a aprovação do administrador.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel enviar sua solicitacao."
      };
    }
  }

  async function createManagedUserSecure(input) {
    if (!adminApi || typeof adminApi.createManagedUser !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.createManagedUser(input);
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message:
          result.message ??
          "Usuario criado com sucesso. A senha inicial foi registrada no servidor.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel cadastrar o usuario."
      };
    }
  }

  async function changePasswordSecure(userId, newPassword) {
    if (!adminApi || typeof adminApi.changePassword !== "function") {
      return {
        success: false,
        message: "Nao foi possivel conectar ao servidor de autenticacao."
      };
    }

    try {
      const result = await adminApi.changePassword({ userId, newPassword });
      const nextUser = normalizeAdminUser(result.user ?? {});

      setState((current) =>
        stabilizeAdminState({
          ...current,
          users: upsertUserIntoState(current.users, nextUser)
        })
      );

      return {
        success: true,
        message: result.message ?? "Senha atualizada com sucesso.",
        user: nextUser
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel atualizar a senha."
      };
    }
  }

  function createBook(input) {
    const id = input.id || `admin-book-${Date.now().toString(36)}`;
    const nextBook = normalizeAdminBook({
      ...input,
      id
    });

    setState((current) => ({
      ...current,
      books: [nextBook, ...current.books]
    }));
  }

  function updateBook(bookId, changes) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        books: current.books.map((book) =>
          book.id === bookId ? normalizeAdminBook({ ...book, ...changes }) : book
        )
      })
    );
  }

  function removeBook(bookId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        books: current.books.filter((book) => book.id !== bookId),
        loans: current.loans.filter((loan) => loan.bookId !== bookId),
        waitlists: current.waitlists.filter((entry) => entry.bookId !== bookId),
        notifications: current.notifications.filter((entry) => entry.bookId !== bookId)
      })
    );
  }

  function importBooks(books) {
    if (!Array.isArray(books) || books.length === 0) {
      return;
    }

    setState((current) => {
      const existing = new Map(current.books.map((book) => [book.id, book]));
      const merged = [...current.books];

      for (const rawBook of books) {
        const nextBook = normalizeAdminBook(rawBook);
        const duplicate = merged.find(
          (book) =>
            book.id === nextBook.id ||
            `${book.title}:${book.author}`.toLowerCase() ===
              `${nextBook.title}:${nextBook.author}`.toLowerCase()
        );

        if (duplicate) {
          const updated = normalizeAdminBook({
            ...duplicate,
            ...nextBook
          });
          existing.set(updated.id, updated);
        } else {
          merged.push(nextBook);
          existing.set(nextBook.id, nextBook);
        }
      }

      return stabilizeAdminState({
        ...current,
        books: Array.from(existing.values())
      });
    });
  }

  function updateUser(userId, changes) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) =>
          user.id === userId ? normalizeAdminUser({ ...user, ...changes }) : user
        )
      })
    );
  }

  function submitRegistrationRequest(input) {
    let result = {
      success: false,
      message: "Não foi possível enviar sua solicitação."
    };

    setState((current) => {
      const normalizedEmail = String(input.email || "").trim().toLowerCase();
      const duplicate = current.users.find(
        (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail
      );

      if (duplicate) {
        result = {
          success: false,
          message: "Ja existe um cadastro com este e-mail."
        };
        return current;
      }

  const nextUser = normalizeAdminUser({
        id: `user-request-${Date.now().toString(36)}`,
        name: input.fullName,
        email: normalizedEmail,
        company: input.company,
        department: input.department,
        cpf: input.cpf,
        phone: input.phone,
        birthDate: input.birthDate,
        password: input.password,
        role: "user",
        level: "bronze",
        accessStatus: "pending",
        createdByAdmin: false,
        mustChangePassword: false,
        readingList: []
      });

      result = {
        success: true,
        message: "Solicitação enviada com sucesso."
      };

      return stabilizeAdminState({
        ...current,
        users: [nextUser, ...current.users]
      });
    });

    return result;
  }

  function createManagedUser(input) {
    let result = {
      success: false,
      message: "Não foi possível cadastrar o usuário."
    };

    setState((current) => {
      const normalizedEmail = String(input.email || "").trim().toLowerCase();
      const duplicate = current.users.find(
        (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail
      );

      if (duplicate) {
        result = {
          success: false,
          message: "Ja existe um cadastro com este e-mail."
        };
        return current;
      }

      const nextUser = normalizeAdminUser({
        id: `user-admin-${Date.now().toString(36)}`,
        name: input.name,
        email: normalizedEmail,
        cpf: input.cpf,
        company: input.company,
        department: input.department,
        role: input.role || "user",
        level: input.level || "bronze",
        accessStatus: "approved",
        createdByAdmin: true,
        mustChangePassword: true,
        password: input.cpf,
        readingList: []
      });

      result = {
        success: true,
        message: "Usuário criado com sucesso. A senha inicial é o CPF."
      };

      return stabilizeAdminState({
        ...current,
        users: [nextUser, ...current.users]
      });
    });

    return result;
  }

  function approveUser(userId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) =>
          user.id === userId
              ? normalizeAdminUser({
                  ...user,
                  accessStatus: "approved"
                })
            : user
        )
      })
    );
  }

  function rejectUser(userId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) =>
          user.id === userId
              ? normalizeAdminUser({
                  ...user,
                  accessStatus: "rejected"
                })
            : user
        )
      })
    );
  }

  function blockUser(userId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) =>
          user.id === userId
              ? normalizeAdminUser({
                  ...user,
                  accessStatus: user.accessStatus === "blocked" ? "approved" : "blocked"
                })
            : user
        )
      })
    );
  }

  function removeUser(userId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.filter((user) => user.id !== userId),
        loans: current.loans.filter((loan) => loan.userId !== userId),
        waitlists: current.waitlists.filter((entry) => entry.userId !== userId),
        notifications: current.notifications.filter((entry) => entry.userId !== userId)
      })
    );
  }

  function changePassword(userId, newPassword) {
    let result = {
      success: false,
      message: "Não foi possível atualizar a senha."
    };

    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) => {
          if (user.id !== userId) {
            return user;
          }

          result = {
            success: true,
            message: "Senha atualizada com sucesso."
          };

          return normalizeAdminUser({
            ...user,
            password: newPassword,
            mustChangePassword: false
          });
        })
      })
    );

    return result;
  }

  function toggleReadingList(userId, bookId) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        users: current.users.map((user) => {
          if (user.id !== userId) {
            return user;
          }

          const currentList = Array.isArray(user.readingList) ? user.readingList : [];
          const nextList = currentList.includes(bookId)
            ? currentList.filter((item) => item !== bookId)
            : [...currentList, bookId];

          return normalizeAdminUser({
            ...user,
            readingList: nextList
          });
        })
      })
    );
  }

function assignBookToUser(userId, bookId) {
    let result = {
      success: false,
      message: "Não foi possível adicionar o livro ao usuário."
    };

    setState((current) => {
      const user = current.users.find((item) => item.id === userId);
      const book = current.books.find((item) => item.id === bookId);

      if (!user || !book) {
        result = {
          success: false,
          message: "Usuário ou livro não encontrado."
        };
        return current;
      }

      if (!book.isActive) {
        result = {
          success: false,
          message: "Este livro está inativo no catálogo."
        };
        return current;
      }

      if (book.type !== "digital" && book.isPremium && !canAccessPremium(user.level)) {
        result = {
          success: false,
          message: "Livros premium exigem nível ouro."
        };
        return current;
      }

      const existingBorrowed = current.loans.find(
        (loan) => loan.userId === userId && loan.status === "BORROWED"
      );

      if (existingBorrowed) {
        result = {
          success: false,
          message: "Este usuário já possui uma leitura ativa."
        };
        return current;
      }

      const physicalStock = Number(book.availableQuantity ?? 0);

      if (book.type === "physical" && physicalStock <= 0) {
        result = {
          success: false,
          message: "Não há estoque disponível para este livro físico."
        };
        return current;
      }

      const now = new Date().toISOString();
      const nextLoan = normalizeAdminLoan({
        id: `admin-loan-${Date.now().toString(36)}`,
        userId,
        bookId,
        requesterId: userId,
        requestedAt: now,
        type: book.type,
        status: "BORROWED",
        responsible: "Equipe Lumiar Flow",
        location: "Biblioteca Lumiar Flow",
        dueAt: addDays(now, book.type === "digital" ? 180 : current.settings.globalMaxDays),
        borrowedAt: now,
        returnedAt: "",
        notes: "Leitura adicionada manualmente pelo admin"
      });

      const nextLoans = [nextLoan, ...current.loans];
      const nextEffects = applyLoanEffects({
        loans: nextLoans,
        books: current.books,
        action: "borrow",
        loan: nextLoan
      });

      result = {
        success: true,
        message: "Livro adicionado com sucesso na leitura do usuário."
      };

      return stabilizeAdminState({
        ...current,
        loans: nextEffects.loans,
        books: nextEffects.books,
        users: syncUsersWithLoans(
          upsertReadingListForUser(current.users, userId, bookId),
          nextEffects.loans
        ),
        notifications: pushLoanNotification(
          current.notifications,
          book,
          user,
          nextLoan,
          "Leitura adicionada pelo admin"
        )
      });
    });

    return result;
  }

  function updateRules(changes) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        rules: {
          ...current.rules,
          ...changes
        }
      })
    );
  }

  function updateGamification(changes) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        gamification: {
          ...current.gamification,
          ...changes
        }
      })
    );
  }

  function updateSettings(changes) {
    setState((current) =>
      stabilizeAdminState({
        ...current,
        settings: {
          ...current.settings,
          ...changes
        }
      })
    );
  }

  function requestLoan(input) {
    let result = {
      success: false,
      message: "Não foi possível registrar a solicitação."
    };

    setState((current) => {
      const book = current.books.find((item) => item.id === input.bookId);
      const user = current.users.find((item) => item.id === input.userId);

      if (!book || !user) {
        result = {
          success: false,
          message: "Livro ou usuário não encontrado."
        };
        return current;
      }

      if (!book.isActive) {
        result = {
          success: false,
          message: "Este livro está inativo no catálogo."
        };
        return current;
      }

      if (book.type !== "digital" && book.isPremium && !canAccessPremium(user.level)) {
        result = {
          success: false,
          message: "Livros premium exigem nível ouro."
        };
        return current;
      }

      const userAccessStatus = normalizeUserAccessStatus(user.accessStatus ?? user.status);

      if (book.type !== "digital" && userAccessStatus !== "approved") {
        result = {
          success: false,
          message:
            "Seu cadastro ainda está em aprovação. Depois da validação do administrador você poderá solicitar empréstimos físicos."
        };
        return current;
      }

      const duplicateLoan = current.loans.find(
        (loan) =>
          loan.userId === input.userId &&
          loan.bookId === input.bookId &&
          isActiveLoanStatus(loan.status)
      );
      const hasActiveBorrowedLoan = current.loans.some(
        (loan) => loan.userId === input.userId && loan.status === "BORROWED"
      );

      if (duplicateLoan) {
        result = {
          success: false,
          message: "Este livro já está associado a este usuário."
        };
        return current;
      }

      const now = new Date().toISOString();

      if (book.type === "digital") {
        const nextLoan = normalizeAdminLoan({
          id: `admin-loan-${Date.now().toString(36)}`,
          userId: input.userId,
          bookId: input.bookId,
          requesterId: input.userId,
          requestedAt: now,
          type: "digital",
          status: "BORROWED",
          responsible: "",
          location: "",
          dueAt: addDays(now, 180),
          borrowedAt: now,
          returnedAt: "",
          notes: input.notes ?? ""
        });
        const nextLoans = [nextLoan, ...current.loans];
        const nextEffects = applyLoanEffects({
          loans: nextLoans,
          books: current.books,
          action: "borrow",
          loan: nextLoan
        });
        result = {
          success: true,
          loan: nextLoan,
          message: "Livro digital liberado imediatamente."
        };

        return stabilizeAdminState({
          ...current,
          loans: nextEffects.loans,
          books: nextEffects.books,
          users: syncUsersWithLoans(
            upsertReadingListForUser(current.users, input.userId, input.bookId),
            nextEffects.loans
          ),
          notifications: pushLoanNotification(current.notifications, book, user, nextLoan, "Acesso liberado")
        });
      }

      const availableQuantity = Number(book.availableQuantity ?? 0);

      if (availableQuantity <= 0) {
        const nextWaitlist = createWaitlistEntry({
          waitlists: current.waitlists,
          bookId: book.id,
          userId: user.id
        });

        result = {
          success: true,
          waitlist: nextWaitlist.entry,
          waitlistPosition: nextWaitlist.position,
          message: `Livro indisponível. Você entrou na fila na posição ${nextWaitlist.position}.`
        };

        return stabilizeAdminState({
          ...current,
          waitlists: nextWaitlist.waitlists,
          notifications: pushNotification(current.notifications, {
            userId: user.id,
            bookId: book.id,
            type: "waitlist",
            title: "Você entrou na fila",
            message: `O livro \"${book.title}\" está indisponível. Você está na posição ${nextWaitlist.position} da fila.`,
            actionLabel: "Ver livro",
            actionTarget: "/livros"
          })
        });
      }

      const nextLoan = normalizeAdminLoan({
        id: `admin-loan-${Date.now().toString(36)}`,
        userId: input.userId,
        bookId: input.bookId,
        requesterId: input.userId,
        requestedAt: now,
        type: "physical",
        status: "PENDING_APPROVAL",
        responsible: "",
        location: "",
        dueAt: "",
        readyUntil: "",
        borrowedAt: "",
        returnedAt: "",
        notes: input.notes ?? ""
      });
      const nextLoans = [nextLoan, ...current.loans];
      result = {
        success: true,
        loan: nextLoan,
        message: "Solicitação enviada para aprovação do admin."
      };

      return stabilizeAdminState({
        ...current,
        loans: nextLoans,
        books: current.books,
        users: syncUsersWithLoans(
          upsertReadingListForUser(current.users, input.userId, input.bookId),
          nextLoans
        ),
        notifications: pushNotificationsForAdminApproval(
          current.notifications,
          current.users,
          book,
          user,
          nextLoan
        )
      });
    });

    return result;
  }

  function approveLoan(loanId, changes) {
    let result = {
      success: false,
      message: "Não foi possível aprovar a solicitação."
    };

    setState((current) => {
      if (!changes.responsible || !changes.location || !changes.dueAt) {
        result = {
          success: false,
          message: "Informe responsável, local e prazo para aprovar."
        };
        return current;
      }

      const target = current.loans.find((loan) => loan.id === loanId);
      const book = current.books.find((item) => item.id === target?.bookId);
      const user = current.users.find((item) => item.id === target?.userId);

      if (!target || !book || !user) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      if (target.status !== "PENDING_APPROVAL") {
        result = {
          success: false,
          message: "Apenas solicitações pendentes podem ser aprovadas."
        };
        return current;
      }

      if (book.type === "physical" && Number(book.availableQuantity ?? 0) <= 0) {
        result = {
          success: false,
          message: "Não há estoque suficiente para liberar esta retirada."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        ...changes,
        approvedAt: new Date().toISOString(),
        status: "READY_FOR_PICKUP"
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      result = {
        success: true,
        message: "Solicitação aprovada e pronta para retirada."
      };

      return {
        ...current,
        loans,
        books: applyLoanEffects({
          loans,
          books: current.books,
          action: "borrow",
          loan: updatedLoan
        }).books,
        users: syncUsersWithLoans(current.users, loans),
        notifications: pushLoanNotification(
          current.notifications,
          book,
          user,
          updatedLoan,
          "Livro disponível para retirada"
        )
      };
    });

    return result;
  }

  function rejectLoan(loanId, changes = {}) {
    let result = {
      success: false,
      message: "Não foi possível reprovar a solicitação."
    };

    setState((current) => {
      const target = current.loans.find((loan) => loan.id === loanId);
      const book = current.books.find((item) => item.id === target?.bookId);
      const user = current.users.find((item) => item.id === target?.userId);

      if (!target || !book || !user) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      if (target.status !== "PENDING_APPROVAL") {
        result = {
          success: false,
          message: "Apenas solicitações pendentes podem ser reprovadas."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        status: "REJECTED",
        rejectedAt: new Date().toISOString(),
        approvedAt: target.approvedAt ?? "",
        borrowedAt: "",
        dueAt: "",
        readyUntil: "",
        notes: changes.reason ? String(changes.reason) : target.notes
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      result = {
        success: true,
        message: "Solicitação reprovada."
      };

      return {
        ...current,
        loans,
        users: syncUsersWithLoans(current.users, loans),
        notifications: pushRejectedLoanNotification(
          current.notifications,
          book,
          user,
          updatedLoan
        )
      };
    });

    return result;
  }

  function confirmPickup(loanId) {
    let result = {
      success: false,
      message: "Não foi possível confirmar a retirada."
    };

    setState((current) => {
      const target = current.loans.find((loan) => loan.id === loanId);
      const book = current.books.find((item) => item.id === target?.bookId);
      const user = current.users.find((item) => item.id === target?.userId);

      if (!target || !book) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      if (target.status !== "READY_FOR_PICKUP") {
        result = {
          success: false,
          message: "Este livro ainda não está liberado para confirmação."
        };
        return current;
      }

      const otherActiveLoan = current.loans.find(
        (loan) =>
          loan.userId === target.userId &&
          loan.id !== target.id &&
          loan.status === "BORROWED"
      );

      if (otherActiveLoan) {
        result = {
          success: false,
          message: "Você precisa devolver o livro atual antes de confirmar esta retirada."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        borrowedAt: new Date().toISOString(),
        status: "BORROWED",
        dueAt: addDays(new Date().toISOString(), current.settings.globalMaxDays),
        readyUntil: ""
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      result = {
        success: true,
        message: "Retirada confirmada com sucesso."
      };

      return {
        ...current,
        loans,
        users: syncUsersWithLoans(current.users, loans),
        notifications: markLoanNotificationAsRead(current.notifications, updatedLoan, user)
      };
    });

    return result;
  }

  function markReturned(loanId) {
    let result = {
      success: false,
      message: "Não foi possível registrar a devolução."
    };

    setState((current) => {
      const target = current.loans.find((loan) => loan.id === loanId);

      if (!target) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        returnedAt: new Date().toISOString(),
        status: "RETURNED"
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      const next = applyLoanEffects({
        loans,
        books: current.books,
        action: "return",
        loan: updatedLoan
      });
      const promoted = promoteWaitlistAfterReturn({
        state: {
          ...current,
          books: next.books,
          loans: next.loans,
          waitlists: current.waitlists,
          notifications: current.notifications
        },
        bookId: updatedLoan.bookId
      });
      const nextUsers = syncUsersWithLoans(
        current.users.map((user) =>
          user.id === updatedLoan.userId
            ? {
                ...user,
                completedLoansCount: Number(user.completedLoansCount ?? 0) + 1
              }
            : user
        ),
        promoted.loans
      );
      result = {
        success: true,
        message: "Devolução registrada e estoque atualizado."
      };

      return {
        ...current,
        loans: promoted.loans,
        books: promoted.books,
        users: nextUsers,
        waitlists: promoted.waitlists,
        notifications: promoted.notifications
      };
    });

    return result;
  }

  function requestReturn(loanId) {
    let result = {
      success: false,
      message: "Não foi possível solicitar a devolução."
    };

    setState((current) => {
      const target = current.loans.find((loan) => loan.id === loanId);
      const book = current.books.find((item) => item.id === target?.bookId);
      const user = current.users.find((item) => item.id === target?.userId);

      if (!target || !book || !user) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      if (target.type === "digital") {
        return current;
      }

      if (target.status !== "BORROWED") {
        result = {
          success: false,
          message: "Somente livros emprestados podem ser devolvidos."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        status: "RETURN_REQUESTED",
        returnRequestedAt: new Date().toISOString()
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      result = {
        success: true,
        message: "Solicitação de devolução enviada. Aguarde a confirmação do responsável."
      };

      return stabilizeAdminState({
        ...current,
        loans,
        users: syncUsersWithLoans(current.users, loans),
        notifications: pushReturnRequestNotifications(
          current.notifications,
          current.users,
          book,
          user,
          updatedLoan
        )
      });
    });

    return result;
  }

  function confirmReturn(loanId) {
    let result = {
      success: false,
      message: "Não foi possível confirmar a devolução."
    };

    setState((current) => {
      const target = current.loans.find((loan) => loan.id === loanId);
      const book = current.books.find((item) => item.id === target?.bookId);
      const user = current.users.find((item) => item.id === target?.userId);

      if (!target || !book || !user) {
        result = {
          success: false,
          message: "Empréstimo não encontrado."
        };
        return current;
      }

      if (target.status !== "RETURN_REQUESTED") {
        result = {
          success: false,
          message: "A devolução ainda não foi solicitada por este usuário."
        };
        return current;
      }

      const updatedLoan = normalizeAdminLoan({
        ...target,
        returnedAt: new Date().toISOString(),
        status: "RETURNED"
      });
      const loans = current.loans.map((loan) => (loan.id === loanId ? updatedLoan : loan));
      const next = applyLoanEffects({
        loans,
        books: current.books,
        action: "return",
        loan: updatedLoan
      });
      const promoted = promoteWaitlistAfterReturn({
        state: {
          ...current,
          books: next.books,
          loans: next.loans,
          waitlists: current.waitlists,
          notifications: current.notifications
        },
        bookId: updatedLoan.bookId
      });
      const nextUsers = syncUsersWithLoans(
        current.users.map((entry) =>
          entry.id === updatedLoan.userId
            ? {
                ...entry,
                completedLoansCount: Number(entry.completedLoansCount ?? 0) + 1
              }
            : entry
        ),
        promoted.loans
      );
      result = {
        success: true,
        message: "Devolução confirmada e estoque atualizado."
      };

      return {
        ...current,
        loans: promoted.loans,
        books: promoted.books,
        users: nextUsers,
        waitlists: promoted.waitlists,
        notifications: pushReturnConfirmedNotification(
          promoted.notifications,
          book,
          user,
          updatedLoan
        )
      };
    });

    return result;
  }

  return {
    currentUser,
    isAdmin:
      currentUser?.role === "admin" &&
      normalizeUserAccessStatus(currentUser?.status ?? currentUser?.accessStatus) === "approved",
    books: state.books,
    users: state.users,
    rules: state.rules,
    gamification: state.gamification,
    loans: state.loans,
    waitlists: state.waitlists,
    notifications: state.notifications,
    settings: state.settings,
    monitoring,
    actions: {
      createBook,
      updateBook,
      removeBook,
      importBooks,
      updateUser,
      submitRegistrationRequest: submitRegistrationRequestSecure,
      createManagedUser: createManagedUserSecure,
      approveUser,
      rejectUser,
      blockUser,
      removeUser,
      changePassword: changePasswordSecure,
      toggleReadingList,
      assignBookToUser,
      updateRules,
      updateGamification,
      updateSettings,
      requestLoan,
      approveLoan,
      rejectLoan,
      confirmPickup,
      markReturned,
      requestReturn,
      confirmReturn
    }
  };
}

function mergeCatalogIntoState(catalog, current) {
  const safeCurrent = createAdminState(current);
  const currentBooks = Array.isArray(current.books) ? current.books : [];
  const currentUsers = Array.isArray(current.users) ? current.users : [];
  const currentLoans = Array.isArray(current.loans) ? current.loans : [];
  const currentWaitlists = Array.isArray(current.waitlists) ? current.waitlists : [];
  const currentNotifications = Array.isArray(current.notifications) ? current.notifications : [];

  const books = mergeById(
    (catalog.books ?? []).map((book) => normalizeAdminBook(fromCatalogBook(book))),
    currentBooks.map((book) => normalizeAdminBook(book))
  );
  const users = mergeUsers(
    (catalog.users ?? []).map((user) => normalizeAdminUser(fromCatalogUser(user))),
    currentUsers.map((user) => normalizeAdminUser(user)),
    BOOTSTRAP_USERS.map((user) => normalizeAdminUser(user))
  );
  const loans = mergeLoans(
    (catalog.loans ?? []).map((loan) =>
      normalizeAdminLoan(fromCatalogLoan(loan, books))
    ),
    currentLoans.map((loan) => normalizeAdminLoan(loan))
  );
  const usersWithAssignments = syncUsersWithLoans(users, loans);

  return {
    books,
    users: usersWithAssignments,
    loans,
    waitlists: currentWaitlists,
    notifications: currentNotifications,
    rules: safeCurrent.rules,
    gamification: safeCurrent.gamification,
    settings: safeCurrent.settings
  };
}

function createAdminState(rawState = {}) {
  return {
    books: Array.isArray(rawState.books) ? rawState.books : [],
    users: Array.isArray(rawState.users) ? rawState.users : [],
    loans: Array.isArray(rawState.loans) ? rawState.loans : [],
    waitlists: Array.isArray(rawState.waitlists) ? rawState.waitlists : [],
    notifications: Array.isArray(rawState.notifications) ? rawState.notifications : [],
    rules: rawState.rules ?? DEFAULT_RULES,
    gamification: rawState.gamification ?? DEFAULT_GAMIFICATION,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(rawState.settings ?? {})
    }
  };
}

function mergeById(seedItems, currentItems) {
  const map = new Map(seedItems.map((item) => [item.id, item]));

  for (const item of currentItems) {
    map.set(item.id, {
      ...map.get(item.id),
      ...item
    });
  }

  return Array.from(map.values());
}

function mergeUsers(seedUsers, currentUsers, forcedUsers = []) {
  const map = new Map();

  for (const user of seedUsers) {
    map.set(user.id, user);
  }

  for (const user of currentUsers) {
    const byEmail = findUserKeyByEmail(map, user.email);
    const key = byEmail ?? user.id;
    map.set(key, {
      ...map.get(key),
      ...user
    });
  }

  for (const user of forcedUsers) {
    const byEmail = findUserKeyByEmail(map, user.email);
    const key = byEmail ?? user.id;
    map.set(key, {
      ...map.get(key),
      ...user
    });
  }

  return Array.from(map.values());
}

function upsertUserIntoState(users, user) {
  const nextUsers = Array.isArray(users) ? users.slice() : [];
  const index = nextUsers.findIndex(
    (entry) =>
      String(entry.id) === String(user.id) ||
      String(entry.email ?? "").trim().toLowerCase() === String(user.email ?? "").trim().toLowerCase()
  );

  if (index >= 0) {
    nextUsers[index] = normalizeAdminUser({
      ...nextUsers[index],
      ...user
    });
    return nextUsers;
  }

  return [normalizeAdminUser(user), ...nextUsers];
}

function findUserKeyByEmail(map, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  for (const [key, user] of map.entries()) {
    if (String(user.email || "").trim().toLowerCase() === normalizedEmail) {
      return key;
    }
  }

  return null;
}

function mergeLoans(seedLoans, currentLoans) {
  const map = new Map(seedLoans.map((loan) => [loan.id, loan]));

  for (const loan of currentLoans) {
    map.set(loan.id, {
      ...map.get(loan.id),
      ...loan
    });
  }

  return Array.from(map.values()).sort(
    (left, right) =>
      new Date(right.requestedAt || right.borrowedAt || 0).getTime() -
      new Date(left.requestedAt || left.borrowedAt || 0).getTime()
  );
}

function syncUsersWithLoans(users, loans) {
  return users.map((user) => {
    const activeLoan = loans.find(
      (loan) =>
        loan.userId === user.id &&
        isActiveLoanStatus(loan.status)
    );

    return normalizeAdminUser({
      ...user,
      activeLoanId: activeLoan?.id ?? null
    });
  });
}

function normalizeAdminBook(book) {
  const totalQuantity = Math.max(1, Number(book.totalQuantity ?? book.totalCopies ?? 1));
  const availableQuantity = Number(
    book.availableQuantity ?? book.availableCopies ?? book.totalQuantity ?? 1
  );
  const type = book.type === "digital" ? "digital" : "physical";
  const normalizedAvailable =
    type === "digital"
      ? Math.max(totalQuantity, Number.isFinite(availableQuantity) ? availableQuantity : totalQuantity)
      : Math.max(0, Math.min(totalQuantity, availableQuantity));

  return {
    id: book.id ?? `book-${Date.now().toString(36)}`,
    title: book.title ?? "",
    author: book.author ?? "",
    summary: book.summary ?? "",
    category: book.category ?? "",
    coverUrl: book.coverUrl ?? "",
    digitalFileName: book.digitalFileName ?? "",
    digitalContentBase64: book.digitalContentBase64 ?? "",
    level: book.level ?? "medium",
    type,
    totalQuantity,
    availableQuantity: normalizedAvailable,
    totalCopies: totalQuantity,
    availableCopies: normalizedAvailable,
    isPremium: Boolean(book.isPremium),
    isActive: book.isActive !== false
  };
}

function normalizeAdminUser(user) {
  const score = Number(user.score ?? user.readingScore ?? 0);
  const cpf = normalizeCpf(user.cpf);
  const role = normalizeUserRole(user.role);
  const accessStatus = normalizeUserAccessStatus(user.accessStatus ?? user.status);

  return {
    id: user.id ?? `user-${Date.now().toString(36)}`,
    name: user.name ?? "",
    email: user.email ?? "",
    role,
    level: normalizeAccessLevel(user.level),
    score,
    readingScore: score,
    activeLoanId: user.activeLoanId ?? null,
    completedLoansCount: Number(user.completedLoansCount ?? 0),
    accessStatus,
    status: accessStatus,
    cpf,
    company: user.company ?? "",
    department: user.department ?? "",
    phone: user.phone ?? "",
    birthDate: user.birthDate ?? "",
    passwordHash: user.passwordHash ?? "",
    passwordSalt: user.passwordSalt ?? "",
    tokenVersion: Number(user.tokenVersion ?? 0),
    lastLoginAt: user.lastLoginAt ?? null,
    approvedAt: user.approvedAt ?? null,
    approvedBy: user.approvedBy ?? null,
    rejectedAt: user.rejectedAt ?? null,
    rejectedBy: user.rejectedBy ?? null,
    rejectionReason: user.rejectionReason ?? "",
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
    createdByAdmin: Boolean(user.createdByAdmin),
    mustChangePassword: Boolean(user.mustChangePassword),
    readingList: Array.isArray(user.readingList) ? user.readingList : [],
    readingGoal: Number(user.readingGoal ?? 0),
    recommendedBookId: user.recommendedBookId ?? "",
    recommendedBookIds: Array.isArray(user.recommendedBookIds)
      ? user.recommendedBookIds
      : user.recommendedBookId
        ? [user.recommendedBookId]
        : []
  };
}

function normalizeAdminLoan(loan) {
  return {
    id: loan.id ?? `loan-${Date.now().toString(36)}`,
    userId: loan.userId ?? "",
    bookId: loan.bookId ?? "",
    requesterId: loan.requesterId ?? loan.userId ?? "",
    requestedAt: loan.requestedAt ?? loan.borrowedAt ?? new Date().toISOString(),
    type: loan.type === "digital" ? "digital" : "physical",
    status: loan.status ?? "PENDING_APPROVAL",
    responsible: loan.responsible ?? "",
    location: loan.location ?? "",
    dueAt: loan.dueAt ?? "",
    readyUntil: loan.readyUntil ?? "",
    approvedAt: loan.approvedAt ?? "",
    rejectedAt: loan.rejectedAt ?? "",
    borrowedAt: loan.borrowedAt ?? "",
    returnedAt: loan.returnedAt ?? "",
    notes: loan.notes ?? ""
  };
}

function isActiveLoanStatus(status) {
  return ["PENDING_APPROVAL", "READY_FOR_PICKUP", "BORROWED"].includes(status);
}

function addHours(baseDate, hours) {
  const target = new Date(baseDate);
  target.setHours(target.getHours() + Number(hours ?? 0));
  return target.toISOString();
}

function buildLoanNotification(loan, book, user, title, message, actionLabel = "Ver livro") {
  return normalizeNotification({
    id: `notification-${loan.id}`,
    userId: user.id,
    bookId: book.id,
    type: "loan",
    title,
    message,
    actionLabel,
    actionTarget: "/livros",
    createdAt: new Date().toISOString(),
    metadata: {
      loanId: loan.id,
      readyUntil: loan.readyUntil || loan.dueAt || ""
    }
  });
}

function pushLoanNotification(notifications, book, user, loan, title) {
  const next = notifications.filter((entry) => entry.id !== `notification-${loan.id}`);
  next.unshift(
    buildLoanNotification(
      loan,
      book,
      user,
      title,
      loan.status === "READY_FOR_PICKUP"
        ? `O livro "${book.title}" está disponível para retirada.`
        : `O livro "${book.title}" foi liberado para leitura.`
    )
  );
  return next;
}

function pushRejectedLoanNotification(notifications, book, user, loan) {
  const next = notifications.filter((entry) => entry.id !== `notification-${loan.id}`);
  next.unshift(
    normalizeNotification({
      id: `notification-${loan.id}`,
      userId: user.id,
      bookId: book.id,
      type: "loan",
      title: "Solicitação negada",
      message: `Sua solicitação para "${book.title}" foi negada. Fale com o responsável pelas liberações.`,
      actionLabel: "Ver minha conta",
      actionTarget: "/minha-conta",
      createdAt: new Date().toISOString(),
      metadata: {
        loanId: loan.id,
        decision: "rejected"
      }
    })
  );
  return next;
}

function pushNotificationsForAdminApproval(notifications, users, book, user, loan) {
  const adminUsers = users.filter((item) => item.role === "admin" && item.accessStatus !== "blocked");
  const next = Array.isArray(notifications) ? notifications.slice() : [];

  const filtered = next.filter(
    (entry) =>
      entry.id !== `notification-${loan.id}` &&
      !adminUsers.some((admin) => entry.id === `notification-${loan.id}-${admin.id}`)
  );

  filtered.unshift(
    normalizeNotification({
      id: `notification-${loan.id}`,
      userId: user.id,
      bookId: book.id,
      type: "loan",
      title: "Solicitação enviada",
      message: `Sua solicitação para "${book.title}" foi enviada para aprovação.`,
      actionLabel: "Ver livro",
      actionTarget: "/livros",
      createdAt: new Date().toISOString(),
      metadata: {
        loanId: loan.id,
        requesterId: user.id
      }
    })
  );

  for (const admin of adminUsers) {
    filtered.unshift(
      normalizeNotification({
        id: `notification-${loan.id}-${admin.id}`,
        userId: admin.id,
        bookId: book.id,
        type: "loan-approval",
        title: "Nova solicitação de empréstimo",
        message: `${user.name} solicitou "${book.title}".`,
        actionLabel: "Abrir solicitacoes",
        actionTarget: "/admin/requests",
        createdAt: new Date().toISOString(),
        metadata: {
          loanId: loan.id,
          requesterId: user.id
        }
      })
    );
  }

  return filtered;
}

function markLoanNotificationAsRead(notifications, loan, user) {
  return notifications.map((notification) => {
    if (notification.metadata?.loanId !== loan.id && notification.bookId !== loan.bookId) {
      return notification;
    }

    return normalizeNotification({
      ...notification,
      readAt: notification.readAt || new Date().toISOString(),
      dismissedAt: notification.dismissedAt || new Date().toISOString()
    });
  });
}

function upsertReadingListForUser(users, userId, bookId) {
  return users.map((user) => {
    if (user.id !== userId) {
      return user;
    }

    const currentList = Array.isArray(user.readingList) ? user.readingList : [];
    const nextList = currentList.includes(bookId) ? currentList : [...currentList, bookId];

    return normalizeAdminUser({
      ...user,
      readingList: nextList
    });
  });
}

function createWaitlistEntry({ waitlists, bookId, userId }) {
  const position = getWaitlistPosition(waitlists, bookId, userId);

  if (position) {
    const existing = waitlists.find(
      (entry) =>
        entry.bookId === bookId &&
        entry.userId === userId &&
        entry.status === "WAITING"
    );

    return {
      entry: existing ?? normalizeWaitlistEntry({
        bookId,
        userId
      }),
      waitlists,
      position
    };
  }

  const entry = normalizeWaitlistEntry({
    id: `waitlist-${Date.now().toString(36)}`,
    bookId,
    userId,
    requestedAt: new Date().toISOString(),
    status: "WAITING"
  });

  return {
    entry,
    position: getWaitlistPosition([...waitlists, entry], bookId, userId),
    waitlists: [entry, ...waitlists]
  };
}

function getWaitlistPosition(waitlists, bookId, userId) {
  const queue = waitlists.filter(
    (entry) => entry.bookId === bookId && entry.status !== "CANCELLED" && entry.status !== "EXPIRED"
  );
  const index = queue.findIndex((entry) => entry.userId === userId);
  return index >= 0 ? index + 1 : queue.length + 1;
}

function promoteWaitlistAfterReturn({ state, bookId }) {
  const books = state.books.map((book) => ({ ...book }));
  const loans = state.loans.map((loan) => normalizeAdminLoan(loan));
  let waitlists = state.waitlists.map((entry) => normalizeWaitlistEntry(entry));
  let notifications = state.notifications.map((entry) => normalizeNotification(entry));
  const book = books.find((item) => item.id === bookId);

  if (!book || book.type !== "physical") {
    return { books, loans, waitlists, notifications };
  }

  let available = Number(book.availableQuantity ?? 0);
  const now = new Date().toISOString();

  while (available > 0) {
    const nextWaiting = waitlists.find(
      (entry) =>
        entry.bookId === bookId &&
        entry.status === "WAITING"
    );

    if (!nextWaiting) {
      break;
    }

    const user = state.users.find((item) => item.id === nextWaiting.userId);

    if (!user) {
      nextWaiting.status = "CANCELLED";
      continue;
    }

    const reservationUntil = addHours(now, state.settings.reservationWindowHours);
    const loan = normalizeAdminLoan({
      id: `admin-loan-${Date.now().toString(36)}`,
      userId: user.id,
      bookId: book.id,
      requesterId: user.id,
      requestedAt: now,
      type: "physical",
      status: "READY_FOR_PICKUP",
      responsible: "",
      location: "",
      dueAt: reservationUntil,
      readyUntil: reservationUntil,
      borrowedAt: "",
      returnedAt: "",
      notes: ""
    });

    loans.unshift(loan);
    notifications = pushLoanNotification(
      notifications,
      book,
      user,
      loan,
      "Livro disponível para retirada"
    );

    nextWaiting.status = "READY";
    nextWaiting.readyAt = now;
    nextWaiting.readyUntil = reservationUntil;
    nextWaiting.loanId = loan.id;
    nextWaiting.notificationId = `notification-${loan.id}`;

    available -= 1;
  }

  book.availableQuantity = available;
  book.availableCopies = available;

  return { books, loans, waitlists, notifications };
}

function expireReservations(state) {
  const books = state.books.map((book) => ({ ...book }));
  const loans = state.loans.map((loan) => normalizeAdminLoan(loan));
  const waitlists = state.waitlists.map((entry) => normalizeWaitlistEntry(entry));
  let notifications = state.notifications.map((entry) => normalizeNotification(entry));
  const now = Date.now();

  for (const loan of loans) {
    if (loan.status !== "READY_FOR_PICKUP" || !loan.readyUntil) {
      continue;
    }

    if (new Date(loan.readyUntil).getTime() >= now) {
      continue;
    }

    loan.status = "EXPIRED";

    const book = books.find((item) => item.id === loan.bookId);
    if (book && book.type === "physical") {
      const totalQuantity = Number(book.totalQuantity ?? 1);
      book.availableQuantity = Math.min(totalQuantity, Number(book.availableQuantity ?? 0) + 1);
      book.availableCopies = book.availableQuantity;
    }

    const relatedWaitlist = waitlists.find((entry) => entry.loanId === loan.id);
    if (relatedWaitlist) {
      relatedWaitlist.status = "EXPIRED";
    }

    notifications = notifications.map((notification) =>
      notification.metadata?.loanId === loan.id
        ? normalizeNotification({
            ...notification,
            readAt: notification.readAt || new Date().toISOString(),
            dismissedAt: notification.dismissedAt || new Date().toISOString()
          })
        : notification
    );
  }

  return { books, loans, waitlists, notifications };
}

function pushNotification(notifications, notification) {
  const next = Array.isArray(notifications) ? notifications.slice() : [];
  const normalized = normalizeNotification(notification);
  const filtered = next.filter((entry) => entry.id !== normalized.id);
  filtered.unshift(normalized);
  return filtered;
}

function normalizeWaitlistEntry(entry) {
  return {
    id: entry.id ?? `waitlist-${Date.now().toString(36)}`,
    bookId: entry.bookId ?? "",
    userId: entry.userId ?? "",
    requestedAt: entry.requestedAt ?? new Date().toISOString(),
    status: entry.status ?? "WAITING",
    readyAt: entry.readyAt ?? "",
    readyUntil: entry.readyUntil ?? "",
    notificationId: entry.notificationId ?? "",
    loanId: entry.loanId ?? ""
  };
}

function normalizeNotification(notification) {
  return {
    id: notification.id ?? `notification-${Date.now().toString(36)}`,
    userId: notification.userId ?? "",
    bookId: notification.bookId ?? "",
    type: notification.type ?? "info",
    title: notification.title ?? "",
    message: notification.message ?? "",
    actionLabel: notification.actionLabel ?? "",
    actionTarget: notification.actionTarget ?? "",
    createdAt: notification.createdAt ?? new Date().toISOString(),
    readAt: notification.readAt ?? "",
    dismissedAt: notification.dismissedAt ?? "",
    metadata: notification.metadata ?? {}
  };
}

function fromCatalogBook(book) {
  return {
    ...book,
    summary: book.summary ?? "",
    coverUrl: book.coverUrl ?? "",
    type: book.type ?? "physical",
    totalQuantity: book.totalCopies,
    availableQuantity: book.availableCopies
  };
}

function fromCatalogUser(user) {
  return {
    ...user,
    score: user.readingScore,
    accessStatus: normalizeUserAccessStatus(user.accessStatus ?? user.status ?? "approved"),
    status: normalizeUserAccessStatus(user.accessStatus ?? user.status ?? "approved")
  };
}

function fromCatalogLoan(loan, books) {
  const book = books.find((item) => item.id === loan.bookId);

  return {
    id: loan.id,
    userId: loan.userId,
    bookId: loan.bookId,
    requesterId: loan.userId,
    requestedAt: loan.borrowedAt,
    type: book?.type ?? "physical",
    status: loan.status === "returned" ? "RETURNED" : "BORROWED",
    responsible: "Equipe Lumiar Flow",
    location: "Biblioteca Lumiar Flow",
    dueAt: loan.dueAt,
    borrowedAt: loan.borrowedAt,
    returnedAt: loan.returnedAt ?? "",
    notes: ""
  };
}

function applyLoanEffects({ loans, books, action, loan }) {
  const nextBooks = books.map((book) => ({ ...book }));
  const targetBook = nextBooks.find((item) => item.id === loan.bookId);

  if (targetBook && targetBook.type === "physical") {
    if (action === "borrow") {
      targetBook.availableQuantity = Math.max(0, targetBook.availableQuantity - 1);
    }

    if (action === "return") {
      targetBook.availableQuantity = Math.min(
        targetBook.totalQuantity,
        targetBook.availableQuantity + 1
      );
    }

    targetBook.availableCopies = targetBook.availableQuantity;
    targetBook.totalCopies = targetBook.totalQuantity;
  }

  return {
    loans,
    books: nextBooks
  };
}

function addDays(baseDate, days) {
  const target = new Date(baseDate);
  target.setDate(target.getDate() + Number(days ?? 0));
  return target.toISOString();
}

function buildMonitoring(state, catalog) {
  const loans = Array.isArray(state.loans) ? state.loans : [];
  const users = Array.isArray(state.users) ? state.users : [];
  const books = Array.isArray(state.books) ? state.books : [];
  const returns = Array.isArray(catalog.returns) ? catalog.returns : [];

  const overdueUsers = loans
    .filter(
      (loan) =>
        loan.status === "BORROWED" &&
        loan.dueAt &&
        new Date(loan.dueAt).getTime() < Date.now()
    )
    .map((loan) => {
      const user = users.find((item) => item.id === loan.userId);
      const book = books.find((item) => item.id === loan.bookId);

      return {
        id: loan.id,
        userName: user?.name ?? "Usuario",
        bookTitle: book?.title ?? "Livro",
        dueAt: loan.dueAt
      };
    });

  const ranking = [...users].sort((left, right) => right.score - left.score);
  const mostReadBooks = [...books]
    .map((book) => ({
      ...book,
      reads: loans.filter((loan) => loan.bookId === book.id).length
    }))
    .sort((left, right) => right.reads - left.reads)
    .slice(0, 5);
  const answerQuality = [...returns]
    .sort((left, right) => (right.qualityScore ?? 0) - (left.qualityScore ?? 0))
    .slice(0, 5);

  return {
    overdueUsers,
    ranking,
    mostReadBooks,
    answerQuality
  };
}

function readAdminState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writeAdminState(state) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Ignore storage failures in desktop browsers with restricted storage.
  }
}
