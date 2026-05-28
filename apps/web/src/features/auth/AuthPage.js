import React, { useEffect, useState } from "react";
import htm from "htm";
import { PageLayout } from "../../components/PageLayout.js";
import { FeedbackMessage } from "../../components/FeedbackMessage.js";
import { BrandImage } from "../../components/BrandImage.js";

const html = htm.bind(React.createElement);

const LOGIN_INITIAL_STATE = {
  email: "",
  password: ""
};

const REGISTER_INITIAL_STATE = {
  fullName: "",
  email: "",
  company: "",
  department: "",
  cpf: "",
  phone: "",
  birthDate: "",
  password: ""
};

export function AuthPage({
  mode,
  onModeChange,
  onClose,
  onLogin,
  onRegister,
  branding = null
}) {
  const [loginForm, setLoginForm] = useState(LOGIN_INITIAL_STATE);
  const [registerForm, setRegisterForm] = useState(REGISTER_INITIAL_STATE);
  const [feedback, setFeedback] = useState(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const isLoginMode = mode === "login";
  const logoSrc = branding?.logoSrc ?? "/storage/branding/logo-lumiar.png";
  const systemName = branding?.systemName ?? "Lumiar Flow";
  const slogan = branding?.slogan ?? "Conhecimento em movimento.";

  useEffect(() => {
    setFeedback(null);
  }, [mode]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? loginForm.email ?? "").trim(),
      password: String(formData.get("password") ?? loginForm.password ?? "").trim()
    };
    const result = await Promise.resolve(onLogin?.(payload));
    if (result?.message) {
      setFeedback({
        tone: result.success ? "success" : "error",
        title: result.success ? "Acesso liberado" : "Não foi possível entrar",
        message: result.message
      });
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      fullName: String(formData.get("fullName") ?? registerForm.fullName ?? "").trim(),
      email: String(formData.get("email") ?? registerForm.email ?? "").trim(),
      company: String(formData.get("company") ?? registerForm.company ?? "").trim(),
      department: String(formData.get("department") ?? registerForm.department ?? "").trim(),
      cpf: String(formData.get("cpf") ?? registerForm.cpf ?? "").trim(),
      phone: String(formData.get("phone") ?? registerForm.phone ?? "").trim(),
      birthDate: String(formData.get("birthDate") ?? registerForm.birthDate ?? "").trim(),
      password: String(formData.get("password") ?? registerForm.password ?? "").trim()
    };
    const result = await Promise.resolve(onRegister?.(payload));
    if (result?.message) {
      setFeedback({
        tone: result.success ? "success" : "error",
        title: result.success ? "Solicitação enviada" : "Não foi possível cadastrar",
        message: result.message
      });
    }
  }

  const asideTitle =
    isLoginMode
      ? "Entre para continuar sua jornada de leitura."
      : "Crie seu acesso para evoluir com a biblioteca Lumiar Flow.";
  const asideDescription =
    isLoginMode
      ? "Use o seu e-mail corporativo para acessar livros, progresso e recomendações da equipe."
      : "Complete seu cadastro para solicitar acesso ao sistema e acompanhar sua evolução profissional.";
  const asideItems =
    isLoginMode
      ? [
          {
            title: "Acesso imediato",
            description: "Entre para consultar leituras em andamento, score e livros disponíveis."
          },
          {
            title: "Ambiente centralizado",
            description: "Tudo fica reunido em um único espaço, sem precisar procurar em várias planilhas."
          }
        ]
      : [
          {
            title: "Leitura guiada",
            description: "Livros recomendados conforme o momento profissional de cada pessoa."
          },
          {
            title: "Progresso visível",
            description: "Ranking, score, nível e histórico concentrados no mesmo ambiente."
          },
          {
            title: "Acesso controlado",
            description: "O login usa o cadastro existente no sistema ou criado previamente no fluxo de acesso."
          }
        ];

  return html`
    <${PageLayout} className="auth-layout">
      <section className="auth-page">
        <div className=${`auth-shell auth-shell--${mode}`}> 
          ${!isLoginMode
            ? html`
                <aside className=${`auth-aside auth-aside--${mode}`}>
                  <span className="auth-tag">LUMIAR FLOW</span>
                  <h1>${asideTitle}</h1>
                  <p>${asideDescription}</p>

                  <div className="auth-aside-list">
                    ${asideItems.map(
                      (item) => html`
                        <article key=${item.title} className="auth-aside-item">
                          <strong>${item.title}</strong>
                          <span>${item.description}</span>
                        </article>
                      `
                    )}
                  </div>
                </aside>
              `
            : null}

          <div className=${`auth-card auth-card--${mode}`}>
            <div className="auth-card-brand">
              <${BrandImage}
                src=${logoSrc}
                fallbackSrc=${branding?.logoFallbackSrc ?? branding?.logoPrimarySrc ?? logoSrc}
                alt=${systemName}
              />
              <div>
                <strong>${systemName}</strong>
                <span>${slogan}</span>
              </div>
            </div>

            <div className="auth-switch">
              <button
                type="button"
                className=${`auth-switch-item ${mode === "login" ? "active" : ""}`}
                onClick=${() => onModeChange?.("login")}
              >
                Entrar
              </button>
              <button
                type="button"
                className=${`auth-switch-item ${mode === "register" ? "active" : ""}`}
                onClick=${() => onModeChange?.("register")}
              >
                Cadastrar
              </button>
            </div>

            ${mode === "login"
              ? html`
                  <form className="auth-form" onSubmit=${handleLoginSubmit}>
                    <label>
                      <span>Email</span>
                      <input
                        name="email"
                        autoComplete="email"
                        type="email"
                        value=${loginForm.email}
                        onChange=${(event) =>
                          setLoginForm((current) => ({
                            ...current,
                          email: event.target.value
                        }))}
                        placeholder="você@empresa.com"
                      />
                    </label>

                    <label>
                      <span>Senha</span>
                      <div className="auth-input-with-action">
                        <input
                          name="password"
                          autoComplete="current-password"
                          type=${showLoginPassword ? "text" : "password"}
                          value=${loginForm.password}
                          onChange=${(event) =>
                            setLoginForm((current) => ({
                              ...current,
                              password: event.target.value
                            }))}
                          placeholder="Digite sua senha"
                        />
                        <button
                          type="button"
                          className="auth-input-action"
                          onClick=${() => setShowLoginPassword((current) => !current)}
                        >
                          ${showLoginPassword ? "Ocultar" : "Mostrar"}
                        </button>
                      </div>
                    </label>

                    <div className="auth-submit-row">
                      <button type="submit" className="auth-submit">
                        Entrar no sistema
                      </button>
                    </div>
                  </form>
                `
              : html`
                <form className="auth-form auth-form-grid" onSubmit=${handleRegisterSubmit}>
                  <label>
                    <span>Nome</span>
                    <input
                      name="fullName"
                      autoComplete="name"
                      value=${registerForm.fullName}
                      onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            fullName: event.target.value
                          }))}
                        placeholder="Nome e sobrenome"
                    />
                  </label>

                  <label>
                    <span>Email</span>
                    <input
                      name="email"
                      autoComplete="email"
                      type="email"
                      value=${registerForm.email}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            email: event.target.value
                          }))}
                        placeholder="você@empresa.com"
                      />
                    </label>

                  <label>
                    <span>Empresa</span>
                    <input
                      name="company"
                      value=${registerForm.company}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            company: event.target.value
                          }))}
                        placeholder="Nome da empresa"
                      />
                  </label>

                  <label>
                    <span>Setor</span>
                    <input
                      name="department"
                      value=${registerForm.department}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            department: event.target.value
                          }))}
                        placeholder="Area de atuacao"
                      />
                  </label>

                  <label>
                    <span>CPF</span>
                      <input
                        name="cpf"
                        autoComplete="off"
                        value=${registerForm.cpf}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            cpf: event.target.value
                          }))}
                        placeholder="000.000.000-00"
                      />
                    </label>

                  <label>
                    <span>Telefone</span>
                    <input
                      name="phone"
                      autoComplete="tel"
                      value=${registerForm.phone}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            phone: event.target.value
                          }))}
                        placeholder="(00) 00000-0000"
                      />
                  </label>

                  <label>
                    <span>Nascimento</span>
                    <input
                      name="birthDate"
                      autoComplete="bday"
                      type="date"
                      value=${registerForm.birthDate}
                        onChange=${(event) =>
                          setRegisterForm((current) => ({
                            ...current,
                            birthDate: event.target.value
                          }))}
                      />
                    </label>

                    <label>
                      <span>Senha</span>
                      <div className="auth-input-with-action">
                      <input
                        name="password"
                        autoComplete="new-password"
                        type=${showRegisterPassword ? "text" : "password"}
                        value=${registerForm.password}
                        onChange=${(event) =>
                            setRegisterForm((current) => ({
                              ...current,
                              password: event.target.value
                            }))}
                          placeholder="Crie uma senha"
                        />
                        <button
                          type="button"
                          className="auth-input-action"
                          onClick=${() => setShowRegisterPassword((current) => !current)}
                        >
                          ${showRegisterPassword ? "Ocultar" : "Mostrar"}
                        </button>
                      </div>
                    </label>

                  <div className="auth-submit-row auth-submit-wide">
                    <button type="submit" className="auth-submit">
                      Solicitar acesso
                    </button>
                  </div>
                </form>
              `}

            ${feedback
              ? html`
                  <${FeedbackMessage}
                    tone=${feedback.tone}
                    title=${feedback.title}
                    message=${feedback.message}
                    className="auth-feedback"
                  />
                `
              : null}
          </div>
        </div>
      </section>
    <//>
  `;
}


