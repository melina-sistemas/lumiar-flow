const DEFAULT_SLOGAN = "Conhecimento em movimento.";
const DEFAULT_THEME_MODE = "auto";
const DEFAULT_STORAGE_ROOT = "/storage/branding";
const DEFAULT_FAVICON_SRC = `${DEFAULT_STORAGE_ROOT}/icon-circle-dark.png`;

function assetPath(fileName) {
  return `${DEFAULT_STORAGE_ROOT}/${fileName}`;
}

function normalizeImageSrc(value, fallback) {
  const src = String(value ?? "").trim();

  if (!src) {
    return fallback;
  }

  if (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/")
  ) {
    return src;
  }

  return fallback;
}

export const BRAND_LOGO_PRESETS = [
  {
    id: "logo-lumiar",
    label: "Logo principal",
    description: "Versão completa para topo, autenticação e áreas de destaque.",
    src: assetPath("logo-lumiar.png"),
    alt: "Lumiar Flow - logo principal"
  },
  {
    id: "logo-negative",
    label: "Logo negativa",
    description: "Versão clara para fundos escuros e blocos de contraste.",
    src: assetPath("logo-negative.png"),
    alt: "Lumiar Flow - logo negativa"
  }
];

export const BRAND_ICON_PRESETS = [
  {
    id: "icon-circle-dark",
    label: "Ícone circular escuro",
    description: "Bom para favicon, avatar e menu lateral.",
    src: assetPath("icon-circle-dark.png"),
    alt: "Lumiar Flow - ícone circular escuro"
  },
  {
    id: "icon-vertical-gold",
    label: "Ícone vertical dourado",
    description: "Versão reduzida com presença mais premium.",
    src: assetPath("icon-vertical-gold.png"),
    alt: "Lumiar Flow - ícone vertical dourado"
  }
];

export const BRAND_FAVICON_PRESETS = [
  {
    id: "favicon-circle-dark",
    label: "Favicon escuro",
    description: "Ícone limpo para aba do navegador.",
    src: assetPath("icon-circle-dark.png"),
    alt: "Lumiar Flow - favicon escuro"
  },
  {
    id: "favicon-gold",
    label: "Favicon dourado",
    description: "Versão quente para destacar a marca.",
    src: assetPath("icon-vertical-gold.png"),
    alt: "Lumiar Flow - favicon dourado"
  },
  {
    id: "favicon-svg",
    label: "Favicon vetorial",
    description: "Versão SVG atual do sistema.",
    src: DEFAULT_FAVICON_SRC,
    alt: "Lumiar Flow - favicon vetorial"
  }
];

export const BRAND_BACKGROUND_PRESETS = [
  {
    id: "midnight",
    label: "Noite",
    description: "Fundo profundo com brilho dourado e contraste forte.",
    previewClass: "brand-background-preview brand-background-midnight",
    appShell: "radial-gradient(circle at top right, rgba(6, 147, 227, 0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #e9eef5 100%)",
    authAside:
      "radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 34%), linear-gradient(145deg, #0a1c34 0%, #0f2746 45%, #132f57 100%)"
  },
  {
    id: "gold-field",
    label: "Campo dourado",
    description: "Fundo quente inspirado nas versões com dourado.",
    previewClass: "brand-background-preview brand-background-gold",
    appShell:
      "radial-gradient(circle at top right, rgba(248, 195, 58, 0.22), transparent 28%), linear-gradient(180deg, #fffaf0 0%, #f3ead7 100%)",
    authAside:
      "radial-gradient(circle at top left, rgba(255, 255, 255, 0.22), transparent 32%), linear-gradient(145deg, #f1b812 0%, #f8c33a 52%, #fbd45b 100%)"
  },
  {
    id: "paper",
    label: "Papel",
    description: "Clareza editorial para telas de leitura e cadastro.",
    previewClass: "brand-background-preview brand-background-paper",
    appShell:
      "radial-gradient(circle at top right, rgba(6, 147, 227, 0.06), transparent 28%), linear-gradient(180deg, #ffffff 0%, #f5f1ea 100%)",
    authAside:
      "radial-gradient(circle at top left, rgba(255, 255, 255, 0.32), transparent 30%), linear-gradient(145deg, #f7f2e8 0%, #fbfaf6 100%)"
  },
  {
    id: "storm",
    label: "Tempestade",
    description: "Atmosfera cinematográfica com leitura elegante.",
    previewClass: "brand-background-preview brand-background-storm",
    appShell:
      "radial-gradient(circle at top right, rgba(255, 255, 255, 0.08), transparent 24%), linear-gradient(180deg, #f7f7f8 0%, #dfe4ea 100%)",
    authAside:
      "radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 32%), linear-gradient(145deg, #132238 0%, #20354f 52%, #35506f 100%)"
  }
];

