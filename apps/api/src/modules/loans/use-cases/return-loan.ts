import {
  analyzeReturnAnswersQuality,
  type ReturnLoanRequest,
  type ReturnLoanResult,
  calculateReadingScore,
  getUserLevelFromScore,
  validateReturnAnswers
} from "@lumiar-flow/shared";
import type { Loan, LoanReturn, ScoreEntry } from "@lumiar-flow/shared";
import type { LoanRepository } from "../loan-repository";
import {
  defaultUseCaseContext,
  type UseCaseContext
} from "../use-case-context";

export interface ReturnLoanDependencies {
  repository: LoanRepository;
  context?: UseCaseContext;
}

export async function returnLoan(
  input: ReturnLoanRequest,
  dependencies: ReturnLoanDependencies
): Promise<ReturnLoanResult> {
  const { repository, context = defaultUseCaseContext } = dependencies;
  const loan = await repository.findLoanById(input.loanId);

  if (!loan) {
    return {
      success: false,
      error: {
        code: "loan_not_found",
        message: "Emprestimo nao encontrado."
      }
    };
  }

  if (loan.returnedAt || loan.status === "returned") {
    return {
      success: false,
      error: {
        code: "loan_already_returned",
        message: "Este emprestimo ja foi finalizado."
      }
    };
  }

  const answersValidation = validateReturnAnswers(input.answers);
  const qualityAnalysis = analyzeReturnAnswersQuality(input.answers);

  if (!answersValidation.isValid) {
    return {
      success: false,
      error: {
        code: "invalid_return_answers",
        message:
          answersValidation.tooShortFields.length > 0
            ? "As respostas da devolucao precisam ser mais detalhadas."
            : "Preencha as tres respostas obrigatorias da devolucao.",
        details: {
          missingFields: answersValidation.missingFields,
          tooShortFields: answersValidation.tooShortFields,
          genericFields: answersValidation.genericFields,
          qualityScore: qualityAnalysis.score
        }
      }
    };
  }

  const user = await repository.findUserById(loan.userId);

  if (!user) {
    return {
      success: false,
      error: {
        code: "user_not_found",
        message: "Usuario nao encontrado."
      }
    };
  }

  const book = await repository.findBookById(loan.bookId);

  if (!book) {
    return {
      success: false,
      error: {
        code: "book_not_found",
        message: "Livro nao encontrado."
      }
    };
  }

  const returnedAt = input.returnedAt ?? context.now();
  const scoreBreakdown = calculateReadingScore(
    loan.levelAtLoan,
    loan.dueAt,
    returnedAt,
    input.answers
  );
  const returnRecord: LoanReturn = {
    id: context.generateId("return"),
    loanId: loan.id,
    userId: loan.userId,
    bookId: loan.bookId,
    returnedAt,
    isLate: scoreBreakdown.isLate,
    daysLate: scoreBreakdown.daysLate,
    scoreAwarded: scoreBreakdown.totalPoints,
    qualityScore: qualityAnalysis.score,
    answers: input.answers
  };
  const scoreEntries = buildScoreEntries(
    loan,
    user.id,
    returnedAt,
    scoreBreakdown,
    context
  );
  const updatedLoan: Loan = {
    ...loan,
    status: "returned",
    returnedAt,
    returnRecordId: returnRecord.id
  };
  const updatedUser = {
    ...user,
    readingScore: user.readingScore + scoreBreakdown.totalPoints,
    level: getUserLevelFromScore(
      user.readingScore + scoreBreakdown.totalPoints
    ),
    activeLoanId: undefined,
    completedLoansCount: user.completedLoansCount + 1
  };
  const updatedBook = {
    ...book,
    availableCopies: book.availableCopies + 1
  };

  await repository.saveLoanReturn(returnRecord);
  await repository.saveLoan(updatedLoan);
  await repository.updateUser(updatedUser);
  await repository.updateBook(updatedBook);

  return {
    success: true,
    data: {
      loan: updatedLoan,
      returnRecord,
      scoreEntries,
      scoreBreakdown,
      user: updatedUser,
      book: updatedBook
    }
  };
}

function buildScoreEntries(
  loan: Loan,
  userId: string,
  createdAt: string,
  scoreBreakdown: {
    basePoints: number;
    onTimeBonus: number;
    completeAnswersBonus: number;
    latePenalty: number;
  },
  context: UseCaseContext
): ScoreEntry[] {
  const positivePoints =
    scoreBreakdown.basePoints +
    scoreBreakdown.onTimeBonus +
    scoreBreakdown.completeAnswersBonus;
  const entries: ScoreEntry[] = [
    {
      id: context.generateId("score"),
      userId,
      loanId: loan.id,
      points: positivePoints,
      reason: "reading_completed",
      createdAt,
      notes: "Pontuacao por leitura concluida e bonus aplicaveis."
    }
  ];

  if (scoreBreakdown.latePenalty > 0) {
    entries.push({
      id: context.generateId("score"),
      userId,
      loanId: loan.id,
      points: -scoreBreakdown.latePenalty,
      reason: "late_return_penalty",
      createdAt,
      notes: "Penalidade por devolucao em atraso."
    });
  }

  return entries;
}
