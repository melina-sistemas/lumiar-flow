import React, { useEffect, useMemo, useState } from "react";
import htm from "htm";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar.js";
import { HeaderBar } from "../components/HeaderBar.js";
import { PageLayout } from "../components/PageLayout.js";
import { AuthPage } from "../features/auth/AuthPage.js";
import { useAdminPanel } from "../features/admin/admin-state.js";
import { enrichBooksWithGoogleBooks } from "../services/google-books.js";
import { createAuthApiClient } from "../services/auth-api.js";
import { createLoanApiClient } from "../services/loan-api.js";
import { BooksPage } from "../pages/BooksPage.js";
import { AccountRequestSentPage } from "../pages/AccountRequestSentPage.js";
import { MyAccountPage } from "../pages/MyAccountPage.js";
import { PerformancePage } from "../pages/PerformancePage.js";
import { ReportsPage } from "../pages/ReportsPage.js";
import { AdminAccessDeniedPage } from "../pages/admin/AdminAccessDeniedPage.js";
import { AdminBooksPage } from "../pages/admin/AdminBooksPage.js";
import { AdminRequestsPage } from "../pages/admin/AdminRequestsPage.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";
import { AdminRulesPage } from "../pages/admin/AdminRulesPage.js";
import { AdminGamificationPage } from "../pages/admin/AdminGamificationPage.js";
import { AdminLoansPage } from "../pages/admin/AdminLoansPage.js";
import { AdminMonitoringPage } from "../pages/admin/AdminMonitoringPage.js";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage.js";
import { createDevelopmentPlanCatalog } from "../data/development-plan-data.js";
import { resolveBrandAppearance, resolveThemeMode } from "../features/branding/brand-theme.js";
import { isLoanActive } from "../features/books/loan-status.js";

const html = htm.bind(React.createElement);

const EMPTY_CATALOG = {
  users: [],
  books: [],
  loans: [],
  returns: []
};
const FALLBACK_CATALOG = normalizeCatalogPayload(createDevelopmentPlanCatalog());
const API_BASE_URL_OVERRIDE_KEY = "lumiar-flow-api-base-url-override";
function normalizeAccessLevel(level) {
  const normalized = String(level ?? "").trim().toLowerCase();

  switch (normalized) {
    case "ouro":
    case "gold":
      return "gold";
    case "prata":
    case "silver":
      return "silver";
    case "bronze":
      return "bronze";
    default:
      return normalized || "bronze";
  }
}

function normalizeAuthUser(user) {
  if (!user) {
    return null;
  }

  const accessStatus = normalizeAccessStatus(user.status ?? user.accessStatus);

  return {
    ...user,
    role: normalizeAuthRole(user.role),
    level: normalizeAccessLevel(user.level),
    status: accessStatus,
    accessStatus
  };
}

function normalizeAuthRole(role) {
  return role === "admin" ? "admin" : "user";
}

function normalizeAccessStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "active") {
    return "approved";
  }

  if (normalized === "aprovado" || normalized === "ativo") {
    return "approved";
  }

  if (
    normalized === "pendente" ||
    normalized === "em aprovação" ||
    normalized === "em aprovacao" ||
    normalized === "aguardando aprovação" ||
    normalized === "aguardando aprovacao"
  ) {
    return "pending";
  }

  if (normalized === "bloqueado") {
    return "blocked";
  }

  if (normalized === "recusado" || normalized === "rejeitado") {
    return "rejected";
  }

  return normalized || "pending";
}

function isApprovedAuthUser(user) {
  return normalizeAccessStatus(user?.status ?? user?.accessStatus) === "approved";
}

function isPendingAuthUser(user) {
  return normalizeAccessStatus(user?.status ?? user?.accessStatus) === "pending";
}

function isRejectedOrBlockedAuthUser(user) {
  const status = normalizeAccessStatus(user?.status ?? user?.accessStatus);
  return status === "rejected" || status === "blocked";
}

