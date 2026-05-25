import React from "react";
import htm from "htm";
import { NavLink, useLocation } from "react-router-dom";
import { BrandImage } from "./BrandImage.js";

const html = htm.bind(React.createElement);

const MAIN_NAV = [
  { label: "Livros", to: "/livros", icon: "books" },
  { label: "Minha Conta", to: "/minha-conta", icon: "users" },
  { label: "Usuários", to: "/usuarios", icon: "users" },
  { label: "Desempenho", to: "/desempenho", icon: "chart" },
  { label: "Relatórios", to: "/relatorios", icon: "report" }
];

const ADMIN_NAV = [
  { label: "Livros", to: "/admin/books", icon: "books" },
  { label: "Solicitações", to: "/admin/loans", icon: "requests" },
  { label: "Usuários", to: "/admin/users", icon: "users" },
  { label: "Regras", to: "/admin/rules", icon: "shield" },
  { label: "Gamificação", to: "/admin/gamification", icon: "trophy" },
  { label: "Monitoramento", to: "/admin/monitoring", icon: "monitor" },
  { label: "Personalização", to: "/admin/settings", icon: "settings" }
];

export function Sidebar({ currentUser, isAuthenticated, branding = null }) {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");
  const isAdminUser = currentUser?.role === "admin";
  const logoSrc = branding?.logoCompactSrc ?? branding?.logoSrc ?? "/storage/branding/icon-vertical-gold.png";
  const systemName = branding?.systemName ?? "Lumiar Flow";
  const slogan = branding?.slogan ?? "Conhecimento em movimento.";
  const visibleMainNav = isAuthenticated
    ? MAIN_NAV.filter((item) =>
        ["/usuarios", "/desempenho", "/relatorios"].includes(item.to) ? isAdminUser : true
      )
    : MAIN_NAV.filter((item) => item.to === "/livros");

  return html`
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <${BrandImage}
          className="sidebar-logo"
          src=${logoSrc}
          fallbackSrc=${branding?.logoFallbackSrc ?? branding?.logoPrimarySrc ?? logoSrc}
          alt=${systemName}
        />
        <div className="sidebar-brand-copy">
          <strong>${systemName}</strong>
          <span>${slogan}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-group">
          <span className="sidebar-group-title">Navegação</span>
          ${visibleMainNav.map((item) => renderNavItem(item))}
        </div>

        ${isAuthenticated && isAdminUser
          ? html`
              <div className="sidebar-group">
                <${NavLink}
                  to="/admin/books"
                  className=${`sidebar-link sidebar-parent-link ${isAdminArea ? "active" : ""}`}
                >
                  <span className="sidebar-link-icon">
                    <${SidebarIcon} name="settings" />
                  </span>
                  <span>Configurações</span>
                </${NavLink}>

                ${isAdminArea
                  ? html`
                      <div className="sidebar-subnav">
                        ${ADMIN_NAV.map((item) => renderNavItem(item, true))}
                      </div>
                    `
                  : null}
              </div>
            `
          : null}
      </nav>

      ${isAuthenticated
        ? html`
            <div className="sidebar-footer">
              <div className="sidebar-level-card">
                <span className="sidebar-level-label">Seu nível atual</span>
                <strong>OURO</strong>
                <div className="sidebar-level-row">
                  <span>Pontos</span>
                  <strong>2.350</strong>
                </div>
                <div className="sidebar-level-row">
                  <span>Próximo nível</span>
                  <strong>Diamante</strong>
                </div>
                <div className="sidebar-progress">
                  <span className="sidebar-progress-fill" style=${{ width: "68%" }}></span>
                </div>
                <small>650 pts para subir</small>
              </div>

              <div className="sidebar-levels">
                <span className="level-badge bronze">Bronze</span>
                <span className="level-badge silver">Prata</span>
                <span className="level-badge gold">Ouro</span>
              </div>
            </div>
          `
        : null}
    </aside>
  `;
}

function renderNavItem(item, nested = false) {
  return html`
    <${NavLink}
      key=${item.to}
      to=${item.to}
      className=${({ isActive }) =>
        `sidebar-link ${nested ? "sidebar-sub-link" : ""} ${isActive ? "active" : ""}`}
    >
      <span className="sidebar-link-icon">
        <${SidebarIcon} name=${item.icon} />
      </span>
      <span>${item.label}</span>
    <//>
  `;
}

function SidebarIcon({ name }) {
  const common = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "books":
      return html`<svg ...${common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>`;
    case "users":
      return html`<svg ...${common}><path d="M20 21a8 8 0 1 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>`;
    case "chart":
      return html`<svg ...${common}><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>`;
    case "report":
      return html`<svg ...${common}><path d="M8 3h8l5 5v13H3V3h5Z" /><path d="M8 3v5h5" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>`;
    case "requests":
      return html`<svg ...${common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8" /><path d="M8 12h8" /><path d="M8 17h5" /></svg>`;
    case "shield":
      return html`<svg ...${common}><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4Z" /><path d="m9.5 12 1.7 1.7L14.8 10" /></svg>`;
    case "trophy":
      return html`<svg ...${common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H5a2 2 0 0 0 0 4h2" /><path d="M17 6h2a2 2 0 0 1 0 4h-2" /></svg>`;
    case "monitor":
      return html`<svg ...${common}><path d="M4 5h16v10H4z" /><path d="M8 19h8" /><path d="M12 15v4" /></svg>`;
    case "settings":
    default:
      return html`<svg ...${common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></svg>`;
  }
}
