import React, { useEffect, useMemo, useRef, useState } from "react";
import htm from "htm";
import { createPlaceholderCover } from "../../services/google-books.js";

const html = htm.bind(React.createElement);
let pdfJsRuntimePromise = null;

function resolveBookCover(book) {
  const coverUrl = typeof book.coverUrl === "string" ? book.coverUrl.trim() : "";

  if (coverUrl && isRenderableCoverUrl(coverUrl)) {
    return coverUrl;
  }

  return createPlaceholderCover(book);
}

function handleBookCoverError(event, book) {
  const image = event.currentTarget;

  if (!image || image.dataset.fallbackApplied === "true") {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = createPlaceholderCover(book);
}

function isRenderableCoverUrl(coverUrl) {
  if (!coverUrl) {
    return false;
  }

  return (
    coverUrl.startsWith("data:image/") ||
    coverUrl.startsWith("blob:") ||
    coverUrl.startsWith("/") ||
    coverUrl.startsWith("./") ||
    coverUrl.startsWith("../") ||
    coverUrl.startsWith("http://localhost") ||
    coverUrl.startsWith("https://localhost") ||
    coverUrl.startsWith("https://lumiarflow")
  );
}

export function BookCatalog({
  books,
  activeLoans,
  borrowerId,
  waitlists = [],
  notifications = [],
  isAuthenticated,
  loading,
  errorMessage,
  selectedBookId,
  onSelectBook,
  loanActions,
  currentReaderLoans = [],
  currentReader = null,
  onLoginRequest = null,
  onAccountRequest = null
}) {
  const [now, setNow] = useState(Date.now());
  const [busyBookId, setBusyBookId] = useState("");
  const [flash, setFlash] = useState(null);
  const [modalBookId, setModalBookId] = useState("");
  const [readerBookId, setReaderBookId] = useState("");
  const [readerTheme, setReaderTheme] = useState("paper");
  const [readerDensity, setReaderDensity] = useState("focus");
  const [readerPage, setReaderPage] = useState(1);
  const [readerPageCount, setReaderPageCount] = useState(0);
  const [readerScale, setReaderScale] = useState(1);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState("");
  const [readerAnimating, setReaderAnimating] = useState(false);
  const [readerTurnDirection, setReaderTurnDirection] = useState("next");
  const readerCanvasRef = useRef(null);
  const readerPageStageRef = useRef(null);
  const readerDocRef = useRef(null);
  const readerRenderTaskRef = useRef(null);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      setFlash(null);
    }, 3600);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [flash]);

  useEffect(() => {
    if (!modalBookId) {
      return undefined;
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        setModalBookId("");
      }
    }

    globalThis.addEventListener("keydown", handleKeydown);

    return () => {
      globalThis.removeEventListener("keydown", handleKeydown);
    };
  }, [modalBookId]);

  const cards = useMemo(
    () =>
      books.map((book) => {
        const bookLoans = activeLoans.filter((loan) => loan.bookId === book.id);
        const currentReaderLoan =
          currentReaderLoans.find((loan) => loan.bookId === book.id) ?? null;
        const currentReaderWaitlist =
          waitlists.find(
            (entry) =>
              entry.bookId === book.id &&
              entry.userId === borrowerId &&
              entry.status === "WAITING"
          ) ?? null;
        const nextLoan = [...bookLoans].sort(
          (left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
        )[0];
        const availableCopies = Number(
          book.availableCopies ?? book.availableQuantity ?? 0
        );
        const totalCopies = Math.max(
          availableCopies,
          Number(book.totalCopies ?? book.totalQuantity ?? availableCopies ?? 0)
        );
        const borrowedCopies =
          book.type === "physical" ? Math.max(0, totalCopies - availableCopies) : 0;
        const isOutOfStock = book.type === "physical" && availableCopies <= 0;
        const isUnavailable = isOutOfStock || !book.isActive;
        const hasActiveBorrowedLoan = currentReaderLoans.some((loan) => loan.status === "BORROWED");
        const canConfirmPickup = currentReaderLoan?.status === "READY_FOR_PICKUP";
        const isWaitingForBook = Boolean(currentReaderWaitlist);
        const requestLabel = canConfirmPickup
          ? "Confirmar empréstimo"
          : isOutOfStock && book.type === "physical"
          ? currentReaderWaitlist
          ? `Na fila #${currentReaderWaitlist.position || getWaitlistPosition(waitlists, book.id, borrowerId)}`
          : "Entrar na fila"
          : book.type === "digital"
          ? "Acessar livro"
          : hasActiveBorrowedLoan
          ? "Devolva o livro atual"
          : "Solicitar empréstimo";

        return {
          ...book,
          availableCopies,
          totalCopies,
          borrowedCopies,
          currentReaderLoan,
          currentReaderWaitlist,
          nextLoan,
          isOutOfStock,
          isUnavailable,
          hasActiveBorrowedLoan,
          canConfirmPickup,
          isWaitingForBook,
          requestLabel,
          returnText: buildReturnCountdown(
            nextLoan?.status === "READY_FOR_PICKUP" ? nextLoan.readyUntil || nextLoan.dueAt : nextLoan?.dueAt,
            now
          ),
          summary: buildSummary(book)
        };
      }),
    [activeLoans, borrowerId, books, currentReaderLoans, now, waitlists]
  );

  const modalBook = cards.find((book) => book.id === modalBookId) ?? null;
  const readerBook = cards.find((book) => book.id === readerBookId) ?? null;
  const canAccessPremiumBook =
    modalBook?.type === "digital" ? true : isGoldLevel(currentReader?.level);
  const canRequestPhysicalLoan = currentReader?.accessStatus === "approved";
  const isPendingReader = currentReader?.accessStatus === "pending";

  useEffect(() => {
    if (!readerBookId) {
      return undefined;
    }

    const storedPage = readStoredReaderPage(readerBookId);

    setReaderPage(storedPage > 0 ? storedPage : 1);

    return undefined;
  }, [readerBookId]);

  useEffect(() => {
    if (!readerBook?.digitalContentBase64) {
      readerDocRef.current = null;
      if (readerRenderTaskRef.current) {
        readerRenderTaskRef.current.cancel();
        readerRenderTaskRef.current = null;
      }
      setReaderPageCount(0);
      setReaderError("");
      return undefined;
    }

    let cancelled = false;
    let loadingTask = null;

    setReaderLoading(true);
    setReaderError("");

    loadPdfJsRuntime()
      .then(({ getDocument }) => {
        if (cancelled) {
          return null;
        }

        loadingTask = getDocument({
          data: decodeBase64Pdf(readerBook.digitalContentBase64)
        });

        return loadingTask.promise;
      })
      .then((pdfDocument) => {
        if (!pdfDocument) {
          return;
        }

        if (cancelled) {
          void pdfDocument.destroy();
          return;
        }

        readerDocRef.current = pdfDocument;
        setReaderPageCount(pdfDocument.numPages || 0);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        readerDocRef.current = null;
        setReaderPageCount(0);
        setReaderError(
          error instanceof Error
            ? error.message
            : "Não foi possível abrir este PDF para leitura."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setReaderLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (readerRenderTaskRef.current) {
        readerRenderTaskRef.current.cancel();
        readerRenderTaskRef.current = null;
      }
      if (loadingTask) {
        void loadingTask.destroy();
      }
      const currentDoc = readerDocRef.current;
      readerDocRef.current = null;
      if (currentDoc) {
        void currentDoc.destroy();
      }
    };
  }, [readerBook]);

  useEffect(() => {
    if (!readerBookId || !readerPageCount) {
      return undefined;
    }

    setReaderPage((currentPage) => clampReaderPage(currentPage, readerPageCount));

    return undefined;
  }, [readerBookId, readerPageCount]);

  useEffect(() => {
    if (!readerBookId || !readerPageCount) {
      return undefined;
    }

    writeStoredReaderPage(readerBookId, readerPage);

    return undefined;
  }, [readerBookId, readerPage, readerPageCount]);

  useEffect(() => {
    const pdfDocument = readerDocRef.current;
    const canvas = readerCanvasRef.current;

    const stage = readerPageStageRef.current;

    if (!pdfDocument || !canvas || !readerPage || !stage) {
      return undefined;
    }

    let cancelled = false;
    if (readerRenderTaskRef.current) {
      readerRenderTaskRef.current.cancel();
      readerRenderTaskRef.current = null;
    }
    setReaderLoading(true);
    setReaderError("");

    pdfDocument
      .getPage(readerPage)
      .then((page) => {
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const stageWidth = Math.max(760, stage.clientWidth - 12);
        const widthScale = stageWidth / baseViewport.width;
        const viewport = page.getViewport({
          scale: Math.max(0.28, Math.min(2.4, widthScale * readerScale))
        });
        const context = canvas.getContext("2d");

        if (!context) {
        setReaderError("Não foi possível preparar a área de leitura.");
          setReaderLoading(false);
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({
          canvasContext: context,
          viewport
        });

        readerRenderTaskRef.current = renderTask;
        return renderTask.promise;
      })
      .then(() => {
        if (!cancelled) {
          setReaderLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setReaderLoading(false);
        setReaderError(
          error instanceof Error
            ? error.message
            : "Não foi possível renderizar esta página."
        );
      });

    return () => {
      cancelled = true;
      if (readerRenderTaskRef.current) {
        readerRenderTaskRef.current.cancel();
        readerRenderTaskRef.current = null;
      }
    };
  }, [readerPage, readerScale, readerBookId, readerPageCount]);

  useEffect(() => {
    if (!readerAnimating) {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      setReaderAnimating(false);
    }, 240);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [readerAnimating, readerPage]);

  function handleOpenModal(bookId) {
    onSelectBook?.(bookId);
    setModalBookId(bookId);
  }

  function handleCloseModal() {
    setModalBookId("");
  }

  function handleOpenReader(book, event) {
    event?.stopPropagation?.();

    if (!book?.digitalContentBase64) {
      setFlash({
        type: "error",
        message: "Este livro digital ainda não possui PDF anexado."
      });
      return;
    }

    setReaderTheme("paper");
    setReaderDensity("wide");
    setReaderScale(1);
    setReaderError("");
    setReaderAnimating(false);
    setReaderBookId(book.id);
    setReaderPage(readStoredReaderPage(book.id) || 1);
  }

  function handleCloseReader() {
    setReaderBookId("");
  }

  function handleReaderPageChange(direction) {
    setReaderPage((currentPage) => {
      const nextPage = currentPage + direction;

      if (nextPage < 1) {
        return 1;
      }

      if (readerPageCount && nextPage > readerPageCount) {
        return readerPageCount;
      }

      return nextPage;
    });
  }

  function handleReaderScaleChange(direction) {
    setReaderScale((currentScale) => {
      const nextScale = currentScale + direction;
      return Number(Math.min(1.8, Math.max(0.85, nextScale)).toFixed(2));
    });
  }

  function handleReaderJump(direction) {
    setReaderTurnDirection(direction > 0 ? "next" : "prev");
    setReaderAnimating(true);
    setReaderPage((currentPage) => {
      const step = direction > 0 ? 1 : -1;
      const nextPage = currentPage + step;

      if (nextPage < 1) {
        return 1;
      }

      if (readerPageCount && nextPage > readerPageCount) {
        return readerPageCount;
      }

      return nextPage;
    });
  }

  function handleReaderStageClick(event) {
    if (!readerBook?.digitalContentBase64 || readerLoading || readerError || !readerPageCount) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const leftZone = rect.width * 0.42;
    const rightZone = rect.width * 0.58;

    if (clickX <= leftZone) {
      handleReaderJump(-1);
      return;
    }

    if (clickX >= rightZone) {
      handleReaderJump(1);
    }
  }

  async function handleBorrow(book, event) {
    event?.stopPropagation?.();

    if (!isAuthenticated) {
      setFlash({
        type: "error",
        message: "Entre no sistema para solicitar ou acessar um livro."
      });
      return;
    }

    if (!borrowerId) {
      setFlash({
        type: "error",
        message: "Nenhum usuário disponível para empréstimo no momento."
      });
      return;
    }

    setBusyBookId(book.id);
    setFlash(null);

    try {
      const response = await Promise.resolve(loanActions?.requestLoan({
        userId: borrowerId,
        bookId: book.id
      }));

      if (!response?.success) {
        setFlash({
          type: "error",
          message: response?.message ?? "Não foi possível solicitar o livro."
        });
        return;
      }

      setFlash({
        type: "success",
        message: response.message
      });
      setModalBookId("");

      if (book.type === "digital" && book.digitalContentBase64) {
        setReaderBookId(book.id);
      }
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusyBookId("");
    }
  }

  async function handleConfirmPickup(book, event) {
    event?.stopPropagation?.();

    if (!isAuthenticated) {
      setFlash({
        type: "error",
        message: "Entre no sistema para confirmar a retirada."
      });
      return;
    }

    const targetLoan = currentReaderLoans.find(
      (loan) => loan.bookId === book.id && loan.status === "READY_FOR_PICKUP"
    );

    if (!targetLoan) {
      setFlash({
        type: "error",
        message: "Não encontramos uma reserva pronta para confirmação."
      });
      return;
    }

    setBusyBookId(book.id);
    setFlash(null);

    try {
      const response = await Promise.resolve(loanActions?.confirmPickup(targetLoan.id));

      if (!response?.success) {
        setFlash({
          type: "error",
          message: response?.message ?? "Não foi possível confirmar o empréstimo."
        });
        return;
      }

      setFlash({
        type: "success",
        message: response.message
      });
      setModalBookId("");
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusyBookId("");
    }
  }

  if (loading) {
    return html`
      <section className="catalog-grid" aria-label="Carregando livros">
        ${Array.from({ length: 8 }).map(
          (_, index) => html`
            <article key=${index} className="book-card skeleton-card">
              <div className="book-cover-frame skeleton-block"></div>
              <div className="book-body">
                <div className="skeleton-line skeleton-line-strong"></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line skeleton-line-short"></div>
              </div>
            </article>
          `
        )}
      </section>
    `;
  }

  if (errorMessage) {
    return html`
      <section className="catalog-state">
        <p>${errorMessage}</p>
      </section>
    `;
  }

  if (cards.length === 0) {
    return html`
      <section className="catalog-state">
        <p>Nenhum livro disponível no momento.</p>
      </section>
    `;
  }

  return html`
    <section className="catalog-wrapper">
      ${flash
        ? html`
            <div className=${`catalog-toast ${flash.type}`}>
              ${flash.message}
            </div>
          `
        : null}

      <section className="catalog-grid">
        ${cards.map((book) => {
          const isSelected = selectedBookId === book.id;

          return html`
            <article
              key=${book.id}
              className=${`book-card ${isSelected ? "selected" : ""}`}
              onClick=${() => handleOpenModal(book.id)}
            >
              <div className="book-cover-frame">
                <img
                  className="book-cover"
                  src=${resolveBookCover(book)}
                  alt=${`Capa do livro ${book.title}`}
                  loading="lazy"
                  onError=${(event) => handleBookCoverError(event, book)}
                />

                ${book.isPlaceholderCover
                  ? html`<span className="cover-placeholder-tag">Capa ilustrativa</span>`
                  : null}

                ${book.currentReaderLoan
                  ? html`
                      <div className="book-ribbon">${translateLoanStatus(book.currentReaderLoan.status)}</div>
                      <div className="book-countdown">
                        ${buildLoanStatusMessage(book.currentReaderLoan, book)}
                      </div>
                    `
                  : book.isOutOfStock
                  ? html`
                      <div className="book-ribbon">Sem estoque</div>
                      <div className="book-countdown">${book.returnText}</div>
                    `
                  : null}
              </div>

              <div className="book-body">
                <h2>${book.title}</h2>
                <p className="book-author">${book.author}</p>
                <div className="book-meta-row">
                  ${book.category
                    ? html`<span className="book-category">${book.category}</span>`
                    : null}
                  <span className="book-rating">${formatRating(book.rating)}</span>
                </div>
                <div className="book-availability-row">
                  <span className="book-availability-pill">
                    ${book.type === "digital"
                      ? "Acesso digital"
                      : `${book.availableCopies} ${book.availableCopies === 1 ? "disponível" : "disponíveis"}`}
                  </span>
                  ${book.type === "physical"
                    ? html`<span className="book-availability-pill muted">
                        ${book.borrowedCopies} emprestado${book.borrowedCopies === 1 ? "" : "s"}
                      </span>`
                    : null}
                </div>
              </div>

              <div className="book-footer">
                ${book.currentReaderLoan
                  ? html`
                      <div className="book-footer-stack">
                        <span
                          className=${`book-status loan-${String(book.currentReaderLoan.status).toLowerCase()}`}
                        >
                          ${buildLoanStatusMessage(book.currentReaderLoan, book)}
                        </span>
                        ${book.currentReaderLoan.status === "BORROWED" && book.type === "digital"
                          ? html`
                              <button
                                type="button"
                                className="book-read-button"
                                onClick=${(event) => handleOpenReader(book, event)}
                              >
                                Ler agora
                              </button>
                            `
                          : null}
                      </div>
                    `
                : book.isOutOfStock
                  ? html`<span className="book-status out-of-stock">Sem estoque</span>`
                  : !book.isActive
                  ? html`<span className="book-status">Indisponível agora</span>`
                  : !isAuthenticated
                  ? html`<span className="book-status">Entre para solicitar</span>`
                  : book.type === "physical" && book.hasActiveBorrowedLoan
                  ? html`<span className="book-status loan-borrowed">Devolva o livro atual</span>`
                  : book.type === "physical" && !canRequestPhysicalLoan
                            ? html`<span className="book-status">Em aprovação</span>`
                  : html`
                      <button
                        type="button"
                        disabled=${busyBookId === book.id || (book.isWaitingForBook && book.isOutOfStock)}
                        onClick=${(event) =>
                          book.canConfirmPickup
                            ? handleConfirmPickup(book, event)
                            : handleBorrow(book, event)}
                      >
                        ${busyBookId === book.id
                          ? "Processando..."
                          : book.requestLabel}
                      </button>
                    `}
              </div>
            </article>
          `;
        })}
      </section>

      ${modalBook
        ? html`
            <div className="book-modal-backdrop" onClick=${handleCloseModal}>
              <div className="book-modal" onClick=${(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="book-modal-close"
                  onClick=${handleCloseModal}
                  aria-label="Fechar detalhes do livro"
                >
                  x
                </button>

                <div className="book-modal-layout">
                  <div className="book-modal-cover">
                    <img
                      src=${resolveBookCover(modalBook)}
                      alt=${`Capa ampliada do livro ${modalBook.title}`}
                      onError=${(event) => handleBookCoverError(event, modalBook)}
                    />
                    ${modalBook.currentReaderLoan
                      ? html`
                          <span className="modal-status-pill borrowed">
                            ${translateLoanStatus(modalBook.currentReaderLoan.status)}
                          </span>
                        `
                      : modalBook.isOutOfStock
                      ? html`<span className="modal-status-pill borrowed">Sem estoque</span>`
                      : html`<span className="modal-status-pill available">Disponivel</span>`}
                  </div>

                  <div className="book-modal-content">
                    <div className="book-modal-header">
                      <h2>${modalBook.title}</h2>
                      <p>${modalBook.author}</p>
                    </div>

                    <div className="book-modal-meta">
                      <span>${formatRating(modalBook.rating)}</span>
                      ${modalBook.categories?.map(
                        (category) => html`
                          <span key=${`${modalBook.id}-${category}`} className="book-category">
                            ${category}
                          </span>
                        `
                      )}
                    </div>

                    ${modalBook.description
                      ? html`
                          <p className="book-modal-description">
                            ${modalBook.description}
                          </p>
                        `
                      : null}

                    ${modalBook.isPremium
                      ? html`
                          <div className=${`premium-access-note ${canAccessPremiumBook ? "granted" : "blocked"}`}>
                            <strong>
                              ${canAccessPremiumBook
                                ? modalBook.type === "digital"
                                  ? "Leitura digital liberada"
                                  : "Acesso premium liberado"
                                : "Livro premium"}
                            </strong>
                            <span>
                              ${canAccessPremiumBook
                                ? modalBook.type === "digital"
                                  ? "Livros digitais podem ser acessados diretamente dentro do sistema."
                                  : "Seu nível atual permite esta leitura."
                                : "Este título exige nível ouro para acesso."}
                            </span>
                          </div>
                        `
                      : null}

                    ${modalBook.summary
                      ? html`
                          <div className="book-modal-summary">
                            <strong>Sobre esta leitura</strong>
                            <p>${modalBook.summary}</p>
                          </div>
                        `
                      : null}

                    <div className="book-availability-row book-availability-row-modal">
                      <span className="book-availability-pill">
                        ${modalBook.type === "digital"
                          ? "Acesso digital"
                          : `${modalBook.availableCopies} ${modalBook.availableCopies === 1 ? "disponível" : "disponíveis"}`}
                      </span>
                      ${modalBook.type === "physical"
                        ? html`<span className="book-availability-pill muted">
                            ${modalBook.borrowedCopies} emprestado${modalBook.borrowedCopies === 1 ? "" : "s"}
                          </span>`
                        : null}
                      ${modalBook.currentReaderLoan?.status === "BORROWED"
                        ? html`<span className="book-availability-pill accent">
                            ${modalBook.returnText}
                          </span>`
                        : null}
                    </div>

                    ${modalBook.currentReaderLoan
                      ? html`
                          <div className="modal-borrow-panel muted">
                            <strong>${translateLoanStatus(modalBook.currentReaderLoan.status)}</strong>
                            <span>${buildLoanStatusMessage(modalBook.currentReaderLoan, modalBook)}</span>
                            ${modalBook.currentReaderLoan.status === "READY_FOR_PICKUP"
                                ? html`
                                  <button
                                    type="button"
                                    disabled=${busyBookId === modalBook.id}
                                    onClick=${(event) => handleConfirmPickup(modalBook, event)}
                                  >
                                    ${busyBookId === modalBook.id
                                      ? "Processando..."
                                      : "Confirmar empréstimo"}
                                  </button>
                                `
                              : null}
                            ${modalBook.currentReaderLoan.status === "BORROWED" &&
                            modalBook.type === "digital" &&
                            modalBook.digitalContentBase64
                              ? html`
                                  <button
                                    type="button"
                                    className="book-read-button"
                                    onClick=${(event) => handleOpenReader(modalBook, event)}
                                  >
                                    Abrir leitura
                                  </button>
                                `
                              : null}
                          </div>
                        `
                      : modalBook.isOutOfStock
                      ? html`
                          <div className="modal-borrow-panel muted">
                            <strong>Sem estoque</strong>
                            <span>Aguarde a devolução de um exemplar físico.</span>
                            ${modalBook.currentReaderWaitlist
                              ? html`<small>Você está na fila #${modalBook.currentReaderWaitlist.position}</small>`
                              : null}
                          </div>
                        `
                      : modalBook.type === "physical" && !canRequestPhysicalLoan
                      ? html`
                          <div className="modal-borrow-panel muted">
                            <strong>Cadastro em aprovação</strong>
                            <span>
                              Seu cadastro ainda está em aprovação. Você pode ver os livros e acessar
                              leituras digitais permitidas, mas o empréstimo físico só fica disponível
                              após a validação do administrador.
                            </span>
                          </div>
                        `
                      : modalBook.type === "physical" && modalBook.hasActiveBorrowedLoan
                      ? html`
                          <div className="modal-borrow-panel muted">
                            <strong>Empréstimo ativo em andamento</strong>
                            <span>
                              Você já está com um livro físico em uso. Conclua a devolução para solicitar
                              outro exemplar físico.
                            </span>
                            <button type="button" className="book-read-button" onClick=${() => onAccountRequest?.()}>
                              Ver minha conta
                            </button>
                          </div>
                        `
                      : !isAuthenticated
                      ? html`
                          <div className="modal-borrow-panel muted">
                            <strong>Login necessário</strong>
                            <span>Entre no sistema para solicitar ou acessar este livro.</span>
                            <button type="button" className="book-read-button" onClick=${() => onLoginRequest?.()}>
                              Fazer login
                            </button>
                          </div>
                        `
                      : html`
                        <div className="modal-borrow-panel">
                            <strong>
                              ${modalBook.type === "digital"
                                ? "Acesso imediato"
                                : modalBook.hasActiveBorrowedLoan
                              ? "Reserva aguardando retorno"
                              : "Pronto para solicitação"}
                          </strong>
                            <span>
                              ${modalBook.type === "digital"
                                ? "Leia este título diretamente no sistema."
                                : "Veja os detalhes e solicite este livro quando estiver pronto."}
                            </span>
                            ${modalBook.hasActiveBorrowedLoan && modalBook.type === "physical"
                              ? html`<small>Você já possui leitura ativa. Depois de devolver, volte para solicitar este livro.</small>`
                              : null}
                            <button
                              type="button"
                              disabled=${busyBookId === modalBook.id}
                              onClick=${(event) =>
                                modalBook.canConfirmPickup
                                  ? handleConfirmPickup(modalBook, event)
                                  : handleBorrow(modalBook, event)}
                            >
                              ${busyBookId === modalBook.id
                                ? "Processando..."
                                : modalBook.requestLabel}
                            </button>
                          </div>
                        `}
                  </div>
                </div>
              </div>
            </div>
          `
        : null}

      ${readerBook
        ? html`
            <div className="reader-modal-backdrop" onClick=${handleCloseReader}>
              <div
                className=${`reader-modal reader-theme-${readerTheme} reader-density-${readerDensity}`}
                onClick=${(event) => event.stopPropagation()}
              >
                <div className="reader-modal-header">
                  <div className="reader-modal-title">
                    <span className="reader-eyebrow">Leitura digital</span>
                    <h2>${readerBook.title}</h2>
                    <p>${readerBook.author}</p>
                  </div>

                  <div className="reader-modal-header-actions">
                    <button
                      type="button"
                      className="reader-icon-button"
                      onClick=${() => setReaderTheme("paper")}
                      aria-pressed=${readerTheme === "paper"}
                      aria-label="Modo papel"
                      title="Modo papel"
                    >
                      ${readerModeIcon("paper")}
                    </button>
                    <button
                      type="button"
                      className="reader-icon-button"
                      onClick=${() => setReaderTheme("night")}
                      aria-pressed=${readerTheme === "night"}
                      aria-label="Modo noturno"
                      title="Modo noturno"
                    >
                      ${readerModeIcon("night")}
                    </button>
                    <button
                      type="button"
                      className="reader-icon-button"
                      onClick=${() => setReaderDensity("focus")}
                      aria-pressed=${readerDensity === "focus"}
                      aria-label="Modo foco"
                      title="Modo foco"
                    >
                      ${readerModeIcon("focus")}
                    </button>
                    <button
                      type="button"
                      className="reader-icon-button"
                      onClick=${() => setReaderDensity("wide")}
                      aria-pressed=${readerDensity === "wide"}
                      aria-label="Modo amplo"
                      title="Modo amplo"
                    >
                      ${readerModeIcon("wide")}
                    </button>
                    <button
                      type="button"
                      className="reader-icon-button reader-close-button"
                      onClick=${handleCloseReader}
                      aria-label="Fechar leitura"
                      title="Fechar leitura"
                    >
                      ${readerModeIcon("close")}
                    </button>
                  </div>
                </div>

                <div className="reader-modal-body">
                  <div className="reader-stage">
                    <div className="reader-modal-frame">
                      ${readerBook.digitalContentBase64
                    ? html`
                          <div className="reader-page-shell">
                            <div className="reader-page-toolbar">
                              <button
                                type="button"
                                className="reader-page-control reader-page-icon-button"
                                disabled=${readerPage <= 1 || readerLoading}
                                onClick=${() => handleReaderJump(-1)}
                                aria-label="Pagina anterior"
                                title="Pagina anterior"
                              >
                                ${readerControlIcon("prev")}
                              </button>
                              <div className="reader-page-progress">
                                <span>
                                  ${readerPageCount
                                    ? `${readerPage} / ${readerPageCount}`
                                    : "0 / 0"}
                                </span>
                                <div className="reader-page-track" aria-hidden="true">
                                  <span
                                    className="reader-page-fill"
                                    style=${{
                                      width: readerPageCount
                                        ? `${Math.max(
                                            4,
                                            Math.min(100, (readerPage / readerPageCount) * 100)
                                          )}%`
                                        : "0%"
                                    }}
                                  ></span>
                                </div>
                              </div>
                              <div className="reader-page-zoom">
                                <button
                                  type="button"
                                  className="reader-page-control reader-page-icon-button"
                                  disabled=${readerLoading}
                                  onClick=${() => handleReaderScaleChange(-0.1)}
                                  aria-label="Diminuir texto"
                                  title="Diminuir texto"
                                >
                                  ${readerControlIcon("minus")}
                                </button>
                                <button
                                  type="button"
                                  className="reader-page-control reader-page-icon-button"
                                  disabled=${readerLoading}
                                  onClick=${() => handleReaderScaleChange(0.1)}
                                  aria-label="Aumentar texto"
                                  title="Aumentar texto"
                                >
                                  ${readerControlIcon("plus")}
                                </button>
                              </div>
                              <button
                                type="button"
                                className="reader-page-control reader-page-icon-button"
                                disabled=${readerPageCount === 0 || readerPage >= readerPageCount || readerLoading}
                                onClick=${() => handleReaderJump(1)}
                                aria-label="Próxima página"
                                title="Próxima página"
                              >
                                ${readerControlIcon("next")}
                              </button>
                            </div>

                            <div
                              className=${`reader-page-stage ${readerAnimating ? `turn-${readerTurnDirection}` : ""}`}
                              ref=${readerPageStageRef}
                              onClick=${handleReaderStageClick}
                            >
                              ${readerLoading
                                ? html`
                                    <div className="reader-page-loading">
                                      <strong>Carregando leitura...</strong>
                                      <p>Estamos preparando a página para você.</p>
                                    </div>
                                  `
                                : null}

                              ${readerError
                                ? html`
                                    <div className="reader-empty-state">
                                      <strong>Leitura indisponível</strong>
                                      <p>${readerError}</p>
                                    </div>
                                  `
                                : html`
                                    <div className="reader-page-paper">
                                      <canvas
                                        ref=${readerCanvasRef}
                                        className="reader-page-canvas"
                                        style=${{
                                          width: "auto",
                                          height: "auto"
                                        }}
                                        aria-label=${`Pagina ${readerPage} do livro ${readerBook.title}`}
                                      ></canvas>
                                    </div>
                                  `}
                            </div>
                          </div>
                      `
                    : html`
                          <div className="reader-empty-state">
            <strong>PDF não anexado</strong>
                            <p>
                              Este livro ainda não possui PDF disponível para leitura no sistema.
                            </p>
                          </div>
                        `}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `
        : null}
    </section>
  `;
}

function clampReaderPage(page, totalPages) {
  if (!Number.isFinite(totalPages) || totalPages <= 0) {
    return Math.max(1, Number(page) || 1);
  }

  return Math.max(1, Math.min(totalPages, Number(page) || 1));
}

function readStoredReaderPage(bookId) {
  if (!bookId || !globalThis.localStorage) {
    return 1;
  }

  const raw = globalThis.localStorage.getItem(`lumiar-flow-reader-page:${bookId}`);
  const page = Number(raw);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

function writeStoredReaderPage(bookId, page) {
  if (!bookId || !globalThis.localStorage) {
    return;
  }

  try {
    globalThis.localStorage.setItem(`lumiar-flow-reader-page:${bookId}`, String(page));
  } catch (error) {
    void error;
  }
}

async function loadPdfJsRuntime() {
  if (!globalThis.window) {
    throw new Error("Leitura digital disponível apenas no navegador.");
  }

  if (!pdfJsRuntimePromise) {
    pdfJsRuntimePromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ]).then(([pdfjsModule, workerModule]) => {
      const workerUrl = workerModule?.default || workerModule;

      if (pdfjsModule?.GlobalWorkerOptions && workerUrl) {
        pdfjsModule.GlobalWorkerOptions.workerSrc = workerUrl;
      }

      return {
        getDocument: pdfjsModule.getDocument
      };
    });
  }

  return pdfJsRuntimePromise;
}

function translateLoanStatus(status) {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Aguardando aprovação";
    case "READY_FOR_PICKUP":
      return "Pronto para retirada";
    case "BORROWED":
      return "Emprestado";
    case "RETURNED":
      return "Devolvido";
    case "REJECTED":
      return "Solicitação negada";
    default:
      return "Em processamento";
  }
}

function buildLoanStatusMessage(loan, book) {
  switch (loan.status) {
    case "PENDING_APPROVAL":
      return "Solicitação enviada ao admin.";
    case "READY_FOR_PICKUP":
      return `Reserve até ${formatLoanDate(loan.readyUntil || loan.dueAt)} e retire em ${loan.location || "local a definir"} com ${loan.responsible || "responsável a definir"}.`;
    case "BORROWED":
      return book.type === "digital"
        ? `Acesso liberado até ${formatLoanDate(loan.dueAt)}.`
        : `Com você até ${formatLoanDate(loan.dueAt)}.`;
    case "REJECTED":
      return "Solicitação negada. Fale com o responsável pelas liberações.";
    default:
      return "Status atualizado.";
  }
}

function formatLoanDate(value) {
  if (!value) {
    return "data a definir";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function buildReturnCountdown(dueAt, now) {
  if (!dueAt) {
    return "Prazo em breve";
  }

  const diff = new Date(dueAt).getTime() - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) {
    return "Devolver hoje";
  }

  if (days === 1) {
    return "Devolver em 1 dia";
  }

  return `Devolver em ${days} dias`;
}

function getWaitlistPosition(waitlists, bookId, userId) {
  const queue = waitlists.filter(
    (entry) => entry.bookId === bookId && entry.status === "WAITING"
  );
  const index = queue.findIndex((entry) => entry.userId === userId);
  return index >= 0 ? index + 1 : queue.length + 1;
}

function formatRating(value) {
  const rating = typeof value === "number" ? value : 4.2;

  return `${rating.toFixed(1)}/5`;
}

function readerModeIcon(mode) {
  switch (mode) {
    case "paper":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 4.5h8l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"></path>
          <path d="M14 4.5V9h4"></path>
          <path d="M8 12h8M8 15h8M8 8.5h3"></path>
        </svg>
      `;
    case "night":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5c.25 0 .5 0 .75.03A6.5 6.5 0 0 0 19 14.5Z"></path>
        </svg>
      `;
    case "focus":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4.5 9V4.5H9"></path>
          <path d="M15 4.5h4.5V9"></path>
          <path d="M19.5 15V19.5H15"></path>
          <path d="M9 19.5H4.5V15"></path>
        </svg>
      `;
    case "wide":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 8V5h3"></path>
          <path d="M19 8V5h-3"></path>
          <path d="M5 16v3h3"></path>
          <path d="M19 16v3h-3"></path>
          <path d="M8 5h8M8 19h8"></path>
        </svg>
      `;
    case "close":
    default:
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      `;
  }
}

function readerControlIcon(action) {
  switch (action) {
    case "prev":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      `;
    case "next":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6"></path>
        </svg>
      `;
    case "minus":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 12h12"></path>
        </svg>
      `;
    case "plus":
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 6v12"></path>
          <path d="M6 12h12"></path>
        </svg>
      `;
    default:
      return html`<span aria-hidden="true"></span>`;
  }
}

function buildSummary(book) {
  const category = book.category ? ` em ${book.category}` : "";
  const level = translateLevel(book.level);

  return `Leitura ${level}${category}.`;
}

function translateLevel(level) {
  switch (level) {
    case "easy":
      return "leve";
    case "medium":
      return "intermediaria";
    case "hard":
      return "avancada";
    default:
      return "interna";
  }
}

function buildPdfDataUrl(base64) {
  const payload = String(base64 || "").trim();

  return payload ? `data:application/pdf;base64,${payload}` : "";
}

function isGoldLevel(level) {
  return ["gold", "ouro"].includes(String(level || "").trim().toLowerCase());
}

function decodeBase64Pdf(base64) {
  const payload = String(base64 || "").trim().replace(/^data:application\/pdf;base64,/, "");

  if (!payload) {
    return new Uint8Array();
  }

  const binary = globalThis.atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}


