import { normalizeUserRole } from "../security/auth.js";
import { loadEnvFile } from "../config/load-env.js";
import { getSupabaseConfig } from "../config/supabase-config.js";
import { createDevelopmentPlanCatalog } from "./development-plan-data.js";

const LEGACY_USER_IDS = ["user-ana", "user-bruno"];
const LEGACY_BOOK_IDS = ["book-clean-code", "book-refactoring", "book-feedback"];

async function main() {
  loadEnvFile();

  const config = getSupabaseConfig();
  const catalog = createDevelopmentPlanCatalog();

  console.log(
    `Sincronizando ${catalog.users.length} usuarios, ${catalog.books.length} livros e ${catalog.recommendations.length} recomendacoes...`
  );

  await deleteLegacySeeds(config);
  await upsertRows(config, "users", catalog.users.map(mapUserToRow));
  await upsertRows(config, "books", catalog.books.map(mapBookToRow));

  try {
    await upsertRows(
      config,
      "book_recommendations",
      catalog.recommendations.map(mapRecommendationToRow)
    );
    console.log("Recomendacoes sincronizadas com sucesso.");
  } catch (error) {
    console.log(
      "A tabela book_recommendations ainda nao esta pronta no banco. Usuarios e livros foram sincronizados, mas as recomendacoes ficaram pendentes."
    );
  }

  console.log("Sincronizacao concluida.");
}

async function deleteLegacySeeds(config) {
  await deleteByOrFilters(config, "returns", [
    `user_id.in.(${LEGACY_USER_IDS.join(",")})`,
    `book_id.in.(${LEGACY_BOOK_IDS.join(",")})`
  ]);
  await deleteByOrFilters(config, "loans", [
    `user_id.in.(${LEGACY_USER_IDS.join(",")})`,
    `book_id.in.(${LEGACY_BOOK_IDS.join(",")})`
  ]);
  await deleteByIds(config, "users", LEGACY_USER_IDS);
  await deleteByIds(config, "books", LEGACY_BOOK_IDS);
}

async function deleteByIds(config, table, ids) {
  if (!ids.length) {
    return;
  }

  const query = new URLSearchParams({
    id: `in.(${ids.join(",")})`
  });

  await request(config, `/rest/v1/${table}?${query.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    }
  });
}

async function deleteByOrFilters(config, table, filters) {
  if (!filters.length) {
    return;
  }

  const query = new URLSearchParams({
    or: `(${filters.join(",")})`
  });

  await request(config, `/rest/v1/${table}?${query.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    }
  });
}

async function upsertRows(config, table, rows) {
  await request(config, `/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
}

async function request(config, path, init) {
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": config.schema,
      "Content-Profile": config.schema,
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

function mapUserToRow(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeUserRole(user.role),
    level: user.level,
    reading_score: user.readingScore,
    active_loan_id: user.activeLoanId ?? null,
    completed_loans_count: user.completedLoansCount,
    updated_at: new Date().toISOString()
  };
}

function mapBookToRow(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    isbn: book.isbn ?? null,
    level: book.level,
    is_premium: book.isPremium,
    total_copies: book.totalCopies,
    available_copies: book.availableCopies,
    is_active: book.isActive,
    updated_at: new Date().toISOString()
  };
}

function mapRecommendationToRow(item) {
  return {
    id: item.id,
    user_id: item.userId,
    book_id: item.bookId,
    cycle: item.cycle,
    priority: item.priority,
    main_focus: item.mainFocus,
    strategic_justification: item.strategicJustification
  };
}

main().catch((error) => {
  console.error("Falha ao sincronizar o plano de desenvolvimento.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
