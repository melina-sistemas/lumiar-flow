import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";
import { PageLayout } from "../components/PageLayout.js";
import { Section } from "../components/Section.js";
import { FeedbackMessage } from "../components/FeedbackMessage.js";
import { createPlaceholderCover, resolveBookCoverSource } from "../services/google-books.js";
import {
  getLoanStatusLabel,
  getWaitlistPosition,
  isLoanActive,
  isLoanBorrowed,
  isLoanPendingApproval,
  isLoanReturned,
  normalizeLoanStatus
} from "../features/books/loan-status.js";

const html = htm.bind(React.createElement);

export function MyAccountPage({ currentUser, books, loans, waitlists = [], notifications = [], actions }) {
  const [profileForm, setProfileForm] = useState(() => buildProfileForm(currentUser));
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: ""
  });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setProfileForm(buildProfileForm(currentUser));
  }, [currentUser]);

  const userLoans = useMemo(
    () => loans.filter((loan) => loan.userId === currentUser?.id),
    [currentUser?.id, loans]
  );

  const userWaitlists = useMemo(
    () => waitlists.filter((entry) => entry.userId === currentUser?.id),
    [currentUser?.id, waitlists]
  );

  const readLoans = userLoans.filter((loan) => isLoanReturned(loan.status));
  const activeLoans = userLoans.filter((loan) => isLoanActive(loan.status));
  const averageDays = calculateAverageDays(readLoans);
  const currentLoan =
    userLoans.find(
      (loan) =>
        isLoanBorrowed(loan.status) ||
        isLoanPendingApproval(loan.status) ||
        ["AGUARDANDO_RETIRADA", "AGUARDANDO_CONFIRMACAO"].includes(
          normalizeLoanStatus(loan.status)
        )
    ) ?? null;
  const currentBook = currentLoan
    ? books.find((book) => book.id === currentLoan.bookId) ?? null
    : null;

  const readingList = useMemo(
    () =>
      books
        .filter((book) => currentUser?.readingList?.includes(book.id))
        .map((book) => ({
          ...book,
          status: getReadingListStatus(book, userLoans)
        })),
    [books, currentUser?.readingList, userLoans]
  );
  const favorites = readingList;

  const topStats = [
    { label: "Livros lidos", value: readLoans.length },
    { label: "Em andamento", value: activeLoans.length },
    { label: "Tempo médio", value: averageDays ? `${averageDays} dias` : "-" }
  ];

  const profileCompletion = calculateProfileCompletion(profileForm);

  return html`
    <${PageLayout}
      eyebrow="Minha conta"
      title="Minha Conta"
      description="Seu espaço pessoal para organizar leituras e manter seus dados atualizados."
      stats=${topStats}
    >
      ${feedback
        ? html`
            <${FeedbackMessage}
              tone=${feedback.tone}
              title=${feedback.title}
              message=${feedback.message}
            />
          `
        : null}

      ${currentUser?.accessStatus === "pending"
        ? html`
            <${FeedbackMessage}
              tone="info"
              title="Acesso em aprovação"
              message="Seu cadastro está em aprovação. Você pode editar seus dados, acompanhar leituras e consultar livros digitais permitidos, mas empréstimos físicos ainda aguardam liberação."
            />
          `
        : null}

      <${Section} title="" description="" className="account-hub-section">
        <div className="account-hub">
          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Dados da conta</h3>
                <p>Atualize seu perfil e mantenha seus acessos organizados de forma simples.</p>
              </div>
              <button
                type="button"
                className="admin-secondary account-toggle-button"
                onClick=${() => {
                  setShowProfileEditor((current) => {
                    const next = !current;
                    if (!next) {
                      setShowPasswordForm(false);
                      setPasswordForm({ password: "", confirmPassword: "" });
                    }
                    return next;
                  });
                }}
              >
                ${showProfileEditor ? "Ocultar dados" : "Abrir dados da conta"}
              </button>
            </div>

            ${showProfileEditor
              ? html`
                  <div className="account-settings-stack">
                    <form
                      className="account-profile-form"
                      onSubmit=${(event) => {
                        event.preventDefault();
                        actions.updateUser(currentUser.id, profileForm);
                        setFeedback({
                          tone: "success",
                          title: "Dados atualizados",
                          message: "Seu perfil foi salvo com sucesso."
                        });
                      }}
                    >
                      <div className="account-form-grid">
                        <label className="account-field account-field-span-2">
                          <span>Nome completo</span>
                          <input
                            type="text"
                            value=${profileForm.name}
                            onInput=${(event) =>
                              setProfileForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Como você deseja aparecer no sistema"
                          />
                        </label>

                        <label className="account-field">
                          <span>Email</span>
                          <input
                            type="email"
                            value=${profileForm.email}
                            onInput=${(event) =>
                              setProfileForm((current) => ({ ...current, email: event.target.value }))}
                            placeholder="você@empresa.com"
                          />
                        </label>

                        <label className="account-field">
                          <span>Telefone</span>
                          <input
                            type="text"
                            value=${profileForm.phone}
                            onInput=${(event) =>
                              setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                            placeholder="(00) 00000-0000"
                          />
                        </label>

                        <label className="account-field">
                          <span>Empresa</span>
                          <input
                            type="text"
                            value=${profileForm.company}
                            onInput=${(event) =>
                              setProfileForm((current) => ({ ...current, company: event.target.value }))}
                            placeholder="Empresa"
                          />
                        </label>

                        <label className="account-field">
                          <span>Setor</span>
                          <input
                            type="text"
                            value=${profileForm.department}
                            onInput=${(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                department: event.target.value
                              }))}
                            placeholder="Seu setor"
                          />
                        </label>

                        <label className="account-field">
                          <span>CPF</span>
                          <input type="text" value=${profileForm.cpf} readOnly />
                        </label>

                        <label className="account-field">
                          <span>Data de nascimento</span>
                          <input
                            type="date"
                            value=${profileForm.birthDate}
                            onInput=${(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                birthDate: event.target.value
                              }))}
                          />
                        </label>
                      </div>

                      <div className="account-form-actions between">
                        <button
                          type="button"
                          className="admin-secondary"
                          onClick=${() => {
                            setShowPasswordForm((current) => !current);
                            setPasswordForm({ password: "", confirmPassword: "" });
                          }}
                        >
                          ${showPasswordForm ? "Cancelar troca de senha" : "Trocar senha"}
                        </button>
                        <button type="submit" className="admin-primary">Salvar alterações</button>
                      </div>
                    </form>

                    ${showPasswordForm
                      ? html`
                          <form
                            className="account-password-form"
                            onSubmit=${async (event) => {
                              event.preventDefault();

                              if (!passwordForm.password || passwordForm.password !== passwordForm.confirmPassword) {
                                setFeedback({
                                  tone: "error",
                                  title: "Senha inválida",
                                  message: "Confirme a nova senha corretamente para continuar."
                                });
                                return;
                              }

                              const result = await Promise.resolve(
                                actions.changePassword(currentUser.id, passwordForm.password)
                              );
                              setFeedback({
                                tone: result.success ? "success" : "error",
                                title: result.success ? "Senha atualizada" : "Não foi possível atualizar",
                                message: result.message
                              });
                              if (result.success) {
                                setPasswordForm({ password: "", confirmPassword: "" });
                                setShowPasswordForm(false);
                              }
                            }}
                          >
                            <div className="account-panel-head compact">
                              <div>
                                <h4>Nova senha</h4>
                                <p>Preencha os campos abaixo apenas quando quiser alterar sua senha.</p>
                              </div>
                            </div>

                            <div className="account-form-grid">
                              <label className="account-field">
                                <span>Nova senha</span>
                                <input
                                  type="password"
                                  value=${passwordForm.password}
                                  onInput=${(event) =>
                                    setPasswordForm((current) => ({
                                      ...current,
                                      password: event.target.value
                                    }))}
                                  placeholder="Digite sua nova senha"
                                />
                              </label>

                              <label className="account-field">
                                <span>Confirmar nova senha</span>
                                <input
                                  type="password"
                                  value=${passwordForm.confirmPassword}
                                  onInput=${(event) =>
                                    setPasswordForm((current) => ({
                                      ...current,
                                      confirmPassword: event.target.value
                                    }))}
                                  placeholder="Repita a senha"
                                />
                              </label>
                            </div>

                            <div className="account-form-actions">
                              <button type="submit" className="admin-primary">Atualizar senha</button>
                            </div>
                          </form>
                        `
                      : null}
                  </div>
                `
              : null}
          </div>

          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Livro atual</h3>
                <p>Veja o livro que está com você agora e o prazo de devolução.</p>
              </div>
            </div>

            ${currentLoan && currentBook
              ? html`
                  <article className="account-reading-card">
                    <div className="account-book-card-shell">
                      <div className="account-book-cover">
                        ${renderBookCover(currentBook)}
                      </div>
                      <div className="account-book-content">
                        <div className="account-card-top">
                          <strong>${currentBook.title}</strong>
                          <span className=${`account-status-pill ${getLoanStatusTone(currentLoan.status)}`}>
                            ${getLoanStatusLabel(currentLoan.status)}
                          </span>
                        </div>
                        <span>${currentBook.author}</span>
                        <small>
                          ${isLoanPendingApproval(currentLoan.status)
                            ? `Solicitado em ${formatDate(currentLoan.requestedAt)}`
                            : `Retirada em ${formatDate(currentLoan.borrowedAt || currentLoan.requestedAt)} · Devolução prevista ${formatDate(currentLoan.dueAt)}`}
                        </small>
                      </div>
                    </div>

                    <div className="account-reading-details">
                      <span>Restam ${getRemainingDaysLabel(currentLoan.dueAt)}</span>
                      <span>Tipo ${currentBook.type === "digital" ? "digital" : "físico"}</span>
                    </div>

                    <div className="account-form-actions between">
                      ${isLoanBorrowed(currentLoan.status) && currentLoan.type !== "digital"
                        ? html`
                            <button
                              type="button"
                              className="admin-primary"
                              onClick=${() => {
                                const result = actions.markReturned(currentLoan.id);
                                setFeedback({
                                  tone: result.success ? "success" : "error",
                                  title: result.success ? "Devolução registrada" : "Não foi possível devolver",
                                  message: result.message
                                });
                              }}
                            >
                              Devolver
                            </button>
                          `
                        : null}
                    </div>
                  </article>
                `
              : html`
                  <article className="account-reading-card account-empty-card">
                    <strong>Nenhum livro em andamento</strong>
                    <span>Quando você solicitar ou abrir uma leitura digital, ela aparecerá aqui.</span>
                  </article>
                `}
          </div>

          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Fila de espera</h3>
                <p>Você pode acompanhar sua posição e sair da fila quando quiser.</p>
              </div>
            </div>

            ${userWaitlists.length > 0
              ? html`
                  <div className="account-waitlist-list">
                    ${userWaitlists.map((entry) => {
                      const book = books.find((item) => item.id === entry.bookId);
                      return html`
                        <article key=${entry.id} className="account-waitlist-card">
                          <div>
                            <strong>${book?.title || "Livro indisponível"}</strong>
                            <p>${book?.author || "Biblioteca interna"}</p>
                            <small>Adicionado em ${formatDate(entry.requestedAt)}</small>
                          </div>
                          <div className="account-waitlist-actions">
                            <span className="account-soft-pill">Fila #${getWaitlistPosition(waitlists, entry.bookId, entry.userId)}</span>
                            <button
                              type="button"
                              className="admin-secondary"
                              onClick=${() => {
                                const result = actions.removeWaitlistEntry(entry.id);
                                setFeedback({
                                  tone: result.success ? "success" : "error",
                                  title: result.success ? "Fila atualizada" : "Não foi possível remover",
                                  message: result.message
                                });
                              }}
                            >
                              Remover
                            </button>
                          </div>
                        </article>
                      `;
                    })}
                  </div>
                `
              : html`
                  <article className="account-reading-card account-empty-card">
                    <strong>Nenhum livro na fila de espera</strong>
                    <span>Quando você entrar em uma fila, ela aparecerá nesta seção.</span>
                  </article>
                `}
          </div>

          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Histórico</h3>
                <p>Veja os livros que você já leu e o tempo de cada leitura.</p>
              </div>
            </div>

            ${readLoans.length > 0
              ? html`
                  <div className="account-history-list">
                    ${readLoans
                      .slice()
                      .sort((left, right) =>
                        new Date(right.returnedAt || right.borrowedAt || 0).getTime() -
                        new Date(left.returnedAt || left.borrowedAt || 0).getTime()
                      )
                      .map((loan) => {
                        const book = books.find((item) => item.id === loan.bookId);
                        return html`
                          <article key=${loan.id} className="account-waitlist-card">
                            <div>
                              <strong>${book?.title || "Livro"}</strong>
                              <p>${book?.author || "Biblioteca interna"}</p>
                              <small>
                                Retirada: ${formatDate(loan.borrowedAt || loan.requestedAt)} · Devolução: ${formatDate(loan.returnedAt)}
                              </small>
                            </div>
                            <span className="account-soft-pill">
                              ${calculateReadingTimeLabel(loan.borrowedAt, loan.returnedAt)}
                            </span>
                          </article>
                        `;
                      })}
                  </div>
                `
              : html`
                  <article className="account-reading-card account-empty-card">
                    <strong>Nenhum livro lido ainda</strong>
                    <span>Seu histórico vai aparecer aqui depois da primeira devolução ou leitura concluída.</span>
                  </article>
                `}
          </div>

          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Favoritos</h3>
                <p>Livros que você marcou para ler depois.</p>
              </div>
            </div>

            <div className="account-recommendations-grid">
              ${favorites.length > 0
                ? favorites.map(
                    (book) => html`
                      <article key=${book.id} className="account-recommendation-card">
                        <div className="account-recommendation-cover">
                          ${renderBookCover(book)}
                        </div>
                        <div className="account-recommendation-body">
                          <div className="account-card-top">
                            <strong>${book.title}</strong>
                            <span className=${`account-status-pill ${book.status.key}`}>${book.status.label}</span>
                          </div>
                          <span>${book.author}</span>
                          <small>${book.category || "Biblioteca interna"}</small>
                          <button
                            type="button"
                            className="admin-primary"
                            onClick=${() => actions.toggleReadingList(currentUser.id, book.id)}
                          >
                            Remover dos favoritos
                          </button>
                        </div>
                      </article>
                    `
                  )
                : html`
                    <article className="account-reading-card account-empty-card">
                      <strong>Sem favoritos no momento</strong>
                      <span>Use a página de livros para salvar títulos para depois.</span>
                    </article>
                  `}
            </div>
          </div>

        </div>
      <//>
    <//>
  `;
}

