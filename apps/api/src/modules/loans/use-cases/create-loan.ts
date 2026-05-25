import {
  type CreateLoanRequest,
  type CreateLoanResult,
  calculateDueDate,
  canCreateLoan
} from "@lumiar-flow/shared";
import type { Loan } from "@lumiar-flow/shared";
import type { LoanRepository } from "../loan-repository";
import {
  defaultUseCaseContext,
  type UseCaseContext
} from "../use-case-context";

export interface CreateLoanDependencies {
  repository: LoanRepository;
  context?: UseCaseContext;
}

export async function createLoan(
  input: CreateLoanRequest,
  dependencies: CreateLoanDependencies
): Promise<CreateLoanResult> {
  const { repository, context = defaultUseCaseContext } = dependencies;
  const user = await repository.findUserById(input.userId);

  if (!user) {
    return {
      success: false,
      error: {
        code: "user_not_found",
        message: "Usuario nao encontrado."
      }
    };
  }

  const book = await repository.findBookById(input.bookId);

  if (!book) {
    return {
      success: false,
      error: {
        code: "book_not_found",
        message: "Livro nao encontrado."
      }
    };
  }

  const permission = canCreateLoan(user, book);

  if (!permission.allowed) {
    return {
      success: false,
      error: {
        code: permission.reason,
        message: getCreateLoanErrorMessage(permission.reason)
      }
    };
  }

  const borrowedAt = input.borrowedAt ?? context.now();
  const loan: Loan = {
    id: context.generateId("loan"),
    userId: user.id,
    bookId: book.id,
    levelAtLoan: book.level,
    borrowedAt,
    dueAt: calculateDueDate(book.level, borrowedAt),
    status: "active"
  };

  const updatedUser = {
    ...user,
    activeLoanId: loan.id
  };

  const updatedBook = {
    ...book,
    availableCopies: book.availableCopies - 1
  };

  await repository.saveLoan(loan);
  await repository.updateUser(updatedUser);
  await repository.updateBook(updatedBook);

  return {
    success: true,
    data: {
      loan,
      user: updatedUser,
      book: updatedBook
    }
  };
}

function getCreateLoanErrorMessage(reason: string | undefined): string {
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
