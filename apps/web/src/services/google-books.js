const metadataCache = new Map();
const STORAGE_PREFIX = "biblioteca-google-books-v1:";

export async function enrichBooksWithGoogleBooks(books) {
  return Promise.all(books.map((book) => enrichBook(book)));
}

export function resolveBookCoverSource(book) {
  const coverUrl = typeof book?.coverUrl === "string" ? book.coverUrl.trim() : "";

  if (!coverUrl) {
    return createPlaceholderCover(book);
  }

  const normalizedCoverUrl = normalizeRenderableCoverUrl(coverUrl);

  if (isRenderableCoverUrl(normalizedCoverUrl)) {
    return normalizedCoverUrl;
  }

  return createPlaceholderCover(book);
}

async function enrichBook(book) {
  const cacheKey = buildCacheKey(book);
  const cached = readCache(cacheKey);

  if (cached) {
    return mergeBookWithMetadata(book, cached);
  }

  try {
    const query = buildQuery(book);
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&printType=books`
    );

    if (!response.ok) {
      throw new Error(`Google Books respondeu ${response.status}`);
    }

    const payload = await response.json();
    const item = payload?.items?.[0]?.volumeInfo ?? null;
    const metadata = item
      ? {
          coverUrl: normalizeCover(item.imageLinks?.thumbnail ?? item.imageLinks?.smallThumbnail),
          description: item.description ?? "",
          categories: Array.isArray(item.categories) ? item.categories : [],
          rating:
            typeof item.averageRating === "number"
              ? item.averageRating
              : buildMockRating(book)
        }
      : buildFallbackMetadata(book);

    writeCache(cacheKey, metadata);
    return mergeBookWithMetadata(book, metadata);
  } catch (error) {
    const fallback = buildFallbackMetadata(book);
    writeCache(cacheKey, fallback);
    return mergeBookWithMetadata(book, fallback);
  }
}

function mergeBookWithMetadata(book, metadata) {
  const categories =
    metadata.categories?.length > 0
      ? metadata.categories
      : book.category
        ? [book.category]
        : [];

  return {
    ...book,
    coverUrl: metadata.coverUrl,
    description:
      metadata.description ||
      `Leitura indicada para ${book.category?.toLowerCase?.() ?? "o acervo interno"}, com foco em ${translateLevel(book.level)}.`,
    categories,
    category: categories[0] ?? book.category ?? "",
    rating: metadata.rating ?? buildMockRating(book),
    isPlaceholderCover: metadata.isPlaceholderCover ?? false
  };
}

function buildQuery(book) {
  return `intitle:${book.title} inauthor:${book.author}`;
}

function normalizeCover(value) {
  if (!value) {
    return "";
  }

  return normalizeRenderableCoverUrl(value).replace("&edge=curl", "");
}

function normalizeRenderableCoverUrl(value) {
  const url = String(value).trim();

  if (!url) {
    return "";
  }

  if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) {
    return url;
  }

  return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
}

function isRenderableCoverUrl(coverUrl) {
  if (!coverUrl) {
    return false;
  }

  return (
    coverUrl.startsWith("data:image/") ||
    coverUrl.startsWith("blob:") ||
    coverUrl.startsWith("/") ||
    coverUrl.startsWith("./") ||
    coverUrl.startsWith("../") ||
    coverUrl.startsWith("https://") ||
    coverUrl.startsWith("http://localhost") ||
    coverUrl.startsWith("http://127.0.0.1")
  );
}

function buildFallbackMetadata(book) {
  return {
    coverUrl: createPlaceholderCover(book),
    description: "",
    categories: book.category ? [book.category] : [],
    rating: buildMockRating(book),
    isPlaceholderCover: true
  };
}

function buildMockRating(book) {
  const seed = `${book.title}:${book.author}:${book.level}`;
  let sum = 0;

  for (const char of seed) {
    sum += char.charCodeAt(0);
  }

  const rating = 3.6 + (sum % 15) / 10;

  return Number(Math.min(4.9, rating).toFixed(1));
}

function buildCacheKey(book) {
  return `${book.title}::${book.author}`.toLowerCase();
}

function readCache(cacheKey) {
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}${cacheKey}`);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    metadataCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    return null;
  }
}

function writeCache(cacheKey, value) {
  metadataCache.set(cacheKey, value);

  try {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${cacheKey}`, JSON.stringify(value));
  } catch (error) {
    // Ignore localStorage write failures and keep the in-memory cache.
  }
}

export function createPlaceholderCover(book) {
  const palette = getPalette(book.level, book.isPremium);
  const title = escapeXml(book.title);
  const author = escapeXml(book.author);
  const category = escapeXml(book.category ?? "Biblioteca");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="360" height="520" rx="28" fill="url(#bg)" />
      <circle cx="290" cy="90" r="88" fill="${palette.glow}" opacity="0.25" />
      <rect x="24" y="24" width="312" height="472" rx="22" fill="none" stroke="rgba(255,255,255,0.28)" />
      <text x="34" y="84" fill="rgba(255,255,255,0.86)" font-size="20" font-family="Arial, sans-serif">${category}</text>
      <text x="34" y="248" fill="#ffffff" font-size="42" font-family="Georgia, serif" font-weight="700">${title}</text>
      <text x="34" y="468" fill="rgba(255,255,255,0.88)" font-size="22" font-family="Arial, sans-serif">${author}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getPalette(level, isPremium) {
  if (isPremium) {
    return {
      start: "#1d5d86",
      end: "#0693e3",
      glow: "#ccecff"
    };
  }

  switch (level) {
    case "easy":
      return {
        start: "#59b4ea",
        end: "#0693e3",
        glow: "#ffffff"
      };
    case "medium":
      return {
        start: "#1f557a",
        end: "#1488cf",
        glow: "#d7f0ff"
      };
    case "hard":
      return {
        start: "#193a51",
        end: "#0d6ea9",
        glow: "#c8ecff"
      };
    default:
      return {
        start: "#59b4ea",
        end: "#0693e3",
        glow: "#ffffff"
      };
  }
}

function translateLevel(level) {
  switch (level) {
    case "easy":
      return "leituras mais introdutorias";
    case "medium":
      return "leituras de aprofundamento";
    case "hard":
      return "leituras avancadas";
    default:
      return "leituras internas";
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
