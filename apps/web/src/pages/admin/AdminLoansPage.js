import React, { useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import { getLoanStatusLabel } from "../../features/books/loan-status.js";

const html = htm.bind(React.createElement);

export function AdminLoansPage({ loans, books, users, actions }) {
  const [requestForm, setRequestForm] = useState({
    userId: users[0]?.id ?? "",
    bookId: books[0]?.id ?? "",
    notes: ""
  });
  const [approvalData, setApprovalData] = useState({});
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState({
    search: "",
    statusFilter: "all"
  });

  const pendingLoans = useMemo(
    () =>
      loans
        .filter((loan) => loan.status !== "RETURNED")
        .filter((loan) => {
          const user = users.find((item) => item.id === loan.userId);
          const book = books.find((item) => item.id === loan.bookId);
          const matchesSearch =
            !search.trim() ||
            `${user?.name ?? ""} ${book?.title ?? ""}`
              .toLowerCase()
              .includes(search.trim().toLowerCase());
          const matchesStatus = statusFilter === "all" || loan.status === statusFilter;

          return matchesSearch && matchesStatus;
        }),
    [books, loans, search, statusFilter, users]
  );
  const summary = useMemo(
    () => ({
      pending: loans.filter((loan) => loan.status === "PENDING_APPROVAL").length,
      ready: loans.filter((loan) => loan.status === "READY_FOR_PICKUP").length,
      borrowed: loans.filter((loan) => loan.status === "BORROWED").length,
      returned: loans.filter((loan) => loan.status === "RETURNED").length
    }),
    [loans]
  );

  const actionsBar = html`
    <button
      type="button"
      className="admin-primary"
      onClick=${() => {
        const pending = pendingLoans.filter((loan) => loan.status === "PENDING_APPROVAL");
        let approved = 0;

        for (const loan of pending) {
          const approval = approvalData[loan.id] ?? {
            responsible: loan.responsible || "Equipe Lumiar Flow",
            location: loan.location || "Biblioteca Lumiar Flow",
            dueAt:
              loan.dueAt?.slice?.(0, 10) ||
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
          };
          const result = actions.approveLoan(loan.id, {
            responsible: approval.responsible,
            location: approval.location,
            dueAt: new Date(approval.dueAt).toISOString()
          });

          if (result.success) {
            approved += 1;
          }
        }

        setFeedback(
          approved > 0
            ? `${approved} solicitação(ões) aprovada(s).`
            : "Nenhuma solicitação pendente foi aprovada."
        );
      }}
    >
      Aprovar tudo
    </button>
  `;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) {
      count += 1;
    }
    if (statusFilter !== "all") {
      count += 1;
    }
    return count;
  }, [search, statusFilter]);

  const statusOptions = [
    { value: "all", label: "Todos os status" },
    { value: "PENDING_APPROVAL", label: "Pendentes" },
    { value: "READY_FOR_PICKUP", label: "Prontos para retirada" },
    { value: "BORROWED", label: "Emprestados" },
    { value: "RETURNED", label: "Devolvidos" }
  ];

  const filters = html`
    <form
      className="admin-filters-form"
      onSubmit=${(event) => {
        event.preventDefault();
        setSearch(draftFilters.search);
        setStatusFilter(draftFilters.statusFilter);
      }}
    >
      <div className="admin-filters-main admin-filters-main-compact">
        <label className="admin-filter-search admin-filter-search-large">
          <span className="sr-only">Buscar solicitação</span>
          <input
            value=${draftFilters.search}
            onInput=${(event) =>
              setDraftFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Buscar por usuário ou livro"
          />
        </label>

        <button type="submit" className="admin-secondary admin-search-submit">
          Buscar
        </button>

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

        ${activeFilterCount > 0
          ? html`
              <button
                type="button"
                className="admin-text-button"
                onClick=${() => {
                  const emptyFilters = { search: "", statusFilter: "all" };
                  setDraftFilters(emptyFilters);
                  setSearch("");
                  setStatusFilter("all");
                  setShowFilters(false);
                }}
              >
                Limpar
              </button>
            `
          : null}
      </div>

      ${showFilters
        ? html`
            <div className="admin-filters-panel">
              <div className="admin-filters-list">
                ${statusOptions.map(
                  (option) => html`
                    <button
                      key=${option.value}
                      type="button"
                      className=${`admin-filter-option ${
                        draftFilters.statusFilter === option.value ? "active" : ""
                      }`}
                      onClick=${() =>
                        setDraftFilters((current) => ({
                          ...current,
                          statusFilter: option.value
                        }))}
                    >
                      <span>${option.label}</span>
                      ${draftFilters.statusFilter === option.value
                        ? html`<strong>Selecionado</strong>`
                        : null}
                    </button>
                  `
                )}
              </div>

              <div className="admin-filter-actions admin-filter-actions-panel">
                <button
                  type="submit"
                  className="admin-primary"
                  onClick=${() => setShowFilters(false)}
                >
                  Aplicar filtros
                </button>
                <button
                  type="button"
                  className="admin-secondary"
                  onClick=${() => setShowFilters(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          `
        : null}
    </form>
  `;

  function handleRequestSubmit(event) {
    event.preventDefault();
    const result = actions.requestLoan(requestForm);
    setFeedback(result.message);
    setRequestForm((current) => ({
      ...current,
      notes: ""
    }));
  }

  return html`
    <${AdminPageLayout}
      title="Solicitações"
      breadcrumb="Solicitações"
      description="Controle solicitações, aprovações, retirada e devolução dos livros."
      actions=${actionsBar}
      filters=${filters}
    >
      <section className="admin-summary-grid">
        <article className="admin-summary-card">
          <span>Pendentes</span>
          <strong>${summary.pending}</strong>
          <small>Solicitações aguardando aprovação.</small>
        </article>
        <article className="admin-summary-card">
          <span>Prontos para retirada</span>
          <strong>${summary.ready}</strong>
          <small>Livros liberados no balcão.</small>
        </article>
        <article className="admin-summary-card">
          <span>Emprestados</span>
          <strong>${summary.borrowed}</strong>
          <small>Leituras em andamento agora.</small>
        </article>
        <article className="admin-summary-card">
          <span>Devolvidos</span>
          <strong>${summary.returned}</strong>
          <small>Fluxos finalizados com sucesso.</small>
        </article>
      </section>

      ${feedback ? html`<article className="admin-card admin-feedback">${feedback}</article>` : null}

      <div className="admin-grid admin-grid-wide">
        <article className="admin-card">
          <div className="admin-card-header">
            <h3>Nova solicitação</h3>
          </div>

          <form className="admin-form admin-form-grid" onSubmit=${handleRequestSubmit}>
            <label>
              <span>Usuário</span>
              <select
                value=${requestForm.userId}
                onChange=${(event) =>
                  setRequestForm((current) => ({ ...current, userId: event.target.value }))}
              >
                ${users.map(
                  (user) => html`
                    <option key=${user.id} value=${user.id}>${user.name}</option>
                  `
                )}
              </select>
            </label>

            <label>
              <span>Livro</span>
              <select
                value=${requestForm.bookId}
                onChange=${(event) =>
                  setRequestForm((current) => ({ ...current, bookId: event.target.value }))}
              >
                ${books.map(
                  (book) => html`
                    <option key=${book.id} value=${book.id}>
                      ${book.title} (${book.type === "digital" ? "digital" : "físico"})
                    </option>
                  `
                )}
              </select>
            </label>

            <label className="admin-form-span-2">
              <span>Observações</span>
              <textarea
                rows="3"
                value=${requestForm.notes}
                onInput=${(event) =>
                  setRequestForm((current) => ({ ...current, notes: event.target.value }))}
              ></textarea>
            </label>

            <div className="admin-actions admin-form-span-2">
              <button type="submit" className="admin-primary">Solicitar empréstimo</button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <div className="admin-card-header">
            <h3>Resumo operacional</h3>
          </div>
          <div className="admin-simple-list">
            <li>
      <strong>Fila de aprovação</strong>
              <span>${summary.pending} aguardando admin</span>
            </li>
            <li>
              <strong>Retiradas prontas</strong>
              <span>${summary.ready} para entrega</span>
            </li>
            <li>
              <strong>Leituras ativas</strong>
              <span>${summary.borrowed} com os usuários</span>
            </li>
          </div>
        </article>
      </div>

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <h3>Fluxo operacional</h3>
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Livro</th>
                <th>Status</th>
                <th>Responsável</th>
                <th>Local</th>
                <th>Prazo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${pendingLoans.map((loan) => {
                const user = users.find((item) => item.id === loan.userId);
                const book = books.find((item) => item.id === loan.bookId);
                const approval = approvalData[loan.id] ?? {
                  responsible: loan.responsible,
                  location: loan.location,
                  dueAt: loan.dueAt ? String(loan.dueAt).slice(0, 10) : ""
                };

                return html`
                  <tr key=${loan.id}>
                    <td>${user?.name ?? "-"}</td>
                    <td>${book?.title ?? "-"}</td>
                    <td>
                      <span className=${`admin-badge status-${loan.status === "BORROWED" ? "active" : "inactive"}`}>
                        ${getLoanStatusLabel(loan.status)}
                      </span>
                    </td>
                    <td>
                      <input
                        value=${approval.responsible ?? ""}
                        onInput=${(event) =>
                          updateApprovalData(
                            setApprovalData,
                            loan.id,
                            "responsible",
                            event.target.value
                          )}
                      />
                    </td>
                    <td>
                      <input
                        value=${approval.location ?? ""}
                        onInput=${(event) =>
                          updateApprovalData(
                            setApprovalData,
                            loan.id,
                            "location",
                            event.target.value
                          )}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value=${approval.dueAt}
                        onInput=${(event) =>
                          updateApprovalData(
                            setApprovalData,
                            loan.id,
                            "dueAt",
                            event.target.value
                          )}
                      />
                    </td>
                    <td className="admin-table-actions">
                      ${loan.status === "PENDING_APPROVAL"
                        ? html`
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() =>
                                setFeedback(
                                  actions.approveLoan(loan.id, {
                                    responsible: approval.responsible,
                                    location: approval.location,
                                    dueAt: approval.dueAt
                                      ? new Date(approval.dueAt).toISOString()
                                      : ""
                                  }).message
                                )}
                            >
                              Aprovar
                            </button>
                          `
                        : null}

                      ${loan.status === "READY_FOR_PICKUP"
                        ? html`
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() =>
                                setFeedback(actions.confirmPickup(loan.id).message)}
                            >
                              Confirmar retirada
                            </button>
                          `
                        : null}

                      ${loan.status === "BORROWED"
                        ? html`
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() =>
                                setFeedback(actions.markReturned(loan.id).message)}
                            >
                            Registrar devolução
                            </button>
                          `
                        : null}
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </article>
    <//>
  `;
}

function updateApprovalData(setter, loanId, field, value) {
  setter((current) => ({
    ...current,
    [loanId]: {
      ...current[loanId],
      [field]: value
    }
  }));
}


