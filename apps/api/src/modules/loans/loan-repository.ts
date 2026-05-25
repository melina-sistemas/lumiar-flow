import type {
  Book,
  BookRecommendation,
  Loan,
  LoanReturn,
  TeamUser
} from "@lumiar-flow/shared";

export interface LibrarySnapshot {
  users: TeamUser[];
  books: Book[];
  loans: Loan[];
  returns: LoanReturn[];
  recommendations: BookRecommendation[];
}

export interface LoanRepository {
  findUserById(userId: string): Promise<TeamUser | null>;
  findBookById(bookId: string): Promise<Book | null>;
  findLoanById(loanId: string): Promise<Loan | null>;
  getLibrarySnapshot(): Promise<LibrarySnapshot>;
  saveLoan(loan: Loan): Promise<void>;
  saveLoanReturn(returnRecord: LoanReturn): Promise<void>;
  updateUser(user: TeamUser): Promise<void>;
  updateBook(book: Book): Promise<void>;
}
