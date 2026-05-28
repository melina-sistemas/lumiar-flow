import React, { useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import { BrandImage } from "../../components/BrandImage.js";
import {
  BRAND_PALETTE_PRESETS,
  BRAND_THEME_PRESETS,
  DEFAULT_BRAND_SETTINGS,
  resolveBrandAppearance
} from "../../features/branding/brand-theme.js";

const html = htm.bind(React.createElement);

const SIMPLE_THEME_PRESETS = BRAND_THEME_PRESETS.filter(
  (preset) => preset.id === "light" || preset.id === "dark"
);

const SIMPLE_PALETTE_PRESETS = BRAND_PALETTE_PRESETS.slice(0, 3);

export function AdminSettingsPage({ settings, actions, branding = null }) {
  const [message, setMessage] = useState("");
  const brand = useMemo(() => branding ?? resolveBrandAppearance(settings), [branding, settings]);
  const activeThemeId = settings.themeMode === "dark" ? "dark" : "light";

  function applySettings(patch, feedbackMessage) {
    actions.updateSettings(patch);
    setMessage(feedbackMessage ?? "Aparencia atualizada com sucesso.");
  }

  function applyTheme(themeId, label) {
    applySettings({ themeMode: themeId }, `Tema ${label.toLowerCase()} aplicado.`);
  }

  function applyPalette(preset) {
    applySettings(
      {
        paletteVariant: preset.id,
        ...preset.settings
      },
      `Paleta ${preset.label.toLowerCase()} aplicada.`
    );
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const previewSrc = await readFileAsDataUrl(file);
    actions.updateSettings({
      logoPrimarySrc: previewSrc,
      logoCompactSrc: previewSrc,
      mobileIconSrc: previewSrc,
      logoPrimaryFileName: file.name,
      logoPrimaryUpdatedAt: new Date().toISOString(),
      logoCompactFileName: file.name,
      logoCompactUpdatedAt: new Date().toISOString(),
      mobileIconFileName: file.name,
      mobileIconUpdatedAt: new Date().toISOString()
    });
    setMessage("Logo aplicada em todo o sistema.");
  }

  function restoreLogo() {
    applySettings(
      {
        logoPrimarySrc: DEFAULT_BRAND_SETTINGS.logoPrimarySrc,
        logoCompactSrc: DEFAULT_BRAND_SETTINGS.logoCompactSrc,
        mobileIconSrc: DEFAULT_BRAND_SETTINGS.mobileIconSrc,
        logoVariant: DEFAULT_BRAND_SETTINGS.logoVariant,
        iconVariant: DEFAULT_BRAND_SETTINGS.iconVariant
      },
      "Logo restaurada para o padrao do sistema."
    );
  }

  function resetBranding() {
    applySettings(
      {
        themeMode: "light",
        paletteVariant: DEFAULT_BRAND_SETTINGS.paletteVariant,
        logoPrimarySrc: DEFAULT_BRAND_SETTINGS.logoPrimarySrc,
        logoCompactSrc: DEFAULT_BRAND_SETTINGS.logoCompactSrc,
        mobileIconSrc: DEFAULT_BRAND_SETTINGS.mobileIconSrc,
        logoVariant: DEFAULT_BRAND_SETTINGS.logoVariant,
        iconVariant: DEFAULT_BRAND_SETTINGS.iconVariant,
        primaryColor: DEFAULT_BRAND_SETTINGS.primaryColor,
        primaryDarkColor: DEFAULT_BRAND_SETTINGS.primaryDarkColor,
        secondaryColor: DEFAULT_BRAND_SETTINGS.secondaryColor,
        accentColor: DEFAULT_BRAND_SETTINGS.accentColor,
        backgroundColor: DEFAULT_BRAND_SETTINGS.backgroundColor,
        surfaceColor: DEFAULT_BRAND_SETTINGS.surfaceColor,
        cardColor: DEFAULT_BRAND_SETTINGS.cardColor,
        textColor: DEFAULT_BRAND_SETTINGS.textColor,
        textSoftColor: DEFAULT_BRAND_SETTINGS.textSoftColor,
        mutedColor: DEFAULT_BRAND_SETTINGS.mutedColor,
        sidebarColor: DEFAULT_BRAND_SETTINGS.sidebarColor,
        sidebarTextColor: DEFAULT_BRAND_SETTINGS.sidebarTextColor,
        sidebarBorderColor: DEFAULT_BRAND_SETTINGS.sidebarBorderColor,
        borderColor: DEFAULT_BRAND_SETTINGS.borderColor,
        headerGradient: DEFAULT_BRAND_SETTINGS.headerGradient,
        appShellGradient: DEFAULT_BRAND_SETTINGS.appShellGradient,
        authAsideGradient: DEFAULT_BRAND_SETTINGS.authAsideGradient
      },
      "Configuração restaurada para o padrao."
    );
  }

  const actionsBar = html`
    <div className="branding-action-row">
      <button type="button" className="branding-reset-button" onClick=${resetBranding}>
        Restaurar padrao
      </button>
    </div>
  `;

  const activePalette =
    SIMPLE_PALETTE_PRESETS.find((preset) => preset.id === settings.paletteVariant) ??
    SIMPLE_PALETTE_PRESETS[0];

  return html`
    <${AdminPageLayout}
      title="Personalizacao"
      breadcrumb="Personalizacao"
      description="Defina uma logo padrao para todo o sistema, escolha entre light e dark e ajuste as cores principais."
      actions=${actionsBar}
    >
      <section className="admin-summary-grid branding-summary-grid">
        <article className="admin-summary-card branding-summary-card">
          <span>Tema atual</span>
          <strong>${brand.themeLabel}</strong>
          <small>${brand.themeDescription}</small>
        </article>
        <article className="admin-summary-card branding-summary-card">
          <span>Logo do sistema</span>
          <strong>${isCustomAsset(settings.logoPrimarySrc, DEFAULT_BRAND_SETTINGS.logoPrimarySrc)
            ? "Personalizada"
            : "Padrao"}</strong>
          <small>Uma unica imagem para topo, login, sidebar e atalhos.</small>
        </article>
        <article className="admin-summary-card branding-summary-card">
          <span>Paleta ativa</span>
          <strong>${activePalette.label}</strong>
          <small>${activePalette.description}</small>
        </article>
      </section>

      ${message ? html`<article className="admin-card admin-feedback">${message}</article>` : null}

      <div className="branding-settings-grid">
        <article className="admin-card branding-card branding-logo-shell">
          <div className="admin-card-header">
            <div>
              <h3>Logo do sistema</h3>
              <p className="admin-helper">
                Envie uma unica logo para ser usada em todas as areas do Lumiar Flow.
              </p>
            </div>
            <span className="admin-pill">Global</span>
          </div>

          <div className="branding-live-preview branding-simple-preview" style=${brandStyle(brand)}>
            <${BrandImage}
              className="branding-live-preview-logo"
              src=${brand.logoPrimarySrc}
              fallbackSrc=${DEFAULT_BRAND_SETTINGS.logoPrimarySrc}
              alt=${brand.systemName}
            />
            <div>
              <strong>${brand.systemName}</strong>
              <p>Logo padrao aplicada no topo, autenticação, menu lateral e atalhos.</p>
            </div>
          </div>

          <div className="branding-upload-row branding-logo-actions">
            <input
              type="file"
              accept="image/*"
              onChange=${handleLogoUpload}
            />
            <button type="button" className="branding-reset-button" onClick=${restoreLogo}>
              Restaurar logo padrao
            </button>
          </div>
        </article>

        <article className="admin-card branding-card branding-theme-shell">
          <div className="admin-card-header">
            <div>
              <h3>Tema</h3>
              <p className="admin-helper">Escolha entre light e dark, sem modo automatico.</p>
            </div>
            <span className="admin-pill">Visual</span>
          </div>

          <div className="branding-option-grid branding-theme-grid branding-theme-grid-simple">
            ${SIMPLE_THEME_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card branding-theme-card ${activeThemeId === preset.id ? "active" : ""}`}
                  onClick=${() => applyTheme(preset.id, preset.label)}
                >
                  <strong>${preset.label}</strong>
                  <small>${preset.description}</small>
                </button>
              `
            )}
          </div>
        </article>

        <article className="admin-card branding-card branding-palette-shell">
          <div className="admin-card-header">
            <div>
              <h3>Cores</h3>
              <p className="admin-helper">Selecione uma paleta simples para ajustar a identidade visual.</p>
            </div>
            <span className="admin-pill">Paletas</span>
          </div>

          <div className="branding-option-grid branding-palette-grid branding-palette-grid-simple">
            ${SIMPLE_PALETTE_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card branding-palette-card ${settings.paletteVariant === preset.id ? "active" : ""}`}
                  onClick=${() => applyPalette(preset)}
                >
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                  <div className="branding-swatch-row" aria-hidden="true">
                    ${preset.swatches.map(
                      (color) => html`<span className="branding-swatch" style=${{ background: color }}></span>`
                    )}
                  </div>
                </button>
              `
            )}
          </div>
        </article>
      </div>
    <//>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function isCustomAsset(value, fallback) {
  return String(value ?? "").trim() !== String(fallback ?? "").trim();
}

function brandStyle(brand) {
  const isDarkTheme = brand.themeMode === "dark";

  return {
    background: isDarkTheme
      ? "linear-gradient(180deg, #102033 0%, #0d1727 100%)"
      : `${brand.colors.surfaceColor}`,
    border: `1px solid ${isDarkTheme ? "rgba(148, 163, 184, 0.18)" : brand.colors.borderColor}`,
    color: "inherit",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)"
  };
}
