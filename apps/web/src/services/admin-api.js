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
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.message || `Admin request failed (${response.status}).`
    );
  }

  return data;
}
