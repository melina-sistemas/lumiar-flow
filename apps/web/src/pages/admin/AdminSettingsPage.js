import React, { useMemo, useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";
import { BrandImage } from "../../components/BrandImage.js";
import {
  BRAND_BACKGROUND_PRESETS,
  BRAND_FAVICON_PRESETS,
  BRAND_ICON_PRESETS,
  BRAND_LAYOUT_PRESETS,
  BRAND_LOGO_PRESETS,
  BRAND_PALETTE_PRESETS,
  BRAND_THEME_PRESETS,
  DEFAULT_BRAND_SETTINGS,
  resolveBrandAppearance
} from "../../features/branding/brand-theme.js";

const html = htm.bind(React.createElement);

const BRAND_ASSET_FIELDS = [
  {
    key: "logoPrimarySrc",
    label: "Logo principal",
    description: "Usada no topo, autenticação e áreas principais.",
    fallback: DEFAULT_BRAND_SETTINGS.logoPrimarySrc
  },
  {
    key: "logoCompactSrc",
    label: "Logo compacta",
    description: "Versão reduzida para sidebar, cards e mobile.",
    fallback: DEFAULT_BRAND_SETTINGS.logoCompactSrc
  },
  {
    key: "faviconSrc",
    label: "Favicon",
    description: "Aba do navegador e atalhos do sistema.",
    fallback: DEFAULT_BRAND_SETTINGS.faviconSrc
  },
  {
    key: "mobileIconSrc",
    label: "Ícone mobile",
    description: "Usado como ícone de app e marcador compacto.",
    fallback: DEFAULT_BRAND_SETTINGS.mobileIconSrc
  },
  {
    key: "loginBannerSrc",
    label: "Banner do login",
    description: "Imagem de destaque da tela de acesso.",
    fallback: DEFAULT_BRAND_SETTINGS.loginBannerSrc
  },
  {
    key: "dashboardBackgroundSrc",
    label: "Fundo do dashboard",
    description: "Imagem de base para a hero e áreas internas.",
    fallback: DEFAULT_BRAND_SETTINGS.dashboardBackgroundSrc
  }
];

export function AdminSettingsPage({ settings, actions, branding = null }) {
  const [message, setMessage] = useState("");
  const brand = useMemo(() => branding ?? resolveBrandAppearance(settings), [branding, settings]);

  function applySettings(patch, feedbackMessage) {
    actions.updateSettings(patch);
    setMessage(feedbackMessage ?? "Aparencia atualizada com sucesso.");
  }

  function resetBranding() {
    actions.updateSettings(getDefaultBrandingSettings());
    setMessage("Branding restaurado para o padrao do Lumiar Flow.");
  }

  async function handleBrandUpload(field, event, label) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const previewSrc = await readFileAsDataUrl(file);
    actions.updateSettings({
      [field]: previewSrc,
      [`${field}FileName`]: file.name,
      [`${field}UpdatedAt`]: new Date().toISOString()
    });
    setMessage(`${label} carregado com sucesso.`);
  }

  const actionsBar = html`
    <div className="branding-action-row">
      <button
        type="button"
        className="admin-primary"
        onClick=${() => setMessage("Configuracoes visuais salvas no painel local.")}
      >
        Salvar aparencia
      </button>
      <button type="button" className="branding-reset-button" onClick=${resetBranding}>
        Resetar padrao
      </button>
    </div>
  `;

  return html`
    <${AdminPageLayout}
      title="Personalizacao"
      breadcrumb="Personalizacao"
      description="Troque logos, icones, favicons, fundos, cores e tema sem mexer no codigo."
      actions=${actionsBar}
    >
      <section className="admin-summary-grid branding-summary-grid">
        <article className="admin-summary-card branding-summary-card">
          <span>Marca ativa</span>
          <strong>${brand.systemName}</strong>
          <small>${brand.slogan}</small>
        </article>
        <article className="admin-summary-card branding-summary-card">
          <span>Tema</span>
          <strong>${brand.themeLabel}</strong>
          <small>${brand.themeDescription}</small>
        </article>
        <article className="admin-summary-card branding-summary-card">
          <span>Paleta</span>
          <strong>${brand.paletteLabel}</strong>
          <small>${brand.paletteDescription}</small>
        </article>
        <article className="admin-summary-card branding-summary-card">
          <span>Fundo</span>
          <strong>${brand.backgroundLabel}</strong>
          <small>${brand.backgroundDescription}</small>
        </article>
      </section>

      ${message ? html`<article className="admin-card admin-feedback">${message}</article>` : null}

      <div className="admin-grid branding-grid">
        <article className="admin-card branding-card">
          <div className="admin-card-header">
            <div>
              <h3>Assets de marca</h3>
              <p className="admin-helper">
                Envie arquivos para substituir logo, favicon, banner e fundo do sistema.
              </p>
            </div>
            <span className="admin-pill">Upload</span>
          </div>

          <div className="branding-upload-grid">
            ${BRAND_ASSET_FIELDS.map(
              (item) => html`
                <label key=${item.key} className="branding-upload-card">
                  <strong>${item.label}</strong>
                  <p>${item.description}</p>
                  <${BrandImage}
                    className="branding-upload-preview"
                    src=${settings[item.key] || brand[item.key] || item.fallback}
                    fallbackSrc=${item.fallback}
                    alt=${item.label}
                  />
                  <div className="branding-upload-row">
                    <input
                      type="file"
                      accept="image/*"
                      onChange=${(event) => handleBrandUpload(item.key, event, item.label)}
                    />
                    <button
                      type="button"
                      className="branding-reset-button"
                      onClick=${() =>
                        applySettings(
                          { [item.key]: item.fallback },
                          `${item.label} restaurado para o padrao.`
                        )}
                    >
                      Restaurar
                    </button>
                  </div>
                </label>
              `
            )}
          </div>
        </article>

        <article className="admin-card branding-card">
          <div className="admin-card-header">
            <div>
              <h3>Temas e cores</h3>
              <p className="admin-helper">
                Escolha um tema global e ajuste as cores da interface em tempo real.
              </p>
            </div>
            <span className="admin-pill">Visual</span>
          </div>

          <div className="branding-option-grid branding-theme-grid">
            ${BRAND_THEME_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card branding-theme-card ${settings.themeMode === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      { themeMode: preset.id },
                      `Tema aplicado: ${preset.label}.`
                    )}
                >
                  <strong>${preset.label}</strong>
                  <small>${preset.description}</small>
                </button>
              `
            )}
          </div>

          <div className="branding-option-grid branding-logo-grid">
            ${BRAND_LOGO_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card ${settings.logoVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      {
                        logoVariant: preset.id,
                        logoPrimarySrc: preset.src
                      },
                      `Logo principal alterado para ${preset.label}.`
                    )}
                >
                  <div className="branding-option-media branding-logo-media">
                    <${BrandImage} src=${preset.src} fallbackSrc=${preset.src} alt=${preset.alt} />
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>

          <div className="branding-option-grid branding-icon-grid">
            ${BRAND_ICON_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card ${settings.iconVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      {
                        iconVariant: preset.id,
                        mobileIconSrc: preset.src
                      },
                      `Icone mobile alterado para ${preset.label}.`
                    )}
                >
                  <div className="branding-option-media branding-icon-media">
                    <${BrandImage} src=${preset.src} fallbackSrc=${preset.src} alt=${preset.alt} />
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>

          <div className="branding-option-grid branding-icon-grid">
            ${BRAND_FAVICON_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card ${settings.faviconVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      {
                        faviconVariant: preset.id,
                        faviconSrc: preset.src
                      },
                      `Favicon alterado para ${preset.label}.`
                    )}
                >
                  <div className="branding-option-media branding-icon-media">
                    <${BrandImage} src=${preset.src} fallbackSrc=${preset.src} alt=${preset.alt} />
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>
        </article>
      </div>

      <div className="admin-grid branding-grid">
        <article className="admin-card branding-card">
          <div className="admin-card-header">
            <div>
              <h3>Background e previews</h3>
              <p className="admin-helper">
                Escolha fundos prontos e veja o resumo visual da identidade ativa.
              </p>
            </div>
            <span className="admin-pill">Preview</span>
          </div>

          <div className="branding-option-grid branding-background-grid">
            ${BRAND_BACKGROUND_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card ${settings.backgroundVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      {
                        backgroundVariant: preset.id
                      },
                      `Background alterado para ${preset.label}.`
                    )}
                >
                  <div className=${preset.previewClass}>
                    <span className="brand-background-label">${preset.label}</span>
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>

          <div className="branding-live-preview" style=${brandStyle(brand)}>
            <${BrandImage}
              className="branding-live-preview-logo"
              src=${brand.logoPrimarySrc}
              fallbackSrc=${DEFAULT_BRAND_SETTINGS.logoPrimarySrc}
              alt=${brand.systemName}
            />
            <div>
              <strong>${brand.systemName}</strong>
              <p>${brand.slogan}</p>
            </div>
          </div>

          <div className="branding-summary-tags">
            <span>${brand.logoVariant}</span>
            <span>${brand.iconVariant}</span>
            <span>${brand.faviconVariant}</span>
            <span>${brand.backgroundVariant}</span>
            <span>${brand.layoutVariant}</span>
          </div>
        </article>

        <article className="admin-card branding-card">
          <div className="admin-card-header">
            <div>
              <h3>Cores e layout</h3>
              <p className="admin-helper">
                Ajuste a identidade do sistema com foco em contraste e leitura.
              </p>
            </div>
            <span className="admin-pill">Config</span>
          </div>

          <div className="branding-option-grid branding-layout-grid">
            ${BRAND_LAYOUT_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card ${settings.layoutVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      { layoutVariant: preset.id },
                      `Layout alterado para ${preset.label}.`
                    )}
                >
                  <div className=${`branding-layout-preview branding-layout-${preset.id}`}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>

          <div className="branding-option-grid branding-palette-grid">
            ${BRAND_PALETTE_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card branding-palette-card ${settings.paletteVariant === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      {
                        paletteVariant: preset.id,
                        ...preset.settings
                      },
                      `Paleta aplicada: ${preset.label}.`
                    )}
                >
                  <div className="branding-swatch-row">
                    ${preset.swatches.map(
                      (color) => html`
                        <span className="branding-swatch" style=${{ backgroundColor: color }}></span>
                      `
                    )}
                  </div>
                  <strong>${preset.label}</strong>
                  <span>${preset.description}</span>
                </button>
              `
            )}
          </div>

          <form className="admin-form admin-form-grid branding-custom-grid">
            <label>
              <span>Nome do sistema</span>
              <input
                value=${settings.systemName}
                onInput=${(event) => actions.updateSettings({ systemName: event.target.value })}
              />
            </label>

            <label>
              <span>Slogan</span>
              <input
                value=${settings.slogan}
                onInput=${(event) => actions.updateSettings({ slogan: event.target.value })}
              />
            </label>

            <label>
              <span>Cor primaria</span>
              <input
                type="color"
                value=${settings.primaryColor}
                onInput=${(event) => actions.updateSettings({ primaryColor: event.target.value })}
              />
            </label>

            <label>
              <span>Cor secundaria</span>
              <input
                type="color"
                value=${settings.secondaryColor}
                onInput=${(event) => actions.updateSettings({ secondaryColor: event.target.value })}
              />
            </label>

            <label>
              <span>Cor da sidebar</span>
              <input
                type="color"
                value=${settings.sidebarColor}
                onInput=${(event) => actions.updateSettings({ sidebarColor: event.target.value })}
              />
            </label>

            <label>
              <span>Cor dos textos</span>
              <input
                type="color"
                value=${settings.textColor}
                onInput=${(event) => actions.updateSettings({ textColor: event.target.value })}
              />
            </label>

            <label>
              <span>Cor de fundo</span>
              <input
                type="color"
                value=${settings.backgroundColor}
                onInput=${(event) =>
                  actions.updateSettings({ backgroundColor: event.target.value })}
              />
            </label>

            <label>
              <span>Cor de destaque</span>
              <input
                type="color"
                value=${settings.accentColor}
                onInput=${(event) => actions.updateSettings({ accentColor: event.target.value })}
              />
            </label>
          </form>

          <div className="admin-card-header">
            <div>
              <h3>Temas do sistema</h3>
              <p className="admin-helper">
                Light, dark ou automatico para acompanhar o sistema do usuario.
              </p>
            </div>
          </div>

          <div className="branding-option-grid branding-theme-grid">
            ${BRAND_THEME_PRESETS.map(
              (preset) => html`
                <button
                  key=${preset.id}
                  type="button"
                  className=${`branding-option-card branding-theme-card ${settings.themeMode === preset.id ? "active" : ""}`}
                  onClick=${() =>
                    applySettings(
                      { themeMode: preset.id },
                      `Tema aplicado: ${preset.label}.`
                    )}
                >
                  <strong>${preset.label}</strong>
                  <small>${preset.description}</small>
                </button>
              `
            )}
          </div>

          <form className="admin-form admin-form-grid">
            <label>
              <span>Cor escura da identidade</span>
              <input
                type="color"
                value=${settings.primaryDarkColor}
                onInput=${(event) =>
                  actions.updateSettings({ primaryDarkColor: event.target.value })}
              />
            </label>

            <label>
              <span>Superficie dos cards</span>
              <input
                type="color"
                value=${settings.surfaceColor}
                onInput=${(event) => actions.updateSettings({ surfaceColor: event.target.value })}
              />
            </label>

            <label>
              <span>Texto secundario</span>
              <input
                type="color"
                value=${settings.textSoftColor}
                onInput=${(event) =>
                  actions.updateSettings({ textSoftColor: event.target.value })}
              />
            </label>

            <label>
              <span>Bordas</span>
              <input
                type="color"
                value=${settings.borderColor}
                onInput=${(event) => actions.updateSettings({ borderColor: event.target.value })}
              />
            </label>
          </form>
        </article>
      </div>

      <div className="admin-grid branding-grid">
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Limites operacionais</h3>
              <p className="admin-helper">
                Continue ajustando as regras da plataforma em paralelo ao branding.
              </p>
            </div>
          </div>

          <form className="admin-form admin-form-grid">
            <label>
              <span>Limite de emprestimos</span>
              <input
                type="number"
                value=${settings.loanLimit}
                onInput=${(event) =>
                  actions.updateSettings({ loanLimit: Number(event.target.value || 0) })}
              />
            </label>

            <label>
              <span>Tempo maximo global</span>
              <input
                type="number"
                value=${settings.globalMaxDays}
                onInput=${(event) =>
                  actions.updateSettings({
                    globalMaxDays: Number(event.target.value || 0)
                  })}
              />
            </label>

            <label>
              <span>Janela de reserva (horas)</span>
              <input
                type="number"
                value=${settings.reservationWindowHours}
                onInput=${(event) =>
                  actions.updateSettings({
                    reservationWindowHours: Number(event.target.value || 0)
                  })}
              />
            </label>
          </form>
        </article>
      </div>
    <//>
  `;
}

