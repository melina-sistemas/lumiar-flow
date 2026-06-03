import {
  calculateDueDate,
  canCreateLoan
} from "./library-rules.js";
import { defaultUseCaseContext } from "./use-case-context.js";

export async function createLoan(input, dependencies) {
  const { repository, context = defaultUseCaseContext } = dependencies;
  const user = await repository.findUserById(input.userId);

  if (!user) {
    return createError("user_not_found", "Usuario nao encontrado.");
  }

  const book = await repository.findBookById(input.bookId);
  const isDigitalRequest = String(input.type ?? book?.type ?? "").trim().toLowerCase() === "digital";

  if (!book) {
    return createError("book_not_found", "Livro nao encontrado.");
  }

  const permission = isDigitalRequest
    ? { allowed: true }
    : canCreateLoan(user, book);

  if (!permission.allowed) {
    return createError(
      permission.reason,
      getCreateLoanErrorMessage(permission.reason)
    );
  }

  const borrowedAt = input.borrowedAt ?? context.now();
  const loan = {
    id: context.generateId("loan"),
    userId: user.id,
    bookId: book.id,
    levelAtLoan: book.level,
    borrowedAt,
    dueAt: calculateDueDate(book.level, borrowedAt),
    status: isDigitalRequest ? "EMPRESTADO" : "PENDENTE_APROVACAO"
  };
  const updatedUser = isDigitalRequest
    ? user
    : {
        ...user,
        activeLoanId: loan.id
      };
  const updatedBook = book;

  await repository.saveLoan(loan);
  await repository.updateUser(updatedUser);
  if (!isDigitalRequest) {
    await repository.updateBook(updatedBook);
  }

  return {
    success: true,
    data: {
      loan,
      user: updatedUser,
      book: updatedBook
    }
  };
}

function getCreateLoanErrorMessage(reason) {
  switch (reason) {
    case "user_has_active_loan":
      return "Usuario ja possui um emprestimo ativo.";
    case "book_inactive":
      return "Livro inativo e indisponivel para emprestimo.";
    case "book_unavailable":
      return "Livro sem copias disponiveis.";
    case "premium_book_requires_gold":
      return "Livro premium disponivel apenas para usuarios nivel ouro.";
    default:
      return "Emprestimo nao pode ser criado.";
  }
}

function createError(code, message, details) {
  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}
