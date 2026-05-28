const SESSION_TOKEN_KEY = "lumiar-flow-session-token";

export function readSessionToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeSessionToken(token) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, String(token));
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignora falhas de storage para nao bloquear o login.
  }
}

export function clearSessionToken() {
  storeSessionToken("");
}
