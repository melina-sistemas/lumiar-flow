import React, { useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import { createLoanApiClient } from "../../services/loan-api.js";
import { isLoanReturned } from "../../features/books/loan-status.js";
import { createPlaceholderCover, resolveBookCoverSource } from "../../services/google-books.js";
import { extractPdfTextFromFile } from "../../features/books/pdf-text.js";

const html = htm.bind(React.createElement);

const EMPTY_BOOK = {
  id: "",
  title: "",
  author: "",
  summary: "",
  category: "",
  coverUrl: "",
  digitalFileName: "",
  digitalContentBase64: "",
  type: "physical",
  totalQuantity: 1,
  availableQuantity: 1,
  isPremium: false,
  isActive: true
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todos os livros" },
  { value: "physical", label: "Somente físicos" },
  { value: "digital", label: "Somente digitais" },
  { value: "premium", label: "Premium" },
  { value: "active", label: "Disponíveis" },
  { value: "unavailable", label: "Sem estoque" }
];

const BOOKS_PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

const BOOK_IMPORT_TEMPLATE_URL = "/modelo-importacao-livros.csv";

export function AdminBooksPage({ books, users, loans, actions, apiBaseUrl }) {
  const [form, setForm] = useState(EMPTY_BOOK);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDigitalUpload, setShowDigitalUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [booksPerPage, setBooksPerPage] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState({
    search: "",
    quickFilter: "all"
  });

  const filteredBooks = useMemo(() => {
    return [...books]
      .filter((book) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          `${book.title} ${book.author} ${book.category}`
            .toLowerCase()
            .includes(query);

        return matchesSearch && matchesBookFilter(book, quickFilter);
      })
      .sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }, [books, quickFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / booksPerPage));
  const pagedBooks = useMemo(() => {
    const startIndex = (currentPage - 1) * booksPerPage;
    return filteredBooks.slice(startIndex, startIndex + booksPerPage);
  }, [currentPage, filteredBooks]);

  const overview = useMemo(() => {
    const availableBooks = books.filter(
      (book) =>
        book.type === "digital" ||
        (book.isActive && Number(book.availableQuantity ?? 0) > 0)
    ).length;
    const activeUsers = users.filter(
      (user) => user.role === "user" || user.role === "staff" || user.role === "admin"
    ).length;
    const completedLoans = loans.filter((loan) => isLoanReturned(loan.status)).length;
    const ranking = [...users]
      .sort(
        (left, right) =>
          (right.readingScore ?? right.score ?? 0) -
          (left.readingScore ?? left.score ?? 0)
      )
      .slice(0, 3)
      .map((user, index) => ({
        id: user.id,
        position: index + 1,
        name: user.name,
        score: user.readingScore ?? user.score ?? 0
      }));

    return {
      availableBooks,
      activeUsers,
      completedLoans,
      ranking
    };
  }, [books, loans, users]);

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (search.trim()) {
      count += 1;
    }

    if (quickFilter !== "all") {
      count += 1;
    }

    return count;
  }, [quickFilter, search]);

  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const actionButtons = html`
    <div className="admin-page-actions">
      <button
        type="button"
        className="admin-secondary"
        onClick=${() => {
          setShowEditor(false);
          setShowImport(true);
        }}
      >
        Importar via PDF
      </button>
      <button
        type="button"
        className="admin-primary"
        onClick=${() => {
          resetForm(setForm, setEditingId);
          setShowImport(false);
          setShowDigitalUpload(false);
          setShowEditor(true);
        }}
      >
        + Novo livro
      </button>
    </div>
  `;

  const filters = html`
    <form
      className="admin-filters-form"
      onSubmit=${(event) => {
        event.preventDefault();
        applyDraftFilters(draftFilters, setSearch, setQuickFilter, setCurrentPage);
      }}
    >
      <div className="admin-filters-main admin-filters-main-compact">
        <label className="admin-filter-search admin-filter-search-large">
          <span className="sr-only">Buscar livro</span>
          <input
            value=${draftFilters.search}
            onInput=${(event) =>
              setDraftFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Buscar livro, autor ou categoria..."
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
                  className="admin-clear-filters"
                  onClick=${() => {
                    const emptyFilters = { search: "", quickFilter: "all" };
                    setDraftFilters(emptyFilters);
                    applyDraftFilters(emptyFilters, setSearch, setQuickFilter, setCurrentPage);
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
                ${FILTER_OPTIONS.map(
                  (option) => html`
                    <button
                      key=${option.value}
                      type="button"
                      className=${`admin-filter-option ${
                        draftFilters.quickFilter === option.value ? "active" : ""
                      }`}
                      onClick=${() =>
                        setDraftFilters((current) => ({
                          ...current,
                          quickFilter: option.value
                        }))}
                    >
                      <span>${option.label}</span>
                      ${draftFilters.quickFilter === option.value
                        ? html`<strong>Selecionado</strong>`
                        : null}
                    </button>
                  `
                )}

                <div className="admin-filter-actions admin-filter-actions-panel">
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
            </div>
          `
        : null}
    </form>
  `;

  function handleSubmit(event) {
    event.preventDefault();

    if (!String(form.title || "").trim()) {
          setImportMessage("Preencha o título do livro antes de salvar.");
      return;
    }

    if (!String(form.author || "").trim()) {
      setImportMessage("Preencha o autor do livro antes de salvar.");
      return;
    }

    if (!Number.isFinite(Number(form.availableQuantity)) || Number(form.availableQuantity) < 0) {
    setImportMessage("Informe uma quantidade disponível válida.");
      return;
    }

    if (form.type === "digital" && !String(form.digitalContentBase64 || "").trim()) {
      setImportMessage("Anexe o PDF do livro digital antes de salvar.");
      setShowDigitalUpload(true);
      return;
    }

    if (editingId) {
      actions.updateBook(editingId, form);
    } else {
      actions.createBook(form);
    }

    setImportMessage(editingId ? "Livro atualizado com sucesso." : "Livro criado com sucesso.");
    resetForm(setForm, setEditingId);
    setShowEditor(false);
    setShowDigitalUpload(false);
  }

  function handleEdit(book) {
    setEditingId(book.id);
    setForm({ ...book });
    setShowImport(false);
    setShowDigitalUpload(false);
    setShowEditor(true);
  }

  function handleBookTypeChange(nextType) {
    setForm((current) => ({
      ...current,
      type: nextType
    }));

    if (nextType === "digital") {
      setShowDigitalUpload(true);
    } else {
      setShowDigitalUpload(false);
    }
  }

  async function handleCoverUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setForm((current) => ({
      ...current,
      coverUrl: dataUrl
    }));
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy(true);
    setImportMessage("");

    try {
      if (isSpreadsheetTemplateFile(file.name)) {
        const csvText = await file.text();
        const importedBooks = parseBookSpreadsheet(csvText);

        if (!importedBooks.length) {
          setImportMessage("A planilha não possui livros válidos para importar.");
          return;
        }

        actions.importBooks(importedBooks);
        setImportMessage(`${importedBooks.length} livros importados a partir da planilha modelo.`);
        return;
      }

      const extractedText = await extractPdfTextFromFile(file);
      const client = createLoanApiClient(apiBaseUrl);
      const result = await client.importBooksPdfText({
        fileName: file.name,
        extractedText
      });

      if (result?.success && Array.isArray(result.importedBooks)) {
        actions.importBooks(result.importedBooks);
        setImportMessage(`${result.importedBooks.length} livros importados para revisão.`);
      } else {
        setImportMessage(result?.error?.message ?? "Não foi possível importar o PDF.");
      }
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleDigitalPdfUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const contentBase64 = await readFileAsBase64(file);
    setForm((current) => ({
      ...current,
      digitalFileName: file.name,
      digitalContentBase64: contentBase64
    }));
    setShowDigitalUpload(false);
    setImportMessage(`PDF digital anexado: ${file.name}`);
    event.target.value = "";
  }

  return html`
    <${AdminPageLayout}
      title="Gerenciar Livros"
      breadcrumb="Gerenciar Livros"
      description="Explore, organize e destaque o acervo da biblioteca."
      actions=${actionButtons}
      filters=${filters}
    >
      <section className="admin-overview-grid">
        <article className="admin-kpi-card blue">
          <div className="admin-kpi-icon">
            <${AdminMetricIcon} name="books" />
          </div>
          <div className="admin-kpi-copy">
            <strong>${overview.availableBooks}</strong>
            <span>Livros disponíveis</span>
            <small>Catálogo pronto para retirada ou acesso imediato.</small>
          </div>
        </article>

        <article className="admin-kpi-card green">
          <div className="admin-kpi-icon">
            <${AdminMetricIcon} name="users" />
          </div>
          <div className="admin-kpi-copy">
            <strong>${overview.activeUsers}</strong>
            <span>Usuários ativos</span>
            <small>Equipe participando da jornada de leitura.</small>
          </div>
        </article>

        <article className="admin-kpi-card purple">
          <div className="admin-kpi-icon">
            <${AdminMetricIcon} name="trophy" />
          </div>
          <div className="admin-kpi-copy">
            <strong>${overview.completedLoans}</strong>
            <span>Empréstimos finalizados</span>
            <small>Leituras concluídas com devolução registrada.</small>
          </div>
        </article>

        <article className="admin-ranking-card">
          <div className="admin-ranking-header">
            <strong>Ranking Geral</strong>
            <span>Leitores em destaque</span>
          </div>
          <div className="admin-ranking-list">
            ${overview.ranking.map(
              (user) => html`
                <div key=${user.id} className="admin-ranking-item">
                  <span className="admin-ranking-position">${user.position}</span>
                  <span className="admin-ranking-name">${user.name}</span>
                  <strong>${user.score} pts</strong>
                </div>
              `
            )}
          </div>
        </article>
      </section>

      ${importMessage
        ? html`<article className="admin-card admin-feedback">${importMessage}</article>`
        : null}

      <article className="admin-card admin-table-card">
        <div className="admin-card-header">
          <h3>Catálogo</h3>
          <span className="admin-pill">Mostrando ${filteredBooks.length} livro(s)</span>
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table admin-books-table">
            <thead>
              <tr>
                <th>Capa</th>
                <th>Título</th>
                <th>Autor</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Estoque</th>
                <th>Disponível</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${pagedBooks.map((book) => {
                const status = getBookStatus(book);

                return html`
                  <tr key=${book.id}>
                    <td>
                      <div className="admin-book-cover">
                        <img
                          src=${resolveBookCoverSource(book)}
                          alt=${`Capa de ${book.title}`}
                          onError=${(event) => {
                            const image = event.currentTarget;

                            if (image?.dataset?.fallbackApplied === "true") {
                              return;
                            }

                            image.dataset.fallbackApplied = "true";
                            image.src = createPlaceholderCover(book);
                          }}
                        />
                      </div>
                    </td>
                    <td><strong>${book.title}</strong></td>
                    <td>${book.author}</td>
                    <td>${book.category || "-"}</td>
                    <td>
                      <span className=${`admin-badge type-${book.type}`}>
                        ${book.type === "digital" ? "Digital" : "Físico"}
                      </span>
                    </td>
                    <td>${book.type === "digital" ? "Infinito" : book.totalQuantity}</td>
                    <td>${book.type === "digital" ? "Infinito" : book.availableQuantity}</td>
                    <td>
                      <span className=${`admin-badge status-${status.key}`}>
                        ${status.label}
                      </span>
                    </td>
                    <td className="admin-inline-actions">
                      <button
                        type="button"
                        className="admin-icon-button"
                        onClick=${() => handleEdit(book)}
                        aria-label="Editar livro"
                      >
                        <${TableActionIcon} name="edit" />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-button danger"
                        onClick=${() => actions.removeBook(book.id)}
                        aria-label="Excluir livro"
                      >
                        <${TableActionIcon} name="trash" />
                      </button>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
        <div className="ranking-pagination admin-books-pagination">
          <div className="ranking-pagination-summary">
            <span className="ranking-page-indicator">
              ${filteredBooks.length === 0
                ? "Nenhum livro encontrado."
                : `Pagina ${currentPage} de ${totalPages}`}
            </span>
            <span className="ranking-page-count">
              ${filteredBooks.length === 0
                ? "Ajuste os filtros para localizar livros."
                : `${filteredBooks.length} livro(s) no catálogo`}
            </span>
          </div>

          <label className="admin-page-size-control">
            <span>Livros por página</span>
            <select
              value=${booksPerPage}
              onChange=${(event) => {
                setBooksPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
            >
              ${BOOKS_PAGE_SIZE_OPTIONS.map(
                (option) => html`
                  <option value=${option}>${option}</option>
                `
              )}
            </select>
          </label>

          <div className="ranking-pagination-actions">
            <button
              type="button"
              className="admin-secondary"
              disabled=${currentPage <= 1 || filteredBooks.length === 0}
              onClick=${() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="admin-secondary"
              disabled=${currentPage >= totalPages || filteredBooks.length === 0}
              onClick=${() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Proxima
            </button>
          </div>
        </div>
      </article>

      ${showImport
        ? html`
            <${BookImportModal}
              busy=${busy}
              importMessage=${importMessage}
              templateUrl=${BOOK_IMPORT_TEMPLATE_URL}
              onClose=${() => setShowImport(false)}
              onImport=${handleImportFile}
            />
          `
        : null}

      ${showEditor
        ? html`
            <${BookEditorModal}
              form=${form}
              editingId=${editingId}
              onClose=${() => {
                    resetForm(setForm, setEditingId);
                    setShowEditor(false);
                    setShowDigitalUpload(false);
              }}
              onSubmit=${handleSubmit}
              onFieldChange=${(field, value) => updateField(setForm, field, value)}
              onTypeChange=${handleBookTypeChange}
              onOpenDigitalUpload=${() => setShowDigitalUpload(true)}
              onCoverUpload=${handleCoverUpload}
            />
          `
        : null}

      ${showDigitalUpload
        ? html`
            <${DigitalBookUploadModal}
              fileName=${form.digitalFileName}
              onClose=${() => setShowDigitalUpload(false)}
              onUpload=${handleDigitalPdfUpload}
            />
          `
        : null}
    <//>
  `;
}

function BookImportModal({ busy, importMessage, templateUrl, onClose, onImport }) {
  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal admin-modal-confirm" onClick=${(event) => event.stopPropagation()}>
              <button type="button" className="admin-modal-close" onClick=${onClose}>×</button>
        <div className="admin-modal-header">
          <div>
            <h3>Importar via PDF</h3>
            <p>
              Envie um PDF com a lista de livros para gerar registros editáveis no catálogo.
              Se preferir, clique em
              <a className="admin-inline-link" href=${templateUrl} download>
                modelo de planilha
              </a>
              para baixar o arquivo compatível, preencher e subir por este mesmo modal.
            </p>
          </div>
        </div>

        <div className="admin-modal-panel">
          <label className="admin-file-field">
            <span>Selecionar PDF ou planilha modelo (.csv)</span>
            <input
              type="file"
              accept="application/pdf,.csv,text/csv"
              disabled=${busy}
              onChange=${onImport}
            />
          </label>

          ${importMessage ? html`<p className="admin-helper">${importMessage}</p>` : null}

          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary" onClick=${onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function BookEditorModal({
  form,
  editingId,
  onClose,
  onSubmit,
  onFieldChange,
  onTypeChange,
  onOpenDigitalUpload,
  onCoverUpload
}) {
  const isTitleValid = Boolean(String(form.title || "").trim());
  const isAuthorValid = Boolean(String(form.author || "").trim());
  const isAvailableQuantityValid = Number(form.availableQuantity) >= 0;

  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal admin-modal-wide" onClick=${(event) => event.stopPropagation()}>
              <button type="button" className="admin-modal-close" onClick=${onClose}>×</button>

        <div className="admin-modal-header">
          <div>
            <h3>${editingId ? "Editar livro" : "Novo livro"}</h3>
            <p>Preencha os dados do título para disponibilizar o livro no acervo interno.</p>
          </div>
        </div>

        <form className="admin-form admin-form-grid" onSubmit=${onSubmit}>
          <label className=${isTitleValid ? "" : "admin-field-required"}>
            <span>Título <strong>(obrigatório)</strong></span>
            <input
              value=${form.title}
              onInput=${(event) => onFieldChange("title", event.target.value)}
              placeholder="Ex.: Mindset"
              required
            />
          </label>

          <label className=${isAuthorValid ? "" : "admin-field-required"}>
            <span>Autor <strong>(obrigatório)</strong></span>
            <input
              value=${form.author}
              onInput=${(event) => onFieldChange("author", event.target.value)}
              placeholder="Ex.: Carol S. Dweck"
              required
            />
          </label>

          <label className="admin-form-span-2">
            <span>Resumo</span>
            <textarea
              rows="4"
              value=${form.summary}
              onInput=${(event) => onFieldChange("summary", event.target.value)}
              placeholder="Adicione uma descrição curta para contextualizar o livro no catálogo."
            ></textarea>
          </label>

          <label>
            <span>Categoria</span>
            <input
              value=${form.category}
              onInput=${(event) => onFieldChange("category", event.target.value)}
            />
          </label>

          <label>
            <span>Tipo do livro</span>
            <select
              value=${form.type}
              onChange=${(event) => onTypeChange(event.target.value)}
            >
              <option value="physical">Físico</option>
              <option value="digital">Digital</option>
            </select>
            ${form.type === "digital"
              ? html`
                  <div className="admin-type-note">
                    <small className="admin-field-note">
                      ${form.digitalFileName
                        ? `PDF anexado: ${form.digitalFileName}`
                        : "Ao selecionar Digital, anexe o PDF do livro para liberar a leitura."}
                    </small>
                    <button
                      type="button"
                      className="admin-link"
                      onClick=${onOpenDigitalUpload}
                    >
                      ${form.digitalFileName ? "Trocar PDF" : "Anexar PDF"}
                    </button>
                  </div>
                `
              : null}
          </label>

          <label>
            <span>Quantidade total</span>
            <input
              type="number"
              min="1"
              value=${form.totalQuantity}
              onInput=${(event) => onFieldChange("totalQuantity", Number(event.target.value || 1))}
            />
          </label>

          <label className=${isAvailableQuantityValid ? "" : "admin-field-required"}>
            <span>Quantidade disponível <strong>(obrigatório)</strong></span>
            <input
              type="number"
              min="0"
              value=${form.availableQuantity}
              onInput=${(event) => onFieldChange("availableQuantity", Number(event.target.value || 0))}
              required
            />
          </label>

          <label className="admin-form-span-2">
            <span>URL da capa</span>
            <small className="admin-field-note">
              Copie o link direto da imagem da capa em um local público, como o site da editora,
              uma pasta compartilhada com acesso liberado ou uma CDN do seu time.
            </small>
            <input
              value=${form.coverUrl}
              onInput=${(event) => onFieldChange("coverUrl", event.target.value)}
              placeholder="https://..."
            />
          </label>

          <label className="admin-switch-field">
            <div className="admin-switch-head">
              <div className="admin-switch-copy">
                <strong>Livro premium</strong>
                <small>Destaca o título para acessos e benefícios especiais.</small>
              </div>
              <button
                type="button"
                className=${`admin-switch ${form.isPremium ? "active" : ""}`}
                aria-pressed=${form.isPremium}
                onClick=${() => onFieldChange("isPremium", !form.isPremium)}
              >
                <span className="admin-switch-handle"></span>
              </button>
            </div>
          </label>

          <label className="admin-switch-field">
            <div className="admin-switch-head">
              <div className="admin-switch-copy">
                <strong>Livro ativo</strong>
                <small>Define se o livro pode aparecer e ser solicitado no acervo.</small>
              </div>
              <button
                type="button"
                className=${`admin-switch ${form.isActive ? "active" : ""}`}
                aria-pressed=${form.isActive}
                onClick=${() => onFieldChange("isActive", !form.isActive)}
              >
                <span className="admin-switch-handle"></span>
              </button>
            </div>
          </label>

          <label className="admin-file-field admin-form-span-2">
            <span>Upload de capa</span>
            <input type="file" accept="image/*" onChange=${onCoverUpload} />
          </label>

          <div className="admin-modal-actions admin-form-span-2">
            <button type="button" className="admin-secondary" onClick=${onClose}>Cancelar</button>
            <button type="submit" className="admin-primary">
              ${editingId ? "Salvar alterações" : "Salvar livro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function DigitalBookUploadModal({ fileName, onClose, onUpload }) {
  return html`
    <div className="admin-modal-backdrop" onClick=${onClose}>
      <div className="admin-modal admin-modal-confirm" onClick=${(event) => event.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick=${onClose}>Ã—</button>
        <div className="admin-modal-header">
          <div>
            <h3>Anexar PDF do livro digital</h3>
            <p>Selecione o arquivo em PDF que será disponibilizado para leitura dos clientes.</p>
          </div>
        </div>

        <div className="admin-modal-panel">
          <label className="admin-file-field">
            <span>Arquivo PDF</span>
            <input type="file" accept="application/pdf" onChange=${onUpload} />
          </label>

          ${fileName
            ? html`<p className="admin-helper">Arquivo atual: ${fileName}</p>`
            : null}

          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary" onClick=${onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateField(setter, field, value) {
  setter((current) => ({
    ...current,
    [field]: value
  }));
}

function resetForm(setForm, setEditingId) {
  setForm(EMPTY_BOOK);
  setEditingId("");
}

function getBookStatus(book) {
  if (!book.isActive) {
    return { key: "inactive", label: "Indisponível" };
  }

  if (book.type === "physical" && Number(book.availableQuantity ?? 0) <= 0) {
    return { key: "inactive", label: "Sem estoque" };
  }

  return { key: "active", label: "Ativo" };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file) {
  return readFileAsDataUrl(file).then((dataUrl) => String(dataUrl).split(",")[1] ?? "");
}

function applyDraftFilters(draftFilters, setSearch, setQuickFilter, setCurrentPage = () => {}) {
  setSearch(draftFilters.search);
  setQuickFilter(draftFilters.quickFilter);
  setCurrentPage(1);
}

function matchesBookFilter(book, quickFilter) {
  switch (quickFilter) {
    case "physical":
      return book.type === "physical";
    case "digital":
      return book.type === "digital";
    case "premium":
      return book.isPremium;
    case "active":
      return (
        book.type === "digital" ||
        (book.isActive && Number(book.availableQuantity ?? 0) > 0)
      );
    case "unavailable":
      return !book.isActive || (book.type === "physical" && Number(book.availableQuantity ?? 0) <= 0);
    case "all":
    default:
      return true;
  }
}

function isSpreadsheetTemplateFile(fileName = "") {
  return String(fileName).trim().toLowerCase().endsWith(".csv");
}

export function parseBookSpreadsheet(csvText) {
  const rows = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length <= 1) {
    return [];
  }

  const delimiter = rows[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(rows[0], delimiter).map((header) =>
    normalizeSpreadsheetHeader(header)
  );

  const books = [];

  for (const row of rows.slice(1)) {
    const values = splitCsvLine(row, delimiter);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const title = String(record.title ?? "").trim();
    const author = String(record.author ?? "").trim();

    if (!title || !author) {
      continue;
    }

    const type = parseBookTypeField(record.type);
    const totalQuantity = Math.max(1, Number(record.totalQuantity || 1));
    const availableQuantity =
      type === "digital"
        ? totalQuantity
        : Math.max(0, Math.min(totalQuantity, Number(record.availableQuantity || totalQuantity)));

    books.push({
      id: `spreadsheet-book-${Date.now().toString(36)}-${books.length + 1}`,
      title,
      author,
      summary: String(record.summary ?? "").trim(),
      category: String(record.category ?? "").trim(),
      coverUrl: String(record.coverUrl ?? "").trim(),
      type,
      totalQuantity,
      availableQuantity,
      isPremium: parseBooleanField(record.isPremium),
      isActive: parseBooleanField(record.isActive, true)
    });
  }

  return books;
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (insideQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === delimiter && !insideQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeSpreadsheetHeader(header) {
  const normalized = String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");

  const aliases = {
    titulo: "title",
    title: "title",
    autor: "author",
    author: "author",
    resumo: "summary",
    descricao: "summary",
    summary: "summary",
    categoria: "category",
    category: "category",
    tipo: "type",
    type: "type",
    quantidade_total: "totalQuantity",
    total_quantity: "totalQuantity",
    totalquantity: "totalQuantity",
    quantidade_disponivel: "availableQuantity",
    available_quantity: "availableQuantity",
    availablequantity: "availableQuantity",
    url_da_capa: "coverUrl",
    url_capa: "coverUrl",
    coverurl: "coverUrl",
    premium: "isPremium",
    livro_premium: "isPremium",
    ativo: "isActive",
    livro_ativo: "isActive"
  };

  return aliases[normalized] ?? normalized;
}

function parseBookTypeField(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized === "digital" ? "digital" : "physical";
}

function parseBooleanField(value, fallback = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["sim", "true", "1", "yes", "ativo"].includes(normalized)) {
    return true;
  }

  if (["nao", "false", "0", "no", "inativo"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function AdminMetricIcon({ name }) {
  const common = {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "users":
      return html`<svg ...${common}><path d="M20 21a8 8 0 1 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>`;
    case "trophy":
      return html`<svg ...${common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H5a2 2 0 0 0 0 4h2" /><path d="M17 6h2a2 2 0 0 1 0 4h-2" /></svg>`;
    case "books":
    default:
      return html`<svg ...${common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>`;
  }
}

function TableActionIcon({ name }) {
  const common = {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  if (name === "trash") {
    return html`<svg ...${common}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>`;
  }

  return html`<svg ...${common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>`;
}


