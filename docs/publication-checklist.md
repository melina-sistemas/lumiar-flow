# Publicacao Oficial - Lumiar Flow

## Objetivo

Colocar o Lumiar Flow em producao com:

- frontend em `https://app.lumiarflow.com.br`
- API em `https://api.lumiarflow.com.br`
- dominio institucional em `https://lumiarflow.com.br`
- autenticacao por cookie funcionando entre frontend e API

## 1. Checklist final de DNS

### Dominio institucional

- [ ] `lumiarflow.com.br` apontando para a pagina institucional ou redirecionando para `app.lumiarflow.com.br`
- [ ] certificado SSL ativo
- [ ] DNS propagado e resolvido corretamente

### Frontend

- [ ] `app.lumiarflow.com.br` configurado no Vercel
- [ ] apontamento por CNAME/ALIAS conforme o provedor DNS permitir
- [ ] dominio verificado dentro do projeto da Vercel

### API

- [ ] `api.lumiarflow.com.br` configurado no Railway
- [ ] apontamento por CNAME para o destino fornecido pelo Railway
- [ ] proxy do Cloudflare desativado se estiver causando conflito de SSL ou roteamento

## 2. Checklist final de Vercel

- [ ] projeto com nome visual de `Lumiar Flow`
- [ ] projeto associado ao repo correto
- [ ] build command: `npm run build`
- [ ] output directory configurado para `apps/web/dist` quando o projeto estiver na raiz do monorepo
- [ ] `VITE_API_BASE_URL=https://api.lumiarflow.com.br`
- [ ] `VITE_SENTRY_DSN` configurado
- [ ] `VITE_SENTRY_ENVIRONMENT=production`
- [ ] `VITE_SENTRY_RELEASE` definido
- [ ] dominio `app.lumiarflow.com.br` adicionado ao projeto
- [ ] preview deployments ainda separados da producao

## 3. Checklist final de Railway

- [ ] service com nome legivel, por exemplo `lumiar-flow-api`
- [ ] `npm run start` como start command
- [ ] `WEB_ORIGIN=https://app.lumiarflow.com.br`
- [ ] `AUTH_COOKIE_SECURE=true`
- [ ] `AUTH_COOKIE_SAMESITE=lax` se tudo estiver sob `lumiarflow.com.br`
- [ ] `AUTH_COOKIE_SAMESITE=none` apenas se os dominios finais forem realmente diferentes
- [ ] `AUTH_JWT_SECRET` forte e unico
- [ ] `AUTH_SESSION_TTL_SECONDS` definido
- [ ] `SUPABASE_URL` configurado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurada apenas no servidor
- [ ] `SENTRY_DSN` configurado
- [ ] healthcheck em `/health`
- [ ] dominio `api.lumiarflow.com.br` adicionado ao service

## 4. Variaveis de ambiente finais

### Frontend

- `VITE_API_BASE_URL=https://api.lumiarflow.com.br`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT=production`
- `VITE_SENTRY_RELEASE`

### API

- `WEB_ORIGIN=https://app.lumiarflow.com.br`
- `AUTH_JWT_SECRET`
- `AUTH_SESSION_TTL_SECONDS`
- `AUTH_COOKIE_NAME=lumiar_flow_session`
- `AUTH_COOKIE_SAMESITE=lax`
- `AUTH_COOKIE_SECURE=true`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA=public`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE`

## 5. Cookies cross-domain

- [ ] frontend faz requests com `credentials: include`
- [ ] API responde com `Access-Control-Allow-Credentials: true`
- [ ] `Access-Control-Allow-Origin` devolve o valor exato de `WEB_ORIGIN`
- [ ] cookie de sessao usa `HttpOnly`
- [ ] cookie de sessao usa `Path=/`
- [ ] cookie de sessao usa `Secure` em producao
- [ ] `SameSite=Lax` se app e API estiverem em subdominios do mesmo dominio raiz
- [ ] `SameSite=None` somente se houver sites diferentes
- [ ] logout remove cookie e invalida a sessao

## 6. GitHub oficial

- [ ] confirmar o owner real do repositório
- [ ] renomear o repo para `lumiar-flow`
- [ ] atualizar o `origin` local para o remote correto
- [ ] confirmar branch principal como `main`
- [ ] revisar protecao de branch e regras de merge
- [ ] validar que Vercel está conectado ao repo novo

## 7. Sequencia exata de deploy

1. Atualize o remote do GitHub com o owner real.
2. Faça push da branch final `main`.
3. Configure o projeto do frontend na Vercel.
4. Configure o projeto da API na Railway.
5. Adicione as variaveis de ambiente em cada provedor.
6. Aponte `app.lumiarflow.com.br` para a Vercel.
7. Aponte `api.lumiarflow.com.br` para a Railway.
8. Aguarde propagacao do DNS.
9. Execute o primeiro deploy de producao do frontend.
10. Execute o primeiro deploy de producao da API.
11. Valide login, logout, cookies e acesso a rotas protegidas.
12. Confirme Sentry, healthcheck e redirects.

## 8. Validacao pos-publicacao

- [ ] `https://lumiarflow.com.br` abre o destino esperado
- [ ] `https://app.lumiarflow.com.br` abre a interface
- [ ] `https://api.lumiarflow.com.br/health` responde `ok`
- [ ] cadastro cria usuario `pending`
- [ ] usuario `pending` nao entra em area privada
- [ ] admin aprova e rejeita usuarios corretamente
- [ ] cookie de sessao persiste entre refresh e navegacao
- [ ] logout encerra a sessao
- [ ] console do navegador sem erros criticos
- [ ] logs basicos ativos na plataforma
- [ ] eventos de teste aparecem no Sentry

## 9. Riscos restantes

- `WEB_ORIGIN` incorreto quebra CORS e cookie
- `AUTH_COOKIE_SECURE=false` em producao enfraquece a sessao
- `VITE_API_BASE_URL` apontando para ambiente errado gera login silenciosamente quebrado
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ir para o frontend
- dominio mal propagado pode fazer a aplicacao parecer quebrada mesmo com deploy valido
- preview deployments podem exigir configuracao separada de cookies e dominio

## 10. Resultado esperado

- frontend online
- API online
- autenticacao funcionando em producao
- cookies funcionando entre frontend e API
- deploy reproduzivel
- logs e monitoramento basicos ativos