export function App() {
  const apiBaseUrl = getApiBaseUrl();
  const authApi = useMemo(() => createAuthApiClient(apiBaseUrl), [apiBaseUrl]);
  const location = useLocation();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const sessionSyncRef = React.useRef(0);
  const isAuthRoute =
    location.pathname === "/entrar" ||
    location.pathname === "/cadastrar" ||
    location.pathname === "/cadastro/aguardando-aprovacao" ||
    location.pathname === "/cadastro/solicitacao-enviada";
  const activeAuthUser = normalizeAuthUser(authUser);
  const adminPanel = useAdminPanel(catalog, activeAuthUser, apiBaseUrl, !loadingCatalog);
  const brandTheme = useMemo(
    () => resolveBrandAppearance(adminPanel.settings),
    [adminPanel.settings]
  );
  const [preferredTheme, setPreferredTheme] = useState(() =>
    getPreferredColorScheme()
  );
  const [validatedBrandAssets, setValidatedBrandAssets] = useState(() => ({
    faviconSrc: brandTheme.faviconSrc,
    loginBannerSrc: brandTheme.loginBannerSrc,
    dashboardBackgroundSrc: brandTheme.dashboardBackgroundSrc
  }));
  const isAuthenticated = Boolean(activeAuthUser);
  const hasApprovedAccess = isAuthenticated && isApprovedAuthUser(activeAuthUser);
  const canUseLibraryAccess = hasApprovedAccess;
  const isBooksRoute = location.pathname.startsWith("/livros");
  const isUsersRoute = location.pathname.startsWith("/usuarios");
  const isReportsRoute = location.pathname.startsWith("/relatorios");
  const showHeaderSearch = isBooksRoute || isUsersRoute || isReportsRoute;
  const displayUsers = adminPanel.users;
  const displayBooks = adminPanel.books;
  const displayLoans = adminPanel.loans;
  const displayWaitlists = adminPanel.waitlists;
  const displayNotifications = adminPanel.notifications;
  const libraryBooks = useMemo(
    () => mergeBooks(catalog.books, displayBooks),
    [catalog.books, displayBooks]
  );
  const libraryLoans = useMemo(
    () => mergeLoans(catalog.loans, displayLoans),
    [catalog.loans, displayLoans]
  );
  const filteredLibraryBooks = useMemo(
    () => (isBooksRoute ? searchBooks(libraryBooks, headerSearchQuery) : libraryBooks),
    [headerSearchQuery, isBooksRoute, libraryBooks]
  );
  const filteredUsers = useMemo(
    () => (isUsersRoute ? searchUsers(displayUsers, headerSearchQuery) : displayUsers),
    [displayUsers, headerSearchQuery, isUsersRoute]
  );
  const reportsSearchData = useMemo(
    () =>
      isReportsRoute
        ? searchReportData(
            {
              users: displayUsers,
              books: displayBooks,
              loans: displayLoans,
              returns: catalog.returns
            },
            headerSearchQuery
          )
        : {
            users: displayUsers,
            books: displayBooks,
            loans: displayLoans,
            returns: catalog.returns
          },
    [catalog.returns, displayBooks, displayLoans, displayUsers, headerSearchQuery, isReportsRoute]
  );
  const headerSearchSuggestions = useMemo(
    () =>
      isBooksRoute
        ? buildBookSearchSuggestions(libraryBooks, headerSearchQuery)
        : isUsersRoute
          ? buildUserSearchSuggestions(displayUsers, headerSearchQuery)
          : isReportsRoute
            ? buildReportSearchSuggestions(
                {
                  users: displayUsers,
                  books: displayBooks,
                  returns: catalog.returns
                },
                headerSearchQuery
              )
          : [],
    [catalog.returns, displayBooks, displayUsers, headerSearchQuery, isBooksRoute, isReportsRoute, isUsersRoute, libraryBooks]
  );
  const matchedSessionUser =
    displayUsers.find((user) => user.id === authUser?.id) ||
    displayUsers.find(
      (user) => user.email && authUser?.email && user.email.toLowerCase() === authUser.email.toLowerCase()
    ) ||
    null;
  const currentSessionUserId = matchedSessionUser?.id || authUser?.id || "";
  const currentReaderId = canUseLibraryAccess
    ? activeAuthUser?.role === "admin"
      ? selectedUserId || currentSessionUserId || displayUsers[0]?.id || ""
      : currentSessionUserId
    : "";
  const currentReader =
    canUseLibraryAccess
      ? displayUsers.find((user) => user.id === currentReaderId) ?? matchedSessionUser ?? activeAuthUser
      : null;
  const currentReaderLoans = canUseLibraryAccess
    ? libraryLoans.filter((loan) => loan.userId === currentReaderId && isLoanActive(loan.status))
    : [];

  const activeLoans = useMemo(
    () => libraryLoans.filter((loan) => isLoanActive(loan.status)),
    [libraryLoans]
  );

  const borrowerId = canUseLibraryAccess ? currentReaderId : "";
  const visibleNotifications = useMemo(() => {
    if (!activeAuthUser || !canUseLibraryAccess) {
      return [];
    }

    return displayNotifications.filter((notification) => notification.userId === activeAuthUser.id);
  }, [activeAuthUser, canUseLibraryAccess, displayNotifications]);
  const unreadNotificationCount = visibleNotifications.filter(
    (notification) => !notification.readAt
  ).length;

  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

    if (!media) {
      return undefined;
    }

    const updateTheme = () => {
      setPreferredTheme(media.matches ? "dark" : "light");
    };

    updateTheme();
    media.addEventListener?.("change", updateTheme);

    return () => {
      media.removeEventListener?.("change", updateTheme);
    };
  }, []);

  const effectiveTheme = resolveThemeMode(
    brandTheme.themeMode,
    preferredTheme === "dark"
  );

  useEffect(() => {
    let cancelled = false;

    async function validateAssets() {
      const [faviconSrc, loginBannerSrc, dashboardBackgroundSrc] = await Promise.all([
        resolveImageWithFallback(brandTheme.faviconSrc, brandTheme.faviconFallbackSrc),
        resolveImageWithFallback(brandTheme.loginBannerSrc, brandTheme.loginBannerFallbackSrc),
        resolveImageWithFallback(
          brandTheme.dashboardBackgroundSrc,
          brandTheme.dashboardBackgroundFallbackSrc
        )
      ]);

      if (!cancelled) {
        setValidatedBrandAssets({
          faviconSrc,
          loginBannerSrc,
          dashboardBackgroundSrc
        });
      }
    }

    validateAssets();

    return () => {
      cancelled = true;
    };
  }, [
    brandTheme.dashboardBackgroundFallbackSrc,
    brandTheme.dashboardBackgroundSrc,
    brandTheme.faviconFallbackSrc,
    brandTheme.faviconSrc,
    brandTheme.loginBannerFallbackSrc,
    brandTheme.loginBannerSrc
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const cssVars = brandTheme.cssVars ?? {};

    for (const [key, value] of Object.entries(cssVars)) {
      if (value) {
        root.style.setProperty(key, String(value));
      }
    }

    body.dataset.brandLayout = brandTheme.layoutVariant;
    body.dataset.brandPalette = brandTheme.paletteVariant;
    body.dataset.brandBackground = brandTheme.backgroundVariant;
    body.dataset.brandTheme = effectiveTheme;
    body.dataset.brandThemeSetting = brandTheme.themeMode;
    body.dataset.brandLogo = brandTheme.logoVariant;
    body.dataset.brandIcon = brandTheme.iconVariant;
    body.dataset.brandFavicon = brandTheme.faviconVariant;

    root.style.colorScheme = effectiveTheme;
    root.style.setProperty(
      "--login-banner-image",
      `url("${validatedBrandAssets.loginBannerSrc}")`
    );
    root.style.setProperty(
      "--dashboard-background-image",
      `url("${validatedBrandAssets.dashboardBackgroundSrc}")`
    );

    const title = `${brandTheme.systemName} - ${brandTheme.slogan}`;
    document.title = title;

    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = validatedBrandAssets.faviconSrc;
  }, [brandTheme, effectiveTheme, validatedBrandAssets]);

  useEffect(() => {
    if (authLoading || loadingCatalog || !authUser) {
      return;
    }

    if (!matchedSessionUser) {
      return;
    }

    const matchedStatus = normalizeAccessStatus(
      matchedSessionUser.status ?? matchedSessionUser.accessStatus
    );

    if (matchedStatus === "rejected" || matchedStatus === "blocked") {
      setAuthUser(null);
      navigate("/entrar", { replace: true });
      return;
    }

    setAuthUser((current) => {
      if (!current) {
        return normalizeAuthUser({
          ...matchedSessionUser,
          status: matchedStatus,
          accessStatus: matchedStatus
        });
      }

      const nextSnapshot = [
        matchedSessionUser.name,
        matchedSessionUser.email,
        matchedSessionUser.role,
        matchedSessionUser.level,
        matchedStatus,
        matchedSessionUser.company,
        matchedSessionUser.department,
        matchedSessionUser.phone,
        matchedSessionUser.birthDate,
        matchedSessionUser.cpf
      ].join("|");
      const currentSnapshot = [
        current.name,
        current.email,
        current.role,
        current.level,
        normalizeAccessStatus(current.status ?? current.accessStatus),
        current.company,
        current.department,
        current.phone,
        current.birthDate,
        current.cpf
      ].join("|");

      if (nextSnapshot === currentSnapshot) {
        return current;
      }

      return normalizeAuthUser({
        ...current,
        ...matchedSessionUser,
        status: matchedStatus,
        accessStatus: matchedStatus
      });
    });

    if (matchedStatus === "pending") {
      if (location.pathname !== "/cadastro/aguardando-aprovacao") {
        navigate("/cadastro/aguardando-aprovacao", { replace: true });
      }
      return;
    }

    if (
      location.pathname === "/entrar" ||
      location.pathname === "/cadastrar" ||
      location.pathname === "/cadastro/aguardando-aprovacao" ||
      location.pathname === "/cadastro/solicitacao-enviada"
    ) {
      navigate("/livros", { replace: true });
    }
  }, [authLoading, authUser, loadingCatalog, location.pathname, matchedSessionUser, navigate]);

  useEffect(() => {
    let ignore = false;

    async function loadCatalog() {
      setLoadingCatalog(true);
      setCatalogError(null);

      try {
        if (!apiBaseUrl) {
          const fallbackCatalog = FALLBACK_CATALOG;

          if (!ignore) {
            setCatalog(fallbackCatalog);
            setCatalogError(null);
            setLoadingCatalog(false);
          }

          const enrichedBooks = await enrichBooksWithGoogleBooks(fallbackCatalog.books);

          if (!ignore) {
            setCatalog((current) => ({
              ...current,
              books: enrichedBooks
            }));
          }

          return;
        }

        const client = createLoanApiClient(apiBaseUrl);
        const data = await client.fetchSeed();
        const nextCatalog = normalizeCatalogPayload(data);

        if (!ignore) {
          setCatalog(nextCatalog);
          setLoadingCatalog(false);
        }

        const enrichedBooks = await enrichBooksWithGoogleBooks(nextCatalog.books);

        if (!ignore) {
          setCatalog((current) => ({
            ...current,
            books: enrichedBooks
          }));
        }
      } catch (error) {
        const fallbackCatalog = FALLBACK_CATALOG;

        if (!ignore) {
          setCatalog(fallbackCatalog);
          setCatalogError(null);
          setLoadingCatalog(false);
        }

        if (!import.meta.env.PROD) {
          console.warn("Falha ao carregar o catalogo remoto; usando catalogo local.", error);
        }

        const enrichedBooks = await enrichBooksWithGoogleBooks(fallbackCatalog.books);

        if (!ignore) {
          setCatalog((current) => ({
            ...current,
            books: enrichedBooks
          }));
        }
      }
    }

    loadCatalog();

    return () => {
      ignore = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let ignore = false;
    const requestId = ++sessionSyncRef.current;

    async function loadSession() {
      setAuthLoading(true);

      try {
        const result = await authApi.me();

        if (ignore) {
          return;
        }

        if (requestId !== sessionSyncRef.current) {
          return;
        }

        setAuthUser(result?.user ? normalizeAuthUser(result.user) : null);
      } catch {
        if (!ignore && requestId === sessionSyncRef.current) {
          setAuthUser(null);
        }
      } finally {
        if (!ignore && requestId === sessionSyncRef.current) {
          setAuthLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      ignore = true;
    };
  }, [authApi]);

  useEffect(() => {
    const stillExists = libraryBooks.some((book) => book.id === selectedBookId);

    if (!stillExists) {
      setSelectedBookId(libraryBooks[0]?.id ?? "");
    }
  }, [libraryBooks, selectedBookId]);

  useEffect(() => {
    if (!canUseLibraryAccess) {
      return;
    }

    if (activeAuthUser?.role !== "admin") {
      if (selectedUserId !== currentSessionUserId) {
        setSelectedUserId(currentSessionUserId);
      }
      return;
    }

    const stillExists = displayUsers.some((user) => user.id === selectedUserId);

    if (!stillExists) {
      setSelectedUserId(currentSessionUserId || displayUsers[0]?.id || "");
    }
  }, [activeAuthUser?.role, canUseLibraryAccess, currentSessionUserId, displayUsers, selectedUserId]);

  async function refreshCatalog(preferredBookId) {
    try {
      if (!apiBaseUrl) {
        const fallbackCatalog = FALLBACK_CATALOG;
        setCatalog(fallbackCatalog);
        setCatalogError(null);

        if (preferredBookId) {
          setSelectedBookId(preferredBookId);
        }

        const enrichedBooks = await enrichBooksWithGoogleBooks(fallbackCatalog.books);

        setCatalog((current) => ({
          ...current,
          books: enrichedBooks
        }));

        return;
      }

      const client = createLoanApiClient(apiBaseUrl);
      const data = await client.fetchSeed();
      const nextCatalog = normalizeCatalogPayload(data);

      setCatalog(nextCatalog);
      setCatalogError(null);

      if (preferredBookId) {
        setSelectedBookId(preferredBookId);
      }

      const enrichedBooks = await enrichBooksWithGoogleBooks(nextCatalog.books);

      setCatalog((current) => ({
        ...current,
        books: enrichedBooks
      }));
    } catch (error) {
      const fallbackCatalog = FALLBACK_CATALOG;
      setCatalog(fallbackCatalog);
      setCatalogError(null);

      const enrichedBooks = await enrichBooksWithGoogleBooks(fallbackCatalog.books);

      setCatalog((current) => ({
        ...current,
        books: enrichedBooks
      }));

      if (!import.meta.env.PROD) {
        console.warn("Falha ao atualizar o catalogo remoto; usando catalogo local.", error);
      }
    }
  }

  const commonBookPageProps = {
    activeLoans,
    borrowerId,
    isAuthenticated,
    loading: loadingCatalog,
    errorMessage: catalogError,
    users: displayUsers,
    selectedBookId,
    onSelectBook: setSelectedBookId,
    loanActions: adminPanel.actions,
    currentReader,
    currentReaderLoans,
    hasApprovedAccess,
    onLoginRequest: () => navigate("/entrar"),
    onAccountRequest: () => navigate("/minha-conta")
  };
  async function handleLogin(credentials) {
    try {
      const result = await authApi.login(credentials);
      const nextUser = normalizeAuthUser(result?.user);

      if (!nextUser) {
        return {
          success: false,
          message: "Nao foi possivel iniciar a sessão."
        };
      }

      sessionSyncRef.current += 1;
      setAuthUser(nextUser);
      setSelectedUserId(nextUser.status === "pending" ? "" : nextUser.id);

      if (nextUser.status === "pending") {
        navigate("/cadastro/aguardando-aprovacao", { replace: true });
        return {
          success: true,
          message: result?.message ?? "Seu cadastro está aguardando aprovação do administrador."
        };
      }

      navigate("/livros", { replace: true });

      return {
        success: true,
        message: result?.message ?? "Login realizado com sucesso."
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Nao foi possivel entrar."
      };
    }
  }

  async function handleLogout() {
    try {
      sessionSyncRef.current += 1;
      await authApi.logout();
    } catch {
      // Ignora falhas de logout local para nao travar a interface.
    }

    setAuthUser(null);
    setSelectedUserId("");
    navigate("/entrar", { replace: true });

    return {
      success: true,
      message: "Voce saiu da sua conta."
    };
  }

  async function handleRegister(payload) {
    const result = await adminPanel.actions.submitRegistrationRequest(payload);

    if (result?.success) {
      const nextUser = normalizeAuthUser(result.user ?? null);

      if (nextUser) {
        sessionSyncRef.current += 1;
        setAuthUser(nextUser);
        setSelectedUserId("");
      }

      navigate("/cadastro/aguardando-aprovacao", { replace: true });
    }

    return result;
  }

  if (authLoading) {
    return html`
      <main className="library-app app-shell">
        <div className="app-main">
          <div className="app-content">
            <div className="admin-card auth-loading-card">
              <strong>Carregando sua sessão...</strong>
              <p className="admin-helper">Estamos validando seu acesso antes de abrir o sistema.</p>
            </div>
          </div>
        </div>
      </main>
    `;
  }

  return html`
    <main className=${`library-app app-shell ${isAuthRoute ? "auth-screen-shell" : ""}`.trim()}>
      ${!isAuthRoute
        ? html`<${Sidebar}
            currentUser=${adminPanel.currentUser}
            isAuthenticated=${isAuthenticated}
            branding=${brandTheme}
          />`
        : null}

      <div className="app-main">
        <${HeaderBar}
          currentUser=${adminPanel.currentUser}
          isAuthenticated=${isAuthenticated}
          branding=${brandTheme}
          variant=${isAuthRoute ? "auth" : "default"}
          notifications=${visibleNotifications}
          notificationCount=${unreadNotificationCount}
          searchValue=${headerSearchQuery}
          searchPlaceholder=${getSearchPlaceholder(location.pathname)}
          searchSuggestions=${headerSearchSuggestions}
          searchEmptyText=${getSearchEmptyText(location.pathname)}
          searchEnabled=${showHeaderSearch}
          onSearchChange=${setHeaderSearchQuery}
          onNotificationAction=${(notification) => {
            if (notification?.actionTarget) {
              navigate(notification.actionTarget);
            }

            if (notification?.bookId) {
              setSelectedBookId(notification.bookId);
            }
          }}
          onSearchSuggestionSelect=${(suggestion) => {
            setHeaderSearchQuery(suggestion.value);
            if (suggestion.bookId) {
              setSelectedBookId(suggestion.bookId);
            }
            if (suggestion.userId) {
              setSelectedUserId(suggestion.userId);
            }
            if (!location.pathname.startsWith("/livros")) {
              if (suggestion.bookId) {
                navigate(isReportsRoute ? "/relatorios" : "/livros");
              } else if (suggestion.userId) {
                navigate(isReportsRoute ? "/relatorios" : "/usuarios");
              } else if (suggestion.reportPath) {
                navigate(suggestion.reportPath);
              }
            }
          }}
          onAuthAction=${(action) => {
            if (action === "logout") {
              handleLogout();
            }
          }}
        />

        <div className=${`app-content ${isAuthRoute ? "auth-screen-content" : ""}`.trim()}>
          <${Routes}>
          <${Route}
            path="/"
            element=${React.createElement(Navigate, { to: "/livros", replace: true })}
          />
          <${Route}
            path="/livros"
            element=${renderReaderPage(activeAuthUser, React.createElement(BooksPage, {
              ...commonBookPageProps,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              title: "Todos os livros",
              subtitle: "Explore todo o catálogo da biblioteca e abra qualquer título para empréstimo.",
              books: filteredLibraryBooks
            }))}
          />
          <${Route}
            path="/livros/todos"
            element=${renderReaderPage(activeAuthUser, React.createElement(BooksPage, {
              ...commonBookPageProps,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              title: "Todos os livros",
              subtitle: "Explore todo o catálogo da biblioteca e abra qualquer título para empréstimo.",
              books: filteredLibraryBooks
            }))}
          />
          <${Route}
            path="/livros/disponiveis"
            element=${renderProtectedPage(
              activeAuthUser,
              React.createElement(BooksPage, {
              ...commonBookPageProps,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              title: "Livros disponíveis",
              subtitle: "Veja apenas os livros que podem ser retirados agora.",
              books: filterBooks(libraryBooks, activeLoans, "available")
            })
          )}
          />
          <${Route}
            path="/livros/emprestados"
            element=${renderProtectedPage(
              activeAuthUser,
              React.createElement(BooksPage, {
              ...commonBookPageProps,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              title: "Livros emprestados",
              subtitle: "Acompanhe os títulos em circulação e o prazo previsto de retorno.",
              books: filterBooks(libraryBooks, activeLoans, "borrowed")
            })
          )}
          />
          <${Route}
            path="/livros/premium"
            element=${renderProtectedPage(
              activeAuthUser,
              React.createElement(BooksPage, {
              ...commonBookPageProps,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              title: "Livros premium",
              subtitle: "Consulte os títulos premium disponíveis para leitores com nível ouro.",
              books: filterBooks(libraryBooks, activeLoans, "premium")
            })
          )}
          />
          <${Route}
            path="/usuarios"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminUsersPage, {
              users: filteredUsers,
              loans: adminPanel.loans,
              books: adminPanel.books,
              returns: catalog.returns,
              waitlists: displayWaitlists,
              notifications: displayNotifications,
              actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/minha-conta"
            element=${renderProtectedPage(
              activeAuthUser,
              React.createElement(MyAccountPage, {
              currentUser: matchedSessionUser ?? authUser,
              books: libraryBooks,
              loans: libraryLoans,
              waitlists: displayWaitlists,
              notifications: visibleNotifications,
              actions: adminPanel.actions
            })
          )}
          />
          <${Route}
            path="/usuarios/ranking"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminUsersPage, {
              users: filteredUsers,
              loans: adminPanel.loans,
              books: adminPanel.books,
              returns: catalog.returns,
              waitlists: displayWaitlists,
              notifications: displayNotifications,
              actions: adminPanel.actions
            })
          )}
          />
          <${Route}
            path="/usuarios/perfil"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminUsersPage, {
              users: filteredUsers,
              loans: adminPanel.loans,
              books: adminPanel.books,
              returns: catalog.returns,
              waitlists: displayWaitlists,
              notifications: displayNotifications,
              actions: adminPanel.actions
            })
          )}
          />
          <${Route}
            path="/usuarios/historico"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminUsersPage, {
              users: filteredUsers,
              loans: adminPanel.loans,
              books: adminPanel.books,
              returns: catalog.returns,
              waitlists: displayWaitlists,
              notifications: displayNotifications,
              actions: adminPanel.actions
            })
          )}
          />
          <${Route}
            path="/desempenho"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(PerformancePage, {
                users: displayUsers,
                books: displayBooks,
                selectedUserId,
                onSelectUser: setSelectedUserId,
                view: "overview"
              })
            )}
          />
          <${Route}
            path="/desempenho/metricas-gerais"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(PerformancePage, {
                users: displayUsers,
                books: displayBooks,
                selectedUserId,
                onSelectUser: setSelectedUserId,
                view: "metrics"
              })
            )}
          />
          <${Route}
            path="/desempenho/evolucao"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(PerformancePage, {
                users: displayUsers,
                books: displayBooks,
                selectedUserId,
                onSelectUser: setSelectedUserId,
                view: "evolution"
              })
            )}
          />
          <${Route}
            path="/relatorios"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(ReportsPage, {
                users: reportsSearchData.users,
                books: reportsSearchData.books,
                loans: reportsSearchData.loans,
                returns: reportsSearchData.returns,
                view: "dashboard"
              })
            )}
          />
          <${Route}
            path="/relatorios/dashboard"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(ReportsPage, {
                users: reportsSearchData.users,
                books: reportsSearchData.books,
                loans: reportsSearchData.loans,
                returns: reportsSearchData.returns,
                view: "dashboard"
              })
            )}
          />
          <${Route}
            path="/relatorios/qualidade-respostas"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(ReportsPage, {
                users: reportsSearchData.users,
                books: reportsSearchData.books,
                loans: reportsSearchData.loans,
                returns: reportsSearchData.returns,
                view: "quality"
              })
            )}
          />
          <${Route}
            path="/entrar"
            element=${isAuthenticated
              ? React.createElement(Navigate, {
                  to: "/livros",
                  replace: true
                })
              : React.createElement(AuthPage, {
                  mode: "login",
                  onLogin: handleLogin,
                  onRegister: handleRegister,
                  onModeChange: (nextMode) =>
                    navigate(nextMode === "login" ? "/entrar" : "/cadastrar"),
                  onClose: () => navigate("/livros"),
                  branding: brandTheme
                })}
          />
          <${Route}
            path="/cadastrar"
            element=${isAuthenticated
              ? React.createElement(Navigate, {
                  to: "/livros",
                  replace: true
                })
              : React.createElement(AuthPage, {
                  mode: "register",
                  onLogin: handleLogin,
                  onRegister: handleRegister,
                  onModeChange: (nextMode) =>
                    navigate(nextMode === "register" ? "/cadastrar" : "/entrar"),
                  onClose: () => navigate("/livros"),
                  branding: brandTheme
                })}
          />
          <${Route}
            path="/cadastro/solicitacao-enviada"
            element=${React.createElement(AccountRequestSentPage)}
          />
          <${Route}
            path="/cadastro/aguardando-aprovacao"
            element=${React.createElement(PendingApprovalPage, { onLogout: handleLogout })}
          />
          <${Route}
            path="/admin"
            element=${React.createElement(Navigate, {
              to: hasApprovedAccess ? "/admin/books" : "/livros",
              replace: true
            })}
          />
          <${Route}
            path="/admin/books"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminBooksPage, {
                books: adminPanel.books,
                users: adminPanel.users,
                loans: adminPanel.loans,
                actions: adminPanel.actions,
                apiBaseUrl
              })
            )}
          />
          <${Route}
            path="/admin/requests"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminRequestsPage, {
                loans: adminPanel.loans,
                books: adminPanel.books,
                users: adminPanel.users,
                actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/admin/users"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminUsersPage, {
                users: adminPanel.users,
                loans: adminPanel.loans,
                books: adminPanel.books,
                actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/admin/rules"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminRulesPage, {
                rules: adminPanel.rules,
                actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/admin/gamification"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminGamificationPage, {
                gamification: adminPanel.gamification,
                actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/admin/loans"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminLoansPage, {
                loans: adminPanel.loans,
                books: adminPanel.books,
                users: adminPanel.users,
                actions: adminPanel.actions
              })
            )}
          />
          <${Route}
            path="/admin/monitoring"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
              React.createElement(AdminMonitoringPage, {
                monitoring: adminPanel.monitoring
              })
            )}
          />
          <${Route}
            path="/admin/settings"
            element=${renderAdminPage(
              activeAuthUser,
              adminPanel,
            React.createElement(AdminSettingsPage, {
              settings: adminPanel.settings,
              actions: adminPanel.actions,
              branding: brandTheme
            })
          )}
          />
          <${Route}
            path="*"
            element=${React.createElement(Navigate, { to: "/livros", replace: true })}
          />
          <//>
        </div>
      </div>
    </main>
  `;
}

export default App;

function getPreferredColorScheme() {
  if (typeof globalThis.matchMedia !== "function") {
    return "light";
  }

  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveImageWithFallback(src, fallbackSrc) {
  const fallback = String(fallbackSrc ?? "").trim();
  const candidate = String(src ?? "").trim();

  if (!candidate) {
    return Promise.resolve(fallback);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(candidate);
    image.onerror = () => resolve(fallback || candidate);
    image.src = candidate;
  });
}

function renderReaderPage(authUser, page) {
  if (!authUser) {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  const status = normalizeAccessStatus(authUser?.status ?? authUser?.accessStatus);

  if (status === "pending") {
    return React.createElement(Navigate, { to: "/cadastro/aguardando-aprovacao", replace: true });
  }

  if (status === "rejected" || status === "blocked") {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  return page;
}

function renderProtectedPage(authUser, page) {
  if (!authUser) {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  const status = normalizeAccessStatus(authUser?.status ?? authUser?.accessStatus);

  if (status === "pending") {
    return React.createElement(Navigate, { to: "/cadastro/aguardando-aprovacao", replace: true });
  }

  if (status === "rejected" || status === "blocked") {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  return page;
}

function renderAdminPage(authUser, adminPanel, page) {
  if (!authUser) {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  if (isRejectedOrBlockedAuthUser(authUser)) {
    return React.createElement(Navigate, { to: "/entrar", replace: true });
  }

  if (isPendingAuthUser(authUser)) {
    return React.createElement(Navigate, { to: "/cadastro/aguardando-aprovacao", replace: true });
  }

  if (!isApprovedAuthUser(authUser) || authUser.role !== "admin") {
    return React.createElement(Navigate, { to: "/livros", replace: true });
  }

  if (adminPanel.currentUser?.role !== "admin" || !adminPanel.isAdmin) {
    return React.createElement(AdminAccessDeniedPage);
  }

  return page;
}

function PendingApprovalPage({ onLogout }) {
  return html`
    <${PageLayout} className="auth-layout">
      <section className="auth-page">
        <div className="auth-shell-simple">
          <div className="auth-card auth-card-minimal auth-pending-card">
            <div className="auth-confirmation">
              <span className="auth-confirmation-icon auth-confirmation-icon-warning">!</span>
              <h1>Seu cadastro está aguardando aprovação do administrador.</h1>
              <p>
                Assim que um admin liberar o acesso, você poderá entrar normalmente e usar a
                plataforma Lumiar Flow.
              </p>
              <button type="button" className="auth-submit" onClick=${onLogout}>
                Voltar para o login
              </button>
            </div>
          </div>
        </div>
      </section>
    <//>
  `;
}

function getApiBaseUrl() {
  const queryOverrideBaseUrl = readApiBaseUrlQueryOverride();
  if (queryOverrideBaseUrl) {
    return queryOverrideBaseUrl;
  }

  const previewBaseUrl = getVercelPreviewApiBaseUrl();
  if (previewBaseUrl) {
    return previewBaseUrl;
  }

  const overrideBaseUrl = readApiBaseUrlStoredOverride();
  if (overrideBaseUrl) {
    return overrideBaseUrl;
  }

  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return "/api";
}

function getVercelPreviewApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const currentUrl = new URL(window.location.href);

    if (currentUrl.protocol === "https:" && currentUrl.hostname.endsWith(".vercel.app")) {
      return "/api";
    }
  } catch {
    return "";
  }

  return "";
}

function readApiBaseUrlQueryOverride() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const url = new URL(window.location.href);
    const queryOverride = String(url.searchParams.get("apiBaseUrl") ?? "").trim();

    if (queryOverride) {
      window.localStorage?.setItem(API_BASE_URL_OVERRIDE_KEY, queryOverride);
      return queryOverride;
    }
  } catch {
    return "";
  }

  return "";
}

function readApiBaseUrlStoredOverride() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return String(window.localStorage?.getItem(API_BASE_URL_OVERRIDE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function normalizeCatalogPayload(data) {
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    books: Array.isArray(data?.books) ? data.books : [],
    loans: Array.isArray(data?.loans) ? data.loans : [],
    returns: Array.isArray(data?.returns) ? data.returns : [],
    adminState: data?.adminState && typeof data.adminState === "object" ? data.adminState : null,
    adminStateUpdatedAt: data?.adminStateUpdatedAt ?? null
  };
}

function mergeBooks(primaryBooks = [], secondaryBooks = []) {
  const merged = new Map();

  for (const book of primaryBooks) {
    const normalized = { ...book };
    merged.set(buildBookMergeKey(normalized), normalized);
  }

  for (const book of secondaryBooks) {
    const normalized = { ...book };
    const key = buildBookMergeKey(normalized);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, normalized);
      continue;
    }

    merged.set(key, mergeBookRecord(existing, normalized));
  }

  return Array.from(merged.values());
}

function mergeBookRecord(baseBook, overrideBook) {
  const merged = { ...baseBook };

  for (const [key, value] of Object.entries(overrideBook ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function mergeLoans(primaryLoans = [], secondaryLoans = []) {
  const merged = new Map();

  for (const loan of primaryLoans) {
    merged.set(String(loan.id ?? buildLoanMergeKey(loan)), { ...loan });
  }

  for (const loan of secondaryLoans) {
    merged.set(String(loan.id ?? buildLoanMergeKey(loan)), { ...loan });
  }

  return Array.from(merged.values());
}

function buildBookMergeKey(book) {
  return String(book.id ?? `${book.title ?? ""}:${book.author ?? ""}`).toLowerCase();
}

function buildLoanMergeKey(loan) {
  return `${loan.userId ?? ""}:${loan.bookId ?? ""}:${loan.status ?? ""}:${loan.requestedAt ?? ""}`.toLowerCase();
}

function getSearchPlaceholder(pathname) {
  if (pathname.startsWith("/admin/books")) {
    return "Buscar livros por título, autor ou categoria";
  }

  if (pathname.startsWith("/livros")) {
    return "Buscar livros por título, autor ou categoria";
  }

  if (pathname.startsWith("/usuarios")) {
    return "Buscar usuários por nome, e-mail ou setor";
  }

  if (pathname.startsWith("/desempenho")) {
    return "Buscar métricas, níveis ou leitores";
  }

  if (pathname.startsWith("/relatorios")) {
    return "Buscar relatórios e indicadores";
  }

  if (pathname.startsWith("/admin")) {
    return "Buscar dados administrativos";
  }

  return "Buscar livros, usuários ou relatórios";
}

function getSearchEmptyText(pathname) {
  if (pathname.startsWith("/admin/books")) {
    return "Nenhum livro parecido encontrado.";
  }

  if (pathname.startsWith("/livros")) {
    return "Nenhum livro parecido encontrado.";
  }

  if (pathname.startsWith("/usuarios")) {
    return "Nenhum usuário parecido encontrado.";
  }

  if (pathname.startsWith("/relatorios")) {
    return "Nenhum dado de relatório parecido encontrado.";
  }

  return "Nenhum resultado encontrado.";
}

function searchBooks(books, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return books;
  }

  return [...books]
    .map((book) => ({
      ...book,
      __score: getBookSearchScore(book, normalizedQuery)
    }))
    .filter((book) => book.__score > 0)
    .sort((left, right) => right.__score - left.__score || left.title.localeCompare(right.title, "pt-BR"))
    .map(({ __score, ...book }) => book);
}

function searchUsers(users, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return users;
  }

  return [...users]
    .map((user) => ({
      ...user,
      __score: getUserSearchScore(user, normalizedQuery)
    }))
    .filter((user) => user.__score > 0)
    .sort((left, right) => right.__score - left.__score || left.name.localeCompare(right.name, "pt-BR"))
    .map(({ __score, ...user }) => user);
}

function buildBookSearchSuggestions(books, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return [];
  }

  return searchBooks(books, query)
    .slice(0, 6)
    .map((book) => ({
      key: `book-${book.id}`,
      value: book.title,
      bookId: book.id,
      title: book.title,
      subtitle: [book.author, book.category].filter(Boolean).join(" • ")
    }));
}

function buildUserSearchSuggestions(users, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return [];
  }

  return searchUsers(users, query)
    .slice(0, 6)
    .map((user) => ({
      key: `user-${user.id}`,
      value: user.name,
      userId: user.id,
      title: user.name,
      subtitle: [user.email, user.department].filter(Boolean).join(" • ")
    }));
}

function searchReportData(data, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return data;
  }

  const directUsers = searchUsers(data.users, query);
  const directBooks = searchBooks(data.books, query);
  const matchingReturns = data.returns.filter((item) => {
    const user = data.users.find((entry) => entry.id === item.userId);
    const book = data.books.find((entry) => entry.id === item.bookId);
    const answersText = normalizeSearch(
      [item.answers?.learning, item.answers?.application, item.answers?.example]
        .filter(Boolean)
        .join(" ")
    );

    return (
      getUserSearchScore(user ?? {}, normalizedQuery) > 0 ||
      getBookSearchScore(book ?? {}, normalizedQuery) > 0 ||
      answersText.includes(normalizedQuery)
    );
  });

  const userIds = new Set(directUsers.map((user) => user.id));
  const bookIds = new Set(directBooks.map((book) => book.id));

  matchingReturns.forEach((item) => {
    userIds.add(item.userId);
    bookIds.add(item.bookId);
  });

  return {
    users: data.users.filter((user) => userIds.has(user.id)),
    books: data.books.filter((book) => bookIds.has(book.id)),
    loans: data.loans.filter((loan) => userIds.has(loan.userId) || bookIds.has(loan.bookId)),
    returns: matchingReturns
  };
}

