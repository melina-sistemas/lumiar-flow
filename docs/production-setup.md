# Preparacao de Producao - Lumiar Flow

## Objetivo

Publicar o Lumiar Flow com frontend separado, API protegida por JWT e fluxo de aprovacao de usuarios.

## Portas e URLs

- Frontend local: `http://localhost:3000`
- API local: `http://localhost:3001`
- Em producao:
  - frontend em Vercel
  - API em Railway ou Vercel Functions

## Variaveis essenciais

### Frontend

- `VITE_API_BASE_URL`
- `NODE_ENV`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT`
- `VITE_SENTRY_RELEASE`

### API

- `PORT` definido pelo provedor em producao
- `WEB_ORIGIN`
- `AUTH_JWT_SECRET`
- `AUTH_SESSION_TTL_SECONDS`
- `AUTH_COOKIE_NAME`
- `AUTH_COOKIE_SAMESITE`
- `AUTH_COOKIE_SECURE`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

## Vercel

O arquivo [vercel.json](/C:/Users/melina.abreu/Documents/Codex/2026-04-20-quero-criar-um-sistema-web-interno/vercel.json) prepara o deploy da interface e mantem o SPA funcionando com fallback para rotas internas.

Se o frontend for publicado separado, configure:

- `VITE_API_BASE_URL=https://api.lumiarflow.com.br`
- `WEB_ORIGIN=https://app.lumiarflow.com.br`
- `VITE_SENTRY_DSN=https://...`

Se estiver usando a Vercel como staging temporario antes do DNS final, adicione tambem:

- `WEB_ORIGIN_ALLOWLIST=https://lumiar-flow-gvivuflf-melina-sistemas-projects.vercel.app`
- `AUTH_COOKIE_SAMESITE=none`
- `AUTH_COOKIE_SECURE=true`

## Railway

Na API, configure:

- `WEB_ORIGIN=https://app.lumiarflow.com.br`
- `PORT` deixado para o Railway definir automaticamente
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAMESITE=lax` se frontend e API estiverem sob `lumiarflow.com.br`
- `AUTH_COOKIE_SAMESITE=none` apenas se houver dominios realmente diferentes
- `WEB_ORIGIN_ALLOWLIST=https://lumiar-flow-gvivuflf-melina-sistemas-projects.vercel.app` enquanto o staging estiver na Vercel
- `SENTRY_DSN=https://...`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE` com o hash/versao da entrega

## Dominio personalizado

1. Aponte o dominio `lumiarflow.com.br` para o site institucional, se existir.
2. Configure o frontend em `app.lumiarflow.com.br`.
3. Configure a API em `api.lumiarflow.com.br`.
4. Atualize `WEB_ORIGIN` e `VITE_API_BASE_URL` com os enderecos finais.
5. Refaca o login para gerar um novo cookie com o dominio final.