function getDefaultBrandingSettings() {
  return {
    systemName: DEFAULT_BRAND_SETTINGS.systemName,
    slogan: DEFAULT_BRAND_SETTINGS.slogan,
    themeMode: DEFAULT_BRAND_SETTINGS.themeMode,
    logoVariant: DEFAULT_BRAND_SETTINGS.logoVariant,
    logoPrimarySrc: DEFAULT_BRAND_SETTINGS.logoPrimarySrc,
    logoCompactSrc: DEFAULT_BRAND_SETTINGS.logoCompactSrc,
    iconVariant: DEFAULT_BRAND_SETTINGS.iconVariant,
    mobileIconSrc: DEFAULT_BRAND_SETTINGS.mobileIconSrc,
    faviconVariant: DEFAULT_BRAND_SETTINGS.faviconVariant,
    faviconSrc: DEFAULT_BRAND_SETTINGS.faviconSrc,
    backgroundVariant: DEFAULT_BRAND_SETTINGS.backgroundVariant,
    dashboardBackgroundSrc: DEFAULT_BRAND_SETTINGS.dashboardBackgroundSrc,
    loginBannerSrc: DEFAULT_BRAND_SETTINGS.loginBannerSrc,
    paletteVariant: DEFAULT_BRAND_SETTINGS.paletteVariant,
    layoutVariant: DEFAULT_BRAND_SETTINGS.layoutVariant,
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
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function brandStyle(brand) {
  return {
    background: `${brand.colors.surfaceColor}`,
    border: `1px solid ${brand.colors.borderColor}`,
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)"
  };
}
