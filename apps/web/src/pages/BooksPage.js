import { BookCatalog } from "../features/books/BookCatalog.js";
import { PageLayout } from "../components/PageLayout.js";
import { Section } from "../components/Section.js";
import { FeedbackMessage } from "../components/FeedbackMessage.js";

import React, { useMemo, useState } from "react";
import htm from "htm";

const html = htm.bind(React.createElement);

export function BooksPage({
  title,
  subtitle,
  books,
  activeLoans,
  borrowerId,
  isAuthenticated,
  currentReader,
  waitlists = [],
  notifications = [],
  loading,
  errorMessage,
  selectedBookId,
  onSelectBook,
  loanActions,
  currentReaderLoans,
  onLoginRequest,
  onAccountRequest
}) {
  const [bookTypeFilter, setBookTypeFilter] = useState("all");

  const filterCounts = useMemo(
    () => ({
      all: books.length,
      physical: books.filter((book) => book.type === "physical").length,
      digital: books.filter((book) => book.type === "digital").length
    }),
    [books]
  );

  const visibleBooks = useMemo(() => {
    switch (bookTypeFilter) {
      case "physical":
        return books.filter((book) => book.type !== "digital");
      case "digital":
        return books.filter((book) => book.type === "digital");
      default:
        return books;
    }
  }, [bookTypeFilter, books]);

  const totalBooks = visibleBooks.length;
  const availableBooks = visibleBooks.filter(
    (book) =>
      book.type === "digital" ||
      (book.isActive && Number(book.availableCopies ?? book.availableQuantity ?? 0) > 0)
  ).length;
  const premiumBooks = visibleBooks.filter((book) => book.isPremium).length;
  const stats = [
    { label: "Catálogo", value: `${totalBooks} livros` },
    { label: "Disponíveis", value: `${availableBooks} agora` },
    { label: "Premium", value: `${premiumBooks} títulos` }
  ];

  return html`
    <${PageLayout}
      eyebrow="Biblioteca"
      title=${title}
      description=${subtitle}
      stats=${stats}
    >
      ${currentReader?.accessStatus === "pending"
        ? html`
            <${FeedbackMessage}
              tone="info"
              title="Cadastro em aprovação"
              message="Você já pode navegar pelos livros e pela sua conta, mas empréstimos físicos continuam bloqueados até a validação do administrador."
            />
          `
        : null}

      <div className="book-type-filter" role="tablist" aria-label="Filtrar livros por tipo">
        <button
          type="button"
          className=${`book-type-filter-chip ${bookTypeFilter === "all" ? "active" : ""}`}
          aria-pressed=${bookTypeFilter === "all"}
          onClick=${() => setBookTypeFilter("all")}
        >
          <span>Todos</span>
          <strong>${filterCounts.all}</strong>
        </button>
        <button
          type="button"
          className=${`book-type-filter-chip ${bookTypeFilter === "physical" ? "active" : ""}`}
          aria-pressed=${bookTypeFilter === "physical"}
          onClick=${() => setBookTypeFilter("physical")}
        >
          <span>Físicos</span>
          <strong>${filterCounts.physical}</strong>
        </button>
        <button
          type="button"
          className=${`book-type-filter-chip ${bookTypeFilter === "digital" ? "active" : ""}`}
          aria-pressed=${bookTypeFilter === "digital"}
          onClick=${() => setBookTypeFilter("digital")}
        >
          <span>Digitais</span>
          <strong>${filterCounts.digital}</strong>
        </button>
      </div>

      ${errorMessage
        ? html`
            <${FeedbackMessage}
              tone="error"
              title="Falha ao carregar o catálogo"
              message=${errorMessage}
            />
          `
        : null}

      <${Section}
        title="Vitrine de livros"
        description="Clique em qualquer capa para ver os detalhes e seguir com a solicitação ou acesso."
      >
        <${BookCatalog}
          books=${visibleBooks}
          activeLoans=${activeLoans}
          borrowerId=${borrowerId}
          waitlists=${waitlists}
          notifications=${notifications}
          loading=${loading}
          errorMessage=${errorMessage}
          selectedBookId=${selectedBookId}
          onSelectBook=${onSelectBook}
          loanActions=${loanActions}
          currentReaderLoans=${currentReaderLoans}
          currentReader=${currentReader}
          isAuthenticated=${isAuthenticated}
          onLoginRequest=${onLoginRequest}
          onAccountRequest=${onAccountRequest}
        />
      <//>
    <//>
  `;
}