function buildReportSearchSuggestions(data, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return [];
  }

  const userSuggestions = searchUsers(data.users, query)
    .slice(0, 3)
    .map((user) => ({
      key: `report-user-${user.id}`,
      value: user.name,
      userId: user.id,
      title: `Usuario: ${user.name}`,
      subtitle: [user.email, user.department].filter(Boolean).join(" â€¢ ")
    }));

  const bookSuggestions = searchBooks(data.books, query)
    .slice(0, 3)
    .map((book) => ({
      key: `report-book-${book.id}`,
      value: book.title,
      bookId: book.id,
      title: `Livro: ${book.title}`,
      subtitle: [book.author, book.category].filter(Boolean).join(" â€¢ ")
    }));

  const answerSuggestions = data.returns
    .filter((item) =>
      normalizeSearch(
        [item.answers?.learning, item.answers?.application, item.answers?.example]
          .filter(Boolean)
          .join(" ")
      ).includes(normalizedQuery)
    )
    .slice(0, 2)
    .map((item) => ({
      key: `report-answer-${item.id}`,
      value: booksafeTitle(data.books.find((book) => book.id === item.bookId)?.title),
      reportPath: "/relatorios/qualidade-respostas",
      title: `Resposta: ${data.users.find((user) => user.id === item.userId)?.name ?? "Usuario"}`,
      subtitle: booksafeTitle(data.books.find((book) => book.id === item.bookId)?.title)
    }));

  return [...userSuggestions, ...bookSuggestions, ...answerSuggestions].slice(0, 6);
}