export const BRAND_PALETTE_PRESETS = [
  {
    id: "navy-gold",
    label: "Marinho + ouro",
    description: "A identidade atual de Lumiar Flow.",
    settings: {
      primaryColor: "#0693e3",
      primaryDarkColor: "#0479bc",
      secondaryColor: "#93c5fd",
      accentColor: "#f8c33a",
      backgroundColor: "#eef2f8",
      surfaceColor: "#f7fbff",
      cardColor: "#ffffff",
      textColor: "#15212b",
      textSoftColor: "#31414f",
      mutedColor: "#7b8791",
      sidebarColor: "#0f172a",
      sidebarTextColor: "#ffffff",
      sidebarBorderColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(6, 147, 227, 0.12)",
      headerGradient: "linear-gradient(90deg, #0b74cf 0%, #0693e3 100%)",
      appShellGradient:
        "radial-gradient(circle at top right, rgba(6, 147, 227, 0.08), transparent 26%), linear-gradient(180deg, #f7fbff 0%, rgb(238, 238, 238) 100%)",
      authAsideGradient:
        "radial-gradient(circle at top left, rgba(255, 255, 255, 0.28), transparent 34%), linear-gradient(145deg, #0d82d6 0%, #0693e3 55%, #39a9f1 100%)"
    },
    swatches: ["#0693e3", "#f8c33a", "#f7fbff", "#15212b", "#e6e6e6"]
  },
  {
    id: "midnight-sand",
    label: "Noite + areia",
    description: "Mais contraste e sofisticação para telas administrativas.",
    settings: {
      primaryColor: "#1f3b63",
      primaryDarkColor: "#10233d",
      secondaryColor: "#f3d18b",
      accentColor: "#d19a2f",
      backgroundColor: "#f1eadf",
      surfaceColor: "#fffdf8",
      cardColor: "#ffffff",
      textColor: "#18212c",
      textSoftColor: "#455165",
      mutedColor: "#6f7883",
      sidebarColor: "#0b1626",
      sidebarTextColor: "#ffffff",
      sidebarBorderColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(31, 59, 99, 0.12)",
      headerGradient: "linear-gradient(90deg, #0b1626 0%, #1f3b63 100%)",
      appShellGradient:
        "radial-gradient(circle at top right, rgba(31, 59, 99, 0.08), transparent 26%), linear-gradient(180deg, #fffdfa 0%, #f1eadf 100%)",
      authAsideGradient:
        "radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%), linear-gradient(145deg, #0b1626 0%, #1f3b63 55%, #4d6f98 100%)"
    },
    swatches: ["#1f3b63", "#d19a2f", "#fffdf8", "#18212c", "#f1eadf"]
  },
  {
    id: "paper-ink",
    label: "Papel + tinta",
    description: "Visual editorial, leve e muito legível.",
    settings: {
      primaryColor: "#374151",
      primaryDarkColor: "#1f2937",
      secondaryColor: "#f59e0b",
      accentColor: "#f4b942",
      backgroundColor: "#f8f4ec",
      surfaceColor: "#ffffff",
      cardColor: "#ffffff",
      textColor: "#1f2937",
      textSoftColor: "#4b5563",
      mutedColor: "#6b7280",
      sidebarColor: "#1f2937",
      sidebarTextColor: "#ffffff",
      sidebarBorderColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(31, 41, 55, 0.1)",
      headerGradient: "linear-gradient(90deg, #1f2937 0%, #374151 100%)",
      appShellGradient:
        "radial-gradient(circle at top right, rgba(244, 185, 66, 0.08), transparent 28%), linear-gradient(180deg, #ffffff 0%, #f8f4ec 100%)",
      authAsideGradient:
        "radial-gradient(circle at top left, rgba(255, 255, 255, 0.2), transparent 34%), linear-gradient(145deg, #374151 0%, #1f2937 58%, #111827 100%)"
    },
    swatches: ["#374151", "#f4b942", "#ffffff", "#1f2937", "#f8f4ec"]
  }
];

