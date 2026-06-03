import { readSessionToken } from "./session-token.js";

export function createLoanApiClient(baseUrl) {
  return {
    async fetchSeed() {
      return request(`${baseUrl}/seed`, {
        method: "GET"
      });
    },

    async createLoan(input) {
      return request(`${baseUrl}/loans`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async joinWaitlist(input) {
      return request(`${baseUrl}/waitlists`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async removeWaitlistEntry(waitlistId) {
      return request(`${baseUrl}/waitlists/${encodeURIComponent(waitlistId)}`, {
        method: "DELETE"
      });
    },

    async returnLoan(input) {
      return request(`${baseUrl}/loans/${input.loanId}/return`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async confirmPickup(loanId) {
      return request(`${baseUrl}/loans/${encodeURIComponent(loanId)}/confirm-pickup`, {
        method: "POST"
      });
    },

    async importBooksPdfText(input) {
      return request(`${baseUrl}/admin/books/import-pdf`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    }
  };
}

async function request(url, init) {
  const sessionToken = readSessionToken();
  let response;

  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    throw buildNetworkError(url, error);
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      const errorMessage = text.slice(0, 200).replace(/\s+/g, " ").trim();
      const parseError = new Error(
        `API retornou conteudo nao JSON em ${new URL(url, window.location.origin).pathname}: ${errorMessage}`
      );
      parseError.cause = error;
      throw parseError;
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.message ??
      `Falha na requisicao (${response.status} ${response.statusText}).`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.payload = data;
    throw requestError;
  }

  return data;
}

function buildNetworkError(url, cause) {
  const host = new URL(url, window.location.origin).host;
  const error = new Error(
    `Nao foi possivel conectar ao servidor em ${host}. Verifique o endpoint do staging.`
  );
  error.cause = cause;
  return error;
}
