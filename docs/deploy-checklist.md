# Checklist de Deploy - Lumiar Flow

## Antes de publicar

- [ ] `.env` local preenchido
- [ ] `PORT` definido pelo provedor na API em producao
- [ ] frontend rodando em `3000`
- [ ] `VITE_API_BASE_URL` apontando para a API correta
- [ ] `WEB_ORIGIN` configurado com `https://app.lumiarflow.com.br`
- [ ] `WEB_ORIGIN_ALLOWLIST` inclui o preview atual da Vercel enquanto o DNS nao propaga
- [ ] `AUTH_JWT_SECRET` forte e unico
- [ ] `AUTH_COOKIE_SECURE=true` em producao
- [ ] `AUTH_COOKIE_SAMESITE=lax` se `app.` e `api.` estiverem sob `lumiarflow.com.br`
- [ ] `AUTH_COOKIE_SAMESITE=none` apenas se frontend e API estiverem em dominios diferentes
- [ ] `SUPABASE_URL` configurado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurada no servidor
- [ ] SQL de migracao do Supabase aplicado
- [ ] admin inicial criado e validado
- [ ] `SENTRY_DSN` configurado no backend
- [ ] `VITE_SENTRY_DSN` configurado no frontend
- [ ] `apps/api/railway.json` revisado no service da Railway
- [ ] `apps/web/vercel.json` revisado no service da Vercel

## Depois do deploy

- [ ] tela de login abre sem erro
- [ ] cadastro cria usuario com `status=pending`
- [ ] pending nao entra nas areas privadas
- [ ] admin aprova e rejeita usuarios
- [ ] logout invalida a sessao local
- [ ] rota `/auth/me` responde com a sessao correta
- [ ] rotas protegidas bloqueiam acesso indevido
- [ ] build da web concluido sem erros
- [ ] endpoint `/health` responde `ok`
- [ ] eventos de teste aparecem no Sentry
- [ ] dominio customizado `app.lumiarflow.com.br` responde via HTTPS
- [ ] cookies persistem entre navegacao e refresh
