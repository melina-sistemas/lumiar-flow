import type {
  CreateLoanRequest,
  CreateLoanResult,
  ReturnLoanRequest,
  ReturnLoanResult
} from "@lumiar-flow/shared";

export interface LoanApiClient {
  createLoan(input: CreateLoanRequest): Promise<CreateLoanResult>;
  returnLoan(input: ReturnLoanRequest): Promise<ReturnLoanResult>;
}

export function createLoanApiClient(baseUrl: string): LoanApiClient {
  return {
    async createLoan(input) {
      return request<CreateLoanResult>(`${baseUrl}/loans`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async returnLoan(input) {
      return request<ReturnLoanResult>(
        `${baseUrl}/loans/${input.loanId}/return`,
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    }
  };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  return response.json() as Promise<T>;
}
