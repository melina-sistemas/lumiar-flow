import React, { useEffect, useRef, useState } from "react";
import htm from "htm";
import { Link, useLocation } from "react-router-dom";
import { BrandImage } from "./BrandImage.js";

const html = htm.bind(React.createElement);

const ROUTE_COPY = [
  { match: "/admin", title: "Painel administrativo", hint: "Gerencie catálogo, regras e operação." },
  { match: "/livros", title: "Biblioteca", hint: "Escolha o próximo livro para leitura." },
  { match: "/usuarios", title: "Usuários", hint: "Acompanhe perfis, históricos e níveis." },
  { match: "/desempenho", title: "Desempenho", hint: "Veja score, ranking e evolução." },
  { match: "/relatorios", title: "Relatórios", hint: "Analise dados de uso e qualidade." },
  { match: "/entrar", title: "Acesso", hint: "Entre na sua conta Lumiar Flow." },
  { match: "/cadastrar", title: "Cadastro", hint: "Crie um novo acesso." }
];

export function HeaderBar({
  currentUser,
  isAuthenticated,
  branding = null,
  variant = "default",
  notifications = [],
  notificationCount = 0,
  searchValue = "",
  searchPlaceholder = "Buscar livros, usuários ou relatórios",
  searchSuggestions = [],
  searchEmptyText = "Nenhum resultado encontrado.",
  searchEnabled = false,
  onSearchChange = () => {},
  onSearchSuggestionSelect = () => {},
  onNotificationAction = () => {},
  onAuthAction = () => {}
}) {
  const location = useLocation();
  const copy = ROUTE_COPY.find((item) => location.pathname.startsWith(item.match)) ?? ROUTE_COPY[1];
  const initials = getInitials(currentUser?.name || "Admin");
  const logoSrc = branding?.iconSrc ?? branding?.logoSrc ?? "/storage/branding/icon-circle-dark.png";
  const systemName = branding?.systemName ?? "Lumiar Flow";
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const notificationRef = useRef(null);
  const profileRef = useRef(null);
  const shouldShowSearch = searchEnabled;

  useEffect(() => {
    if (!searchEnabled || !String(searchValue || "").trim()) {
      setIsSearchOpen(false);
    }
  }, [searchEnabled, searchValue]);

  useEffect(() => {
    if (!notificationCount) {
      setIsNotificationOpen(false);
    }
  }, [notificationCount]);

  useEffect(() => {
    if (variant === "auth") {
      setIsProfileOpen(false);
    }
  }, [variant]);

  useEffect(() => {
    function handlePointerDown(event) {
      const notificationNode = notificationRef.current;
      const profileNode = profileRef.current;

      if (notificationNode && !notificationNode.contains(event.target)) {
        setIsNotificationOpen(false);
      }

      if (profileNode && !profileNode.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }

    globalThis.addEventListener("pointerdown", handlePointerDown);

    return () => {
      globalThis.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  if (variant === "auth") {
    return html`
      <header className="app-header auth-topbar">
        <${Link} to="/livros" className="auth-topbar-brand">
          <${BrandImage}
            className="auth-topbar-logo"
            src=${logoSrc}
            fallbackSrc=${branding?.logoFallbackSrc ?? branding?.logoPrimarySrc ?? logoSrc}
            alt=${systemName}
          />
          <strong>${systemName}</strong>
        </${Link}>
      </header>
    `;
  }

  return html`
    <header className="app-header">
      ${shouldShowSearch
        ? html`
            <div className="header-search">
              <input
                type="search"
                placeholder=${searchPlaceholder}
                value=${searchValue}
                onInput=${(event) => {
                  onSearchChange(event.target.value);
                  if (searchEnabled) {
                    setIsSearchOpen(true);
                  }
                }}
                onFocus=${() => {
                  if (searchEnabled && searchSuggestions.length > 0) {
                    setIsSearchOpen(true);
                  }
                }}
                onBlur=${() => {
                  globalThis.setTimeout(() => {
                    setIsSearchOpen(false);
                  }, 120);
                }}
              />
              <span className="header-search-shortcut" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </span>

              ${searchEnabled && isSearchOpen
                ? html`
                    <div className="header-search-suggestions">
                      ${searchSuggestions.length > 0
                        ? searchSuggestions.map(
                            (suggestion) => html`
                              <button
                                key=${suggestion.key}
                                type="button"
                                className="header-search-suggestion"
                                onMouseDown=${(event) => event.preventDefault()}
                                onClick=${() => {
                                  onSearchSuggestionSelect(suggestion);
                                  setIsSearchOpen(false);
                                }}
                              >
                                <strong>${suggestion.title}</strong>
                                ${suggestion.subtitle
                                  ? html`<span>${suggestion.subtitle}</span>`
                                  : null}
                              </button>
                            `
                          )
                        : html`
                            <div className="header-search-empty">
                              ${searchEmptyText}
                            </div>
                          `}
                    </div>
                  `
                : null}
            </div>
          `
        : null}

      <div className="header-route-copy">
        <strong>${copy.title}</strong>
        <span>${copy.hint}</span>
      </div>

      <div className="header-right">
        ${isAuthenticated
          ? html`
              <div className="header-auth-tools">
                <div ref=${notificationRef} className="header-notifications">
                  <button
                    type="button"
                    className="header-icon-button"
                    aria-label="Notificações"
                    onClick=${() => setIsNotificationOpen((current) => !current)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
                      <path d="M10 21a2 2 0 0 0 4 0"></path>
                    </svg>
                    ${notificationCount > 0
                      ? html`<span className="header-badge">${notificationCount}</span>`
                      : null}
                  </button>

                  ${isNotificationOpen
                    ? html`
                        <div className="header-notification-popover">
                          <div className="header-notification-head">
                            <strong>Notificações</strong>
                            <span>${notificationCount} novas</span>
                          </div>

                          ${notifications.length > 0
                            ? notifications.slice(0, 5).map(
                                (notification) => html`
                                  <button
                                    key=${notification.id}
                                    type="button"
                                    className="header-notification-item"
                                    onClick=${() => {
                                      onNotificationAction(notification);
                                      setIsNotificationOpen(false);
                                    }}
                                  >
                                    <strong>${notification.title}</strong>
                                    <span>${notification.message}</span>
                                    ${notification.actionLabel
                                      ? html`<small>${notification.actionLabel}</small>`
                                      : null}
                                  </button>
                                `
                              )
                            : html`<div className="header-notification-empty">Nenhuma notificação nova.</div>`}
                        </div>
                      `
                    : null}
                </div>

                <div
                  ref=${profileRef}
                  className=${`header-profile ${isProfileOpen ? "is-open" : ""}`.trim()}
                >
                  <button
                    type="button"
                    className="header-profile-button"
                    aria-label="Usuário"
                    aria-expanded=${isProfileOpen}
                    onClick=${() => setIsProfileOpen((current) => !current)}
                  >
                    <span className="header-profile-avatar">${initials}</span>
                  </button>
                  ${isProfileOpen
                    ? html`
                        <div className="header-profile-popover">
                          <strong>${currentUser?.name || "Admin"}</strong>
                          <span className="header-profile-level">Ouro</span>
                          <button
                            type="button"
                            className="header-profile-action"
                            onClick=${() => {
                              setIsProfileOpen(false);
                              onAuthAction("logout");
                            }}
                          >
                            Sair
                          </button>
                        </div>
                      `
                    : null}
                </div>
              </div>
            `
          : html`
              <div
                ref=${profileRef}
                className=${`header-profile header-profile-guest ${isProfileOpen ? "is-open" : ""}`.trim()}
              >
                <button
                  type="button"
                  className="header-profile-button header-profile-button-guest"
                  aria-label="Acesso"
                  aria-expanded=${isProfileOpen}
                  onClick=${() => setIsProfileOpen((current) => !current)}
                >
                  <span className="header-profile-avatar header-profile-avatar-guest">Entrar</span>
                </button>
                ${isProfileOpen
                  ? html`
                      <div className="header-profile-popover header-profile-popover-guest">
                        <div className="header-profile-guest-copy">
                          <strong>Acesso</strong>
                          <span className="header-profile-level header-profile-level-neutral">
                            Entre ou crie sua conta.
                          </span>
                        </div>
                        <${Link}
                          to="/entrar"
                          className="header-profile-action"
                          onClick=${() => setIsProfileOpen(false)}
                        >
                          Entrar
                        </${Link}>
                        <${Link}
                          to="/cadastrar"
                          className="header-profile-action header-profile-action-secondary"
                          onClick=${() => setIsProfileOpen(false)}
                        >
                          Cadastrar
                        </${Link}>
                      </div>
                    `
                  : null}
              </div>
            `}
      </div>
    </header>
  `;
}

function getInitials(name) {
  return String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
