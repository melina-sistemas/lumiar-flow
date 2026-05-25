import * as Sentry from "@sentry/node";

let initialized = false;

export function initServerMonitoring() {
  const dsn = String(process.env.SENTRY_DSN ?? "").trim();

  if (!dsn || initialized) {
    return initialized ? Sentry : null;
  }

  const environment = String(process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production").trim();
  const release = String(process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "").trim() || undefined;
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1
  });

  initialized = true;

  const shutdown = async (code) => {
    try {
      await Sentry.flush(2000);
    } finally {
      process.exit(code);
    }
  };

  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
    void shutdown(1);
  });

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
  });

  process.on("SIGTERM", () => {
    void shutdown(0);
  });

  return Sentry;
}