export const BRAND_LAYOUT_PRESETS = [
  {
    id: "balanced",
    label: "Equilibrado",
    description: "Padrão com respiro suficiente para leitura e operação."
  },
  {
    id: "compact",
    label: "Compacto",
    description: "Mais densidade visual, melhor para painéis com muita informação."
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Mais espaço e presença para telas de marca e leitura."
  }
];

export const BRAND_THEME_PRESETS = [
  {
    id: "light",
    label: "Light",
    description: "Mais claro e legível para rotinas de operação."
  },
  {
    id: "dark",
    label: "Dark",
    description: "Mais contraste para a noite e ambientes com pouca luz."
  },
  {
    id: "auto",
    label: "Automático",
    description: "Segue a preferência do sistema operacional."
  }
];

export const DEFAULT_BRAND_SETTINGS = {
  systemName: "Lumiar Flow",
  slogan: DEFAULT_SLOGAN,
  themeMode: DEFAULT_THEME_MODE,
  logoVariant: "logo-lumiar",
  logoPrimarySrc: assetPath("logo-lumiar.png"),
  logoCompactSrc: assetPath("icon-vertical-gold.png"),
  iconVariant: "icon-circle-dark",
  mobileIconSrc: assetPath("icon-circle-dark.png"),
  faviconVariant: "favicon-circle-dark",
  faviconSrc: DEFAULT_FAVICON_SRC,
  backgroundVariant: "midnight",
  dashboardBackgroundSrc: assetPath("fundos.png"),
  loginBannerSrc: assetPath("logo-negative.png"),
  paletteVariant: "navy-gold",
  layoutVariant: "balanced",
  ...BRAND_PALETTE_PRESETS[0].settings
};

export function resolveThemeMode(mode = DEFAULT_THEME_MODE, prefersDark = false) {
  const normalized = String(mode ?? DEFAULT_THEME_MODE).trim().toLowerCase();

  if (normalized === "dark") {
    return "dark";
  }

  if (normalized === "light") {
    return "light";
  }

  return prefersDark ? "dark" : "light";
}

