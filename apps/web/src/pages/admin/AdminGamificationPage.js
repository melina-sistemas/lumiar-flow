import React, { useState } from "react";
import htm from "htm";
import { AdminPageLayout } from "../../components/AdminPageLayout.js";

const html = htm.bind(React.createElement);

export function AdminGamificationPage({ gamification, actions }) {
  const [message, setMessage] = useState("");

  const actionsBar = html`
    <button
      type="button"
      className="admin-primary"
      onClick=${() => setMessage("Configurações de gamificação salvas.")}
    >
      Salvar regras
    </button>
  `;

  return html`
    <${AdminPageLayout}
      title="Gamificação"
      breadcrumb="Gamificação"
      description="Configure recompensas e penalidades para o ranking Lumiar Flow."
      actions=${actionsBar}
    >
      <section className="admin-summary-grid">
        <article className="admin-summary-card">
          <span>Top 1</span>
          <strong>${gamification.rewards.top1}</strong>
          <small>Recompensa principal da temporada.</small>
        </article>
        <article className="admin-summary-card">
          <span>Top 3</span>
          <strong>${gamification.rewards.top3}</strong>
          <small>Incentivo para o pódio da leitura.</small>
        </article>
        <article className="admin-summary-card">
          <span>Top 10</span>
          <strong>${gamification.rewards.top10}</strong>
          <small>Reconhecimento para os mais constantes.</small>
        </article>
        <article className="admin-summary-card">
          <span>Penalidade por atraso</span>
          <strong>${gamification.penalties.atraso}</strong>
          <small>Impacto padrão em leituras fora do prazo.</small>
        </article>
      </section>

      ${message ? html`<article className="admin-card admin-feedback">${message}</article>` : null}
      <div className="admin-grid">
        <article className="admin-card">
          <div className="admin-card-header">
            <h3>Recompensas</h3>
          </div>
          <form className="admin-form">
            ${["top1", "top3", "top10"].map(
              (key) => html`
                <label key=${key}>
                  <span>${key.toUpperCase()}</span>
                  <input
                    value=${gamification.rewards[key]}
                    onInput=${(event) =>
                      actions.updateGamification({
                        rewards: {
                          ...gamification.rewards,
                          [key]: event.target.value
                        }
                      })}
                  />
                </label>
              `
            )}
          </form>
        </article>

        <article className="admin-card">
          <div className="admin-card-header">
            <h3>Penalidades</h3>
          </div>
          <form className="admin-form">
            ${["atraso", "resposta_ruim", "dano_livro"].map(
              (key) => html`
                <label key=${key}>
                  <span>${key.replaceAll("_", " ")}</span>
                  <input
                    type="number"
                    value=${gamification.penalties[key]}
                    onInput=${(event) =>
                      actions.updateGamification({
                        penalties: {
                          ...gamification.penalties,
                          [key]: Number(event.target.value || 0)
                        }
                      })}
                  />
                </label>
              `
            )}
          </form>
        </article>
      </div>
    <//>
  `;
}
