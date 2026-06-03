const OFFICIAL_LOAN_STATUS_LABELS = {
  DISPONIVEL: "Disponível",
  PENDENTE_APROVACAO: "Pendente de aprovação",
  AGUARDANDO_RETIRADA: "Aguardando retirada",
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  EMPRESTADO: "Emprestado",
  AGUARDANDO_FILA: "Aguardando fila",
  DEVOLVIDO: "Devolvido",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado"
};

const OFFICIAL_WAITLIST_STATUS_LABELS = {
  AGUARDANDO_FILA: "Aguardando fila"
};

export const MAX_WAITLIST_BOOKS_PER_USER = 5;

export function normalizeLoanStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();

  switch (normalized) {
    case "DISPONIVEL":
    case "AVAILABLE":
    case "EXPIRED":
      return "DISPONIVEL";
    case "READY_FOR_PICKUP":
      return "AGUARDANDO_CONFIRMACAO";
    case "PENDING_APPROVAL":
    case "PENDENTE_APROVACAO":
    case "PENDENTE DE APROVACAO":
      return "PENDENTE_APROVACAO";
    case "AGUARDANDO_RETIRADA":
      return "AGUARDANDO_RETIRADA";
    case "AGUARDANDO_CONFIRMACAO":
      return "AGUARDANDO_CONFIRMACAO";
    case "BORROWED":
    case "ACTIVE":
    case "OVERDUE":
    case "EMPRESTADO":
    case "RETURN_REQUESTED":
      return "EMPRESTADO";
    case "WAITING":
    case "AGUARDANDO_FILA":
    case "READY":
      return "AGUARDANDO_FILA";
    case "RETURNED":
    case "DEVOLVIDO":
      return "DEVOLVIDO";
    case "REJECTED":
    case "REJEITADO":
      return "RECUSADO";
    case "CANCELLED":
    case "CANCELADO":
      return "CANCELADO";
    default:
      return "DISPONIVEL";
  }
}

export function normalizeWaitlistStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();

  switch (normalized) {
    case "WAITING":
    case "AGUARDANDO_FILA":
    case "READY":
      return "AGUARDANDO_FILA";
    case "AGUARDANDO_CONFIRMACAO":
      return "AGUARDANDO_CONFIRMACAO";
    case "CANCELLED":
    case "CANCELADO":
    case "EXPIRED":
      return "CANCELADO";
    default:
      return "AGUARDANDO_FILA";
  }
}

export function getLoanStatusLabel(status) {
  return OFFICIAL_LOAN_STATUS_LABELS[normalizeLoanStatus(status)] ?? "Disponível";
}

export function getWaitlistStatusLabel(status) {
  return OFFICIAL_WAITLIST_STATUS_LABELS[normalizeWaitlistStatus(status)] ?? "Aguardando fila";
}

export function isLoanBorrowed(status) {
  return normalizeLoanStatus(status) === "EMPRESTADO";
}

export function isLoanPendingApproval(status) {
  return normalizeLoanStatus(status) === "PENDENTE_APROVACAO";
}

export function isLoanReturned(status) {
  return normalizeLoanStatus(status) === "DEVOLVIDO";
}

export function isLoanActive(status) {
  const normalized = normalizeLoanStatus(status);
  return (
    normalized === "PENDENTE_APROVACAO" ||
    normalized === "AGUARDANDO_RETIRADA" ||
    normalized === "AGUARDANDO_CONFIRMACAO" ||
    normalized === "EMPRESTADO" ||
    normalized === "AGUARDANDO_FILA"
  );
}

export function isWaitlistEntryActive(entry) {
  const normalized = normalizeWaitlistStatus(entry?.status);
  return normalized === "AGUARDANDO_FILA";
}

export function countBookWaitlistEntries(waitlists, bookId) {
  return (Array.isArray(waitlists) ? waitlists : []).filter(
    (entry) => String(entry.bookId) === String(bookId) && isWaitlistEntryActive(entry)
  ).length;
}

export function countUserWaitlistEntries(waitlists, userId) {
  const seenBookIds = new Set();

  for (const entry of Array.isArray(waitlists) ? waitlists : []) {
    if (String(entry.userId) !== String(userId) || !isWaitlistEntryActive(entry)) {
      continue;
    }

    seenBookIds.add(String(entry.bookId));
  }

  return seenBookIds.size;
}

export function getWaitlistPosition(waitlists, bookId, userId) {
  const queue = (Array.isArray(waitlists) ? waitlists : []).filter(
    (entry) => String(entry.bookId) === String(bookId) && isWaitlistEntryActive(entry)
  );
  const index = queue.findIndex((entry) => String(entry.userId) === String(userId));

  return index >= 0 ? index + 1 : 0;
}

export function getWaitlistEntry(waitlists, bookId, userId) {
  return (Array.isArray(waitlists) ? waitlists : []).find(
    (entry) =>
      String(entry.bookId) === String(bookId) &&
      String(entry.userId) === String(userId) &&
      isWaitlistEntryActive(entry)
  ) ?? null;
}
