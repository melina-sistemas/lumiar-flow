import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";
import { PageLayout } from "../components/PageLayout.js";
import { Section } from "../components/Section.js";
import { FeedbackMessage } from "../components/FeedbackMessage.js";
import { createPlaceholderCover } from "../services/google-books.js";

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

  const actionableLoans = useMemo(
    () =>
      userLoans
        .filter((loan) => loan.status !== "RETURNED")
        .map((loan) => {
          const book = books.find((item) => item.id === loan.bookId);
          return {
            ...loan,
            book
          };
        })
        .filter((loan) => loan.book),
    [books, userLoans]
  );

  const readLoans = userLoans.filter((loan) => loan.status === "RETURNED");
  const activeLoans = userLoans.filter((loan) => loan.status !== "RETURNED");
  const averageDays = calculateAverageDays(readLoans);

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

  const personalizedRecommendations = useMemo(
    () =>
      buildPersonalizedRecommendations({
        books,
        readingList,
        readLoans,
        currentUser,
        userLoans
      }),
    [books, currentUser, readLoans, readingList, userLoans]
  );

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
                <h3>Leituras e filas</h3>
                <p>Acompanhe seus empréstimos atuais, reservas e a posição na fila de espera.</p>
              </div>
            </div>

            <div className="account-reading-grid">
              ${actionableLoans.length > 0
                ? actionableLoans.map(
                    (loan) => html`
                      <article key=${loan.id} className="account-reading-card">
                        <div className="account-book-card-shell">
                          <div className="account-book-cover">
                            ${renderBookCover(loan.book)}
                          </div>
                          <div className="account-book-content">
                            <div className="account-card-top">
                              <strong>${loan.book.title}</strong>
                              <span className=${`account-status-pill ${translateLoanStatusClass(loan.status)}`}>
                                ${translateLoanStatus(loan.status)}
                              </span>
                            </div>
                            <span>${loan.book.author}</span>
                            <small>
                              ${loan.status === "READY_FOR_PICKUP"
                                ? `Retire ate ${formatDate(loan.readyUntil || loan.dueAt)}`
                                : loan.status === "BORROWED"
                                ? `Devolução prevista para ${formatDate(loan.dueAt)}`
                                : `Solicitado em ${formatDate(loan.requestedAt)}`}
                            </small>
                          </div>
                        </div>

                        <div className="account-form-actions between">
                          ${loan.status === "BORROWED"
                            ? html`
                                <button
                                  type="button"
                                  className="admin-primary"
                                  onClick=${() => {
                                    const result = actions.markReturned(loan.id);
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
                            : loan.status === "READY_FOR_PICKUP"
                            ? html`
                                <button
                                  type="button"
                                  className="admin-primary"
                                  onClick=${() => {
                                    const result = actions.confirmPickup(loan.id);
                                    setFeedback({
                                      tone: result.success ? "success" : "error",
                                      title: result.success ? "Retirada confirmada" : "Não foi possível confirmar",
                                      message: result.message
                                    });
                                  }}
                                >
                                  Confirmar retirada
                                </button>
                              `
                            : null}
                        </div>
                      </article>
                    `
                  )
                : html`
                    <article className="account-reading-card account-empty-card">
                      <strong>Nenhuma leitura em andamento</strong>
                      <span>Quando houver empréstimos ou reservas, eles aparecem aqui.</span>
                    </article>
                  `}
            </div>

            <div className="account-waitlist-block">
              <div className="account-panel-head compact">
                <div>
                  <h4>Fila de espera</h4>
                  <p>Livros que você quer ler, mas ainda aguardam disponibilidade.</p>
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
                            </div>
                            <span className="account-soft-pill">Fila #${entry.position || 1}</span>
                          </article>
                        `;
                      })}
                    </div>
                  `
                : html`
                    <p className="admin-helper">Nenhum livro na fila de espera no momento.</p>
                  `}
            </div>
          </div>

          <div className="account-hub-block">
            <div className="account-block-heading">
              <div>
                <h3>Recomendações para você</h3>
                <p>Sugestões baseadas no que você já leu e no que faz sentido para o seu perfil.</p>
              </div>
            </div>

            <div className="account-recommendations-grid">
              ${personalizedRecommendations.length > 0
                ? personalizedRecommendations.map(
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
                          <p>${book.recommendationReason}</p>
                          <button
                            type="button"
                            className="admin-primary"
                            onClick=${() => actions.toggleReadingList(currentUser.id, book.id)}
                          >
                            Adicionar a minha lista
                          </button>
                        </div>
                      </article>
                    `
                  )
                : html`
                    <article className="account-reading-card account-empty-card">
                      <strong>Sem recomendações no momento</strong>
                      <span>A Lumiar Flow vai sugerir leituras conforme você usar mais o sistema.</span>
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
  const readLoan = loans.find((loan) => loan.bookId === book.id && loan.status === "RETURNED");
  if (readLoan) {
    return { key: "read", label: "Já lido" };
  }

  const activeLoan = loans.find((loan) => loan.bookId === book.id && loan.status !== "RETURNED");
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

function translateLoanStatusClass(status) {
  switch (status) {
    case "READY_FOR_PICKUP":
      return "borrowed";
    case "BORROWED":
      return "borrowed";
    case "RETURNED":
      return "read";
    case "REJECTED":
      return "unavailable";
    default:
      return "available";
  }
}

function translateLoanStatus(status) {
  switch (status) {
    case "READY_FOR_PICKUP":
      return "Pronto para retirada";
    case "BORROWED":
      return "Emprestado";
    case "RETURNED":
      return "Devolvido";
    case "PENDING_APPROVAL":
      return "Aguardando aprovação";
    case "REJECTED":
      return "Solicitação negada";
    case "EXPIRED":
      return "Reserva expirada";
    default:
      return "Em andamento";
  }
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
  if (book?.coverUrl) {
    return html`<img
      src=${book.coverUrl}
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


