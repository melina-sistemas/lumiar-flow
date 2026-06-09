import { createInitialLibraryState } from "../../../data/seed-data.js";

export class InMemoryLoanRepository {
  constructor(initialState = createInitialLibraryState()) {
    this.state = {
      users: initialState.users.map((item) => ({ ...item })),
      books: initialState.books.map((item) => ({ ...item })),
      loans: initialState.loans.map((item) => ({ ...item })),
      returns: initialState.returns.map((item) => ({ ...item })),
      recommendations: (initialState.recommendations ?? []).map((item) => ({
        ...item
      })),
      scoreEntries: initialState.scoreEntries.map((item) => ({ ...item }))
    };
  }

  async findUserById(userId) {
    return this.state.users.find((user) => user.id === userId) ?? null;
  }

  async findBookById(bookId) {
    return this.state.books.find((book) => book.id === bookId) ?? null;
  }

  async findLoanById(loanId) {
    return this.state.loans.find((loan) => loan.id === loanId) ?? null;
  }

  async getLibrarySnapshot() {
    return this.getSnapshot();
  }

  async saveLoan(loan) {
    const index = this.state.loans.findIndex((item) => item.id === loan.id);

    if (index >= 0) {
      this.state.loans[index] = { ...loan };
      return;
    }

    this.state.loans.push({ ...loan });
  }

  async saveLoanReturn(returnRecord) {
    this.state.returns.push({ ...returnRecord });
  }

  async updateUser(user) {
    const index = this.state.users.findIndex((item) => item.id === user.id);

    if (index >= 0) {
      this.state.users[index] = { ...user };
    }
  }

  async deleteUser(userId) {
    this.state.users = this.state.users.filter((item) => item.id !== userId);
    this.state.loans = this.state.loans.filter((item) => item.userId !== userId);
    this.state.returns = this.state.returns.filter((item) => item.userId !== userId);
    this.state.recommendations = this.state.recommendations.filter((item) => item.userId !== userId);
  }

  async saveBook(book) {
    const index = this.state.books.findIndex((item) => item.id === book.id);

    if (index >= 0) {
      this.state.books[index] = { ...book };
      return;
    }

    this.state.books.push({ ...book });
  }

  async deleteBook(bookId) {
    this.state.books = this.state.books.filter((item) => item.id !== bookId);
    this.state.loans = this.state.loans.filter((item) => item.bookId !== bookId);
    this.state.returns = this.state.returns.filter((item) => item.bookId !== bookId);
    this.state.recommendations = this.state.recommendations.filter((item) => item.bookId !== bookId);
  }

  async updateBook(book) {
    const index = this.state.books.findIndex((item) => item.id === book.id);

    if (index >= 0) {
      this.state.books[index] = { ...book };
    }
  }

  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}
