import { readFile, writeFile } from "node:fs/promises";
import { getSupabaseConfig } from "../config/supabase-config.js";

const ADMIN_STATE_ROW_KEY = "panel";
const ADMIN_STATE_FILE = new URL("./admin-state.json", import.meta.url);

export function createAdminStateStore() {
  const hasSupabaseConfig =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!hasSupabaseConfig && process.env.NODE_ENV === "production") {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios em producao para o admin_state."
    );
  }

  if (hasSupabaseConfig) {
    return new SupabaseAdminStateStore(getSupabaseConfig());
  }

  return new FileAdminStateStore(ADMIN_STATE_FILE);
}

class FileAdminStateStore {
  constructor(fileUrl) {
    this.fileUrl = fileUrl;
  }

  async read() {
    try {
      const raw = await readFile(this.fileUrl, "utf8");
      const parsed = JSON.parse(raw);
      const state = normalizeState(parsed?.state ?? parsed);
      const updatedAt = parsed?.updatedAt ?? parsed?.updated_at ?? null;

      return {
        state,
        updatedAt
      };
    } catch (error) {
      return createEmptyRecord();
    }
  }

  async write(state) {
    const record = {
      state: normalizeState(state),
      updatedAt: new Date().toISOString()
    };

    await writeFile(this.fileUrl, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    return record;
  }
}

class SupabaseAdminStateStore {
  constructor(config) {
    this.config = config;
  }

  async read() {
    const rows = await this.request(
      `/rest/v1/admin_state?key=eq.${encodeURIComponent(ADMIN_STATE_ROW_KEY)}&select=payload,updated_at`,
      {
        method: "GET"
      }
    );
    const row = rows[0];

    if (!row) {
      return createEmptyRecord();
    }

    return {
      state: normalizeState(row.payload),
      updatedAt: row.updated_at ?? null
    };
  }

  async write(state) {
    const record = {
      key: ADMIN_STATE_ROW_KEY,
      payload: normalizeState(state),
      updated_at: new Date().toISOString()
    };

    await this.request("/rest/v1/admin_state?on_conflict=key", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(record)
    });

    return {
      state: record.payload,
      updatedAt: record.updated_at
    };
  }

  async request(path, init) {
    const response = await fetch(`${this.config.url}${path}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": this.config.schema,
        "Content-Profile": this.config.schema,
        ...(init?.headers ?? {})
      }
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        `Supabase request failed (${response.status}): ${
          data?.message ?? response.statusText
        }`
      );
    }

    return data;
  }
}

function createEmptyRecord() {
  return {
    state: {},
    updatedAt: null
  };
}

function normalizeState(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return {
    ...value,
    books: Array.isArray(value.books) ? value.books : [],
    users: Array.isArray(value.users) ? value.users : [],
    loans: Array.isArray(value.loans) ? value.loans : [],
    waitlists: Array.isArray(value.waitlists) ? value.waitlists : [],
    notifications: Array.isArray(value.notifications) ? value.notifications : []
  };
}
