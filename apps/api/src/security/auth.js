import crypto from "node:crypto";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function getAuthConfig() {
  const jwtSecret = process.env.AUTH_JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("Configure AUTH_JWT_SECRET no arquivo .env.");
  }

  const cookieName = process.env.AUTH_COOKIE_NAME ?? "lumiar_flow_session";
  const cookieSameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAMESITE ?? "lax");
  const cookieSecure = normalizeBoolean(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === "production");
  const sessionTtlSeconds = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? DEFAULT_SESSION_TTL_SECONDS);

  return {
    jwtSecret,
    cookieName,
    cookieSameSite,
    cookieSecure,
    sessionTtlSeconds
  };
}

export function hashPassword(password, salt = randomSalt()) {
  const passwordBuffer = Buffer.from(String(password ?? ""), "utf8");
  const derived = crypto.scryptSync(passwordBuffer, salt, 64);

  return {
    passwordHash: derived.toString("hex"),
    passwordSalt: salt
  };
}

export function verifyPassword(password, passwordHash, passwordSalt) {
  if (!passwordHash || !passwordSalt) {
    return false;
  }

  const { passwordHash: nextHash } = hashPassword(password, passwordSalt);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(nextHash, "hex"),
      Buffer.from(String(passwordHash), "hex")
    );
  } catch {
    return false;
  }
}

export function issueSessionToken(user, config = getAuthConfig()) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.id),
    role: String(user.role ?? "user"),
    status: String(user.accessStatus ?? user.status ?? "pending"),
    tokenVersion: Number(user.tokenVersion ?? 0),
    iat: now,
    exp: now + config.sessionTtlSeconds
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(signingInput)
    .digest("base64url");

  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date((payload.exp ?? now) * 1000).toISOString(),
    payload
  };
}

export function verifySessionToken(token, config = getAuthConfig()) {
  if (!token) {
    return null;
  }

  const parts = String(token).split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(signingInput)
    .digest("base64url");

  if (!safeEqualString(signature, expectedSignature)) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
    return null;
  }

  return payload;
}

export function parseCookies(cookieHeader = "") {
  const cookies = {};

  for (const part of String(cookieHeader).split(";")) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

export function getBearerToken(request) {
  const authorization = request.headers?.authorization ?? request.headers?.Authorization ?? "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

export function getSessionTokenFromRequest(request, config = getAuthConfig()) {
  const cookies = parseCookies(request.headers?.cookie ?? request.headers?.Cookie ?? "");
  const cookieToken = cookies[config.cookieName] ?? "";

  return cookieToken || getBearerToken(request);
}

export function buildAuthCookie(token, config = getAuthConfig()) {
  const attributes = [
    `${config.cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${config.sessionTtlSeconds}`,
    `SameSite=${capitalizeSameSite(config.cookieSameSite)}`
  ];

  if (config.cookieSecure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function buildClearedAuthCookie(config = getAuthConfig()) {
  const attributes = [
    `${config.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${capitalizeSameSite(config.cookieSameSite)}`
  ];

  if (config.cookieSecure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const {
    passwordHash,
    passwordSalt,
    ...safeUser
  } = user;

  return safeUser;
}

export function normalizeUserStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "active" || normalized === "aprovado" || normalized === "ativo") {
    return "approved";
  }

  if (
    normalized === "pendente" ||
    normalized === "em aprovação" ||
    normalized === "em aprovacao" ||
    normalized === "aguardando aprovação" ||
    normalized === "aguardando aprovacao"
  ) {
    return "pending";
  }

  if (normalized === "recusado" || normalized === "rejeitado") {
    return "rejected";
  }

  if (normalized === "bloqueado") {
    return "blocked";
  }

  return normalized || "pending";
}

export function normalizeUserRole(role) {
  return String(role ?? "").trim().toLowerCase() === "admin" ? "admin" : "staff";
}

export function normalizeUserLevel(level) {
  const normalized = String(level ?? "").trim().toLowerCase();

  if (normalized === "gold" || normalized === "ouro") {
    return "gold";
  }

  if (normalized === "silver" || normalized === "prata") {
    return "silver";
  }

  return "bronze";
}

export function randomSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSameSite(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "none" || normalized === "strict") {
    return normalized;
  }

  return "lax";
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }

  const normalized = String(value).trim().toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function capitalizeSameSite(value) {
  if (value === "none") {
    return "None";
  }

  if (value === "strict") {
    return "Strict";
  }

  return "Lax";
}
