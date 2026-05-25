# Lumiar Flow

Conhecimento em movimento.

Plataforma de livros e gerenciamento de leitura externa.

## Enderecos oficiais

- Site/app: `https://app.lumiarflow.com.br`
- API: `https://api.lumiarflow.com.br`
- Dominio institucional: `https://lumiarflow.com.br`

## Portas locais

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`

## Execucao local

1. Copie [.env.example](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/.env.example) para `.env`.
2. Preencha as variaveis de ambiente.
3. Rode os servicos do projeto.

## Estrutura principal

- [apps/web](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/apps/web)
- [apps/api](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/apps/api)
- [docs](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/docs)
- [supabase/schema.sql](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/supabase/schema.sql)

## Fluxo de acesso

- Novos usuarios entram como `pending` e `role=user`
- Apenas administradores aprovados podem acessar a area administrativa
- Usuarios pendentes veem somente a tela de aguardando aprovacao

## Deploy

- Leia [docs/deploy-checklist.md](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/docs/deploy-checklist.md)
- Leia [docs/production-setup.md](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/docs/production-setup.md)
- Leia [docs/publication-checklist.md](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/docs/publication-checklist.md)
- Leia [docs/mvp-gap-report.md](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/docs/mvp-gap-report.md)
