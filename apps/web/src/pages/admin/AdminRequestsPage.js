import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import {
  getLoanStatusLabel,
  isLoanApproved,
  isLoanBorrowed,
  isLoanPendingApproval,
  isLoanReturnRequested,
  normalizeLoanStatus
} from "../../features/books/loan-status.js";

const html = htm.bind(React.createElement);

export function AdminRequestsPage({ loans, books, users, actions }) {
  const [approvalData, setApprovalData] = useState({});
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [rejectionModal, setRejectionModal] = useState(null);

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const visibleLoans = useMemo(
    () =>
      loans.filter((loan) => {
        const user = users.find((item) => item.id === loan.userId);
        const book = books.find((item) => item.id === loan.bookId);
        return Boolean(user) && Boolean(book) && !user.deletedAt && !book.deletedAt;
      }),
    [books, loans, users]
  );

  const pendingRequests = useMemo(
    () => visibleLoans.filter((loan) => isLoanPendingApproval(loan.status)),
    [visibleLoans]
  );

  const returnRequests = useMemo(
    () => visibleLoans.filter((loan) => isLoanReturnRequested(loan.status)),
    [visibleLoans]
  );

  const rejectedRequests = useMemo(
    () => visibleLoans.filter((loan) => normalizeLoanStatus(loan.status) === "RECUSADO"),
    [visibleLoans]
  );

  const activeLoans = useMemo(
    () => visibleLoans.filter((loan) => isLoanBorrowed(loan.status) || isLoanApproved(loan.status)),
    [visibleLoans]
  );

  function handleApprove(loanId, approval) {
    const result = actions.approveLoan(loanId, {
      responsible: approval.responsible,
      location: approval.location,
      dueAt: approval.dueAt ? new Date(approval.dueAt).toISOString() : ""
    });

    setFeedback(result.message);
  }

  function handleArchive(loanId) {
    const result = actions.archiveLoan(loanId);
    setFeedback(result.message);
  }

  function openRejectModal(loan, kind, bookTitle = "livro") {
    setRejectionModal({
      kind,
      loanId: loan.id,
      reason: kind === "loan" ? String(loan.rejectionReason ?? loan.notes ?? "") : "",
      addToWaitlist: Boolean(loan.rejectionAddsToWaitlist),
      title:
        kind === "loan"
          ? `Recusar "${bookTitle}"`
          : `Recusar devolução de "${bookTitle}"`
    });
  }

  function handleRejectSubmit() {
    if (!rejectionModal) {
      return;
    }

    const reason = String(rejectionModal.reason ?? "").trim();
    if (!reason) {
      setFeedback("Informe um motivo para continuar.");
      return;
    }

    const result =
      rejectionModal.kind === "loan"
        ? actions.rejectLoan(rejectionModal.loanId, {
            reason,
            addToWaitlist: rejectionModal.addToWaitlist
          })
        : actions.rejectReturn(rejectionModal.loanId, { reason });

    setFeedback(result.message);
    setRejectionModal(null);
  }

  const actionsBar = html`
    <button
      type="button"
      className="admin-primary"
      onClick=${() => {
        const pending = pendingRequests.slice();
        let approved = 0;

        for (const loan of pending) {
          const approval = approvalData[loan.id] ?? {
            responsible: loan.responsible || "Equipe Lumiar Flow",
            location: loan.location || "Biblioteca Lumiar Flow",
            dueAt:
              loan.dueAt?.slice?.(0, 10) ||
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
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

  return html`
    <${AdminPageLayout}
      title="Solicitações"
      breadcrumb="Solicitações"
      description="Controle aprovações, recusas, devoluções e o histórico operacional da biblioteca."
      actions=${actionsBar}
    >
      ${feedback ? html`<article className="admin-card admin-feedback">${feedback}</article>` : null}

      <section className="admin-summary-grid">
        <article className="admin-summary-card">
          <span>Pendentes</span>
          <strong>${pendingRequests.length}</strong>
          <small>Solicitações aguardando análise.</small>
        </article>
        <article className="admin-summary-card">
          <span>Devoluções</span>
          <strong>${returnRequests.length}</strong>
          <small>Pedidos de devolução para aprovar ou recusar.</small>
        </article>
        <article className="admin-summary-card">
          <span>Aprovados</span>
          <strong>${activeLoans.filter((loan) => isLoanApproved(loan.status)).length}</strong>
          <small>Livros liberados aguardando retirada.</small>
        </article>
        <article className="admin-summary-card">
          <span>Emprestados</span>
          <strong>${activeLoans.filter((loan) => isLoanBorrowed(loan.status)).length}</strong>
          <small>Leituras em andamento.</small>
        </article>
      </section>

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <div>
            <h3>Fila de aprovação</h3>
            <p className="admin-helper">Aprove, recuse e, quando fizer sentido, envie o usuário para a fila.</p>
          </div>
          <span className="admin-pill">${pendingRequests.length} pendências</span>
        </div>

        ${renderLoanTable({
          emptyMessage: "Nenhuma solicitação aguardando aprovação.",
          loans: pendingRequests,
          users,
          books,
          now,
          approvals: approvalData,
          onUpdateApproval: setApprovalData,
          onApprove: handleApprove,
          onReject: (loan) => openRejectModal(loan, "loan", getBookTitleFromLoan(loan, books))
        })}
      </article>

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <div>
            <h3>Recusadas</h3>
            <p className="admin-helper">Solicitações recusadas ficam registradas e podem ser arquivadas depois.</p>
          </div>
          <span className="admin-pill">${rejectedRequests.length} itens</span>
        </div>

        ${rejectedRequests.length === 0
          ? html`
              <div className="admin-empty">
                <strong>Nenhuma solicitação recusada no momento.</strong>
              </div>
            `
          : html`
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Livro</th>
                      <th>Motivo</th>
                      <th>Recusada em</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rejectedRequests.map((loan) => {
                      const user = users.find((item) => item.id === loan.userId);
                      const book = books.find((item) => item.id === loan.bookId);
                      return html`
                        <tr key=${loan.id}>
                          <td>${user?.name ?? "-"}</td>
                          <td>${book?.title ?? "-"}</td>
                          <td>${loan.rejectionReason || loan.notes || "-"}</td>
                          <td>${formatDateTime(loan.rejectedAt || loan.requestedAt)}</td>
                          <td>
                            <span className="admin-badge status-rejected">Recusado</span>
                          </td>
                          <td className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() => handleArchive(loan.id)}
                            >
                              Arquivar
                            </button>
                          </td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              </div>
            `}
      </article>

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <div>
            <h3>Devoluções solicitadas</h3>
            <p className="admin-helper">Cada pedido precisa de aprovação ou recusa com motivo.</p>
          </div>
          <span className="admin-pill">${returnRequests.length} solicitações</span>
        </div>

        ${returnRequests.length === 0
          ? html`
              <div className="admin-empty">
                <strong>Nenhuma devolução solicitada no momento.</strong>
              </div>
            `
          : html`
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Livro</th>
                      <th>Solicitado em</th>
                      <th>Prazo</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${returnRequests.map((loan) => {
                      const user = users.find((item) => item.id === loan.userId);
                      const book = books.find((item) => item.id === loan.bookId);
                      return html`
                        <tr key=${loan.id}>
                          <td>${user?.name ?? "-"}</td>
                          <td>${book?.title ?? "-"}</td>
                          <td>${formatDateTime(loan.returnRequestedAt || loan.requestedAt)}</td>
                          <td>${formatDateTime(loan.dueAt)}</td>
                          <td>
                            <span className="admin-badge status-active">
                              ${getLoanStatusLabel(loan.status)}
                            </span>
                          </td>
                          <td className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() => {
                                const result = actions.confirmReturn(loan.id);
                                setFeedback(result.message);
                              }}
                            >
                              Aprovar devolução
                            </button>
                            <button
                              type="button"
                              className="admin-link danger"
                              onClick=${() => openRejectModal(loan, "return", book?.title ?? "Livro")}
                            >
                              Recusar devolução
                            </button>
                          </td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              </div>
            `}
      </article>

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <div>
            <h3>Empréstimos liberados</h3>
            <p className="admin-helper">Livros aprovados e já emprestados com prazo e tempo restante.</p>
          </div>
          <span className="admin-pill">${activeLoans.length} itens</span>
        </div>

        ${activeLoans.length === 0
          ? html`
              <div className="admin-empty">
                <strong>Nenhum livro emprestado ou aprovado no momento.</strong>
              </div>
            `
          : html`
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Livro</th>
                      <th>Estado</th>
                      <th>Liberado em</th>
                      <th>Prazo</th>
                      <th>Falta</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activeLoans.map((loan) => {
                      const user = users.find((item) => item.id === loan.userId);
                      const book = books.find((item) => item.id === loan.bookId);
                      const statusLabel = getLoanStatusLabel(loan.status);
                      return html`
                        <tr key=${loan.id}>
                          <td>${user?.name ?? "-"}</td>
                          <td>${book?.title ?? "-"}</td>
                          <td>
                            <span className="admin-badge status-active">${statusLabel}</span>
                          </td>
                          <td>${formatReleaseDate(loan)}</td>
                          <td>${formatDateTime(loan.dueAt)}</td>
                          <td>${formatRemainingTime(loan.dueAt, now)}</td>
                          <td className="admin-table-actions">
                            ${isLoanApproved(loan.status)
                              ? html`
                                  <button
                                    type="button"
                                    className="admin-link"
                                    onClick=${() => {
                                      const result = actions.confirmPickup(loan.id);
                                      setFeedback(result.message);
                                    }}
                                  >
                                    Confirmar retirada
                                  </button>
                                `
                              : null}
                            ${isLoanBorrowed(loan.status)
                              ? html`
                                  <button
                                    type="button"
                                    className="admin-link"
                                    onClick=${() => {
                                      const result = actions.markReturned(loan.id);
                                      setFeedback(result.message);
                                    }}
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
            `}
      </article>

      ${rejectionModal
        ? html`
            <div className="admin-modal-backdrop" onClick=${() => setRejectionModal(null)}>
              <form
                className="admin-modal rejection-modal"
                onSubmit=${(event) => {
                  event.preventDefault();
                  handleRejectSubmit();
                }}
                onClick=${(event) => event.stopPropagation()}
              >
                <div className="admin-modal-header">
                  <div>
                    <h3>${rejectionModal.title}</h3>
                    <p>Explique o motivo da recusa antes de concluir a ação.</p>
                  </div>
                  <button type="button" className="admin-modal-close" onClick=${() => setRejectionModal(null)}>
                    ×
                  </button>
                </div>

                <label className="admin-form-field rejection-modal-field">
                  <span>Motivo obrigatório</span>
                  <textarea
                    rows="6"
                    className="rejection-modal-textarea"
                    value=${rejectionModal.reason}
                    onInput=${(event) =>
                      setRejectionModal((current) => ({
                        ...current,
                        reason: event.target.value
                      }))}
                    required
                    minLength="3"
                    placeholder="Descreva o motivo da recusa."
                  ></textarea>
                  <small className="admin-field-note">
                    O motivo será exibido para o usuário e registrado no histórico da solicitação.
                  </small>
                </label>

                ${rejectionModal.kind === "loan"
                  ? html`
                      <div className="admin-modal-panel rejection-modal-queue">
                        <label className="admin-checkbox-field">
                          <input
                            type="checkbox"
                            checked=${rejectionModal.addToWaitlist}
                            onChange=${(event) =>
                              setRejectionModal((current) => ({
                                ...current,
                                addToWaitlist: event.target.checked
                              }))}
                          />
                          <span>Recusar e adicionar à fila de espera</span>
                        </label>
                      </div>
                    `
                  : null}

                <div className="admin-modal-actions">
                  <button type="button" className="admin-secondary" onClick=${() => setRejectionModal(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="admin-primary">
                    Confirmar recusa
                  </button>
                </div>
              </form>
            </div>
          `
        : null}
    <//>
  `;
}

function renderLoanTable({
  emptyMessage,
  loans,
  users,
  books,
  approvals,
  onUpdateApproval,
  onApprove,
  onReject
}) {
  if (loans.length === 0) {
    return html`
      <div className="admin-empty">
        <strong>${emptyMessage}</strong>
      </div>
    `;
  }

  return html`
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Livro</th>
            <th>Solicitado em</th>
            <th>Responsável</th>
            <th>Local</th>
            <th>Prazo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${loans.map((loan) => {
            const user = users.find((item) => item.id === loan.userId);
            const book = books.find((item) => item.id === loan.bookId);
            const approval = approvals[loan.id] ?? {
              responsible: loan.responsible ?? "",
              location: loan.location ?? "",
              dueAt: loan.dueAt ? String(loan.dueAt).slice(0, 10) : ""
            };

            return html`
              <tr key=${loan.id}>
                <td>${user?.name ?? "-"}</td>
                <td>
                  <div className="admin-cell-stack">
                    <strong>${book?.title ?? "-"}</strong>
                    ${book?.type === "physical"
                      ? html`<small>Livro físico</small>`
                      : html`<small>Livro digital</small>`}
                  </div>
                </td>
                <td>${formatDateTime(loan.requestedAt)}</td>
                <td>
                  <input
                    value=${approval.responsible}
                    onInput=${(event) =>
                      updateApprovalData(onUpdateApproval, loan.id, "responsible", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    value=${approval.location}
                    onInput=${(event) =>
                      updateApprovalData(onUpdateApproval, loan.id, "location", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value=${approval.dueAt}
                    onInput=${(event) =>
                      updateApprovalData(onUpdateApproval, loan.id, "dueAt", event.target.value)}
                  />
                </td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="admin-link"
                    onClick=${() => onApprove(loan.id, approval)}
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className="admin-link danger"
                    onClick=${() => onReject(loan)}
                  >
                    Recusar
                  </button>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
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

function getBookTitleFromLoan(loan, books) {
  const book = books.find((item) => item.id === loan.bookId);
  return book?.title ?? "livro";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatReleaseDate(loan) {
  return formatDateTime(loan.approvedAt || loan.borrowedAt || loan.requestedAt);
}

function formatRemainingTime(dueAt, now) {
  if (!dueAt) {
    return "-";
  }

  const diffDays = Math.ceil((new Date(dueAt).getTime() - now) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    return `${diffDays} dias`;
  }

  if (diffDays === 1) {
    return "1 dia";
  }

  if (diffDays === 0) {
    return "Hoje";
  }

  return `Atrasado há ${Math.abs(diffDays)} dias`;
}
