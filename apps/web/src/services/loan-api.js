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

    async returnLoan(input) {
      return request(`${baseUrl}/loans/${input.loanId}/return`, {
        method: "POST",
        body: JSON.stringify(input)
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
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

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
