import {
  analyzeReturnAnswersQuality,
  calculateReadingScore,
  getUserLevelFromScore,
  validateReturnAnswers
} from "./library-rules.js";
import { defaultUseCaseContext } from "./use-case-context.js";

export async function returnLoan(input, dependencies) {
  const { repository, context = defaultUseCaseContext } = dependencies;
  const loan = await repository.findLoanById(input.loanId);

  if (!loan) {
    return createError("loan_not_found", "Emprestimo nao encontrado.");
  }

  if (loan.returnedAt || String(loan.status ?? "").trim().toUpperCase() === "DEVOLVIDO") {
    return createError(
      "loan_already_returned",
      "Este emprestimo ja foi finalizado."
    );
  }

  const answersValidation = validateReturnAnswers(input.answers);
  const qualityAnalysis = analyzeReturnAnswersQuality(input.answers);

  if (!answersValidation.isValid) {
    return createError(
      "invalid_return_answers",
      answersValidation.tooShortFields.length > 0
        ? "As respostas da devolucao precisam ser mais detalhadas."
        : "Preencha as tres respostas obrigatorias da devolucao.",
      {
        missingFields: answersValidation.missingFields,
        tooShortFields: answersValidation.tooShortFields,
        genericFields: answersValidation.genericFields,
        qualityScore: qualityAnalysis.score
      }
    );
  }

  const user = await repository.findUserById(loan.userId);

  if (!user) {
    return createError("user_not_found", "Usuario nao encontrado.");
  }

  const book = await repository.findBookById(loan.bookId);

  if (!book) {
    return createError("book_not_found", "Livro nao encontrado.");
  }

  const returnedAt = input.returnedAt ?? context.now();
  const scoreBreakdown = calculateReadingScore(
    loan.levelAtLoan,
    loan.dueAt,
    returnedAt,
    input.answers
  );
  const returnRecord = {
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
  const updatedLoan = {
    ...loan,
    status: "DEVOLVIDO",
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

function buildScoreEntries(loan, userId, createdAt, scoreBreakdown, context) {
  const positivePoints =
    scoreBreakdown.basePoints +
    scoreBreakdown.onTimeBonus +
    scoreBreakdown.completeAnswersBonus;
  const entries = [
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