export function resolveBrandAppearance(settings = {}) {
  const palette =
    BRAND_PALETTE_PRESETS.find((item) => item.id === settings.paletteVariant) ??
    BRAND_PALETTE_PRESETS[0];
  const logo =
    BRAND_LOGO_PRESETS.find((item) => item.id === settings.logoVariant) ?? BRAND_LOGO_PRESETS[0];
  const icon =
    BRAND_ICON_PRESETS.find((item) => item.id === settings.iconVariant) ?? BRAND_ICON_PRESETS[0];
  const favicon =
    BRAND_FAVICON_PRESETS.find((item) => item.id === settings.faviconVariant) ??
    BRAND_FAVICON_PRESETS[0];
  const background =
    BRAND_BACKGROUND_PRESETS.find((item) => item.id === settings.backgroundVariant) ??
    BRAND_BACKGROUND_PRESETS[0];
  const layout =
    BRAND_LAYOUT_PRESETS.find((item) => item.id === settings.layoutVariant) ??
    BRAND_LAYOUT_PRESETS[0];
  const theme =
    BRAND_THEME_PRESETS.find((item) => item.id === settings.themeMode) ?? BRAND_THEME_PRESETS[2];

  const mergedPalette = {
    ...palette.settings,
    primaryColor: settings.primaryColor ?? palette.settings.primaryColor,
    primaryDarkColor: settings.primaryDarkColor ?? palette.settings.primaryDarkColor,
    secondaryColor: settings.secondaryColor ?? palette.settings.secondaryColor,
    accentColor: settings.accentColor ?? palette.settings.accentColor,
    backgroundColor: settings.backgroundColor ?? palette.settings.backgroundColor,
    surfaceColor: settings.surfaceColor ?? palette.settings.surfaceColor,
    cardColor: settings.cardColor ?? palette.settings.cardColor,
    textColor: settings.textColor ?? palette.settings.textColor,
    textSoftColor: settings.textSoftColor ?? palette.settings.textSoftColor,
    mutedColor: settings.mutedColor ?? palette.settings.mutedColor,
    sidebarColor: settings.sidebarColor ?? palette.settings.sidebarColor,
    sidebarTextColor: settings.sidebarTextColor ?? palette.settings.sidebarTextColor,
    sidebarBorderColor: settings.sidebarBorderColor ?? palette.settings.sidebarBorderColor,
    borderColor: settings.borderColor ?? palette.settings.borderColor,
    headerGradient: settings.headerGradient ?? palette.settings.headerGradient,
    appShellGradient: settings.appShellGradient ?? palette.settings.appShellGradient,
    authAsideGradient: settings.authAsideGradient ?? palette.settings.authAsideGradient
  };

  const logoPrimarySrc = normalizeImageSrc(
    settings.logoPrimarySrc,
    logo.src
  );
  const logoCompactSrc = normalizeImageSrc(
    settings.logoCompactSrc,
    icon.src
  );
  const faviconSrc = normalizeImageSrc(settings.faviconSrc, favicon.src);
  const mobileIconSrc = normalizeImageSrc(settings.mobileIconSrc, icon.src);
  const loginBannerSrc = normalizeImageSrc(settings.loginBannerSrc, logoPrimarySrc);
  const dashboardBackgroundSrc = normalizeImageSrc(
    settings.dashboardBackgroundSrc,
    assetPath("fundos.png")
  );

  return {
    systemName: String(settings.systemName ?? DEFAULT_BRAND_SETTINGS.systemName),
    slogan: String(settings.slogan ?? DEFAULT_BRAND_SETTINGS.slogan),
    themeMode: theme.id,
    themeLabel: theme.label,
    themeDescription: theme.description,
    logoVariant: logo.id,
    logoSrc: logoPrimarySrc,
    logoFallbackSrc: logo.src,
    logoPrimarySrc,
    logoCompactSrc,
    logoAlt: logo.alt,
    iconVariant: icon.id,
    iconSrc: mobileIconSrc,
    iconFallbackSrc: icon.src,
    mobileIconSrc,
    iconAlt: icon.alt,
    faviconVariant: favicon.id,
    faviconSrc,
    faviconFallbackSrc: favicon.src,
    faviconAlt: favicon.alt,
    backgroundVariant: background.id,
    backgroundPreviewClass: background.previewClass,
    backgroundLabel: background.label,
    backgroundDescription: background.description,
    loginBannerSrc,
    dashboardBackgroundSrc,
    loginBannerFallbackSrc: logo.src,
    dashboardBackgroundFallbackSrc: assetPath("fundos.png"),
    backgroundStyle: {
      appShell: background.appShell,
      authAside: background.authAside
    },
    paletteVariant: palette.id,
    paletteLabel: palette.label,
    paletteDescription: palette.description,
    paletteSwatches: palette.swatches,
    layoutVariant: layout.id,
    layoutLabel: layout.label,
    layoutDescription: layout.description,
    colors: mergedPalette,
    cssVars: {
      "--primary": mergedPalette.primaryColor,
      "--primary-dark": mergedPalette.primaryDarkColor,
      "--secondary": mergedPalette.secondaryColor,
      "--background": mergedPalette.backgroundColor,
      "--surface": mergedPalette.surfaceColor,
      "--card": mergedPalette.cardColor,
      "--text": mergedPalette.textColor,
      "--text-soft": mergedPalette.textSoftColor,
      "--muted": mergedPalette.mutedColor,
      "--sidebar": mergedPalette.sidebarColor,
      "--sidebar-text": mergedPalette.sidebarTextColor,
      "--sidebar-border": mergedPalette.sidebarBorderColor,
      "--border": mergedPalette.borderColor,
      "--app-header-gradient": mergedPalette.headerGradient,
      "--app-shell-gradient": background.appShell ?? mergedPalette.appShellGradient,
      "--auth-aside-gradient": background.authAside ?? mergedPalette.authAsideGradient,
      "--login-banner-image": `url("${loginBannerSrc}")`,
      "--dashboard-background-image": `url("${dashboardBackgroundSrc}")`
    }
  };
}
