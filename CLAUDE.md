# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ITSM ITRAMOS — sistema B2B de gestão de chamados. Next.js 16 App Router + Supabase + Resend. Interface interna para analistas e portal self-service para clientes.

## Commands

```bash
# Dev
npm run dev

# Build
npm run build

# Lint
npm run lint

# Tests
npm run test                  # run all
npx vitest run tests/sla.test.ts   # single file

# Supabase local
npm run supabase:start
npm run supabase:stop
```

Tests require `.env.test.local` (loaded automatically by `tests/setup.ts` via dotenv).

## Architecture

### Route Groups

| Group | Path prefix | Who |
|---|---|---|
| `(internal)` | `/dashboard`, `/chamados`, `/clientes`, `/usuarios`, `/configuracoes` | admin, gestor, analista |
| `(portal)` | `/portal/*` | clientes externos |
| `(auth)` | `/login` | login interno |
| bare | `/aprovacao/[token]` | aprovadores externos (sem auth) |
| `api` | `/api/cron/*`, `/api/tickets/*`, `/api/upload/*` | webhooks e crons |

`(internal)` layout usa Sidebar + Header. `(portal)` tem layout próprio.

### Supabase clients (`src/lib/supabase/`)

- `createClient()` — anon key + cookies. Use em Server Components e Server Actions normais.
- `createServiceClient()` — service role key, bypassa RLS. Use apenas em webhooks e operações administrativas (rota `/api`, criação de usuários).

### Auth & Roles (`src/lib/auth.ts`)

Roles internas: `admin | gestor | analista`. Qualquer outro role é cliente de portal.

O middleware (`src/lib/supabase/middleware.ts`) enforça: interno tentando acessar `/portal` → redirect `/dashboard`; cliente tentando acessar área interna → redirect `/portal/chamados`.

### Ticket State Machine (`src/lib/ticket-transitions.ts`)

Sempre validar com `isValidTransition(from, to)` antes de mudar status. O mapa `VALID_TRANSITIONS` é a fonte de verdade. Estados: `aberto → em_andamento → aguardando_cliente | aguardando_fornecedor | aguardando_aprovacao | em_mudanca | agendado | resolvido → fechado → reaberto`.

SLA pausa automaticamente quando entra em `aguardando_fornecedor` e retoma ao sair.

### SLA (`src/lib/sla.ts`)

`calculateDeadline()` considera horário comercial (`BusinessHoursSettings`) e feriados. `is24x7` em contratos ignora horário comercial. Configurações lidas da tabela `platform_settings`.

### Server Actions

Todos em `actions.ts` dentro de cada rota. Padrão:
1. Parse com Zod (schema de `src/lib/validations/`)
2. `createClient()` para operações do usuário autenticado
3. `createServiceClient()` apenas quando necessário bypassar RLS
4. `revalidatePath()` ao final, nunca `redirect()` exceto em criação

### Email (`src/lib/email.ts` + `src/lib/email-template-sender.ts`)

`sendEmail()` via Resend. O `from` é construído com `buildFromAddress()` lendo `platform_settings`.

**Dois padrões de e-mail:**
- `email.ts` — funções hardcoded (legado: `approvalRequestHtml`, `kbLinkHtml`, etc.). Usar para fluxos ainda não migrados.
- `email-template-sender.ts` — **padrão novo**. `sendEmailFromTemplate(slug, to, vars)` carrega o template do banco (`email_templates`), substitui `{{variavel}}` via `substituteVariables()`, envolve com `wrapEmailHtml()` (logo + header ITRAMOS + footer) e envia. Usar para qualquer novo fluxo de e-mail.

### Templates de E-mail (`/configuracoes/email-templates`)

36 templates pré-populados na tabela `email_templates` (slug PK). Editáveis por admin/gestor. RLS bloqueia outros roles. Campos: `slug`, `category`, `name`, `subject`, `body_rich_text` (TipTap JSON), `body_html`, mais `default_*` para restauração. Variáveis no formato `{{chave}}`.

Editor usa TipTap 2.x com extensão `VariableHighlight` (decorações ProseMirror — classe `.template-variable-chip`). Componentes em `src/components/settings/email-templates/`.

### Audit Log (`src/lib/log.ts`)

Use `insertLog(serviceClient, category, status, description, details)` para registrar eventos em `system_logs`. Sempre usar `createServiceClient()` para logs.

### Validações

Schemas Zod em `src/lib/validations/` por entidade. Nunca validar manualmente — sempre `.safeParse()`.

O projeto usa **Zod v4**. Atenção à API quebrada em relação ao v3: `z.record()` agora exige dois argumentos — `z.record(z.string(), z.unknown())`, não `z.record(z.unknown())`.

### Components

- `src/components/ui/` — primitivos shadcn/ui. **Atenção:** o projeto usa `@radix-ui`, não `@base-ui/react`. Ao instalar componentes via `npx shadcn@latest add`, verificar se o arquivo gerado importa `@base-ui/react` — se sim, substituir pela implementação Radix equivalente (ver `scroll-area.tsx` e `alert-dialog.tsx` como referência).
- `src/components/tickets/` — componentes de chamado (TicketForm, SLAIndicator, InteractionForm, etc.)
- `src/components/settings/email-templates/` — editor de templates de e-mail (TemplateEditor, EmailTemplateList, EmailTemplateEditor, etc.)
- `src/components/layout/` — Sidebar, Header

### Database types

`src/types/database.ts` é majoritariamente gerado pelo Supabase CLI (`supabase gen types`). Exceção: `EmailTemplateVariable` e a entrada `email_templates` foram adicionadas manualmente (o CLI local não alcança a migration enquanto Docker não estiver rodando). Ao regenerar, preservar essas adições.

**Padrão de queries Supabase com TypeScript:** queries em tabelas com tipos complexos (ex: `email_templates`, `platform_settings`) frequentemente retornam `never` na inferência. Usar `as any` nesses casos — padrão estabelecido no projeto.

### Tests

Ficam em `tests/` (não colocados). Usam Vitest com `environment: 'node'`. Testes de integração conectam ao Supabase local — rodar `npm run supabase:start` antes.

## Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
```
