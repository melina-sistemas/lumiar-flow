import { createLoanApiClient } from "../../services/loan-api.js";
import { ResultPanel } from "../../components/ResultPanel.js";

import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function LoanForm({
  apiBaseUrl,
  users,
  books,
  selectedUserId,
  selectedBookId,
  onUserChange,
  onBookChange,
  loadingCatalog,
  onSuccess
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const availableBooks = useMemo(
    () => books.filter((book) => book.isActive),
    [books]
  );

  useEffect(() => {
    const selectedUserIsValid = users.some((user) => user.id === selectedUserId);

    if (!selectedUserIsValid && users.length > 0) {
      onUserChange?.(users[0].id);
    }
  }, [onUserChange, selectedUserId, users]);

  useEffect(() => {
    const selectedBookIsValid = availableBooks.some(
      (book) => book.id === selectedBookId
    );

    if (!selectedBookIsValid && availableBooks.length > 0) {
      onBookChange?.(availableBooks[0].id);
    }
  }, [availableBooks, onBookChange, selectedBookId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const client = createLoanApiClient(apiBaseUrl);
      const selectedBook = books.find((book) => book.id === selectedBookId);
      const response = await client.createLoan({
        userId: selectedUserId,
        bookId: selectedBookId,
        type: selectedBook?.type
      });

      if (!response.success) {
        setError(response);
        return;
      }

      setResult(response);
      await onSuccess?.();
    } catch (submitError) {
      setError({
        success: false,
        error: {
          code: "network_error",
          message: submitError instanceof Error ? submitError.message : String(submitError)
        }
      });
    } finally {
      setLoading(false);
    }
  }

  return html`
    <section className="card">
      <div className="card-top">
        <p className="section-tag">Tela de empréstimo</p>
        <h2>Pegar livro</h2>
        <p>
          Escolha um usuario e um livro na lista. O formulario mostra o nome,
          mas envia o id correto para a API por baixo dos panos.
        </p>
      </div>

      <form className="form-stack" onSubmit=${handleSubmit}>
        <label>
          <span>Usuário</span>
          <select
            value=${selectedUserId}
            onChange=${(event) => onUserChange?.(event.target.value)}
            disabled=${loadingCatalog || users.length === 0 || loading}
          >
            ${users.map(
              (user) => html`
                <option key=${user.id} value=${user.id}>
                  ${user.name} (${translateUserLevel(user.level)})
                </option>
              `
            )}
          </select>
        </label>

        <label>
          <span>Livro</span>
          <select
            value=${selectedBookId}
            onChange=${(event) => onBookChange?.(event.target.value)}
            disabled=${loadingCatalog || availableBooks.length === 0 || loading}
          >
            ${availableBooks.map(
              (book) => html`
                <option key=${book.id} value=${book.id}>
                  ${book.title}
                  ${book.isPremium ? "- Premium" : ""}
                  (${book.availableCopies} disponíveis)
                </option>
              `
            )}
          </select>
        </label>

<p className="helper-text">
  O sistema exibe os nomes no dropdown, mas envia internamente <code>userId</code>
  e <code>bookId</code> para o endpoint <code>POST /loans</code>.
</p>

        <button
          type="submit"
          disabled=${loading || users.length === 0 || availableBooks.length === 0}
        >
          ${loading ? "Enviando..." : "Pegar livro"}
        </button>
      </form>

      ${result
        ? html`
            <${ResultPanel}
              title="Resposta do emprestimo"
              status="success"
              raw=${result}
            >
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Loan ID</span>
                  <strong>${result.data.loan.id}</strong>
                </div>
                <div>
                  <span className="metric-label">Status</span>
                  <strong>${result.data.loan.status}</strong>
                </div>
                <div>
                  <span className="metric-label">Prazo</span>
                  <strong>${new Date(result.data.loan.dueAt).toLocaleString("pt-BR")}</strong>
                </div>
                <div>
                  <span className="metric-label">Copias disponiveis</span>
                  <strong>${result.data.book.availableCopies}</strong>
                </div>
                <div>
                  <span className="metric-label">Usuário</span>
                  <strong>${result.data.user.name}</strong>
                </div>
                <div>
                  <span className="metric-label">Livro</span>
                  <strong>${result.data.book.title}</strong>
                </div>
              </div>
            </${ResultPanel}>
          `
        : null}

      ${error
        ? html`
            <${ResultPanel}
              title="Erro no emprestimo"
              status="error"
              raw=${error}
            >
              <p>${error.error.message}</p>
            </${ResultPanel}>
          `
        : null}
    </section>
  `;
}

function translateUserLevel(level) {
  switch (level) {
    case "bronze":
      return "Bronze";
    case "silver":
      return "Prata";
    case "gold":
      return "Ouro";
    default:
      return level;
  }
}