function getReadingListStatus(book, loans) {
  const readLoan = loans.find((loan) => loan.bookId === book.id && isLoanReturned(loan.status));
  if (readLoan) {
    return { key: "read", label: "Já lido" };
  }

  const activeLoan = loans.find((loan) => loan.bookId === book.id && isLoanActive(loan.status));
  if (activeLoan) {
    return { key: "borrowed", label: "Emprestado" };
  }

  const available =
    book.type === "digital" || Number(book.availableCopies ?? book.availableQuantity ?? 0) > 0;
  return {
    key: available ? "available" : "unavailable",
    label: available ? "Disponível" : "Sem estoque"
  };
}

function calculateAverageDays(loans) {
  const durations = loans
    .map((loan) => {
      if (!loan.borrowedAt || !loan.returnedAt) {
        return null;
      }

      const days = Math.round(
        (new Date(loan.returnedAt).getTime() - new Date(loan.borrowedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      return days >= 0 ? days : null;
    })
    .filter((value) => value !== null);

  if (durations.length === 0) {
    return 0;
  }

  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("pt-BR");
}

function getLoanStatusTone(status) {
  if (isLoanBorrowed(status)) {
    return "borrowed";
  }

  if (isLoanPendingApproval(status)) {
    return "pending";
  }

  if (["AGUARDANDO_RETIRADA", "AGUARDANDO_CONFIRMACAO"].includes(normalizeLoanStatus(status))) {
    return "pending";
  }

  if (isLoanReturned(status)) {
    return "read";
  }

  return "available";
}

function getRemainingDaysLabel(dueAt) {
  if (!dueAt) {
    return "-";
  }

  const diffDays = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `Atrasado há ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? "" : "s"}`;
  }

  if (diffDays === 0) {
    return "Devolver hoje";
  }

  return `${diffDays} dia${diffDays === 1 ? "" : "s"}`;
}

function calculateReadingTimeLabel(borrowedAt, returnedAt) {
  if (!borrowedAt || !returnedAt) {
    return "Tempo não disponível";
  }

  const diffDays = Math.max(
    1,
    Math.round((new Date(returnedAt).getTime() - new Date(borrowedAt).getTime()) / (1000 * 60 * 60 * 24))
  );

  return `${diffDays} dia${diffDays === 1 ? "" : "s"}`;
}

function translateAccessStatus(status) {
  switch (status) {
    case "active":
      return "Ativo";
    case "pending":
      return "Pendente";
    case "rejected":
      return "Recusado";
    default:
      return "-";
  }
}

function buildPersonalizedRecommendations({ books, readingList, readLoans, currentUser, userLoans }) {
  const readBookIds = new Set(readLoans.map((loan) => loan.bookId));
  const readingListIds = new Set(readingList.map((book) => book.id));
  const preferredCategories = new Set(
    [...readingList, ...readLoans.map((loan) => books.find((book) => book.id === loan.bookId)).filter(Boolean)]
      .map((item) => item?.category)
      .filter(Boolean)
  );

  return books
    .filter((book) => !readingListIds.has(book.id) && !readBookIds.has(book.id))
    .map((book) => {
      const status = getReadingListStatus(book, userLoans);
      const availableNow =
        book.type === "digital" || Number(book.availableCopies ?? book.availableQuantity ?? 0) > 0;
      let score = 0;

      if (preferredCategories.has(book.category)) {
        score += 50;
      }

      if (availableNow) {
        score += 30;
      }

      if (book.isPremium && isGoldLevel(currentUser?.level)) {
        score += 18;
      }

      if (!book.isPremium) {
        score += 8;
      }

      if (book.level === "medium") {
        score += 10;
      }

      if (book.level === "easy") {
        score += 6;
      }

      return {
        ...book,
        status,
        score,
        recommendationReason: buildRecommendationReason(book, preferredCategories, availableNow)
      };
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "pt-BR"))
    .slice(0, 4);
}

function buildRecommendationReason(book, preferredCategories, availableNow) {
  if (preferredCategories.has(book.category)) {
    return `Combina com seu interesse atual em ${book.category}.`;
  }

  if (availableNow) {
    return "Já está pronto para entrar na sua próxima leitura.";
  }

  if (book.isPremium) {
    return "Leitura de destaque para quem já está em um nível mais avançado.";
  }

  return "Boa opção para ampliar seu repertório dentro da biblioteca.";
}

function isGoldLevel(level) {
  return ["gold", "ouro"].includes(String(level || "").trim().toLowerCase());
}

function renderBookCover(book) {
  const coverSource = resolveBookCoverSource(book);

  if (coverSource) {
    return html`<img
      src=${coverSource}
      alt=${`Capa do livro ${book.title || "Lumiar Flow"}`}
      loading="lazy"
      onError=${(event) => {
        const image = event.currentTarget;

        if (image?.dataset?.fallbackApplied === "true") {
          return;
        }

        image.dataset.fallbackApplied = "true";
        image.src = createPlaceholderCover(book);
      }}
    />`;
  }

  return html`
    <div className="account-cover-placeholder">
      <strong>${book?.title?.slice?.(0, 1) || "L"}</strong>
    </div>
  `;
}

function buildProfileForm(user) {
  return {
    name: user?.name || "",
    email: user?.email || "",
    company: user?.company || "",
    department: user?.department || "",
    cpf: getSafeProfileCpf(user),
    phone: user?.phone || "",
    birthDate: user?.birthDate || ""
  };
}

function getSafeProfileCpf(user) {
  const cpf = String(user?.cpf || "").trim();
  const cpfDigits = cpf.replace(/\D/g, "");

  if (cpfDigits.length !== 11) {
    return "";
  }

  return cpf;
}

function calculateProfileCompletion(profileForm) {
  const values = [
    profileForm?.name,
    profileForm?.email,
    profileForm?.company,
    profileForm?.department,
    profileForm?.cpf,
    profileForm?.phone,
    profileForm?.birthDate
  ];
  const filled = values.filter((value) => String(value || "").trim()).length;
  return Math.round((filled / values.length) * 100);
}


