import { clearSessionToken, readSessionToken, storeSessionToken } from "./session-token.js";

export function createAuthApiClient(baseUrl) {
  return {
    async login(input) {
      const result = await request(`${baseUrl}/auth/login`, {
        method: "POST",
        body: JSON.stringify(input)
      });

      storeSessionToken(result?.session?.token ?? "");
      return result;
    },

    async me() {
      try {
        const result = await request(`${baseUrl}/auth/me`, {
          method: "GET"
        });
        storeSessionToken(result?.session?.token ?? readSessionToken());
        return result;
      } catch (error) {
        if (error?.status === 401) {
          clearSessionToken();
        }

        throw error;
      }
    },

    async logout() {
      try {
        return await request(`${baseUrl}/auth/logout`, {
          method: "POST"
        });
      } finally {
        clearSessionToken();
      }
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
      data?.error?.message ?? `Falha na requisicao (${response.status} ${response.statusText}).`;
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
    `Nao foi possivel conectar a API em ${host}. Verifique a URL do staging e a propagacao do DNS.`
  );
  error.cause = cause;
  return error;
}
