export function createAdminApiClient(baseUrl) {
  return {
    async fetchState() {
      return request(`${baseUrl}/admin/state`, {
        method: "GET"
      });
    },

    async syncState(state) {
      return request(`${baseUrl}/admin/state`, {
        method: "POST",
        body: JSON.stringify({ state })
      });
    },

    async syncBooks(books) {
      return request(`${baseUrl}/admin/books/sync`, {
        method: "POST",
        body: JSON.stringify({ books })
      });
    },

    async registerUser(input) {
      return request(`${baseUrl}/auth/register`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async createManagedUser(input) {
      return request(`${baseUrl}/admin/users`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },

    async changePassword(input) {
      return request(`${baseUrl}/auth/password`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    }
  };
}

async function request(url, init) {
  let response;

  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
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
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.message || `Admin request failed (${response.status}).`
    );
  }

  return data;
}

function buildNetworkError(url, cause) {
  const host = new URL(url, window.location.origin).host;
  const error = new Error(`Nao foi possivel conectar ao painel administrativo em ${host}.`);
  error.cause = cause;
  return error;
}
