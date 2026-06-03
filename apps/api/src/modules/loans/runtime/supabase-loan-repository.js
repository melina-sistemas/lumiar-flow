import { normalizeUserRole } from "../../../security/auth.js";

export class SupabaseLoanRepository {
  constructor(config) {
    this.config = config;
  }

  async findUserById(userId) {
    const rows = await this.select("users", {
      id: `eq.${userId}`
    });

    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findBookById(bookId) {
    const rows = await this.select("books", {
      id: `eq.${bookId}`
    });

    return rows[0] ? mapBook(rows[0]) : null;
  }

  async findLoanById(loanId) {
    const rows = await this.select("loans", {
      id: `eq.${loanId}`
    });

    return rows[0] ? mapLoan(rows[0]) : null;
  }

  async getLibrarySnapshot() {
    const [users, books, loans, returns, recommendations] = await Promise.all([
      this.select("users", {}, "name.asc").then((rows) => rows.map(mapUser)),
      this.select("books", {}, "title.asc").then((rows) => rows.map(mapBook)),
      this.select("loans", {}, "borrowed_at.desc").then((rows) =>
        rows.map(mapLoan)
      ),
      this.select("returns", {}, "returned_at.desc").then((rows) =>
        rows.map(mapReturn)
      ),
      this.selectOptional("book_recommendations", {}, "user_id.asc").then((rows) =>
        rows.map(mapRecommendation)
      )
    ]);

    return {
      users,
      books,
      loans,
      returns,
      recommendations
    };
  }

  async saveLoan(loan) {
    await this.upsert("loans", mapLoanToRow(loan));
  }

  async saveLoanReturn(returnRecord) {
    await this.upsert("returns", mapReturnToRow(returnRecord));
  }

  async updateUser(user) {
    await this.upsert("users", mapUserToRow(user), "id");
  }

  async updateBook(book) {
    await this.update("books", book.id, mapBookToRow(book));
  }

  async select(table, filters = {}, order) {
    const query = new URLSearchParams({
      select: "*"
    });

    for (const [key, value] of Object.entries(filters)) {
      query.set(key, value);
    }

    if (order) {
      query.set("order", order);
    }

    return this.request(
      `/rest/v1/${table}?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Prefer: "return=representation"
        }
      }
    );
  }

  async selectOptional(table, filters = {}, order) {
    try {
      return await this.select(table, filters, order);
    } catch (error) {
      if (
        error instanceof Error &&
        /schema cache|relation .* does not exist|Could not find the table/i.test(
          error.message
        )
      ) {
        return [];
      }

      throw error;
    }
  }

  async upsert(table, payload, conflictTarget = "id") {
    await this.request(`/rest/v1/${table}`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      query: { on_conflict: conflictTarget },
      body: JSON.stringify(payload)
    });
  }

  async update(table, id, payload) {
    await this.request(`/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });
  }

  async request(path, init) {
    const query = init?.query ? `?${new URLSearchParams(init.query).toString()}` : "";
    const response = await fetch(`${this.config.url}${path}${query}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": this.config.schema,
        "Content-Profile": this.config.schema,
        ...(init?.headers ?? {})
      }
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        `Supabase request failed (${response.status}): ${
          data?.message ?? response.statusText
        }`
      );
    }

    return data;
  }
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeUserRole(row.role),
    level: row.level,
    readingScore: row.reading_score,
    activeLoanId: row.active_loan_id ?? undefined,
    completedLoansCount: row.completed_loans_count
  };
}

function mapUserToRow(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeUserRole(user.role),
    level: user.level,
    reading_score: user.readingScore,
    active_loan_id: user.activeLoanId ?? null,
    completed_loans_count: user.completedLoansCount,
    updated_at: new Date().toISOString()
  };
}

function mapBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    category: row.category,
    isbn: row.isbn ?? undefined,
    level: row.level,
    isPremium: row.is_premium,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    isActive: row.is_active
  };
}

function mapBookToRow(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    isbn: book.isbn ?? null,
    level: book.level,
    is_premium: book.isPremium,
    total_copies: book.totalCopies,
    available_copies: book.availableCopies,
    is_active: book.isActive,
    updated_at: new Date().toISOString()
  };
}

function mapLoan(row) {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    levelAtLoan: row.level_at_loan,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    status: row.status,
    returnedAt: row.returned_at ?? undefined,
    returnRecordId: row.return_record_id ?? undefined
  };
}

function mapLoanToRow(loan) {
  return {
    id: loan.id,
    user_id: loan.userId,
    book_id: loan.bookId,
    level_at_loan: loan.levelAtLoan,
    borrowed_at: loan.borrowedAt,
    due_at: loan.dueAt,
    status: loan.status,
    returned_at: loan.returnedAt ?? null,
    return_record_id: loan.returnRecordId ?? null,
    updated_at: new Date().toISOString()
  };
}

function mapReturn(row) {
  return {
    id: row.id,
    loanId: row.loan_id,
    userId: row.user_id,
    bookId: row.book_id,
    returnedAt: row.returned_at,
    isLate: row.is_late,
    daysLate: row.days_late,
    scoreAwarded: row.score_awarded,
    qualityScore: row.quality_score ?? 0,
    answers: {
      learning: row.learning,
      application: row.application,
      example: row.example
    }
  };
}

function mapReturnToRow(returnRecord) {
  return {
    id: returnRecord.id,
    loan_id: returnRecord.loanId,
    user_id: returnRecord.userId,
    book_id: returnRecord.bookId,
    returned_at: returnRecord.returnedAt,
    is_late: returnRecord.isLate,
    days_late: returnRecord.daysLate,
    score_awarded: returnRecord.scoreAwarded,
    quality_score: returnRecord.qualityScore,
    learning: returnRecord.answers.learning,
    application: returnRecord.answers.application,
    example: returnRecord.answers.example
  };
}

function mapRecommendation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    cycle: row.cycle,
    priority: row.priority,
    mainFocus: row.main_focus,
    strategicJustification: row.strategic_justification
  };
}
