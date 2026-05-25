import * as Sentry from "@sentry/react";

let initialized = false;

export function initClientMonitoring() {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();

  if (!dsn || initialized) {
    return initialized ? Sentry : null;
  }

  const environment = String(
    import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE ?? "production"
  ).trim();
  const release = String(import.meta.env.VITE_SENTRY_RELEASE ?? "").trim() || undefined;

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: 0.1
  });

  initialized = true;

  return Sentry;
}
