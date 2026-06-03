import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import {
  isLoanBorrowed,
  isLoanPendingApproval
} from "../../features/books/loan-status.js";

const html = htm.bind(React.createElement);

export function AdminRequestsPage({ loans, books, users, actions }) {
  const [approvalData, setApprovalData] = useState({});
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const pendingRequests = useMemo(
    () => loans.filter((loan) => isLoanPendingApproval(loan.status)),
    [loans]
  );

  const activeLoans = useMemo(
    () => loans.filter((loan) => isLoanBorrowed(loan.status)),
    [loans]
  );

  function handleApprove(loanId, approval) {
    const result = actions.approveLoan(loanId, {
      responsible: approval.responsible,
      location: approval.location,
      dueAt: approval.dueAt ? new Date(approval.dueAt).toISOString() : ""
    });

    setFeedback(result.message);
  }

  function handleReject(loanId) {
    const confirmed = globalThis.confirm(
      "Deseja reprovar esta solicitação? O usuário será notificado."
    );

    if (!confirmed) {
      return;
    }

    const result = actions.rejectLoan(loanId);
    setFeedback(result.message);
  }

  return html`
    <${AdminPageLayout}
      title="Solicitações pendentes"
      breadcrumb="Solicitações"
      description="Veja pedidos em análise e o histórico dos livros já liberados para leitura."
    >
      ${feedback ? html`<article className="admin-card admin-feedback">${feedback}</article>` : null}

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <h3>Fila de aprovação</h3>
          <span className="admin-pill">${pendingRequests.length} pendências</span>
        </div>

        ${pendingRequests.length === 0
          ? html`
              <div className="admin-empty">
                <strong>Nenhuma solicitação aguardando aprovação.</strong>
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
                      <th>Responsável</th>
                      <th>Local</th>
                      <th>Prazo</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pendingRequests.map((loan) => {
                      const user = users.find((item) => item.id === loan.userId);
                      const book = books.find((item) => item.id === loan.bookId);
                      const approval = approvalData[loan.id] ?? {
                        responsible: loan.responsible ?? "",
                        location: loan.location ?? "",
                        dueAt: loan.dueAt ? String(loan.dueAt).slice(0, 10) : ""
                      };

                      return html`
                        <tr key=${loan.id}>
                          <td>${user?.name ?? "-"}</td>
                          <td>${book?.title ?? "-"}</td>
                          <td>${formatDateTime(loan.requestedAt)}</td>
                          <td>
                            <input
                              value=${approval.responsible}
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
                              value=${approval.location}
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
                            <button
                              type="button"
                              className="admin-link"
                              onClick=${() => handleApprove(loan.id, approval)}
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              className="admin-link danger"
                              onClick=${() => handleReject(loan.id)}
                            >
                              Reprovar
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
            <p className="admin-helper">Livros já emprestados com prazo, responsável e tempo restante.</p>
          </div>
          <span className="admin-pill">${activeLoans.length} itens</span>
        </div>

        ${activeLoans.length === 0
          ? html`
              <div className="admin-empty">
                <strong>Nenhum livro emprestado no momento.</strong>
              </div>
            `
          : html`
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ssuario</th>
                      <th>Livro</th>
                      <th>Liberado em</th>
                      <th>Liberado por</th>
                      <th>Prazo</th>
                      <th>Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activeLoans.map((loan) => {
                      const user = users.find((item) => item.id === loan.userId);
                      const book = books.find((item) => item.id === loan.bookId);
                      return html`
                        <tr key=${loan.id}>
                          <td>${user?.name ?? "-"}</td>
                          <td>${book?.title ?? "-"}</td>
                          <td>${formatReleaseDate(loan)}</td>
                          <td>${loan.responsible || "-"}</td>
                          <td>${formatDateTime(loan.dueAt)}</td>
                          <td>${formatRemainingTime(loan.dueAt, now)}</td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              </div>
            `}
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
  return formatDateTime(loan.borrowedAt || loan.approvedAt || loan.requestedAt);
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

  return `Atrasado ha ${Math.abs(diffDays)} dias`;
}


