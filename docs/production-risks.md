# Riscos de Producao

## Riscos principais

- `WEB_ORIGIN` incorreto quebra cookies e CORS entre frontend e API
- `AUTH_COOKIE_SECURE=false` em producao expõe a sessao em conexoes inseguras
- `AUTH_COOKIE_SAMESITE=lax` em dominios diferentes pode impedir autenticao por cookie
- `AUTH_JWT_SECRET` fraco facilita forca bruta e roubo de sessao
- `SUPABASE_SERVICE_ROLE_KEY` exposta no frontend compromete o banco inteiro
- `VITE_API_BASE_URL` apontando para ambiente errado cria falhas silenciosas de login
- deploy sem `healthcheck` dificulta detectar API quebrada no Railway
- falta de source maps no Sentry reduz a qualidade do debug
- rotas administrativas expostas sem checagem de `role=admin` podem vazar dados
- `.env.local` ou segredos comitados por engano podem comprometer o ambiente

## Mitigacoes recomendadas

- usar dominios finais antes de abrir o acesso publico
- revisar `WEB_ORIGIN`, `AUTH_COOKIE_SECURE` e `AUTH_COOKIE_SAMESITE` no deploy
- guardar segredos apenas em variaveis do provedor
- habilitar Sentry em frontend e backend
- manter healthcheck e logs basicos no Railway
- testar login, logout, aprovacao e rejeicao em producao com conta de homologacao