function booksafeTitle(title) {
  return title || "Livro sem título";
}

function getBookSearchScore(book, normalizedQuery) {
  const title = normalizeSearch(book.title);
  const author = normalizeSearch(book.author);
  const category = normalizeSearch(book.category);
  const haystack = `${title} ${author} ${category}`.trim();

  if (!haystack) {
    return 0;
  }

  let score = 0;

  if (title === normalizedQuery) {
    score += 120;
  } else if (title.startsWith(normalizedQuery)) {
    score += 80;
  } else if (title.includes(normalizedQuery)) {
    score += 60;
  }

  if (author.startsWith(normalizedQuery)) {
    score += 50;
  } else if (author.includes(normalizedQuery)) {
    score += 35;
  }

  if (category.startsWith(normalizedQuery)) {
    score += 30;
  } else if (category.includes(normalizedQuery)) {
    score += 20;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
    score += 25;
  }

  return score;
}

function getUserSearchScore(user, normalizedQuery) {
  const name = normalizeSearch(user.name);
  const email = normalizeSearch(user.email);
  const department = normalizeSearch(user.department);
  const company = normalizeSearch(user.company);
  const haystack = `${name} ${email} ${department} ${company}`.trim();

  if (!haystack) {
    return 0;
  }

  let score = 0;

  if (name === normalizedQuery) {
    score += 120;
  } else if (name.startsWith(normalizedQuery)) {
    score += 80;
  } else if (name.includes(normalizedQuery)) {
    score += 60;
  }

  if (email.startsWith(normalizedQuery)) {
    score += 50;
  } else if (email.includes(normalizedQuery)) {
    score += 35;
  }

  if (department.startsWith(normalizedQuery)) {
    score += 35;
  } else if (department.includes(normalizedQuery)) {
    score += 24;
  }

  if (company.startsWith(normalizedQuery)) {
    score += 24;
  } else if (company.includes(normalizedQuery)) {
    score += 14;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
    score += 25;
  }

  return score;
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function filterBooks(books, activeLoans, filter) {
  switch (filter) {
    case "available":
      return books.filter(
        (book) =>
          book.isActive &&
          (book.type === "digital" ||
            Number(book.availableCopies ?? book.availableQuantity ?? 0) > 0)
      );
    case "borrowed":
      return books.filter((book) =>
        activeLoans.some((loan) => loan.bookId === book.id)
      );
    case "premium":
      return books.filter((book) => book.isPremium);
    default:
      return books;
  }
}


