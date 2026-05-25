import React from "react";
import htm from "htm";
import { Link } from "react-router-dom";
import { PageLayout } from "../components/PageLayout.js";

const html = htm.bind(React.createElement);

export function AccountRequestSentPage() {
  return html`
    <${PageLayout} className="auth-layout">
      <section className="auth-page">
        <div className="auth-shell auth-shell--login">
          <aside className="auth-aside auth-aside--login">
            <span className="auth-tag">LUMIAR FLOW</span>
            <h1>Sua solicitação foi enviada.</h1>
            <p>
              Agora um administrador da plataforma precisa analisar e liberar o seu acesso.
            </p>
          </aside>

          <div className="auth-card auth-card--login">
            <div className="auth-confirmation">
              <span className="auth-confirmation-icon" aria-hidden="true">✓</span>
              <h1>Cadastro em análise</h1>
              <p>
                Assim que um dos administradores aprovar seu cadastro, você poderá entrar com o
                e-mail e a senha definidos no formulário.
              </p>

              <div className="auth-confirmation-actions">
                <${Link} to="/livros" className="auth-submit">Voltar ao acervo</${Link}>
                <${Link} to="/entrar" className="auth-secondary-link">
                  Já fui aprovado
                </${Link}>
              </div>
            </div>
          </div>
        </div>
      </section>
    <//>
  `;
}
