import React, { useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import { normalizeLoanStatus } from "../../features/books/loan-status.js";

const html = htm.bind(React.createElement);

export function AdminUsersPage({ users, loans, books, returns = [], actions }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draftFilters, setDraftFilters] = useState({
    role: "all",
    level: "all",
    status: "all"
  });
  const [adminCreateFeedback, setAdminCreateFeedback] = useState("");
  const [adminCreateForm, setAdminCreateForm] = useState({
    name: "",
    email: "",
    temporaryPassword: "",
    cpf: "",
    company: "",
    department: "",
    role: "user",
    level: "bronze"
  });

  const filteredUsers = useMemo(
    () =>
      users
        .filter((user) =>
          roleFilter === "all" ? true : normalizeRoleForUi(user.role) === roleFilter
        )
        .filter((user) => (levelFilter === "all" ? true : user.level === levelFilter))
        .filter((user) => (statusFilter === "all" ? true : user.accessStatus === statusFilter))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [levelFilter, roleFilter, statusFilter, users]
  );
  const pendingUsers = useMemo(
    () =>
      users
        .filter((user) => user.accessStatus === "pending")
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [users]
  );

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const selectedUserHistory = useMemo(
    () => buildUserHistory({ user: selectedUser, loans, books, returns }),
    [books, loans, returns, selectedUser]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (roleFilter !== "all") {
      count += 1;
    }

    if (levelFilter !== "all") {
      count += 1;
    }

    if (statusFilter !== "all") {
      count += 1;
    }

    return count;
  }, [levelFilter, roleFilter, statusFilter]);

  const actionsBar = html`
    <div className="admin-users-toolbar-actions">
      <div className="admin-users-toolbar-filters">
        <button
          type="button"
          className=${`admin-secondary admin-filter-trigger ${showFilters ? "active" : ""}`}
          onClick=${() => setShowFilters((current) => !current)}
        >
          Filtros
          ${activeFilterCount > 0
            ? html`<span className="admin-filter-count">${activeFilterCount}</span>`
            : null}
        </button>

        ${showFilters
          ? html`
              <form
                className="admin-filters-panel admin-users-filters-panel"
                onSubmit=${(event) => {
                  event.preventDefault();
                  setRoleFilter(draftFilters.role);
                  setLevelFilter(draftFilters.level);
                  setStatusFilter(draftFilters.status);
                  setShowFilters(false);
                }}
              >
                <div className="admin-users-filters-list">
                  <label>
                    <span>Perfil</span>
                    <select
                      value=${draftFilters.role}
                      onChange=${(event) =>
                        setDraftFilters((current) => ({ ...current, role: event.target.value }))}
                    >
                      <option value="all">Todos</option>
                      <option value="staff">Usuário</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>

                  <label>
                    <span>Nível</span>
                    <select
                      value=${draftFilters.level}
                      onChange=${(event) =>
                        setDraftFilters((current) => ({ ...current, level: event.target.value }))}
                    >
                      <option value="all">Todos</option>
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                    </select>
                  </label>

                  <label>
                    <span>Status</span>
                    <select
                      value=${draftFilters.status}
                      onChange=${(event) =>
                        setDraftFilters((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="all">Todos</option>
                      <option value="approved">Ativo</option>
                      <option value="blocked">Bloqueado</option>
                      <option value="pending">Pendente</option>
                      <option value="rejected">Recusado</option>
                    </select>
                  </label>

                  <div className="admin-filter-actions admin-filter-actions-panel">
                    ${activeFilterCount > 0
                      ? html`
                          <button
                            type="button"
                            className="admin-clear-filters"
                            onClick=${() => {
                              const emptyFilters = { role: "all", level: "all", status: "all" };
                              setDraftFilters(emptyFilters);
                              setRoleFilter("all");
                              setLevelFilter("all");
                              setStatusFilter("all");
                            }}
                          >
                            Limpar
                          </button>
                        `
                      : null}
                    <button type="submit" className="admin-primary">Aplicar filtros</button>
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick=${() => setShowFilters(false)}
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </form>
            `
          : null}
      </div>

      <div className="admin-users-toolbar-actions-group">
        ${selectedUserIds.length > 0
          ? html`
              <button
                type="button"
                className="admin-secondary"
                onClick=${async () => {
                  const selectedUsers = filteredUsers.filter((user) =>
                    selectedUserIds.includes(user.id)
                  );

                  if (selectedUsers.length === 0) {
                    return;
                  }

                  const confirmed = globalThis.confirm(
                    `Deseja excluir ${selectedUsers.length} usuário(s) selecionado(s)?`
                  );

                  if (!confirmed) {
                    return;
                  }

                  let deleted = 0;

                  for (const user of selectedUsers) {
                    const result = await Promise.resolve(actions.removeUser(user.id));
                    if (result?.success) {
                      deleted += 1;
                    }
                  }

                  setSelectedUserIds([]);
                  setSelectedUserId("");
                  setAdminCreateFeedback(
                    deleted > 0
                      ? `${deleted} usuário(s) excluído(s) com sucesso.`
                      : "Nenhum usuário pôde ser excluído."
                  );
                }}
              >
                Excluir selecionados (${selectedUserIds.length})
              </button>
            `
          : null}

        <button type="button" className="admin-primary" onClick=${() => setShowCreateModal(true)}>
          + Novo usuário
        </button>
      </div>
    </div>
  `;

  return html`
    <${AdminPageLayout}
      title="Usuários"
      breadcrumb="Usuários"
      description="Gerencie o time, acompanhe a jornada de leitura e ajuste os dados de cada colaborador."
      actions=${actionsBar}
    >
      <article className="admin-card admin-approval-card">
        <div className="admin-card-header admin-card-header-block">
          <div>
            <h3>Usuários pendentes</h3>
            <p>Revise os cadastros novos antes de liberar o acesso ao sistema.</p>
          </div>
          <span className="admin-pill">${pendingUsers.length} pendências</span>
        </div>

        ${pendingUsers.length > 0
          ? html`
              <div className="admin-approval-list">
                ${pendingUsers.map(
                  (user) => html`
                    <article key=${user.id} className="admin-approval-item">
                      <div className="admin-approval-copy">
                        <strong>${user.name}</strong>
                        <span>${user.email}</span>
                      </div>

                      <div className="admin-approval-meta">
                        <span className=${`admin-user-badge ${user.role}`}>${translateRole(user.role)}</span>
                        <span className=${`admin-user-badge ${user.level}`}>${translateLevel(user.level)}</span>
                        <span className="admin-user-badge status pending">Pendente</span>
                      </div>

                      <div className="admin-approval-actions">
                        <button
                          type="button"
                          className="admin-primary"
                          onClick=${() => actions.approveUser(user.id)}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className="admin-secondary"
                          onClick=${() => actions.rejectUser(user.id)}
                        >
                          Reprovar
                        </button>
                      </div>
                    </article>
                  `
                )}
              </div>
            `
          : html`<p className="admin-helper">Nenhum usuário pendente no momento.</p>`}
      </article>

      <article className="admin-card admin-user-directory-card">
        <div className="admin-card-header admin-card-header-block">
          <div>
            <h3>Usuários do time</h3>
            <p>Selecione um usuário da lista ou use o botão Editar para abrir o perfil completo.</p>
          </div>
        </div>

        ${filteredUsers.length > 0
          ? html`
              <div className="admin-user-list-head">
                <span>Usuário</span>
                <span>Perfil</span>
                <span>Nível</span>
                <span>Status</span>
                <span className="admin-user-actions-head">Ações</span>
              </div>
              <div className="admin-user-list admin-user-list-structured">
                ${filteredUsers.map(
                  (user) => html`
                    <article key=${user.id} className="admin-user-item admin-user-row">
                      <button
                        type="button"
                        className="admin-user-row-main"
                        onClick=${() => setSelectedUserId(user.id)}
                      >
                        <div className="admin-user-primary admin-user-cell-user">
                          <strong>${user.name}</strong>
                          <span>${user.email}</span>
                        </div>
                        <div className="admin-user-cell admin-user-cell-role">
                          <span className=${`admin-user-badge ${user.role}`}>${translateRole(user.role)}</span>
                        </div>
                        <div className="admin-user-cell admin-user-cell-level">
                          <span className=${`admin-user-badge ${user.level}`}>${translateLevel(user.level)}</span>
                        </div>
                        <div className="admin-user-cell admin-user-cell-status">
                          <span className=${`admin-user-badge status ${user.accessStatus || "unknown"}`}>
                            ${translateStatus(user.accessStatus)}
                          </span>
                        </div>
                      </button>

                      <div className="admin-user-row-actions">
                        <label className="admin-user-select-toggle" title="Selecionar usuário">
                          <input
                            type="checkbox"
                            checked=${selectedUserIds.includes(user.id)}
                            onChange=${() =>
                              setSelectedUserIds((current) =>
                                current.includes(user.id)
                                  ? current.filter((id) => id !== user.id)
                                  : [...current, user.id]
                              )}
                          />
                          <span className="sr-only">Selecionar usuário</span>
                        </label>
                        <button
                          type="button"
                          className="admin-icon-button"
                          title="Editar usuário"
                          aria-label="Editar usuário"
                          onClick=${() => setSelectedUserId(user.id)}
                        >
                          ${renderActionIcon("edit")}
                        </button>
                        <button
                          type="button"
                          className=${`admin-icon-button ${user.accessStatus === "blocked" ? "active" : ""}`}
                          title=${user.accessStatus === "blocked" ? "Desbloquear usuário" : "Bloquear usuário"}
                          aria-label=${user.accessStatus === "blocked" ? "Desbloquear usuário" : "Bloquear usuário"}
                          onClick=${() =>
                            setConfirmAction({
                              type: "block",
                              user
                            })}
                        >
                          ${renderActionIcon("block")}
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button admin-icon-button-danger"
                          title="Excluir usuário"
                          aria-label="Excluir usuário"
                          onClick=${() =>
                            setConfirmAction({
                              type: "delete",
                              user
                            })}
                        >
                          ${renderActionIcon("delete")}
                        </button>
                      </div>
                    </article>
                  `
                )}
              </div>
            `
          : html`<p className="admin-helper">Nenhum usuário encontrado com os filtros atuais.</p>`}

        <footer className="admin-user-directory-footer">
          <span>Total de usuários</span>
          <strong>${filteredUsers.length}</strong>
        </footer>
      </article>

      ${showCreateModal
        ? renderCreateUserModal({
            adminCreateFeedback,
            adminCreateForm,
            onClose: () => {
              setShowCreateModal(false);
              setAdminCreateFeedback("");
            },
            onSubmit: async (event) => {
              event.preventDefault();
              const result = await Promise.resolve(actions.createManagedUser(adminCreateForm));
              setAdminCreateFeedback(result.message);

              if (result.success) {
                setAdminCreateForm({
                  name: "",
                  email: "",
                  temporaryPassword: "",
                  cpf: "",
                  company: "",
                  department: "",
                  role: "user",
                  level: "bronze"
                });
                setShowCreateModal(false);
              }
            },
            onChange: setAdminCreateForm
          })
        : null}

      ${selectedUser
        ? html`
            <${UserProfileModal}
              user=${selectedUser}
              books=${books}
              history=${selectedUserHistory}
              actions=${actions}
              onClose=${() => setSelectedUserId("")}
            />
          `
        : null}

      ${confirmAction
        ? renderConfirmActionModal({
            confirmAction,
            onClose: () => setConfirmAction(null),
            onConfirm: async () => {
              if (confirmAction.type === "block") {
                actions.blockUser(confirmAction.user.id);
                setConfirmAction(null);
                return;
              }

              if (confirmAction.type === "bulk-delete") {
                let deleted = 0;

                for (const user of confirmAction.users ?? []) {
                  const result = await Promise.resolve(actions.removeUser(user.id));
                  if (result?.success) {
                    deleted += 1;
                  }
                }

                setSelectedUserIds([]);
                setSelectedUserId("");
                setConfirmAction(null);
                setAdminCreateFeedback(
                  deleted > 0
                    ? `${deleted} usuário(s) excluído(s) com sucesso.`
                    : "Nenhum usuário pôde ser excluído."
                );
                return;
              }

              if (confirmAction.type === "delete") {
                const result = await Promise.resolve(actions.removeUser(confirmAction.user.id));

                if (!result?.success) {
                  return;
                }

                if (selectedUserId === confirmAction.user.id) {
                  setSelectedUserId("");
                }

                setSelectedUserIds((current) => current.filter((id) => id !== confirmAction.user.id));

                setConfirmAction(null);
                return;
              }
            }
          })
        : null}
    <//>
  `;
}

function renderCreateUserModal({
  adminCreateFeedback,
  adminCreateForm,
  onClose,
  onSubmit,
  onChange
}) {
  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal" onClick=${(event) => event.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick=${onClose}>×</button>
        <div className="admin-modal-header">
          <div>
            <h3>Novo usuário</h3>
            <p>Cadastre um colaborador e defina o acesso inicial do perfil.</p>
          </div>
        </div>

        <form className="admin-form admin-form-grid" onSubmit=${onSubmit}>
          <label>
            <span>Nome</span>
            <input
              value=${adminCreateForm.name}
              onInput=${(event) => onChange((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <label>
            <span>Email</span>
            <input
              value=${adminCreateForm.email}
              onInput=${(event) => onChange((current) => ({ ...current, email: event.target.value }))}
            />
          </label>

          <label>
            <span>Senha temporária</span>
            <input
              type="password"
              value=${adminCreateForm.temporaryPassword}
              onInput=${(event) =>
                onChange((current) => ({ ...current, temporaryPassword: event.target.value }))}
              placeholder="Defina a senha inicial"
              required
            />
          </label>

          <label>
            <span>CPF</span>
            <input
              value=${adminCreateForm.cpf}
              onInput=${(event) => onChange((current) => ({ ...current, cpf: event.target.value }))}
            />
          </label>

          <label>
            <span>Empresa</span>
            <input
              value=${adminCreateForm.company}
              onInput=${(event) => onChange((current) => ({ ...current, company: event.target.value }))}
            />
          </label>

          <label>
            <span>Setor</span>
            <input
              value=${adminCreateForm.department}
              onInput=${(event) =>
                onChange((current) => ({ ...current, department: event.target.value }))}
            />
          </label>

                  <label>
                    <span>Perfil</span>
                    <select
                      value=${adminCreateForm.role}
                      onChange=${(event) => onChange((current) => ({ ...current, role: event.target.value }))}
                    >
                    <option value="user">Usuário</option>
              <option value="admin">Admin</option>
                    </select>
                  </label>

          <label>
            <span>Nível</span>
            <select
              value=${adminCreateForm.level}
              onChange=${(event) => onChange((current) => ({ ...current, level: event.target.value }))}
            >
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>
          </label>

          <div className="admin-modal-actions admin-form-span-2">
            <button type="button" className="admin-secondary" onClick=${onClose}>Cancelar</button>
            <button type="submit" className="admin-primary">Salvar usuário</button>
          </div>
          ${adminCreateFeedback
            ? html`<p className="admin-helper admin-form-span-2">${adminCreateFeedback}</p>`
            : null}
        </form>
      </div>
    </div>
  `;
}

function UserProfileModal({ user, books, history, actions, onClose }) {
  const [selectedRecommendationId, setSelectedRecommendationId] = useState("");
  const [selectedBorrowBookId, setSelectedBorrowBookId] = useState("");
  const [borrowFeedback, setBorrowFeedback] = useState("");
  const recommendedBookIds = Array.isArray(user.recommendedBookIds)
    ? user.recommendedBookIds
    : user.recommendedBookId
      ? [user.recommendedBookId]
      : [];

  const recommendedBooks = useMemo(
    () =>
      recommendedBookIds
        .map((bookId) => books.find((book) => book.id === bookId))
        .filter(Boolean)
        .map((book) => ({
          ...book,
          status: getRecommendedBookStatus({
            book,
            history
          })
        })),
    [books, history, recommendedBookIds]
  );

  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal admin-modal-wide" onClick=${(event) => event.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick=${onClose}>×</button>

        <div className="admin-modal-header">
          <div>
            <h3>${user.name}</h3>
            <p>${user.email}</p>
          </div>
          <div className="admin-user-secondary">
            <span className=${`admin-user-badge ${user.role}`}>${translateRole(user.role)}</span>
            <span className=${`admin-user-badge ${user.level}`}>${translateLevel(user.level)}</span>
            <span className=${`admin-user-badge status ${user.accessStatus || "unknown"}`}>
              ${translateStatus(user.accessStatus)}
            </span>
          </div>
        </div>

        <div className="admin-modal-grid">
          <div className="admin-modal-panel">
            <div className="admin-card-header">
              <h3>Dados do usuário</h3>
            </div>

            <form className="admin-form admin-form-grid">
              <label>
                <span>Nome</span>
                <input
                  value=${user.name}
                  onInput=${(event) => actions.updateUser(user.id, { name: event.target.value })}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  value=${user.email}
                  onInput=${(event) => actions.updateUser(user.id, { email: event.target.value })}
                />
              </label>

              <label>
                <span>Setor</span>
                <input
                  value=${user.department || ""}
                  onInput=${(event) =>
                    actions.updateUser(user.id, { department: event.target.value })}
                />
              </label>

              <label>
                <span>Empresa</span>
                <input
                  value=${user.company || ""}
                  onInput=${(event) => actions.updateUser(user.id, { company: event.target.value })}
                />
              </label>

              <label>
                <span>Status</span>
                <select
                  value=${user.accessStatus || "approved"}
                  onChange=${(event) =>
                    actions.updateUser(user.id, { accessStatus: event.target.value })}
                >
                  <option value="approved">Ativo</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="pending">Pendente</option>
                  <option value="rejected">Recusado</option>
                </select>
              </label>

              <label>
                <span>Perfil</span>
                <select
                  value=${user.role}
                  onChange=${(event) => actions.updateUser(user.id, { role: event.target.value })}
                >
                  <option value="staff">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label>
                <span>Nível</span>
                <select
                  value=${user.level}
                  onChange=${(event) => actions.updateUser(user.id, { level: event.target.value })}
                >
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </label>

              <label>
                <span>Pontuacao</span>
                <input
                  type="number"
                  value=${user.score ?? user.readingScore ?? 0}
                  onChange=${(event) =>
                    actions.updateUser(user.id, { score: Number(event.target.value || 0) })}
                />
              </label>

              <label>
                <span>Meta de leitura</span>
                <div className="admin-stepper-field">
                  <button
                    type="button"
                    className="admin-stepper-button"
                    onClick=${() =>
                      actions.updateUser(user.id, {
                        readingGoal: Math.max(0, Number(user.readingGoal || 0) - 1)
                      })}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value=${Number(user.readingGoal || 0)}
                    onChange=${(event) =>
                      actions.updateUser(user.id, {
                        readingGoal: Math.max(0, Number(event.target.value || 0))
                      })}
                  />
                  <button
                    type="button"
                    className="admin-stepper-button"
                    onClick=${() =>
                      actions.updateUser(user.id, {
                        readingGoal: Number(user.readingGoal || 0) + 1
                      })}
                  >
                    +
                  </button>
                </div>
              </label>

              <div className="admin-form-span-2 admin-book-indication-block">
                <label>
                  <span>Indicar livro</span>
                  <select
                    value=${selectedRecommendationId}
                    onChange=${(event) => setSelectedRecommendationId(event.target.value)}
                  >
                    <option value="">Selecione um livro para indicar</option>
                    ${books
                      .filter((book) => !recommendedBookIds.includes(book.id))
                      .map(
                        (book) => html`<option key=${book.id} value=${book.id}>${book.title}</option>`
                      )}
                  </select>
                </label>

                <div className="admin-book-indication-actions">
                  <button
                    type="button"
                    className="admin-primary"
                    disabled=${!selectedRecommendationId}
                    onClick=${() => {
                      if (!selectedRecommendationId) {
                        return;
                      }

                      const nextIds = [...recommendedBookIds, selectedRecommendationId];
                      actions.updateUser(user.id, {
                        recommendedBookId: nextIds[0] || "",
                        recommendedBookIds: nextIds
                      });
                      setSelectedRecommendationId("");
                    }}
                  >
                    Confirmar indicação
                  </button>
                </div>

              <div className="admin-book-indication-list">
                  <strong>Livros ja indicados</strong>
                  ${recommendedBooks.length > 0
                    ? html`
                        <div className="admin-recommended-books">
                          ${recommendedBooks.map(
                            (book) => html`
                              <article key=${book.id} className="admin-recommended-book-card">
                                <div>
                                  <h4>${book.title}</h4>
                                  <p>${book.author}</p>
                                </div>
                                <div className="admin-recommended-book-meta">
                                  <span className=${`admin-user-badge status ${book.status.className}`}>
                                    ${book.status.label}
                                  </span>
                                  <button
                                    type="button"
                                    className="admin-icon-button admin-icon-button-danger"
                                    title="Remover indicação"
                                    aria-label="Remover indicação"
                                    onClick=${() => {
                                      const nextIds = recommendedBookIds.filter((id) => id !== book.id);
                                      actions.updateUser(user.id, {
                                        recommendedBookId: nextIds[0] || "",
                                        recommendedBookIds: nextIds
                                      });
                                    }}
                                  >
                                    ${renderActionIcon("delete")}
                                  </button>
                                </div>
                              </article>
                            `
                          )}
                      </div>
                    `
                  : html`<p className="admin-helper">Nenhum livro indicado para este usuário ainda.</p>`}
                </div>
              </div>

              <div className="admin-form-span-2 admin-book-indication-block admin-borrow-assignment-block">
                <div className="admin-panel-inline-head">
                  <div>
                    <h4>Adicionar livro em leitura</h4>
                    <p>Use este controle para registrar manualmente um livro que o usuário está lendo.</p>
                  </div>
                </div>

                <label>
                  <span>Livro</span>
                  <select
                    value=${selectedBorrowBookId}
                    onChange=${(event) => setSelectedBorrowBookId(event.target.value)}
                  >
                    <option value="">Selecione um livro</option>
                    ${books.map(
                      (book) => html`<option key=${book.id} value=${book.id}>${book.title}</option>`
                    )}
                  </select>
                </label>

                <div className="admin-book-indication-actions">
                  <button
                    type="button"
                    className="admin-primary"
                    disabled=${!selectedBorrowBookId}
                    onClick=${() => {
                      if (!selectedBorrowBookId) {
                        return;
                      }

                      const result = actions.assignBookToUser(user.id, selectedBorrowBookId);
                      setBorrowFeedback(result.message);

                      if (result.success) {
                        setSelectedBorrowBookId("");
                      }
                    }}
                  >
                    Adicionar leitura
                  </button>
                </div>

                ${borrowFeedback
                    ? html`<p className=${`admin-helper ${borrowFeedback.includes("Não") ? "error" : ""}`}>
                      ${borrowFeedback}
                    </p>`
                  : null}
              </div>
            </form>
          </div>

          <div className="admin-modal-panel admin-history-panel">
            <div className="admin-card-header admin-history-panel-header">
              <div>
                <h3>Histórico e respostas</h3>
                <p>Veja as leituras realizadas e as respostas enviadas ao final de cada leitura.</p>
              </div>
            </div>

            ${history.length > 0
              ? html`
                  <div className="admin-user-history-list">
                    ${history.map(
                      (item) => html`
                        <article key=${item.id} className="admin-history-card admin-history-card-structured">
                          <div className="admin-history-card-top">
                            <strong>${item.bookTitle}</strong>
                            <span className="admin-history-status">${translateLoanStatus(item.status)}</span>
                          </div>

                          <div className="admin-history-meta-grid">
                            <div>
                              <small>Solicitado em</small>
                              <p>${formatDate(item.requestedAt)}</p>
                            </div>
                            <div>
                              <small>Devolvido em</small>
                              <p>${formatDate(item.returnedAt)}</p>
                            </div>
                          </div>

                          ${item.answers
                            ? html`
                                <div className="admin-history-answers">
                                  <div>
                                    <small>Learning</small>
                                    <p>${item.answers.learning || "-"}</p>
                                  </div>
                                  <div>
                                    <small>Application</small>
                                    <p>${item.answers.application || "-"}</p>
                                  </div>
                                  <div>
                                    <small>Example</small>
                                    <p>${item.answers.example || "-"}</p>
                                  </div>
                                </div>
                              `
                            : html`<p className="admin-helper">Sem respostas registradas nesta leitura.</p>`}
                        </article>
                      `
                    )}
                  </div>
                `
              : html`<p className="admin-helper">Nenhum histórico encontrado para este usuário.</p>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderConfirmActionModal({ confirmAction, onClose, onConfirm }) {
    const isBulkDelete = confirmAction.type === "bulk-delete";
    const isDelete = confirmAction.type === "delete" || isBulkDelete;
    const isBlocked = confirmAction.user?.accessStatus === "blocked";
    const title = isDelete
      ? isBulkDelete
        ? "Confirmar exclusão em lote"
        : "Confirmar exclusão"
      : isBlocked
        ? "Confirmar desbloqueio"
        : "Confirmar bloqueio";
  const message = isDelete
      ? `Deseja realmente excluir o usuário ${confirmAction.user.name}? Esta ação remove o cadastro da lista.`
    : isBlocked
      ? `Deseja desbloquear o usuário ${confirmAction.user.name} para liberar o acesso ao sistema?`
      : `Deseja bloquear o usuário ${confirmAction.user.name}? Ele não conseguirá acessar o sistema até ser liberado novamente.`;
  const confirmLabel = isDelete ? "Excluir usuário" : isBlocked ? "Desbloquear" : "Bloquear";

  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal admin-modal-confirm" onClick=${(event) => event.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick=${onClose}>×</button>
        <div className="admin-modal-header">
          <div>
            <h3>${title}</h3>
            <p>${message}</p>
          </div>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary" onClick=${onClose}>Cancelar</button>
          <button
            type="button"
            className=${isDelete ? "admin-primary admin-button-danger" : "admin-primary"}
            onClick=${onConfirm}
          >
            ${confirmLabel}
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildUserHistory({ user, loans, books, returns }) {
  if (!user) {
    return [];
  }

  return loans
    .filter((loan) => loan.userId === user.id)
    .map((loan) => {
      const returnRecord = returns.find((item) => item.loanId === loan.id) || null;
      return {
        ...loan,
        bookTitle: books.find((book) => book.id === loan.bookId)?.title ?? "Livro",
        returnedAt: returnRecord?.returnedAt ?? loan.returnedAt ?? "",
        answers: returnRecord?.answers ?? null
      };
    })
    .sort(
      (left, right) =>
        new Date(right.returnedAt || right.requestedAt || 0).getTime() -
        new Date(left.returnedAt || left.requestedAt || 0).getTime()
    );
}

function translateRole(role) {
    return role === "admin" ? "Admin" : "Usuário";
}

function normalizeRoleForUi(role) {
  return String(role ?? "").trim().toLowerCase() === "admin" ? "admin" : "staff";
}

function translateLevel(level) {
  switch (level) {
    case "gold":
      return "Ouro";
    case "silver":
      return "Silver";
    default:
      return "Bronze";
  }
}

function translateStatus(status) {
  switch (status) {
    case "pending":
      return "Pendente";
    case "approved":
    case "active":
      return "Ativo";
      case "blocked":
        return "Bloqueado";
      case "rejected":
        return "Recusado";
    default:
      return "Sem status";
  }
}

function translateLoanStatus(status) {
  switch (normalizeLoanStatus(status)) {
    case "PENDENTE_APROVACAO":
      return "Em análise";
    case "APROVADO":
      return "Pronto para retirada";
    case "EMPRESTADO":
      return "Emprestado";
    case "DEVOLVIDO":
      return "Devolvido";
    case "RECUSADO":
      return "Recusado";
    case "CANCELADO":
      return "Cancelado";
    default:
      return status || "-";
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "-";
}

function getRecommendedBookStatus({ book, history }) {
  const matchingHistory = history.find((item) => item.bookId === book.id) || null;

  if (normalizeLoanStatus(matchingHistory?.status) === "DEVOLVIDO") {
    return { label: "Lido", className: "active" };
  }

  if (normalizeLoanStatus(matchingHistory?.status) === "EMPRESTADO") {
    return { label: "Emprestado", className: "pending" };
  }

  if (normalizeLoanStatus(matchingHistory?.status) === "APROVADO") {
    return { label: "Pronto para retirada", className: "pending" };
  }

  if (normalizeLoanStatus(matchingHistory?.status) === "PENDENTE_APROVACAO") {
    return { label: "Aguardando aprovação", className: "pending" };
  }

  if (book.type === "digital" || Number(book.availableQuantity ?? 0) > 0) {
    return { label: "Disponível", className: "active" };
  }

  return { label: "Sem estoque", className: "blocked" };
}

function renderActionIcon(kind) {
  const icons = {
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75L21 5.75z",
    block: "M12 17a2 2 0 0 0 2-2V9h1V7h-1V6a2 2 0 1 0-4 0v1H9v2h1v6a2 2 0 0 0 2 2zm-1-11a1 1 0 1 1 2 0v1h-2V6zM5 10h2v9h10v2H5v-11z",
    delete: "M6 7h12v2H6V7zm2 3h8l-1 10H9L8 10zm3-5h2l1 1h4v2H6V6h4l1-1z"
  };

  return html`
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d=${icons[kind]} />
    </svg>
  `;
}


