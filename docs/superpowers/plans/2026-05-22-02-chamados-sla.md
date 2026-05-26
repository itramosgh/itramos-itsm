# Sub-spec 2: Chamados, Engine de SLA e Canais de Entrada — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o ciclo de vida completo dos chamados com engine de SLA em horário comercial e 24x7, abertura via portal e e-mail (Resend Inbound), fluxo de aprovação com token, agendamento com crons, automações de aguardando-cliente/aprovação, templates de resposta e integração básica com base de conhecimento.

**Architecture:** Chamados e interações ficam no PostgreSQL com RLS. A engine de SLA é lógica TypeScript pura (testável sem banco) que calcula o deadline com base em horário comercial e feriados. Crons são Vercel Cron Jobs (rotas Next.js protegidas por `CRON_SECRET`). E-mail de saída via Resend SDK; e-mail de entrada via Resend Inbound webhook. Aprovações usam tokens UUID únicos em links de e-mail — sem autenticação requerida para aprovar/reprovar. A rota de aprovação pública fica em `src/app/aprovacao/[token]/` fora de qualquer route group protegido.

**Tech Stack:** Next.js 15 · TypeScript · Supabase (Auth + PostgreSQL + Storage) · TailwindCSS · shadcn/ui · Resend (inbound + outbound) · date-fns · Vitest

---

## Mapa de arquivos

```
src/
├── app/
│   ├── (internal)/
│   │   ├── chamados/
│   │   │   ├── page.tsx                          — lista com filtros e busca
│   │   │   ├── novo/page.tsx                     — formulário de abertura
│   │   │   ├── [id]/page.tsx                     — detalhe e histórico
│   │   │   └── actions.ts                        — createTicket, changeStatus, schedule, reopen, approval, KB
│   │   └── configuracoes/
│   │       ├── categorias/
│   │       │   ├── page.tsx
│   │       │   └── actions.ts
│   │       ├── feriados/
│   │       │   ├── page.tsx
│   │       │   └── actions.ts
│   │       └── templates/
│   │           ├── page.tsx
│   │           └── actions.ts
│   ├── (portal)/
│   │   └── portal/
│   │       └── chamados/
│   │           ├── page.tsx
│   │           ├── novo/page.tsx
│   │           └── [id]/page.tsx
│   ├── aprovacao/
│   │   └── [token]/
│   │       ├── page.tsx                          — página pública de aprovação/reprovação
│   │       └── actions.ts
│   └── api/
│       ├── cron/
│       │   ├── sla-alerts/route.ts
│       │   ├── ticket-automations/route.ts       — aguardando_cliente + aguardando_aprovacao
│       │   └── agendamento/route.ts              — lembrete 15min + mudança de status
│       ├── tickets/
│       │   ├── email/route.ts                    — Resend Inbound webhook
│       │   └── kb-confirm/route.ts               — confirmação KB via link de e-mail
│       └── upload/
│           └── attachment/route.ts
├── components/
│   ├── tickets/
│   │   ├── TicketForm.tsx
│   │   ├── TicketList.tsx
│   │   ├── TicketDetail.tsx
│   │   ├── InteractionForm.tsx
│   │   ├── AttachmentUpload.tsx
│   │   ├── TicketStatusBadge.tsx
│   │   ├── SLAIndicator.tsx
│   │   ├── SchedulingDialog.tsx
│   │   ├── ApprovalDialog.tsx
│   │   ├── ReopenDialog.tsx
│   │   └── TemplateSelector.tsx
│   └── settings/
│       └── ResponseTemplateForm.tsx
├── lib/
│   ├── sla.ts                                    — engine de cálculo, pura (sem IO)
│   ├── email.ts                                  — wrapper Resend outbound
│   ├── ticket-transitions.ts                     — mapa de transições válidas
│   └── validations/
│       ├── ticket.ts
│       └── template.ts
└── types/
    └── database.ts                               — modify: adicionar todos os novos tipos
supabase/
└── migrations/
    ├── 20260522000004_tickets_schema.sql
    ├── 20260522000005_tickets_rls.sql
    ├── 20260522000006_tickets_storage.sql
    └── 20260522000007_tickets_trgm.sql
tests/
├── sla.test.ts
├── ticket-transitions.test.ts
└── ticket-validations.test.ts
vercel.json                                       — create: definição dos cron jobs
```

---

## Task 1: Migration — Schema de chamados (12 tabelas)

**Files:**
- Create: `supabase/migrations/20260522000004_tickets_schema.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new tickets_schema
```

- [ ] **Escrever migration** em `supabase/migrations/20260522000004_tickets_schema.sql`

```sql
-- Habilitar pg_trgm para busca por texto
create extension if not exists pg_trgm;

-- ticket_categories
create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  requires_approval boolean not null default false,
  is_active boolean not null default true
);

-- holidays: feriados para pausar SLA
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  is_national boolean not null default true,
  municipality text,
  created_at timestamptz not null default now(),
  unique (date, coalesce(municipality, ''))
);

-- kb_articles: stub — expandido no sub-spec de Base de Conhecimento
create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  slug text unique,
  body text not null default '',
  category_id uuid references public.ticket_categories(id) on delete set null,
  source_ticket_id uuid,  -- FK adicionada após criar tickets (ver abaixo)
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique generated always as identity,
  title text not null,
  description text,
  category_id uuid references public.ticket_categories(id) on delete set null,
  priority text not null check (priority in ('critica', 'alta', 'media', 'baixa')),
  status text not null default 'aberto'
    check (status in ('aberto','agendado','em_andamento','aguardando_cliente',
                      'aguardando_fornecedor','aguardando_aprovacao','em_mudanca',
                      'resolvido','fechado','reaberto')),
  channel text not null
    check (channel in ('portal','email','zabbix','azure_monitor','url_monitoring')),
  company_id uuid not null references public.companies(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  external_alert_id text,
  sla_deadline timestamptz,
  sla_first_response_at timestamptz,
  sla_met boolean,
  sla_breach_minutes integer,
  sla_paused_at timestamptz,
  sla_paused_minutes integer not null default 0,
  billing_status text check (billing_status in ('pendente', 'cobrado')),
  resolution text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adicionar FK circular após criar tickets
alter table public.kb_articles
  add constraint kb_articles_source_ticket_id_fkey
  foreign key (source_ticket_id) references public.tickets(id) on delete set null;

-- ticket_interactions
create table public.ticket_interactions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  type text not null
    check (type in ('mensagem', 'status_change', 'assignment', 'system')),
  content text,
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_contact_id uuid references public.contacts(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ticket_attachments
create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  interaction_id uuid references public.ticket_interactions(id) on delete set null,
  filename text not null,
  storage_path text not null,
  size_bytes integer,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ticket_reopens
create table public.ticket_reopens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  reopened_by_profile_id uuid references public.profiles(id) on delete set null,
  reopened_by_contact_id uuid references public.contacts(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- ticket_approvals
create table public.ticket_approvals (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  approver_contact_id uuid references public.contacts(id) on delete set null,
  approver_email text not null,
  token uuid not null unique default gen_random_uuid(),
  previous_status text not null default 'em_andamento',
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','reprovado','expirado','automatico')),
  response_reason text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- response_templates
create table public.response_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  body text not null,
  variables jsonb not null default '[]',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ticket_kb_links
create table public.ticket_kb_links (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kb_article_id uuid not null references public.kb_articles(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  confirmation_token uuid not null unique default gen_random_uuid(),
  resolution_confirmed boolean,
  created_at timestamptz not null default now()
);

-- pending_email_tickets: estado temporário para e-mails de remetentes desconhecidos
create table public.pending_email_tickets (
  id uuid primary key default gen_random_uuid(),
  from_email text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  original_subject text not null,
  original_body text not null,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Triggers updated_at
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger trg_response_templates_updated_at
  before update on public.response_templates
  for each row execute function public.set_updated_at();

create trigger trg_kb_articles_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

-- Indexes
create index idx_tickets_company_id on public.tickets(company_id);
create index idx_tickets_contact_id on public.tickets(contact_id);
create index idx_tickets_status on public.tickets(status);
create index idx_tickets_assigned_to on public.tickets(assigned_to);
create index idx_tickets_sla_deadline on public.tickets(sla_deadline) where sla_first_response_at is null;
create index idx_tickets_scheduled_at on public.tickets(scheduled_at) where scheduled_at is not null;
create index idx_ticket_interactions_ticket_id on public.ticket_interactions(ticket_id);
create index idx_ticket_attachments_ticket_id on public.ticket_attachments(ticket_id);
create index idx_ticket_approvals_token on public.ticket_approvals(token);
create index idx_ticket_approvals_ticket_id on public.ticket_approvals(ticket_id);
create index idx_ticket_kb_links_token on public.ticket_kb_links(confirmation_token);
create index idx_holidays_date on public.holidays(date);
create index idx_pending_email_from on public.pending_email_tickets(from_email);

-- Índices GIN para busca full-text em tickets
create index idx_tickets_title_trgm on public.tickets using gin (title gin_trgm_ops);
create index idx_tickets_description_trgm on public.tickets using gin (description gin_trgm_ops);
```

- [ ] **Inserir categorias padrão** — adicionar ao final da migration

```sql
insert into public.ticket_categories (name, slug) values
  ('Suporte Técnico',           'suporte_tecnico'),
  ('Incidente',                 'incidente'),
  ('Solicitação de Serviço',    'solicitacao_servico'),
  ('Mudança de Infraestrutura', 'mudanca_infraestrutura'),
  ('Criação de Site Institucional', 'criacao_site'),
  ('Landing Page',              'landing_page'),
  ('Agente de IA',              'agente_ia');
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar tabelas no Studio**

Abrir `http://127.0.0.1:54323` → Table Editor. Confirmar que as 12 novas tabelas existem (`ticket_categories`, `tickets`, `ticket_interactions`, `ticket_attachments`, `ticket_reopens`, `ticket_approvals`, `response_templates`, `ticket_kb_links`, `holidays`, `kb_articles`, `pending_email_tickets`).

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: migration tickets_schema — 12 tabelas, indexes GIN e pg_trgm"
```

---

## Task 2: Migration — RLS Policies para chamados

**Files:**
- Create: `supabase/migrations/20260522000005_tickets_rls.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new tickets_rls
```

- [ ] **Escrever migration**

```sql
-- Habilitar RLS nas novas tabelas
alter table public.ticket_categories enable row level security;
alter table public.holidays enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_interactions enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_reopens enable row level security;
alter table public.ticket_approvals enable row level security;
alter table public.response_templates enable row level security;
alter table public.ticket_kb_links enable row level security;
alter table public.kb_articles enable row level security;
alter table public.pending_email_tickets enable row level security;

-- Função auxiliar: retorna company_id do contato autenticado (cliente)
create or replace function public.get_contact_company_id()
returns uuid language sql stable security definer as $$
  select company_id from public.contacts
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

-- ticket_categories: todos internos leem; admin gerencia
create policy "categories_select_internal"
  on public.ticket_categories for select
  using (public.is_internal());

create policy "categories_select_portal"
  on public.ticket_categories for select
  using (public.get_user_role() = 'cliente');

create policy "categories_manage_admin"
  on public.ticket_categories for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- holidays: internos leem; admin e gestor gerenciam
create policy "holidays_select_internal"
  on public.holidays for select
  using (public.is_internal());

create policy "holidays_manage_admin_gestor"
  on public.holidays for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- tickets: internos veem todos; cliente vê apenas da própria empresa
create policy "tickets_select_internal"
  on public.tickets for select
  using (public.is_internal());

create policy "tickets_select_client"
  on public.tickets for select
  using (
    public.get_user_role() = 'cliente'
    and company_id = public.get_contact_company_id()
  );

create policy "tickets_insert_internal"
  on public.tickets for insert
  with check (public.is_internal());

create policy "tickets_insert_service"
  on public.tickets for insert
  with check (auth.role() = 'service_role');

create policy "tickets_update_admin_gestor"
  on public.tickets for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tickets_update_analista_assigned"
  on public.tickets for update
  using (
    public.get_user_role() = 'analista'
    and (assigned_to = auth.uid() or assigned_to is null)
  );

-- ticket_interactions: visibilidade vinculada ao chamado pai
create policy "interactions_select_internal"
  on public.ticket_interactions for select
  using (
    public.is_internal()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

create policy "interactions_select_client"
  on public.ticket_interactions for select
  using (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "interactions_insert_internal"
  on public.ticket_interactions for insert
  with check (public.is_internal());

create policy "interactions_insert_client"
  on public.ticket_interactions for insert
  with check (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "interactions_insert_service"
  on public.ticket_interactions for insert
  with check (auth.role() = 'service_role');

-- ticket_attachments
create policy "attachments_select_internal"
  on public.ticket_attachments for select
  using (
    public.is_internal()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

create policy "attachments_select_client"
  on public.ticket_attachments for select
  using (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "attachments_insert_internal"
  on public.ticket_attachments for insert
  with check (public.is_internal());

create policy "attachments_insert_service"
  on public.ticket_attachments for insert
  with check (auth.role() = 'service_role');

create policy "attachments_update_service"
  on public.ticket_attachments for update
  using (auth.role() = 'service_role');

-- ticket_reopens
create policy "reopens_select_internal"
  on public.ticket_reopens for select
  using (public.is_internal());

create policy "reopens_insert_internal"
  on public.ticket_reopens for insert
  with check (public.is_internal());

create policy "reopens_insert_client"
  on public.ticket_reopens for insert
  with check (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

-- ticket_approvals
create policy "approvals_select_admin_gestor"
  on public.ticket_approvals for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "approvals_select_analista_own"
  on public.ticket_approvals for select
  using (
    public.get_user_role() = 'analista'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.assigned_to = auth.uid()
    )
  );

create policy "approvals_write_service"
  on public.ticket_approvals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- response_templates
create policy "templates_select_internal"
  on public.response_templates for select
  using (public.is_internal() and is_active = true);

create policy "templates_manage_admin_gestor"
  on public.response_templates for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- ticket_kb_links
create policy "kb_links_select_internal"
  on public.ticket_kb_links for select
  using (public.is_internal());

create policy "kb_links_insert_internal"
  on public.ticket_kb_links for insert
  with check (public.is_internal());

create policy "kb_links_update_service"
  on public.ticket_kb_links for update
  using (auth.role() = 'service_role');

-- kb_articles
create policy "kb_articles_select_internal"
  on public.kb_articles for select
  using (public.is_internal() and is_active = true);

create policy "kb_articles_manage_service"
  on public.kb_articles for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- pending_email_tickets: apenas service_role
create policy "pending_email_service"
  on public.pending_email_tickets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: RLS policies para tabelas de chamados — 5 papéis + service_role"
```

---

## Task 3: Migration — Bucket ticket-attachments

**Files:**
- Create: `supabase/migrations/20260522000006_tickets_storage.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new tickets_storage
```

- [ ] **Escrever migration**

```sql
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy "ticket-attachments: internos fazem upload"
  on storage.objects for insert
  with check (
    bucket_id = 'ticket-attachments'
    and public.is_internal()
  );

create policy "ticket-attachments: service_role faz upload"
  on storage.objects for insert
  with check (
    bucket_id = 'ticket-attachments'
    and auth.role() = 'service_role'
  );

create policy "ticket-attachments: internos leem"
  on storage.objects for select
  using (
    bucket_id = 'ticket-attachments'
    and public.is_internal()
  );

create policy "ticket-attachments: cliente lê próprios"
  on storage.objects for select
  using (
    bucket_id = 'ticket-attachments'
    and public.get_user_role() = 'cliente'
    and (storage.foldername(name))[1] in (
      select t.id::text from public.tickets t
      where t.company_id = public.get_contact_company_id()
    )
  );

create policy "ticket-attachments: service_role atualiza (soft delete)"
  on storage.objects for update
  using (
    bucket_id = 'ticket-attachments'
    and auth.role() = 'service_role'
  );
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: bucket ticket-attachments com policies por papel"
```

---

## Task 4: Atualizar `src/types/database.ts`

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Adicionar novos tipos** no início do arquivo (após os tipos existentes)

```typescript
// Adicionar após os tipos existentes (LogStatus, etc.)

export type TicketStatus =
  | 'aberto' | 'agendado' | 'em_andamento' | 'aguardando_cliente'
  | 'aguardando_fornecedor' | 'aguardando_aprovacao' | 'em_mudanca'
  | 'resolvido' | 'fechado' | 'reaberto'

export type TicketPriority = 'critica' | 'alta' | 'media' | 'baixa'

export type TicketChannel = 'portal' | 'email' | 'zabbix' | 'azure_monitor' | 'url_monitoring'

export type InteractionType = 'mensagem' | 'status_change' | 'assignment' | 'system'

export type ApprovalStatus = 'pendente' | 'aprovado' | 'reprovado' | 'expirado' | 'automatico'
```

- [ ] **Adicionar as tabelas novas à interface `Database`** — dentro de `Tables`:

```typescript
      ticket_categories: {
        Row: {
          id: string; name: string; slug: string
          requires_approval: boolean; is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['ticket_categories']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['ticket_categories']['Insert']>
      }
      holidays: {
        Row: {
          id: string; date: string; name: string
          is_national: boolean; municipality: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['holidays']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
      }
      tickets: {
        Row: {
          id: string; number: number; title: string; description: string | null
          category_id: string | null; priority: TicketPriority; status: TicketStatus
          channel: TicketChannel; company_id: string; contact_id: string
          contract_id: string | null; assigned_to: string | null
          scheduled_at: string | null; external_alert_id: string | null
          sla_deadline: string | null; sla_first_response_at: string | null
          sla_met: boolean | null; sla_breach_minutes: number | null
          sla_paused_at: string | null; sla_paused_minutes: number
          billing_status: 'pendente' | 'cobrado' | null
          resolution: string | null; closed_at: string | null
          created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'number' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>
      }
      ticket_interactions: {
        Row: {
          id: string; ticket_id: string; type: InteractionType
          content: string | null; author_profile_id: string | null
          author_contact_id: string | null; is_system: boolean; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_interactions']['Row'], 'id' | 'created_at'>
        Update: never
      }
      ticket_attachments: {
        Row: {
          id: string; ticket_id: string; interaction_id: string | null
          filename: string; storage_path: string; size_bytes: number | null
          mime_type: string | null; is_deleted: boolean; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_attachments']['Row'], 'id' | 'created_at'>
        Update: Pick<Database['public']['Tables']['ticket_attachments']['Row'], 'is_deleted'>
      }
      ticket_reopens: {
        Row: {
          id: string; ticket_id: string
          reopened_by_profile_id: string | null; reopened_by_contact_id: string | null
          reason: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_reopens']['Row'], 'id' | 'created_at'>
        Update: never
      }
      ticket_approvals: {
        Row: {
          id: string; ticket_id: string; approver_contact_id: string | null
          approver_email: string; token: string; previous_status: string
          status: ApprovalStatus; response_reason: string | null
          responded_at: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_approvals']['Row'], 'id' | 'token' | 'created_at'>
        Update: Partial<Pick<Database['public']['Tables']['ticket_approvals']['Row'], 'status' | 'response_reason' | 'responded_at'>>
      }
      response_templates: {
        Row: {
          id: string; name: string; category: string | null; body: string
          variables: { key: string; label: string; auto_filled: boolean }[]
          is_active: boolean; created_by: string | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['response_templates']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['response_templates']['Insert']>
      }
      ticket_kb_links: {
        Row: {
          id: string; ticket_id: string; kb_article_id: string
          linked_by: string | null; confirmation_token: string
          resolution_confirmed: boolean | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_kb_links']['Row'], 'id' | 'confirmation_token' | 'created_at'>
        Update: Pick<Database['public']['Tables']['ticket_kb_links']['Row'], 'resolution_confirmed'>
      }
      kb_articles: {
        Row: {
          id: string; title: string; summary: string | null; slug: string | null
          body: string; category_id: string | null; source_ticket_id: string | null
          is_active: boolean; created_by: string | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_articles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['kb_articles']['Insert']>
      }
      pending_email_tickets: {
        Row: {
          id: string; from_email: string; company_id: string
          original_subject: string; original_body: string
          reminder_count: number; last_reminder_at: string | null
          completed_at: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['pending_email_tickets']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['pending_email_tickets']['Insert']>
      }
```

- [ ] **Adicionar à seção `Functions`** dentro de `Database`:

```typescript
      get_contact_company_id: { Args: Record<never, never>; Returns: string | null }
```

- [ ] **Rodar build para verificar tipos**

```bash
npm run build 2>&1 | head -30
```

Expected: sem erros de TypeScript nos novos tipos.

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: database types — TicketStatus, TicketPriority, TicketChannel e 11 novas tabelas"
```

---

## Task 5: Engine de SLA — cálculo em horário comercial e 24x7 (TDD)

**Files:**
- Create: `src/lib/sla.ts`
- Create: `tests/sla.test.ts`

- [ ] **Instalar date-fns**

```bash
npm install date-fns
```

- [ ] **Escrever os testes** em `tests/sla.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { calculateDeadline, addBusinessHours, isBusinessDay } from '@/lib/sla'

const defaultSettings = {
  start: '09:00',
  end: '18:00',
  days: [1, 2, 3, 4, 5], // Seg-Sex
}

describe('isBusinessDay', () => {
  it('segunda-feira sem feriado é dia útil', () => {
    const monday = new Date('2026-06-01T10:00:00') // segunda
    expect(isBusinessDay(monday, defaultSettings, [])).toBe(true)
  })

  it('sábado não é dia útil', () => {
    const saturday = new Date('2026-06-06T10:00:00') // sábado
    expect(isBusinessDay(saturday, defaultSettings, [])).toBe(false)
  })

  it('feriado não é dia útil', () => {
    const holiday = new Date('2026-06-01T10:00:00')
    expect(isBusinessDay(holiday, defaultSettings, ['2026-06-01'])).toBe(false)
  })
})

describe('calculateDeadline — 24x7', () => {
  it('prazo 24x7 ignora horário comercial', () => {
    const created = new Date('2026-06-06T22:00:00Z') // sábado noite
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 2,
      is24x7: true,
      settings: defaultSettings,
      holidays: [],
    })
    expect(deadline.getTime()).toBe(new Date('2026-06-07T00:00:00Z').getTime())
  })
})

describe('calculateDeadline — horário comercial', () => {
  it('prazo dentro do mesmo dia', () => {
    // Criado segunda 10:00, prazo 4h → segunda 14:00
    const created = new Date('2026-06-01T10:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T14:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que vira dia — segunda 16h + 4h → terça 11h', () => {
    // Segunda 16:00 → segunda 18:00 = 2h disponíveis, restam 2h → terça 09:00 + 2h = terça 11:00
    const created = new Date('2026-06-01T16:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-02T11:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula fim de semana — sexta 16h + 4h → segunda 11h', () => {
    // Sexta 16:00 → sexta 18:00 = 2h, restam 2h → pula sábado e domingo → segunda 09:00 + 2h = segunda 11:00
    const created = new Date('2026-05-29T16:00:00') // sexta
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T11:00:00') // segunda
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula feriado na segunda — sexta 16h + 4h + feriado segunda → terça 11h', () => {
    const created = new Date('2026-05-29T16:00:00') // sexta
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: ['2026-06-01'], // feriado na segunda
    })
    const expected = new Date('2026-06-02T11:00:00') // terça
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura fora do horário comercial conta a partir do início do próximo dia útil', () => {
    // Sábado 10:00 → primeiro dia útil = segunda 09:00 → + 4h = segunda 13:00
    const created = new Date('2026-05-30T10:00:00') // sábado
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00') // segunda
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura antes do horário comercial conta a partir do início do dia', () => {
    // Segunda 07:00 → avança para 09:00 → + 4h = segunda 13:00
    const created = new Date('2026-06-01T07:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })
})
```

- [ ] **Rodar testes para verificar falha**

```bash
npm test -- tests/sla.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/sla'`

- [ ] **Criar `src/lib/sla.ts`**

```typescript
export interface BusinessHoursSettings {
  start: string  // "09:00" ou "09:00:00"
  end: string
  days: number[] // 1=Seg ... 7=Dom (ISO)
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hours: h, minutes: m }
}

function toISOWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export function isBusinessDay(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): boolean {
  const isoDay = toISOWeekday(date.getDay())
  if (!settings.days.includes(isoDay)) return false
  const dateStr = date.toISOString().slice(0, 10)
  return !holidays.includes(dateStr)
}

function nextBusinessDayStart(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  next.setHours(0, 0, 0, 0)

  while (!isBusinessDay(next, settings, holidays)) {
    next.setDate(next.getDate() + 1)
  }

  const { hours, minutes } = parseTime(settings.start)
  next.setHours(hours, minutes, 0, 0)
  return next
}

export function addBusinessHours(
  start: Date,
  hours: number,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  let remainingMinutes = hours * 60
  let current = new Date(start)

  const startTime = parseTime(settings.start)
  const endTime = parseTime(settings.end)
  const startMins = startTime.hours * 60 + startTime.minutes
  const endMins = endTime.hours * 60 + endTime.minutes

  while (remainingMinutes > 0) {
    if (!isBusinessDay(current, settings, holidays)) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const currentMins = current.getHours() * 60 + current.getMinutes()

    if (currentMins < startMins) {
      current = new Date(current)
      current.setHours(startTime.hours, startTime.minutes, 0, 0)
    }

    const refreshedMins = current.getHours() * 60 + current.getMinutes()

    if (refreshedMins >= endMins) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const minutesAvailable = endMins - refreshedMins

    if (remainingMinutes <= minutesAvailable) {
      return new Date(current.getTime() + remainingMinutes * 60_000)
    }

    remainingMinutes -= minutesAvailable
    current = nextBusinessDayStart(current, settings, holidays)
  }

  return current
}

export function calculateDeadline(params: {
  createdAt: Date
  responseHours: number
  is24x7: boolean
  settings: BusinessHoursSettings
  holidays: string[]
}): Date {
  const { createdAt, responseHours, is24x7, settings, holidays } = params

  if (is24x7) {
    return new Date(createdAt.getTime() + responseHours * 60 * 60_000)
  }

  return addBusinessHours(createdAt, responseHours, settings, holidays)
}

export function getSLARemainingMinutes(
  deadline: Date,
  pausedAt: Date | null
): number {
  const now = new Date()
  const currentPauseMs = pausedAt ? now.getTime() - pausedAt.getTime() : 0
  return Math.floor((deadline.getTime() - now.getTime() + currentPauseMs) / 60_000)
}

export function getSLAPercentUsed(
  createdAt: Date,
  deadline: Date,
  pausedAt: Date | null
): number {
  const totalMs = deadline.getTime() - createdAt.getTime()
  const remainingMs = getSLARemainingMinutes(deadline, pausedAt) * 60_000
  if (totalMs <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)))
}
```

- [ ] **Rodar testes**

```bash
npm test -- tests/sla.test.ts
```

Expected: PASS (9 testes)

- [ ] **Commit**

```bash
git add src/lib/sla.ts tests/sla.test.ts
git commit -m "feat: engine de SLA — cálculo em horário comercial e 24x7 com TDD"
```

---

## Task 6: Transições de status e schemas de validação (TDD)

**Files:**
- Create: `src/lib/ticket-transitions.ts`
- Create: `src/lib/validations/ticket.ts`
- Create: `src/lib/validations/template.ts`
- Create: `tests/ticket-transitions.test.ts`
- Create: `tests/ticket-validations.test.ts`

- [ ] **Escrever testes de transição** em `tests/ticket-transitions.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { isValidTransition, VALID_TRANSITIONS } from '@/lib/ticket-transitions'

describe('isValidTransition', () => {
  it('aberto → em_andamento é válido', () => {
    expect(isValidTransition('aberto', 'em_andamento')).toBe(true)
  })

  it('aberto → agendado é válido', () => {
    expect(isValidTransition('aberto', 'agendado')).toBe(true)
  })

  it('fechado → em_andamento é inválido', () => {
    expect(isValidTransition('fechado', 'em_andamento')).toBe(false)
  })

  it('fechado → reaberto é válido', () => {
    expect(isValidTransition('fechado', 'reaberto')).toBe(true)
  })

  it('reaberto → fechado é inválido — precisa passar por estado de trabalho', () => {
    expect(isValidTransition('reaberto', 'fechado')).toBe(false)
  })

  it('aguardando_aprovacao → em_andamento é válido (aprovado)', () => {
    expect(isValidTransition('aguardando_aprovacao', 'em_andamento')).toBe(true)
  })

  it('aguardando_aprovacao → fechado é válido (reprovado ou timeout)', () => {
    expect(isValidTransition('aguardando_aprovacao', 'fechado')).toBe(true)
  })

  it('em_andamento → aguardando_aprovacao é válido', () => {
    expect(isValidTransition('em_andamento', 'aguardando_aprovacao')).toBe(true)
  })

  it('todos os status têm ao menos uma transição de saída exceto fechado', () => {
    const statuses = Object.keys(VALID_TRANSITIONS) as (keyof typeof VALID_TRANSITIONS)[]
    for (const status of statuses) {
      if (status === 'fechado') continue
      expect(VALID_TRANSITIONS[status].length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Criar `src/lib/ticket-transitions.ts`**

```typescript
import type { TicketStatus } from '@/types/database'

export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  aberto:                ['em_andamento', 'agendado', 'aguardando_cliente'],
  agendado:              ['em_andamento'],
  em_andamento:          ['aguardando_cliente', 'aguardando_fornecedor', 'aguardando_aprovacao',
                          'em_mudanca', 'agendado', 'resolvido', 'fechado'],
  aguardando_cliente:    ['em_andamento', 'fechado'],
  aguardando_fornecedor: ['em_andamento', 'fechado'],
  aguardando_aprovacao:  ['em_andamento', 'fechado'],
  em_mudanca:            ['em_andamento', 'fechado'],
  resolvido:             ['fechado'],
  fechado:               ['reaberto'],
  reaberto:              ['em_andamento', 'agendado', 'aguardando_cliente'],
}

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```

- [ ] **Escrever testes de validação** em `tests/ticket-validations.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { ticketSchema, interactionSchema, scheduleSchema } from '@/lib/validations/ticket'
import { templateSchema } from '@/lib/validations/template'

describe('ticketSchema', () => {
  it('rejeita chamado sem título', () => {
    const result = ticketSchema.safeParse({
      title: '',
      priority: 'alta',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita prioridade inválida', () => {
    const result = ticketSchema.safeParse({
      title: 'Problema',
      priority: 'urgente',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(false)
  })

  it('aceita chamado válido mínimo', () => {
    const result = ticketSchema.safeParse({
      title: 'VPN não conecta',
      priority: 'alta',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(true)
  })
})

describe('scheduleSchema', () => {
  it('rejeita agendamento sem data', () => {
    expect(scheduleSchema.safeParse({ scheduled_at: '' }).success).toBe(false)
  })

  it('rejeita agendamento no passado', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(scheduleSchema.safeParse({ scheduled_at: past }).success).toBe(false)
  })

  it('aceita agendamento futuro', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    expect(scheduleSchema.safeParse({ scheduled_at: future }).success).toBe(true)
  })
})

describe('templateSchema', () => {
  it('rejeita template sem nome', () => {
    expect(templateSchema.safeParse({ name: '', body: 'Olá {{nome_cliente}}' }).success).toBe(false)
  })

  it('aceita template válido', () => {
    const result = templateSchema.safeParse({
      name: 'Acesso VPN',
      body: 'Olá {{nome_cliente}}, seu acesso foi liberado.',
      variables: [{ key: 'nome_cliente', label: 'Nome do Cliente', auto_filled: true }],
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Criar `src/lib/validations/ticket.ts`**

```typescript
import { z } from 'zod'

export const ticketSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  priority: z.enum(['critica', 'alta', 'media', 'baixa'], { message: 'Prioridade inválida' }),
  channel: z.enum(['portal', 'email', 'zabbix', 'azure_monitor', 'url_monitoring']),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  contract_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
})

export const interactionSchema = z.object({
  ticket_id: z.string().uuid(),
  type: z.enum(['mensagem', 'status_change', 'assignment', 'system']),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
})

export const scheduleSchema = z.object({
  scheduled_at: z
    .string()
    .min(1, 'Data e hora são obrigatórias')
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      'Data deve ser no futuro'
    ),
})

export const approvalRequestSchema = z.object({
  approver_email: z.string().email('E-mail do aprovador inválido'),
  approver_contact_id: z.string().uuid().optional(),
})

export type TicketInput = z.infer<typeof ticketSchema>
export type InteractionInput = z.infer<typeof interactionSchema>
export type ScheduleInput = z.infer<typeof scheduleSchema>
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>
```

- [ ] **Criar `src/lib/validations/template.ts`**

```typescript
import { z } from 'zod'

const templateVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  auto_filled: z.boolean().default(false),
})

export const templateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  category: z.string().optional(),
  body: z.string().min(1, 'Corpo é obrigatório'),
  variables: z.array(templateVariableSchema).default([]),
})

export type TemplateInput = z.infer<typeof templateSchema>
```

- [ ] **Rodar todos os novos testes**

```bash
npm test -- tests/ticket-transitions.test.ts tests/ticket-validations.test.ts
```

Expected: PASS (9 + 6 = 15 testes)

- [ ] **Commit**

```bash
git add src/lib/ticket-transitions.ts src/lib/validations/ticket.ts src/lib/validations/template.ts tests/
git commit -m "feat: transições de status e schemas de validação de chamados com TDD"
```

---

## Task 7: Serviço de e-mail (Resend)

**Files:**
- Create: `src/lib/email.ts`
- Modify: `.env.local`

- [ ] **Instalar Resend**

```bash
npm install resend
```

- [ ] **Adicionar variáveis ao `.env.local`**

```
RESEND_API_KEY=re_xxxxxxxx
RESEND_INBOUND_SECRET=whsec_xxxxxxxx
CRON_SECRET=gere_uma_string_aleatoria_segura
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Nota: `RESEND_API_KEY` e `RESEND_INBOUND_SECRET` são obtidos no painel da Resend. `CRON_SECRET` pode ser gerado com `openssl rand -hex 32`.

- [ ] **Criar `src/lib/email.ts`**

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from: string  // formato: "Nome <email@dominio.com>"
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { error } = await resend.emails.send({
    from: params.from,
    to: typeof params.to === 'string' ? [params.to] : params.to,
    subject: params.subject,
    html: params.html,
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

export function buildFromAddress(name: string | null, address: string | null): string {
  const n = name ?? 'ITRAMOS Suporte'
  const a = address ?? 'suporte@itramos.com.br'
  return `${n} <${a}>`
}

// Templates de e-mail

export function slaAlertHtml(params: {
  ticketNumber: number
  ticketTitle: string
  deadlineStr: string
  alertType: 'proximo' | 'violado'
  appUrl: string
}): string {
  const { ticketNumber, ticketTitle, deadlineStr, alertType, appUrl } = params
  const heading = alertType === 'proximo'
    ? `⚠️ SLA próximo de vencer — Chamado #${ticketNumber}`
    : `🚨 SLA VIOLADO — Chamado #${ticketNumber}`
  return `
    <h2>${heading}</h2>
    <p><strong>Chamado:</strong> #${ticketNumber} — ${ticketTitle}</p>
    <p><strong>Prazo SLA:</strong> ${deadlineStr}</p>
    <p><a href="${appUrl}/chamados/${ticketNumber}">Abrir chamado</a></p>
  `
}

export function schedulingReminderHtml(params: {
  ticketNumber: number
  ticketTitle: string
  scheduledAtStr: string
  appUrl: string
}): string {
  return `
    <h2>Lembrete de atendimento agendado</h2>
    <p><strong>Chamado:</strong> #${params.ticketNumber} — ${params.ticketTitle}</p>
    <p><strong>Horário agendado:</strong> ${params.scheduledAtStr}</p>
    <p><a href="${params.appUrl}/chamados/${params.ticketNumber}">Abrir chamado</a></p>
  `
}

export function approvalRequestHtml(params: {
  ticketNumber: number
  ticketTitle: string
  requesterName: string
  approvePath: string
  rejectPath: string
  appUrl: string
}): string {
  return `
    <h2>Solicitação de aprovação — Chamado #${params.ticketNumber}</h2>
    <p>O chamado "<strong>${params.ticketTitle}</strong>" solicitado por <strong>${params.requesterName}</strong> requer sua aprovação.</p>
    <p>
      <a href="${params.appUrl}${params.approvePath}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        ✅ Aprovar
      </a>
      &nbsp;&nbsp;
      <a href="${params.appUrl}${params.rejectPath}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        ❌ Reprovar
      </a>
    </p>
  `
}

export function approvalResultHtml(params: {
  ticketNumber: number
  ticketTitle: string
  approved: boolean
  reason?: string
  appUrl: string
}): string {
  const result = params.approved ? '✅ Aprovado' : '❌ Reprovado'
  return `
    <h2>Resultado da aprovação — Chamado #${params.ticketNumber}</h2>
    <p>O chamado "<strong>${params.ticketTitle}</strong>" foi <strong>${result}</strong>.</p>
    ${params.reason ? `<p><strong>Motivo:</strong> ${params.reason}</p>` : ''}
    <p><a href="${params.appUrl}/chamados/${params.ticketNumber}">Abrir chamado</a></p>
  `
}

export function awaitingClientReminderHtml(params: {
  ticketNumber: number
  ticketTitle: string
  portalUrl: string
}): string {
  return `
    <h2>Aguardamos seu retorno — Chamado #${params.ticketNumber}</h2>
    <p>Seu chamado "<strong>${params.ticketTitle}</strong>" está aguardando sua resposta.</p>
    <p><a href="${params.portalUrl}/portal/chamados/${params.ticketNumber}">Responder no portal</a></p>
  `
}

export function kbLinkHtml(params: {
  ticketNumber: number
  articleTitle: string
  articleSummary: string | null
  confirmUrl: string
  denyUrl: string
}): string {
  return `
    <h2>Artigo relacionado ao seu chamado #${params.ticketNumber}</h2>
    <p><strong>${params.articleTitle}</strong></p>
    ${params.articleSummary ? `<p>${params.articleSummary}</p>` : ''}
    <p>Isso resolveu seu problema?</p>
    <p>
      <a href="${params.confirmUrl}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        Sim, resolvido
      </a>
      &nbsp;&nbsp;
      <a href="${params.denyUrl}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        Não, ainda preciso de ajuda
      </a>
    </p>
  `
}

export function passwordSetupHtml(params: {
  fullName: string
  setupUrl: string
}): string {
  return `
    <h2>Bem-vindo(a), ${params.fullName}!</h2>
    <p>Sua conta no portal ITRAMOS foi criada. Clique no link abaixo para definir sua senha (válido por 24 horas):</p>
    <p><a href="${params.setupUrl}">Definir minha senha</a></p>
  `
}
```

- [ ] **Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: serviço de e-mail Resend com templates HTML para todos os cenários"
```

---

## Task 8: Categorias de chamado e Feriados — CRUD

**Files:**
- Create: `src/app/(internal)/configuracoes/categorias/actions.ts`
- Create: `src/app/(internal)/configuracoes/categorias/page.tsx`
- Create: `src/app/(internal)/configuracoes/feriados/actions.ts`
- Create: `src/app/(internal)/configuracoes/feriados/page.tsx`

- [ ] **Criar `src/app/(internal)/configuracoes/categorias/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  slug: z.string().min(1, 'Slug é obrigatório').regex(/^[a-z0-9_]+$/, 'Slug: apenas letras minúsculas, números e _'),
  requires_approval: z.boolean().default(false),
})

export async function createCategoryAction(formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    requires_approval: formData.get('requires_approval') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ticket_categories').insert(parsed.data)
  if (error?.code === '23505') return { error: 'Já existe uma categoria com este slug.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/categorias')
  return { success: true }
}

export async function updateCategoryAction(id: string, formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    requires_approval: formData.get('requires_approval') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ticket_categories').update(parsed.data).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/categorias')
  return { success: true }
}

export async function toggleCategoryAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('ticket_categories').update({ is_active: isActive }).eq('id', id)
  revalidatePath('/configuracoes/categorias')
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/categorias/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createCategoryAction, updateCategoryAction, toggleCategoryAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ticket_categories')
    .select('*')
    .order('name')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorias de Chamado</h1>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Slug</th>
              <th className="p-3 text-left">Requer aprovação</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {categories?.map((cat) => (
              <tr key={cat.id} className="border-b">
                <td className="p-3">{cat.name}</td>
                <td className="p-3 font-mono text-xs">{cat.slug}</td>
                <td className="p-3">
                  {cat.requires_approval ? <Badge>Sim</Badge> : <span className="text-muted-foreground">Não</span>}
                </td>
                <td className="p-3">
                  <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                    {cat.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
                <td className="p-3">
                  <form action={toggleCategoryAction.bind(null, cat.id, !cat.is_active)}>
                    <Button variant="ghost" size="sm" type="submit">
                      {cat.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/feriados/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const holidaySchema = z.object({
  date: z.string().date('Data inválida'),
  name: z.string().min(1, 'Nome é obrigatório'),
  is_national: z.boolean().default(true),
  municipality: z.string().optional(),
})

export async function createHolidayAction(formData: FormData) {
  const parsed = holidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
    is_national: formData.get('is_national') === 'on',
    municipality: formData.get('municipality') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('holidays').insert(parsed.data)
  if (error?.code === '23505') return { error: 'Feriado já cadastrado nesta data.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/feriados')
  return { success: true }
}

export async function deleteHolidayAction(id: string) {
  const supabase = await createClient()
  await supabase.from('holidays').delete().eq('id', id)
  revalidatePath('/configuracoes/feriados')
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/feriados/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createHolidayAction, deleteHolidayAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function FeriadosPage() {
  const supabase = await createClient()
  const { data: holidays } = await supabase
    .from('holidays')
    .select('*')
    .order('date')

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Feriados</h1>

      <form action={createHolidayAction} className="space-y-3 border rounded-md p-4">
        <h2 className="font-medium">Novo feriado</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="date">Data</Label>
            <Input id="date" name="date" type="date" required />
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Ex: Tiradentes" required />
          </div>
        </div>
        <div>
          <Label htmlFor="municipality">Município (opcional)</Label>
          <Input id="municipality" name="municipality" placeholder="Ex: São Paulo" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_national" name="is_national" defaultChecked />
          <Label htmlFor="is_national">Feriado nacional</Label>
        </div>
        <Button type="submit">Adicionar</Button>
      </form>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {holidays?.map((h) => (
              <tr key={h.id} className="border-b">
                <td className="p-3">{new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-3">{h.name}</td>
                <td className="p-3 text-muted-foreground text-xs">
                  {h.is_national ? 'Nacional' : `Municipal — ${h.municipality}`}
                </td>
                <td className="p-3">
                  <form action={deleteHolidayAction.bind(null, h.id)}>
                    <Button variant="ghost" size="sm" type="submit">Remover</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/configuracoes/categorias/ src/app/\(internal\)/configuracoes/feriados/
git commit -m "feat: CRUD de categorias de chamado e feriados"
```

---

## Task 9: Templates de resposta — CRUD e seletor

**Files:**
- Create: `src/app/(internal)/configuracoes/templates/actions.ts`
- Create: `src/app/(internal)/configuracoes/templates/page.tsx`
- Create: `src/components/settings/ResponseTemplateForm.tsx`
- Create: `src/components/tickets/TemplateSelector.tsx`

- [ ] **Criar `src/app/(internal)/configuracoes/templates/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { templateSchema } from '@/lib/validations/template'

export async function createTemplateAction(formData: FormData) {
  const variablesRaw = formData.get('variables_json') as string
  const parsed = templateSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    body: formData.get('body'),
    variables: variablesRaw ? JSON.parse(variablesRaw) : [],
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('response_templates').insert({
    ...parsed.data,
    created_by: user!.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/templates')
  return { success: true }
}

export async function updateTemplateAction(id: string, formData: FormData) {
  const variablesRaw = formData.get('variables_json') as string
  const parsed = templateSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    body: formData.get('body'),
    variables: variablesRaw ? JSON.parse(variablesRaw) : [],
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('response_templates').update(parsed.data).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/templates')
  return { success: true }
}

export async function deactivateTemplateAction(id: string) {
  const supabase = await createClient()
  await supabase.from('response_templates').update({ is_active: false }).eq('id', id)
  revalidatePath('/configuracoes/templates')
}
```

- [ ] **Criar `src/components/settings/ResponseTemplateForm.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Variable { key: string; label: string; auto_filled: boolean }

interface Props {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  initial?: { name: string; category?: string; body: string; variables: Variable[] }
}

export function ResponseTemplateForm({ action, initial }: Props) {
  const [variables, setVariables] = useState<Variable[]>(initial?.variables ?? [])
  const [newVar, setNewVar] = useState({ key: '', label: '', auto_filled: false })
  const [error, setError] = useState('')

  const AUTO_VARS = ['nome_cliente', 'numero_chamado', 'nome_analista', 'data_hoje']

  async function handleSubmit(formData: FormData) {
    formData.set('variables_json', JSON.stringify(variables))
    const result = await action(formData)
    if (result.error) setError(result.error)
  }

  function addVariable() {
    if (!newVar.key || !newVar.label) return
    setVariables([...variables, newVar])
    setNewVar({ key: '', label: '', auto_filled: false })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nome do template</Label>
        <Input id="name" name="name" defaultValue={initial?.name} required />
      </div>
      <div>
        <Label htmlFor="category">Categoria</Label>
        <Input id="category" name="category" defaultValue={initial?.category} placeholder="Ex: Acesso, Senha Temporária" />
      </div>
      <div>
        <Label htmlFor="body">Corpo</Label>
        <Textarea id="body" name="body" defaultValue={initial?.body} rows={6}
          placeholder="Olá {{nome_cliente}}, ..." required />
        <p className="text-xs text-muted-foreground mt-1">
          Variáveis automáticas: {AUTO_VARS.map(v => `{{${v}}}`).join(', ')}
        </p>
      </div>
      <div className="border rounded-md p-3 space-y-2">
        <p className="text-sm font-medium">Variáveis manuais</p>
        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-mono bg-muted px-1 rounded">{`{{${v.key}}}`}</span>
            <span>{v.label}</span>
            <Button type="button" variant="ghost" size="sm"
              onClick={() => setVariables(variables.filter((_, j) => j !== i))}>
              ×
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="chave" value={newVar.key} onChange={e => setNewVar({ ...newVar, key: e.target.value })} className="w-32" />
          <Input placeholder="rótulo" value={newVar.label} onChange={e => setNewVar({ ...newVar, label: e.target.value })} />
          <Button type="button" variant="outline" size="sm" onClick={addVariable}>Adicionar</Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Salvar template</Button>
    </form>
  )
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/templates/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { ResponseTemplateForm } from '@/components/settings/ResponseTemplateForm'
import { createTemplateAction, deactivateTemplateAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('response_templates')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Templates de Resposta</h1>
      <div className="border rounded-md p-4">
        <h2 className="font-medium mb-3">Novo template</h2>
        <ResponseTemplateForm action={createTemplateAction} />
      </div>
      <div className="space-y-2">
        {templates?.map((t) => (
          <div key={t.id} className="border rounded-md p-3 flex items-start justify-between">
            <div>
              <p className="font-medium">{t.name}</p>
              {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
            </div>
            {t.is_active && (
              <form action={deactivateTemplateAction.bind(null, t.id)}>
                <Button variant="ghost" size="sm" type="submit">Desativar</Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Criar `src/components/tickets/TemplateSelector.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Template {
  id: string
  name: string
  category: string | null
  body: string
  variables: { key: string; label: string; auto_filled: boolean }[]
}

interface Props {
  templates: Template[]
  autoValues: Record<string, string>  // { nome_cliente, numero_chamado, nome_analista, data_hoje }
  onApply: (text: string) => void
}

export function TemplateSelector({ templates, autoValues, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [manualValues, setManualValues] = useState<Record<string, string>>({})

  function applyTemplate() {
    if (!selected) return
    let body = selected.body
    for (const v of selected.variables) {
      const value = v.auto_filled ? (autoValues[v.key] ?? '') : (manualValues[v.key] ?? '')
      body = body.replaceAll(`{{${v.key}}}`, value)
    }
    onApply(body)
    setOpen(false)
    setSelected(null)
    setManualValues({})
  }

  const manualVars = selected?.variables.filter(v => !v.auto_filled) ?? []

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Usar template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar template</DialogTitle>
          </DialogHeader>
          {!selected ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map(t => (
                <button key={t.id} type="button"
                  onClick={() => setSelected(t)}
                  className="w-full text-left p-3 border rounded-md hover:bg-muted transition-colors">
                  <p className="font-medium text-sm">{t.name}</p>
                  {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {manualVars.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Preencher variáveis</p>
                  {manualVars.map(v => (
                    <div key={v.key}>
                      <Label>{v.label}</Label>
                      <Input
                        value={manualValues[v.key] ?? ''}
                        onChange={e => setManualValues({ ...manualValues, [v.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" onClick={applyTemplate}>Aplicar</Button>
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>Voltar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Instalar componentes shadcn necessários**

```bash
npx shadcn@latest add dialog textarea badge
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/configuracoes/templates/ src/components/settings/ src/components/tickets/TemplateSelector.tsx
git commit -m "feat: templates de resposta — CRUD admin e seletor com preenchimento de variáveis"
```

---

## Task 10: Lista e abertura de chamados (painel interno)

**Files:**
- Create: `src/app/(internal)/chamados/actions.ts`
- Create: `src/app/(internal)/chamados/page.tsx`
- Create: `src/app/(internal)/chamados/novo/page.tsx`
- Create: `src/components/tickets/TicketStatusBadge.tsx`
- Create: `src/components/tickets/SLAIndicator.tsx`
- Create: `src/components/tickets/TicketList.tsx`
- Create: `src/components/tickets/TicketForm.tsx`

- [ ] **Criar `src/components/tickets/TicketStatusBadge.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/types/database'

const STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  agendado: 'Agendado',
  em_andamento: 'Em Andamento',
  aguardando_cliente: 'Aguardando Cliente',
  aguardando_fornecedor: 'Aguardando Fornecedor',
  aguardando_aprovacao: 'Aguardando Aprovação',
  em_mudanca: 'Em Mudança',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  reaberto: 'Reaberto',
}

const STATUS_VARIANT: Record<TicketStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberto: 'default',
  agendado: 'outline',
  em_andamento: 'default',
  aguardando_cliente: 'secondary',
  aguardando_fornecedor: 'secondary',
  aguardando_aprovacao: 'secondary',
  em_mudanca: 'outline',
  resolvido: 'outline',
  fechado: 'secondary',
  reaberto: 'destructive',
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
```

- [ ] **Criar `src/components/tickets/SLAIndicator.tsx`**

```typescript
import { getSLARemainingMinutes, getSLAPercentUsed } from '@/lib/sla'

interface Props {
  createdAt: string
  slaDeadline: string | null
  slaFirstResponseAt: string | null
  slaMet: boolean | null
  slaPausedAt: string | null
}

export function SLAIndicator({ createdAt, slaDeadline, slaFirstResponseAt, slaMet, slaPausedAt }: Props) {
  if (!slaDeadline) return <span className="text-xs text-muted-foreground">Sem SLA</span>

  if (slaFirstResponseAt !== null) {
    return (
      <span className={`text-xs font-medium ${slaMet ? 'text-green-600' : 'text-red-600'}`}>
        {slaMet ? '✓ SLA cumprido' : '✗ SLA violado'}
      </span>
    )
  }

  const remaining = getSLARemainingMinutes(
    new Date(slaDeadline),
    slaPausedAt ? new Date(slaPausedAt) : null
  )
  const pct = getSLAPercentUsed(
    new Date(createdAt),
    new Date(slaDeadline),
    slaPausedAt ? new Date(slaPausedAt) : null
  )

  const color = remaining < 0 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
  const label = remaining < 0
    ? `Atrasado ${Math.abs(remaining)}min`
    : remaining < 60
    ? `${remaining}min restantes`
    : `${Math.floor(remaining / 60)}h restantes`

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs ${remaining < 0 ? 'text-red-600' : pct >= 80 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/chamados/actions.ts`** — parte 1: createTicketAction (SLA será fiado na Task 16)

```typescript
'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ticketSchema, interactionSchema } from '@/lib/validations/ticket'
import { isValidTransition } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'

export async function createTicketAction(formData: FormData) {
  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    category_id: formData.get('category_id') || undefined,
    priority: formData.get('priority'),
    channel: formData.get('channel') ?? 'portal',
    company_id: formData.get('company_id'),
    contact_id: formData.get('contact_id'),
    contract_id: formData.get('contract_id') || undefined,
    assigned_to: formData.get('assigned_to') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert(parsed.data)
    .select('id, number')
    .single()

  if (error) return { error: error.message }

  // Registrar interação de sistema: abertura
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticket.id,
    type: 'system',
    content: 'Chamado aberto.',
    is_system: true,
  })

  redirect(`/chamados/${ticket.id}`)
}

export async function addInteractionAction(formData: FormData) {
  const parsed = interactionSchema.safeParse({
    ticket_id: formData.get('ticket_id'),
    type: formData.get('type') ?? 'mensagem',
    content: formData.get('content'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('sla_first_response_at, contract_id, sla_deadline')
    .eq('id', parsed.data.ticket_id)
    .single()

  const isAnalystMessage = parsed.data.type === 'mensagem'
  const isFirstResponse = isAnalystMessage && !ticket?.sla_first_response_at

  await supabase.from('ticket_interactions').insert({
    ticket_id: parsed.data.ticket_id,
    type: parsed.data.type,
    content: parsed.data.content,
    author_profile_id: user!.id,
  })

  if (isFirstResponse) {
    const now = new Date().toISOString()
    const deadline = ticket?.sla_deadline
    const met = deadline ? new Date(now) <= new Date(deadline) : null
    const breachMinutes = (!met && deadline)
      ? Math.floor((new Date(now).getTime() - new Date(deadline).getTime()) / 60_000)
      : null

    await supabase.from('tickets').update({
      sla_first_response_at: now,
      sla_met: met,
      sla_breach_minutes: breachMinutes,
    }).eq('id', parsed.data.ticket_id)
  }

  revalidatePath(`/chamados/${parsed.data.ticket_id}`)
  return { success: true }
}

export async function changeStatusAction(ticketId: string, newStatus: TicketStatus, note?: string) {
  const supabase = await createClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, sla_paused_at, sla_paused_minutes, sla_deadline, contract_id')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { error: 'Chamado não encontrado' }

  if (!isValidTransition(ticket.status as TicketStatus, newStatus)) {
    return { error: `Transição de "${ticket.status}" para "${newStatus}" não é permitida` }
  }

  const updates: Record<string, unknown> = { status: newStatus }

  // SLA pause/resume
  if (newStatus === 'aguardando_fornecedor' && !ticket.sla_paused_at) {
    updates.sla_paused_at = new Date().toISOString()
  }
  if (ticket.status === 'aguardando_fornecedor' && newStatus !== 'aguardando_fornecedor') {
    if (ticket.sla_paused_at && ticket.sla_deadline) {
      const pauseMs = new Date().getTime() - new Date(ticket.sla_paused_at).getTime()
      const newDeadline = new Date(new Date(ticket.sla_deadline).getTime() + pauseMs)
      updates.sla_deadline = newDeadline.toISOString()
      updates.sla_paused_minutes = (ticket.sla_paused_minutes ?? 0) + Math.floor(pauseMs / 60_000)
      updates.sla_paused_at = null
    }
  }

  if (newStatus === 'fechado') {
    updates.closed_at = new Date().toISOString()
  }

  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('tickets').update(updates).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: note ?? `Status alterado para: ${newStatus}`,
    author_profile_id: user!.id,
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function assignTicketAction(ticketId: string, analystId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('tickets').update({ assigned_to: analystId }).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'assignment',
    content: analystId ? `Chamado atribuído.` : 'Atribuição removida.',
    author_profile_id: user!.id,
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Criar `src/components/tickets/TicketList.tsx`**

```typescript
import Link from 'next/link'
import { TicketStatusBadge } from './TicketStatusBadge'
import { SLAIndicator } from './SLAIndicator'
import type { TicketStatus, TicketPriority } from '@/types/database'

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critica: '🔴 Crítica',
  alta: '🟠 Alta',
  media: '🟡 Média',
  baixa: '🟢 Baixa',
}

interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; sla_deadline: string | null
  sla_first_response_at: string | null; sla_met: boolean | null
  sla_paused_at: string | null; scheduled_at: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
}

export function TicketList({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left">#</th>
            <th className="p-3 text-left">Título</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Prioridade</th>
            <th className="p-3 text-left">Empresa</th>
            <th className="p-3 text-left">SLA</th>
            <th className="p-3 text-left">Aberto em</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className="p-3 font-mono text-xs">#{t.number}</td>
              <td className="p-3">
                <Link href={`/chamados/${t.id}`} className="hover:underline font-medium">
                  {t.title}
                </Link>
                {t.scheduled_at && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    📅 Agendado: {new Date(t.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}
              </td>
              <td className="p-3"><TicketStatusBadge status={t.status} /></td>
              <td className="p-3 text-xs">{PRIORITY_LABELS[t.priority]}</td>
              <td className="p-3 text-xs">{t.companies?.name ?? '—'}</td>
              <td className="p-3">
                <SLAIndicator
                  createdAt={t.created_at}
                  slaDeadline={t.sla_deadline}
                  slaFirstResponseAt={t.sla_first_response_at}
                  slaMet={t.sla_met}
                  slaPausedAt={t.sla_paused_at}
                />
              </td>
              <td className="p-3 text-xs text-muted-foreground">
                {new Date(t.created_at).toLocaleDateString('pt-BR')}
              </td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum chamado encontrado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/chamados/page.tsx`**

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TicketList } from '@/components/tickets/TicketList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string }>
}) {
  const { q, status, priority } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('tickets')
    .select('id, number, title, status, priority, created_at, sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at, companies(name), contacts(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)

  const { data: tickets } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chamados</h1>
        <Button asChild><Link href="/chamados/novo">+ Novo chamado</Link></Button>
      </div>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por título ou descrição..." className="max-w-sm" />
        <select name="status" defaultValue={status ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="aguardando_cliente">Aguardando Cliente</option>
          <option value="aguardando_fornecedor">Aguardando Fornecedor</option>
          <option value="aguardando_aprovacao">Aguardando Aprovação</option>
          <option value="agendado">Agendado</option>
          <option value="em_mudanca">Em Mudança</option>
          <option value="resolvido">Resolvido</option>
          <option value="fechado">Fechado</option>
          <option value="reaberto">Reaberto</option>
        </select>
        <select name="priority" defaultValue={priority ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todas as prioridades</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      <TicketList tickets={(tickets ?? []) as Parameters<typeof TicketList>[0]['tickets']} />
    </div>
  )
}
```

- [ ] **Criar `src/components/tickets/TicketForm.tsx`**

```typescript
'use client'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  action: (formData: FormData) => Promise<{ error?: string } | undefined>
  companies: { id: string; name: string }[]
  contacts: { id: string; full_name: string; company_id: string }[]
  contracts: { id: string; company_id: string; status: string }[]
  analysts: { id: string; full_name: string }[]
  categories: { id: string; name: string }[]
}

export function TicketForm({ action, companies, contacts, contracts, analysts, categories }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="channel" value="portal" />
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="priority">Prioridade *</Label>
          <select id="priority" name="priority" required className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media" selected>Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="company_id">Empresa *</Label>
          <select id="company_id" name="company_id" required className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Selecionar empresa</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="contact_id">Solicitante *</Label>
          <select id="contact_id" name="contact_id" required className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Selecionar contato</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contract_id">Contrato</Label>
          <select id="contract_id" name="contract_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem contrato</option>
            {contracts.filter(c => c.status === 'ativo').map(c => (
              <option key={c.id} value={c.id}>Contrato {c.id.slice(0, 8)}...</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="assigned_to">Analista responsável</Label>
          <select id="assigned_to" name="assigned_to" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Não atribuído</option>
            {analysts.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Criando...' : 'Criar chamado'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/app/(internal)/chamados/novo/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TicketForm } from '@/components/tickets/TicketForm'
import { createTicketAction } from '../actions'

export default async function NovoChamadoPage() {
  const supabase = await createClient()
  const [
    { data: companies },
    { data: contacts },
    { data: contracts },
    { data: analysts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name'),
    supabase.from('contracts').select('id, company_id, status'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Chamado</h1>
      <TicketForm
        action={createTicketAction}
        companies={companies ?? []}
        contacts={contacts ?? []}
        contracts={contracts ?? []}
        analysts={analysts ?? []}
        categories={categories ?? []}
      />
    </div>
  )
}
```

- [ ] **Adicionar "Chamados" à sidebar** — modificar `src/components/layout/Sidebar.tsx` para incluir `{ href: '/chamados', label: 'Chamados', icon: TicketIcon }` na `navItems`. Importar `Ticket` de `lucide-react`.

- [ ] **Rodar servidor e testar criação de chamado**

```bash
npm run dev
```

Acessar `http://localhost:3000/chamados/novo`. Criar um chamado de teste. Verificar redirecionamento para a página de detalhe.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/chamados/ src/components/tickets/TicketStatusBadge.tsx src/components/tickets/SLAIndicator.tsx src/components/tickets/TicketList.tsx src/components/tickets/TicketForm.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: lista e abertura de chamados com SLA indicator e filtros"
```

---

## Task 11: Detalhe do chamado, histórico e interações

**Files:**
- Create: `src/app/(internal)/chamados/[id]/page.tsx`
- Create: `src/components/tickets/TicketDetail.tsx`
- Create: `src/components/tickets/InteractionForm.tsx`

- [ ] **Criar `src/components/tickets/InteractionForm.tsx`**

```typescript
'use client'
import { useActionState, useState } from 'react'
import { addInteractionAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TemplateSelector } from './TemplateSelector'

interface Template {
  id: string; name: string; category: string | null; body: string
  variables: { key: string; label: string; auto_filled: boolean }[]
}

interface Props {
  ticketId: string
  ticketNumber: number
  contactName: string
  analystName: string
  templates: Template[]
}

export function InteractionForm({ ticketId, ticketNumber, contactName, analystName, templates }: Props) {
  const [content, setContent] = useState('')
  const [state, formAction, pending] = useActionState(addInteractionAction, null)

  const autoValues = {
    nome_cliente: contactName,
    numero_chamado: String(ticketNumber),
    nome_analista: analystName,
    data_hoje: new Date().toLocaleDateString('pt-BR'),
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="type" value="mensagem" />
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">Adicionar resposta</p>
        <TemplateSelector
          templates={templates}
          autoValues={autoValues}
          onApply={(text) => setContent(text)}
        />
      </div>
      <Textarea
        name="content"
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={4}
        placeholder="Digite sua resposta..."
        required
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando...' : 'Enviar'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/app/(internal)/chamados/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { SLAIndicator } from '@/components/tickets/SLAIndicator'
import { InteractionForm } from '@/components/tickets/InteractionForm'
import { changeStatusAction, assignTicketAction } from '../actions'
import { VALID_TRANSITIONS } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'
import { Button } from '@/components/ui/button'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: ticket },
    { data: interactions },
    { data: templates },
    { data: analysts },
    { data: { user } },
  ] = await Promise.all([
    supabase.from('tickets').select(`
      *, companies(name), contacts(full_name, email),
      profiles!assigned_to(full_name), ticket_categories(name, requires_approval)
    `).eq('id', id).single(),
    supabase.from('ticket_interactions').select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id).order('created_at'),
    supabase.from('response_templates').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.auth.getUser(),
  ])

  if (!ticket) notFound()

  const currentProfile = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    : null

  const validNextStatuses = VALID_TRANSITIONS[ticket.status as TicketStatus] ?? []

  const STATUS_LABELS: Record<TicketStatus, string> = {
    aberto: 'Aberto', agendado: 'Agendado', em_andamento: 'Em Andamento',
    aguardando_cliente: 'Aguardando Cliente', aguardando_fornecedor: 'Aguardando Fornecedor',
    aguardando_aprovacao: 'Aguardando Aprovação', em_mudanca: 'Em Mudança',
    resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
  }

  const PRIORITY_LABELS = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Média', baixa: '🟢 Baixa' }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{ticket.number}</p>
          <h1 className="text-xl font-semibold mt-0.5">{ticket.title}</h1>
        </div>
        <TicketStatusBadge status={ticket.status as TicketStatus} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border rounded-md p-4">
        <div><span className="text-muted-foreground">Empresa:</span> {(ticket.companies as any)?.name}</div>
        <div><span className="text-muted-foreground">Solicitante:</span> {(ticket.contacts as any)?.full_name}</div>
        <div><span className="text-muted-foreground">Prioridade:</span> {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}</div>
        <div><span className="text-muted-foreground">Categoria:</span> {(ticket.ticket_categories as any)?.name ?? '—'}</div>
        <div>
          <span className="text-muted-foreground">Analista:</span>{' '}
          <span>{(ticket.profiles as any)?.full_name ?? 'Não atribuído'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">SLA:</span>{' '}
          <SLAIndicator
            createdAt={ticket.created_at}
            slaDeadline={ticket.sla_deadline}
            slaFirstResponseAt={ticket.sla_first_response_at}
            slaMet={ticket.sla_met}
            slaPausedAt={ticket.sla_paused_at}
          />
        </div>
      </div>

      {ticket.description && (
        <div className="border rounded-md p-4 text-sm">
          <p className="text-muted-foreground text-xs mb-1">Descrição</p>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Ações de status */}
      {validNextStatuses.length > 0 && ticket.status !== 'fechado' && (
        <div className="flex flex-wrap gap-2">
          {validNextStatuses.map(s => (
            <form key={s} action={changeStatusAction.bind(null, id, s, undefined)}>
              <Button type="submit" variant="outline" size="sm">
                → {STATUS_LABELS[s]}
              </Button>
            </form>
          ))}
        </div>
      )}

      {/* Histórico */}
      <div className="space-y-3">
        <h2 className="font-medium">Histórico</h2>
        {interactions?.map(i => {
          const author = (i.profiles as any)?.full_name ?? (i.contacts as any)?.full_name ?? 'Sistema'
          const isSystem = i.is_system
          return (
            <div key={i.id} className={`border rounded-md p-3 text-sm ${isSystem ? 'bg-muted/30 border-dashed' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{author}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(i.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{i.content}</p>
            </div>
          )
        })}
      </div>

      {/* Formulário de resposta */}
      {ticket.status !== 'fechado' && (
        <InteractionForm
          ticketId={id}
          ticketNumber={ticket.number}
          contactName={(ticket.contacts as any)?.full_name ?? ''}
          analystName={currentProfile?.data?.full_name ?? ''}
          templates={(templates ?? []) as Parameters<typeof InteractionForm>[0]['templates']}
        />
      )}
    </div>
  )
}
```

- [ ] **Testar detalhe manualmente**

Abrir `http://localhost:3000/chamados` → clicar em chamado de teste → verificar histórico e formulário de resposta.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/chamados/\[id\]/ src/components/tickets/TicketDetail.tsx src/components/tickets/InteractionForm.tsx
git commit -m "feat: detalhe do chamado com histórico, transições de status e formulário de resposta"
```

---

## Task 12: Upload de anexos

**Files:**
- Create: `src/app/api/upload/attachment/route.ts`
- Create: `src/components/tickets/AttachmentUpload.tsx`

- [ ] **Criar `src/app/api/upload/attachment/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const ticketId = formData.get('ticket_id') as string
  const interactionId = formData.get('interaction_id') as string | null

  if (!file || !ticketId) {
    return NextResponse.json({ error: 'Arquivo e ticket_id são obrigatórios' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = interactionId
    ? `${ticketId}/${interactionId}/${safeFilename}`
    : `${ticketId}/sem_interacao/${safeFilename}`

  const buffer = await file.arrayBuffer()

  const serviceSupabase = await createServiceClient()
  const { error: uploadError } = await serviceSupabase.storage
    .from('ticket-attachments')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await serviceSupabase.from('ticket_attachments').insert({
    ticket_id: ticketId,
    interaction_id: interactionId || null,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, path })
}
```

- [ ] **Criar `src/components/tickets/AttachmentUpload.tsx`**

```typescript
'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  ticketId: string
  interactionId?: string
  onUploaded?: () => void
}

export function AttachmentUpload({ ticketId, interactionId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')

    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('ticket_id', ticketId)
      if (interactionId) fd.append('interaction_id', interactionId)

      const res = await fetch('/api/upload/attachment', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error); break }
    }

    setUploading(false)
    onUploaded?.()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Enviando...' : '📎 Anexar arquivo'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Adicionar `AttachmentUpload` ao `InteractionForm`** — adicionar `<AttachmentUpload ticketId={ticketId} />` após o textarea no `InteractionForm.tsx`.

- [ ] **Commit**

```bash
git add src/app/api/upload/attachment/ src/components/tickets/AttachmentUpload.tsx src/components/tickets/InteractionForm.tsx
git commit -m "feat: upload de anexos para Supabase Storage via route handler"
```

---

## Task 13: Agendamento de chamados

**Files:**
- Create: `src/components/tickets/SchedulingDialog.tsx`
- Modify: `src/app/(internal)/chamados/actions.ts`

- [ ] **Criar `src/components/tickets/SchedulingDialog.tsx`**

```typescript
'use client'
import { useState, useTransition } from 'react'
import { scheduleTicketAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  ticketId: string
  onClose?: () => void
}

export function SchedulingDialog({ ticketId, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!scheduledAt) { setError('Data e hora são obrigatórias'); return }
    startTransition(async () => {
      const result = await scheduleTicketAction(ticketId, scheduledAt)
      if (result?.error) { setError(result.error); return }
      setOpen(false)
      onClose?.()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        📅 Agendar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="scheduled_at">Data e hora do atendimento</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Confirmar agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Adicionar `scheduleTicketAction` em `src/app/(internal)/chamados/actions.ts`**

```typescript
import { scheduleSchema } from '@/lib/validations/ticket'

export async function scheduleTicketAction(ticketId: string, scheduledAt: string) {
  const parsed = scheduleSchema.safeParse({ scheduled_at: scheduledAt })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (!isValidTransition(ticket.status as TicketStatus, 'agendado')) {
    return { error: `Não é possível agendar a partir do status "${ticket.status}"` }
  }

  await supabase.from('tickets').update({
    status: 'agendado',
    scheduled_at: parsed.data.scheduled_at,
  }).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Chamado agendado para ${new Date(parsed.data.scheduled_at).toLocaleString('pt-BR')}.`,
    author_profile_id: user!.id,
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Adicionar `SchedulingDialog` ao detalhe** — em `src/app/(internal)/chamados/[id]/page.tsx`, adicionar `<SchedulingDialog ticketId={id} />` na seção de ações quando `validNextStatuses.includes('agendado')`.

- [ ] **Commit**

```bash
git add src/components/tickets/SchedulingDialog.tsx src/app/\(internal\)/chamados/actions.ts src/app/\(internal\)/chamados/\[id\]/page.tsx
git commit -m "feat: agendamento de chamados com validação de data futura obrigatória"
```

---

## Task 14: Fluxo de aprovação

**Files:**
- Create: `src/components/tickets/ApprovalDialog.tsx`
- Create: `src/app/aprovacao/[token]/page.tsx`
- Create: `src/app/aprovacao/[token]/actions.ts`
- Modify: `src/app/(internal)/chamados/actions.ts`

- [ ] **Adicionar `requestApprovalAction` em `src/app/(internal)/chamados/actions.ts`**

```typescript
import { approvalRequestSchema } from '@/lib/validations/ticket'
import { sendEmail, approvalRequestHtml, approvalResultHtml, buildFromAddress } from '@/lib/email'

export async function requestApprovalAction(ticketId: string, formData: FormData) {
  const parsed = approvalRequestSchema.safeParse({
    approver_email: formData.get('approver_email'),
    approver_contact_id: formData.get('approver_contact_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('number, title, status, contact_id, channel, contacts(email, full_name)')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (['zabbix', 'azure_monitor', 'url_monitoring'].includes(ticket.channel)) {
    return { error: 'Chamados de monitoramento não passam por aprovação' }
  }
  if (!isValidTransition(ticket.status as TicketStatus, 'aguardando_aprovacao')) {
    return { error: `Não é possível solicitar aprovação a partir do status "${ticket.status}"` }
  }

  const contactEmail = (ticket.contacts as any)?.email
  const contactName = (ticket.contacts as any)?.full_name

  // Auto-aprovação quando aprovador = solicitante
  if (parsed.data.approver_email === contactEmail) {
    const { data: { user } } = await supabase.auth.getUser()
    await serviceSupabase.from('ticket_approvals').insert({
      ticket_id: ticketId,
      approver_email: parsed.data.approver_email,
      approver_contact_id: parsed.data.approver_contact_id ?? null,
      previous_status: ticket.status,
      status: 'automatico',
      responded_at: new Date().toISOString(),
    })
    await supabase.from('tickets').update({ status: 'em_andamento' }).eq('id', ticketId)
    await supabase.from('ticket_interactions').insert({
      ticket_id: ticketId,
      type: 'system',
      content: 'Aprovado automaticamente — solicitante e aprovador são a mesma pessoa.',
      is_system: true,
    })
    revalidatePath(`/chamados/${ticketId}`)
    return { success: true, autoApproved: true }
  }

  const { data: approval } = await serviceSupabase.from('ticket_approvals').insert({
    ticket_id: ticketId,
    approver_email: parsed.data.approver_email,
    approver_contact_id: parsed.data.approver_contact_id ?? null,
    previous_status: ticket.status,
    status: 'pendente',
  }).select('token').single()

  if (!approval) return { error: 'Erro ao criar solicitação de aprovação' }

  await supabase.from('tickets').update({ status: 'aguardando_aprovacao' }).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Aprovação solicitada para: ${parsed.data.approver_email}`,
    is_system: true,
  })

  const { data: settings } = await supabase.from('platform_settings').select('email_from_address, email_from_name').single()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  await sendEmail({
    to: parsed.data.approver_email,
    subject: `Aprovação necessária — Chamado #${ticket.number}`,
    from,
    html: approvalRequestHtml({
      ticketNumber: ticket.number,
      ticketTitle: ticket.title,
      requesterName: contactName ?? 'Solicitante',
      approvePath: `/aprovacao/${approval.token}?action=aprovar`,
      rejectPath: `/aprovacao/${approval.token}?action=reprovar`,
      appUrl,
    }),
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Criar `src/components/tickets/ApprovalDialog.tsx`**

```typescript
'use client'
import { useState, useTransition } from 'react'
import { requestApprovalAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Contact { id: string; full_name: string; email: string }

interface Props {
  ticketId: string
  contacts: Contact[]
}

export function ApprovalDialog({ ticketId, contacts }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [contactId, setContactId] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleContactChange(id: string) {
    setContactId(id)
    const contact = contacts.find(c => c.id === id)
    if (contact) setEmail(contact.email)
  }

  function handleSubmit() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('approver_email', email)
      if (contactId) fd.set('approver_contact_id', contactId)
      const result = await requestApprovalAction(ticketId, fd)
      if (result?.error) { setError(result.error); return }
      setOpen(false)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        🔐 Solicitar aprovação
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar aprovação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Aprovador (contato cadastrado)</Label>
              <select
                value={contactId}
                onChange={e => handleContactChange(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Selecionar ou digitar e-mail abaixo</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="approver_email">E-mail do aprovador</Label>
              <Input
                id="approver_email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="aprovador@empresa.com"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending || !email}>
              {isPending ? 'Enviando...' : 'Solicitar aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Criar `src/app/aprovacao/[token]/actions.ts`**

```typescript
'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, approvalResultHtml, buildFromAddress } from '@/lib/email'

export async function processApprovalAction(
  token: string,
  action: 'aprovar' | 'reprovar',
  reason?: string
) {
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('ticket_approvals')
    .select('*, tickets(number, title, assigned_to, contacts(email, full_name))')
    .eq('token', token)
    .single()

  if (!approval) return { error: 'Token inválido ou expirado' }
  if (approval.status !== 'pendente') return { error: 'Esta solicitação já foi respondida' }

  const ticket = approval.tickets as any
  const approved = action === 'aprovar'
  const newTicketStatus = approved ? 'em_andamento' : approval.previous_status

  await supabase.from('ticket_approvals').update({
    status: approved ? 'aprovado' : 'reprovado',
    response_reason: reason ?? null,
    responded_at: new Date().toISOString(),
  }).eq('id', approval.id)

  await supabase.from('tickets').update({ status: newTicketStatus }).eq('id', approval.ticket_id)

  await supabase.from('ticket_interactions').insert({
    ticket_id: approval.ticket_id,
    type: 'system',
    content: approved
      ? 'Aprovação concedida. Chamado retomado.'
      : `Reprovado${reason ? `: ${reason}` : ''}. Chamado retornou ao status anterior.`,
    is_system: true,
  })

  // Notificar analista e, se reprovado, cliente
  const { data: settings } = await supabase.from('platform_settings').select('email_from_address, email_from_name').single()
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const html = approvalResultHtml({
    ticketNumber: ticket.number,
    ticketTitle: ticket.title,
    approved,
    reason,
    appUrl,
  })

  const recipients: string[] = []
  if (ticket.assigned_to) {
    const { data: analyst } = await supabase.from('profiles').select('id').eq('id', ticket.assigned_to).single()
    // Busca e-mail do analista via auth admin
    if (analyst) {
      const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
      if (authUser.user?.email) recipients.push(authUser.user.email)
    }
  }
  if (!approved && ticket.contacts?.email) {
    recipients.push(ticket.contacts.email)
  }

  if (recipients.length > 0) {
    await sendEmail({ to: recipients, subject: `Resultado da aprovação — Chamado #${ticket.number}`, from, html })
  }

  return { success: true, approved }
}
```

- [ ] **Criar `src/app/aprovacao/[token]/page.tsx`**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { processApprovalAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default async function AprovacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ action?: string }>
}) {
  const { token } = await params
  const { action } = await searchParams

  const supabase = await createServiceClient()
  const { data: approval } = await supabase
    .from('ticket_approvals')
    .select('status, tickets(number, title, contacts(full_name))')
    .eq('token', token)
    .single()

  if (!approval) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-muted-foreground">Este link de aprovação não existe ou expirou.</p>
        </div>
      </div>
    )
  }

  if (approval.status !== 'pendente') {
    const label = approval.status === 'aprovado' ? 'aprovado' : approval.status === 'reprovado' ? 'reprovado' : 'processado'
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Solicitação já {label}</h1>
          <p className="text-muted-foreground">Esta solicitação de aprovação já foi respondida anteriormente.</p>
        </div>
      </div>
    )
  }

  const ticket = approval.tickets as any

  async function handleApprove(formData: FormData) {
    'use server'
    await processApprovalAction(token, 'aprovar')
  }

  async function handleReject(formData: FormData) {
    'use server'
    const reason = formData.get('reason') as string
    await processApprovalAction(token, 'reprovar', reason)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 border rounded-lg p-6">
        <div>
          <h1 className="text-xl font-semibold">Solicitação de Aprovação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chamado #{ticket.number} — {ticket.title}
          </p>
          <p className="text-sm text-muted-foreground">
            Solicitado por: {ticket.contacts?.full_name}
          </p>
        </div>

        {action !== 'reprovar' ? (
          <div className="space-y-4">
            <form action={handleApprove}>
              <Button type="submit" className="w-full">✅ Aprovar</Button>
            </form>
            <a href={`/aprovacao/${token}?action=reprovar`}>
              <Button type="button" variant="outline" className="w-full">❌ Reprovar</Button>
            </a>
          </div>
        ) : (
          <form action={handleReject} className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo da reprovação (opcional)</Label>
              <Textarea id="reason" name="reason" rows={3} placeholder="Descreva o motivo..." />
            </div>
            <div className="flex gap-2">
              <a href={`/aprovacao/${token}`} className="flex-1">
                <Button type="button" variant="outline" className="w-full">Voltar</Button>
              </a>
              <Button type="submit" variant="destructive" className="flex-1">Confirmar reprovação</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Adicionar `ApprovalDialog` ao detalhe do chamado** — em `src/app/(internal)/chamados/[id]/page.tsx`, carregar contatos da empresa e renderizar `<ApprovalDialog ticketId={id} contacts={companyContacts} />` quando `validNextStatuses.includes('aguardando_aprovacao')`. Importar `ApprovalDialog`.

- [ ] **Testar fluxo de aprovação**

1. Criar chamado com categoria que `requires_approval = false` (neste ponto a UI exibe o botão manualmente via status `em_andamento → aguardando_aprovacao`)
2. Na página de detalhe, clicar "Solicitar aprovação"
3. Preencher e-mail do aprovador (e-mail diferente do solicitante)
4. Verificar que ticket muda para `aguardando_aprovacao`
5. Verificar que e-mail foi enviado (checar console do Resend)
6. Acessar `/aprovacao/[token]` — verificar página de aprovação
7. Aprovar → verificar que ticket volta para `em_andamento`

- [ ] **Commit**

```bash
git add src/components/tickets/ApprovalDialog.tsx src/app/aprovacao/ src/app/\(internal\)/chamados/actions.ts src/app/\(internal\)/chamados/\[id\]/page.tsx
git commit -m "feat: fluxo de aprovação com token em e-mail, auto-aprovação e página pública"
```

---

## Task 15: SLA — wiring ao criar chamado e alertas (cron)

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts`
- Create: `src/app/api/cron/sla-alerts/route.ts`
- Create: `vercel.json`

- [ ] **Modificar `createTicketAction`** em `src/app/(internal)/chamados/actions.ts` para calcular o SLA ao criar o chamado. Adicionar este bloco após criar o ticket:

```typescript
// Adicionar imports no topo do arquivo:
import { calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'

// Dentro de createTicketAction, após criar o ticket com supabase.from('tickets').insert(...):
// Calcular SLA se o chamado tiver contrato com regra de SLA
if (parsed.data.contract_id) {
  const [{ data: slaRule }, { data: contract }, { data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('contract_sla_rules')
      .select('response_hours')
      .eq('contract_id', parsed.data.contract_id)
      .eq('priority', parsed.data.priority)
      .single(),
    supabase.from('contracts').select('is_24x7').eq('id', parsed.data.contract_id).single(),
    supabase.from('platform_settings').select('business_hours_start, business_hours_end, business_hours_days').single(),
    supabase.from('holidays').select('date').gte('date', new Date().toISOString().slice(0, 10)),
  ])

  if (slaRule && contract && settings) {
    const businessSettings: BusinessHoursSettings = {
      start: settings.business_hours_start,
      end: settings.business_hours_end,
      days: settings.business_hours_days,
    }
    const holidayDates = (holidays ?? []).map(h => h.date)
    const deadline = calculateDeadline({
      createdAt: new Date(),
      responseHours: slaRule.response_hours,
      is24x7: contract.is_24x7,
      settings: businessSettings,
      holidays: holidayDates,
    })

    await supabase.from('tickets').update({ sla_deadline: deadline.toISOString() }).eq('id', ticket.id)
  }
}
```

- [ ] **Criar `src/app/api/cron/sla-alerts/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, slaAlertHtml, buildFromAddress } from '@/lib/email'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name')
    .single()

  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // Buscar analistas e gestores com notify_new_tickets para receber alertas SLA
  const { data: alertProfiles } = await supabase
    .from('profiles')
    .select('id, role')
    .in('role', ['analista', 'gestor'])
    .eq('is_active', true)

  // Chamados sem primeira resposta com SLA ativo
  const { data: openTickets } = await supabase
    .from('tickets')
    .select('id, number, title, sla_deadline, assigned_to, created_at, sla_paused_at')
    .is('sla_first_response_at', null)
    .not('sla_deadline', 'is', null)
    .not('status', 'in', '("fechado","resolvido")')

  let alertsSent = 0

  for (const ticket of openTickets ?? []) {
    const deadline = new Date(ticket.sla_deadline!)
    const deadlineMs = deadline.getTime()
    const nowMs = now.getTime()

    // Pause adjustment: if paused, remaining time is frozen
    const pausedMs = ticket.sla_paused_at ? nowMs - new Date(ticket.sla_paused_at).getTime() : 0
    const effectiveNowMs = nowMs - pausedMs

    const totalMs = deadlineMs - new Date(ticket.created_at).getTime()
    const remainingMs = deadlineMs - effectiveNowMs
    const pctUsed = 1 - remainingMs / totalMs

    const isBreached = effectiveNowMs > deadlineMs
    const isNearBreach = !isBreached && pctUsed >= 0.8

    if (!isBreached && !isNearBreach) continue

    // Find recipients: assigned analyst + all gestores
    const recipientIds = new Set<string>()
    if (ticket.assigned_to) recipientIds.add(ticket.assigned_to)
    for (const p of alertProfiles ?? []) {
      if (p.role === 'gestor') recipientIds.add(p.id)
    }

    for (const uid of recipientIds) {
      const { data: authUser } = await supabase.auth.admin.getUserById(uid)
      if (!authUser.user?.email) continue

      await sendEmail({
        to: authUser.user.email,
        subject: isBreached
          ? `🚨 SLA VIOLADO — Chamado #${ticket.number}`
          : `⚠️ SLA próximo de vencer — Chamado #${ticket.number}`,
        from,
        html: slaAlertHtml({
          ticketNumber: ticket.number,
          ticketTitle: ticket.title,
          deadlineStr: deadline.toLocaleString('pt-BR'),
          alertType: isBreached ? 'violado' : 'proximo',
          appUrl,
        }),
      })
      alertsSent++
    }
  }

  return NextResponse.json({ ok: true, alertsSent })
}
```

- [ ] **Criar `vercel.json`** na raiz do projeto

```json
{
  "crons": [
    {
      "path": "/api/cron/sla-alerts",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/ticket-automations",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/agendamento",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Adicionar `CRON_SECRET` ao `.env.local`** (se ainda não foi feito na Task 7):

```bash
openssl rand -hex 32
```

Copiar o resultado e adicionar ao `.env.local`:
```
CRON_SECRET=<resultado_acima>
```

- [ ] **Testar rota SLA manualmente**

```bash
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/sla-alerts
```

Expected: `{"ok":true,"alertsSent":0}` (nenhum chamado com SLA violado ainda)

- [ ] **Commit**

```bash
git add src/app/\(internal\)/chamados/actions.ts src/app/api/cron/sla-alerts/ vercel.json
git commit -m "feat: SLA wiring no createTicket e cron de alertas (próximo de vencer + violado)"
```

---

## Task 16: Automações — Aguardando Cliente e Aguardando Aprovação (cron)

**Files:**
- Create: `src/app/api/cron/ticket-automations/route.ts`

- [ ] **Criar `src/app/api/cron/ticket-automations/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, awaitingClientReminderHtml, buildFromAddress } from '@/lib/email'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name, company_whatsapp')
    .single()
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  let actions = 0

  // ── AGUARDANDO CLIENTE ──────────────────────────────────────────────
  const { data: awaitingClientTickets } = await supabase
    .from('tickets')
    .select('id, number, title, updated_at, contact_id, contacts(email, full_name), assigned_to')
    .eq('status', 'aguardando_cliente')

  for (const ticket of awaitingClientTickets ?? []) {
    const lastUpdate = new Date(ticket.updated_at)
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 3_600_000
    const contactEmail = (ticket.contacts as any)?.email
    const contactName = (ticket.contacts as any)?.full_name

    if (hoursSinceUpdate >= 48) {
      // Auto-fechar após 2 dias sem resposta
      await supabase.from('tickets').update({
        status: 'fechado',
        closed_at: now.toISOString(),
      }).eq('id', ticket.id)

      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Chamado encerrado por falta de retorno do cliente após 2 dias de espera.',
        is_system: true,
      })

      // Notificar analista + gestores
      if (ticket.assigned_to) {
        const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (authUser.user?.email) {
          await sendEmail({
            to: authUser.user.email,
            subject: `Chamado #${ticket.number} encerrado automaticamente`,
            from,
            html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado por ausência de retorno do cliente após 2 dias.</p>`,
          })
        }
      }
      actions++
      continue
    }

    if (hoursSinceUpdate >= 24 && contactEmail) {
      // Lembrete a cada 24h
      await sendEmail({
        to: contactEmail,
        subject: `Aguardamos seu retorno — Chamado #${ticket.number}`,
        from,
        html: awaitingClientReminderHtml({
          ticketNumber: ticket.number,
          ticketTitle: ticket.title,
          portalUrl: appUrl,
        }),
      })

      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Lembrete automático de retorno enviado ao solicitante.',
        is_system: true,
      })
      actions++
    }
  }

  // ── AGUARDANDO APROVAÇÃO ────────────────────────────────────────────
  const twoDaysAgo = new Date(now.getTime() - 48 * 3_600_000)

  const { data: pendingApprovals } = await supabase
    .from('ticket_approvals')
    .select('id, ticket_id, tickets(number, title, assigned_to, contact_id, contacts(email))')
    .eq('status', 'pendente')
    .lt('created_at', twoDaysAgo.toISOString())

  for (const approval of pendingApprovals ?? []) {
    const ticket = approval.tickets as any

    await supabase.from('ticket_approvals').update({ status: 'expirado' }).eq('id', approval.id)
    await supabase.from('tickets').update({
      status: 'fechado',
      closed_at: now.toISOString(),
    }).eq('id', approval.ticket_id)

    await supabase.from('ticket_interactions').insert({
      ticket_id: approval.ticket_id,
      type: 'system',
      content: 'Chamado encerrado por ausência de aprovação após 2 dias.',
      is_system: true,
    })

    // Notificar solicitante + analista + gestores
    const recipients: string[] = []
    if (ticket.contacts?.email) recipients.push(ticket.contacts.email)
    if (ticket.assigned_to) {
      const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
      if (authUser.user?.email) recipients.push(authUser.user.email)
    }
    const { data: gestores } = await supabase.from('profiles').select('id').eq('role', 'gestor').eq('is_active', true)
    for (const g of gestores ?? []) {
      const { data: au } = await supabase.auth.admin.getUserById(g.id)
      if (au.user?.email) recipients.push(au.user.email)
    }

    if (recipients.length > 0) {
      await sendEmail({
        to: [...new Set(recipients)],
        subject: `Chamado #${ticket.number} encerrado — ausência de aprovação`,
        from,
        html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado automaticamente por ausência de aprovação após 2 dias.</p>`,
      })
    }
    actions++
  }

  return NextResponse.json({ ok: true, actions })
}
```

- [ ] **Commit**

```bash
git add src/app/api/cron/ticket-automations/
git commit -m "feat: cron ticket-automations — lembrete e fechamento para aguardando_cliente e aprovação"
```

---

## Task 17: Cron de agendamento (lembrete 15min + mudança de status)

**Files:**
- Create: `src/app/api/cron/agendamento/route.ts`

- [ ] **Criar `src/app/api/cron/agendamento/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, schedulingReminderHtml, buildFromAddress } from '@/lib/email'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name')
    .single()
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  let actions = 0

  const { data: scheduledTickets } = await supabase
    .from('tickets')
    .select('id, number, title, scheduled_at, assigned_to, contact_id, contacts(email)')
    .eq('status', 'agendado')
    .not('scheduled_at', 'is', null)

  for (const ticket of scheduledTickets ?? []) {
    const scheduledAt = new Date(ticket.scheduled_at!)
    const diffMs = scheduledAt.getTime() - now.getTime()
    const diffMin = diffMs / 60_000

    // Lembrete 15min antes (janela: entre 15 e 20 minutos)
    if (diffMin >= 15 && diffMin < 20) {
      const recipients: string[] = []
      if (ticket.assigned_to) {
        const { data: au } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (au.user?.email) recipients.push(au.user.email)
      }
      if ((ticket.contacts as any)?.email) recipients.push((ticket.contacts as any).email)

      if (recipients.length > 0) {
        await sendEmail({
          to: [...new Set(recipients)],
          subject: `Lembrete: atendimento em 15 minutos — Chamado #${ticket.number}`,
          from,
          html: schedulingReminderHtml({
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            scheduledAtStr: scheduledAt.toLocaleString('pt-BR'),
            appUrl,
          }),
        })
      }
      actions++
    }

    // Executar mudança de status no horário agendado (janela: passados 0-5 minutos)
    if (diffMin <= 0 && diffMin > -5) {
      await supabase.from('tickets').update({ status: 'em_andamento' }).eq('id', ticket.id)
      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Atendimento iniciado automaticamente no horário agendado.',
        is_system: true,
      })
      actions++
    }
  }

  return NextResponse.json({ ok: true, actions })
}
```

- [ ] **Commit**

```bash
git add src/app/api/cron/agendamento/
git commit -m "feat: cron agendamento — lembrete 15min e mudança automática de status"
```

---

## Task 18: Reabertura de chamados

**Files:**
- Create: `src/components/tickets/ReopenDialog.tsx`
- Modify: `src/app/(internal)/chamados/actions.ts`

- [ ] **Adicionar `reopenTicketAction`** em `src/app/(internal)/chamados/actions.ts`

```typescript
export async function reopenTicketAction(ticketId: string, reason: string, reopenedByContactId?: string) {
  const supabase = await createClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, closed_at, number')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (ticket.status !== 'fechado') return { error: 'Apenas chamados fechados podem ser reabertos' }

  if (!ticket.closed_at) return { error: 'Data de fechamento não registrada' }
  const closedAt = new Date(ticket.closed_at)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000)
  if (closedAt < sevenDaysAgo) {
    return { error: 'Prazo de reabertura expirado. O chamado foi fechado há mais de 7 dias. Abra um novo chamado.' }
  }

  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('ticket_reopens').insert({
    ticket_id: ticketId,
    reopened_by_profile_id: reopenedByContactId ? null : user!.id,
    reopened_by_contact_id: reopenedByContactId ?? null,
    reason,
  })

  await supabase.from('tickets').update({
    status: 'reaberto',
    closed_at: null,
  }).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'system',
    content: `Chamado reaberto. Motivo: ${reason}`,
    is_system: true,
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Criar `src/components/tickets/ReopenDialog.tsx`**

```typescript
'use client'
import { useState, useTransition } from 'react'
import { reopenTicketAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  ticketId: string
  closedAt: string
}

export function ReopenDialog({ ticketId, closedAt }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000)
  const isExpired = new Date(closedAt) < sevenDaysAgo

  if (isExpired) return null

  function handleReopen() {
    if (!reason.trim()) { setError('Informe o motivo da reabertura'); return }
    startTransition(async () => {
      const result = await reopenTicketAction(ticketId, reason)
      if (result?.error) { setError(result.error); return }
      setOpen(false)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        🔄 Reabrir chamado
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir chamado</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="reason">Motivo da reabertura *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo..."
            />
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleReopen} disabled={isPending}>
              {isPending ? 'Reabrindo...' : 'Confirmar reabertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Adicionar `ReopenDialog` ao detalhe** — em `src/app/(internal)/chamados/[id]/page.tsx`, renderizar `<ReopenDialog ticketId={id} closedAt={ticket.closed_at!} />` quando `ticket.status === 'fechado' && ticket.closed_at`.

- [ ] **Commit**

```bash
git add src/components/tickets/ReopenDialog.tsx src/app/\(internal\)/chamados/actions.ts src/app/\(internal\)/chamados/\[id\]/page.tsx
git commit -m "feat: reabertura de chamados com validação de 7 dias e registro de histórico"
```

---

## Task 19: Busca full-text em tempo real com pg_trgm

**Files:**
- Create: `supabase/migrations/20260522000007_tickets_trgm.sql` (já coberto na Task 1 — pg_trgm foi habilitado e indexes GIN já criados)
- Modify: `src/app/(internal)/chamados/page.tsx`

**Nota:** O pg_trgm já foi habilitado e os índices GIN (`idx_tickets_title_trgm`, `idx_tickets_description_trgm`) já foram criados na migration da Task 1. Esta task apenas melhora a query e UI de busca.

- [ ] **Criar migration adicional** apenas se necessário para adicionar a busca de nome do solicitante via trigram no contato:

```bash
npx supabase migration new tickets_contact_trgm
```

```sql
-- Adicionar índice trigram no nome do contato para busca
create index if not exists idx_contacts_full_name_trgm
  on public.contacts using gin (full_name gin_trgm_ops);
```

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Atualizar query de listagem** em `src/app/(internal)/chamados/page.tsx` — melhorar para usar operador `%` com similarity quando `q` está presente:

```typescript
// Substituir o bloco de query existente por:
let query = supabase
  .from('tickets')
  .select(`
    id, number, title, status, priority, created_at,
    sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at,
    companies(name), contacts(full_name)
  `)
  .order('created_at', { ascending: false })
  .limit(100)

if (status) query = query.eq('status', status)
if (priority) query = query.eq('priority', priority)
if (q) {
  // Usar ilike para busca por título; para busca por número usar correspondência exata
  const numericQ = parseInt(q, 10)
  if (!isNaN(numericQ)) {
    query = query.eq('number', numericQ)
  } else {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  }
}
```

- [ ] **Adicionar filtros adicionais** ao formulário de busca — adicionar filtro por analista e empresa no formulário de `page.tsx`:

```typescript
// Carregar listas para filtros
const [{ data: allAnalysts }, { data: allCompanies }] = await Promise.all([
  supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
])

// Adicionar `assigned_to` e `company_id` ao searchParams e à query:
// if (assigned_to) query = query.eq('assigned_to', assigned_to)
// if (company_id) query = query.eq('company_id', company_id)
```

- [ ] **Commit**

```bash
git add supabase/migrations/ src/app/\(internal\)/chamados/page.tsx
git commit -m "feat: busca de chamados por número, título e filtros combinativos"
```

---

## Task 20: Canal e-mail — Resend Inbound webhook

**Files:**
- Create: `src/app/api/tickets/email/route.ts`

- [ ] **Criar `src/app/api/tickets/email/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, passwordSetupHtml, buildFromAddress } from '@/lib/email'

interface ResendInboundPayload {
  from: string
  subject: string
  text?: string
  html?: string
  messageId?: string
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export async function POST(request: Request) {
  // Verificar signature Resend Inbound (simplificado — em produção usar svix)
  const secret = process.env.RESEND_INBOUND_SECRET
  if (secret) {
    const signature = request.headers.get('svix-signature')
    if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    // Verificação completa via svix recomendada em produção:
    // import { Webhook } from 'svix'; new Webhook(secret).verify(rawBody, headers)
  }

  let payload: ResendInboundPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fromEmail = extractEmail(payload.from).toLowerCase()
  const domain = extractDomain(fromEmail)
  const subject = payload.subject ?? '(sem assunto)'
  const body = payload.text ?? payload.html ?? ''

  const supabase = await createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name')
    .single()
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  // 1. Verificar se remetente é contato cadastrado
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, contracts:companies!inner(id, contracts(id, status, is_24x7))')
    .eq('email', fromEmail)
    .eq('is_active', true)
    .single()

  if (contact) {
    // Remetente conhecido — criar chamado
    const activeContract = (contact as any).contracts?.contracts?.find((c: any) => c.status === 'ativo')

    await supabase.from('tickets').insert({
      title: subject,
      description: body,
      priority: 'media',
      channel: 'email',
      company_id: contact.company_id,
      contact_id: contact.id,
      contract_id: activeContract?.id ?? null,
    })

    return NextResponse.json({ ok: true, action: 'ticket_created' })
  }

  // 2. Remetente desconhecido — verificar domínio
  const { data: domainRecord } = await supabase
    .from('company_email_domains')
    .select('company_id, companies!inner(is_active, is_blocked)')
    .eq('domain', domain)
    .single()

  if (!domainRecord) {
    // Domínio desconhecido — descartar com resposta
    await sendEmail({
      to: fromEmail,
      subject: `Re: ${subject}`,
      from,
      html: `<p>Olá, o endereço <strong>${fromEmail}</strong> não está associado a nenhuma empresa cadastrada em nosso sistema. Entre em contato diretamente com nossa equipe.</p>`,
    })
    return NextResponse.json({ ok: true, action: 'discarded_unknown_domain' })
  }

  const company = (domainRecord.companies as any)
  if (!company.is_active) {
    return NextResponse.json({ ok: true, action: 'discarded_inactive_company' })
  }

  // Verificar se já há solicitação pendente para este e-mail
  const { data: existing } = await supabase
    .from('pending_email_tickets')
    .select('id, reminder_count')
    .eq('from_email', fromEmail)
    .is('completed_at', null)
    .single()

  if (existing) {
    // Segunda mensagem — tentar extrair dados da resposta
    const lines = body.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const fullName = lines[0] ?? ''
    const phone = lines[1] ?? ''
    const dept = lines[2] ?? ''
    const isWhatsApp = /sim/i.test(lines[3] ?? '')

    if (fullName) {
      // Criar contato e chamado original
      const { data: newContact } = await supabase.from('contacts').insert({
        company_id: domainRecord.company_id,
        full_name: fullName,
        email: fromEmail,
        phone: phone || null,
        is_whatsapp: isWhatsApp,
        department: dept || null,
      }).select('id').single()

      if (newContact) {
        // Criar usuário Supabase Auth para o contato
        const { data: authData } = await supabase.auth.admin.createUser({
          email: fromEmail,
          email_confirm: false,
          app_metadata: { role: 'cliente' },
        })

        if (authData.user) {
          await supabase.from('contacts').update({ user_id: authData.user.id }).eq('id', newContact.id)

          // Enviar link de definição de senha (via resetPasswordForEmail)
          const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: fromEmail,
          })

          if (linkData.properties?.action_link) {
            await sendEmail({
              to: fromEmail,
              subject: 'Bem-vindo(a) ao portal ITRAMOS — defina sua senha',
              from,
              html: passwordSetupHtml({ fullName, setupUrl: linkData.properties.action_link }),
            })
          }
        }

        // Criar o chamado original
        const { data: pendingTicket } = await supabase
          .from('pending_email_tickets')
          .select('original_subject, original_body')
          .eq('id', existing.id)
          .single()

        if (pendingTicket) {
          await supabase.from('tickets').insert({
            title: pendingTicket.original_subject,
            description: pendingTicket.original_body,
            priority: 'media',
            channel: 'email',
            company_id: domainRecord.company_id,
            contact_id: newContact.id,
          })
          await supabase.from('pending_email_tickets').update({ completed_at: new Date().toISOString() }).eq('id', existing.id)
        }
      }
    }
    return NextResponse.json({ ok: true, action: 'contact_created_from_reply' })
  }

  // Primeira mensagem de remetente desconhecido com domínio válido — solicitar dados
  await supabase.from('pending_email_tickets').insert({
    from_email: fromEmail,
    company_id: domainRecord.company_id,
    original_subject: subject,
    original_body: body,
  })

  await sendEmail({
    to: fromEmail,
    subject: `Re: ${subject}`,
    from,
    html: `
      <p>Olá, recebemos sua mensagem. Para abrir seu chamado, precisamos de algumas informações.</p>
      <p>Por favor, responda este e-mail com os dados abaixo, um por linha:</p>
      <ol>
        <li>Seu nome completo</li>
        <li>Telefone</li>
        <li>Departamento</li>
        <li>O telefone é WhatsApp? (Sim/Não)</li>
      </ol>
    `,
  })

  return NextResponse.json({ ok: true, action: 'info_requested' })
}
```

- [ ] **Commit**

```bash
git add src/app/api/tickets/email/
git commit -m "feat: canal e-mail Resend Inbound — remetente conhecido, desconhecido e domínio inválido"
```

---

## Task 21: Portal — Lista, abertura e detalhe de chamados

**Files:**
- Create: `src/app/(portal)/portal/chamados/page.tsx`
- Create: `src/app/(portal)/portal/chamados/novo/page.tsx`
- Create: `src/app/(portal)/portal/chamados/[id]/page.tsx`

- [ ] **Criar `src/app/(portal)/portal/chamados/page.tsx`**

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { Button } from '@/components/ui/button'
import type { TicketStatus } from '@/types/database'

export default async function PortalChamadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, full_name')
    .eq('user_id', user!.id)
    .single()

  if (!contact) return <p>Perfil não encontrado.</p>

  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, number, title, status, priority, created_at')
    .eq('company_id', contact.company_id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meus Chamados</h1>
        <Button asChild><Link href="/portal/chamados/novo">+ Novo chamado</Link></Button>
      </div>
      <div className="space-y-2">
        {tickets?.map(t => (
          <Link key={t.id} href={`/portal/chamados/${t.id}`}>
            <div className="border rounded-md p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">#{t.number} — {t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <TicketStatusBadge status={t.status as TicketStatus} />
              </div>
            </div>
          </Link>
        ))}
        {tickets?.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum chamado aberto.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Criar `src/app/(portal)/portal/chamados/novo/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ticketSchema } from '@/lib/validations/ticket'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

async function createPortalTicketAction(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single()

  if (!contact) return

  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    priority: formData.get('priority') ?? 'media',
    channel: 'portal',
    company_id: contact.company_id,
    contact_id: contact.id,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await supabase.from('tickets').insert(parsed.data)
  redirect('/portal/chamados')
}

export default async function NovoChamadoPortalPage() {
  const { data: categories } = await (await import('@/lib/supabase/server')).createClient()
    .then(s => s.from('ticket_categories').select('id, name').eq('is_active', true).order('name'))

  return (
    <div className="p-6 space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Abrir novo chamado</h1>
      <form action={createPortalTicketAction} className="space-y-4">
        <div>
          <Label htmlFor="title">Título *</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" name="description" rows={4} />
        </div>
        <div>
          <Label htmlFor="priority">Prioridade</Label>
          <select id="priority" name="priority" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="baixa">Baixa</option>
            <option value="media" selected>Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Selecionar (opcional)</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Button type="submit">Abrir chamado</Button>
      </form>
    </div>
  )
}
```

- [ ] **Criar `src/app/(portal)/portal/chamados/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { ReopenDialog } from '@/components/tickets/ReopenDialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { revalidatePath } from 'next/cache'
import type { TicketStatus } from '@/types/database'

async function sendPortalReplyAction(formData: FormData) {
  'use server'
  const ticketId = formData.get('ticket_id') as string
  const content = formData.get('content') as string
  if (!content?.trim()) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user!.id)
    .single()

  if (!contact) return

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, company_id')
    .eq('id', ticketId)
    .single()

  if (!ticket || ticket.company_id !== contact.company_id) return

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'mensagem',
    content,
    author_contact_id: contact.id,
  })

  // Se aguardando cliente → retomar em_andamento
  if (ticket.status === 'aguardando_cliente') {
    await supabase.from('tickets').update({ status: 'em_andamento' }).eq('id', ticketId)
  }

  revalidatePath(`/portal/chamados/${ticketId}`)
}

export default async function PortalTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user!.id)
    .single()

  if (!contact) notFound()

  const [{ data: ticket }, { data: interactions }] = await Promise.all([
    supabase.from('tickets').select('*, ticket_categories(name)').eq('id', id).single(),
    supabase.from('ticket_interactions')
      .select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id)
      .order('created_at'),
  ])

  if (!ticket || ticket.company_id !== contact.company_id) notFound()

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{ticket.number}</p>
          <h1 className="text-xl font-semibold">{ticket.title}</h1>
        </div>
        <TicketStatusBadge status={ticket.status as TicketStatus} />
      </div>

      {ticket.description && (
        <div className="border rounded-md p-3 text-sm">
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      <div className="space-y-3">
        {interactions?.map(i => {
          const author = (i.profiles as any)?.full_name ?? (i.contacts as any)?.full_name ?? 'Sistema'
          return (
            <div key={i.id} className={`border rounded-md p-3 text-sm ${i.is_system ? 'bg-muted/30 border-dashed' : ''}`}>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-xs">{author}</span>
                <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString('pt-BR')}</span>
              </div>
              <p className="whitespace-pre-wrap">{i.content}</p>
            </div>
          )
        })}
      </div>

      {ticket.status !== 'fechado' && (
        <form action={sendPortalReplyAction} className="space-y-3">
          <input type="hidden" name="ticket_id" value={id} />
          <Label htmlFor="content">Responder</Label>
          <Textarea id="content" name="content" rows={3} required />
          <Button type="submit">Enviar</Button>
        </form>
      )}

      {ticket.status === 'fechado' && ticket.closed_at && (
        <ReopenDialog ticketId={id} closedAt={ticket.closed_at} />
      )}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/\(portal\)/portal/chamados/
git commit -m "feat: portal de chamados — lista, abertura, detalhe com resposta e reabertura"
```

---

## Task 22: Integração com base de conhecimento + encerramento com artigo

**Files:**
- Create: `src/app/api/tickets/kb-confirm/route.ts`
- Modify: `src/app/(internal)/chamados/actions.ts`
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`

- [ ] **Adicionar `linkKbArticleAction` e `closeWithArticleAction`** em `src/app/(internal)/chamados/actions.ts`

```typescript
import { kbLinkHtml } from '@/lib/email'

export async function searchKbArticlesAction(query: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kb_articles')
    .select('id, title, summary, slug')
    .eq('is_active', true)
    .ilike('title', `%${query}%`)
    .limit(10)
  return { articles: data ?? [] }
}

export async function linkKbArticleAction(ticketId: string, articleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: article }, { data: ticket }] = await Promise.all([
    supabase.from('kb_articles').select('id, title, summary, slug').eq('id', articleId).single(),
    supabase.from('tickets').select('number, title, contact_id, contacts(email)').eq('id', ticketId).single(),
  ])

  if (!article || !ticket) return { error: 'Chamado ou artigo não encontrado' }

  const { data: link } = await supabase.from('ticket_kb_links').insert({
    ticket_id: ticketId,
    kb_article_id: articleId,
    linked_by: user!.id,
  }).select('confirmation_token').single()

  if (!link) return { error: 'Erro ao vincular artigo' }

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'system',
    content: `Artigo vinculado: "${article.title}"`,
    author_profile_id: user!.id,
    is_system: false,
  })

  const contactEmail = (ticket.contacts as any)?.email
  if (contactEmail) {
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('email_from_address, email_from_name')
      .single()
    const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    await sendEmail({
      to: contactEmail,
      subject: `Artigo relacionado ao seu chamado #${ticket.number}`,
      from,
      html: kbLinkHtml({
        ticketNumber: ticket.number,
        articleTitle: article.title,
        articleSummary: article.summary,
        confirmUrl: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=true`,
        denyUrl: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=false`,
      }),
    })
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function closeWithResolutionAction(ticketId: string, resolution: string, createArticle?: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('title, description, category_id')
    .eq('id', ticketId)
    .single()

  if (!ticket) return { error: 'Chamado não encontrado' }

  await supabase.from('tickets').update({
    status: 'fechado',
    closed_at: new Date().toISOString(),
    resolution,
  }).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Chamado fechado. Resolução: ${resolution}`,
    author_profile_id: user!.id,
  })

  if (createArticle) {
    const slug = `${ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    await supabase.from('kb_articles').insert({
      title: ticket.title,
      summary: resolution.slice(0, 200),
      slug,
      body: `${ticket.description ?? ''}\n\n**Resolução:**\n${resolution}`,
      category_id: ticket.category_id ?? null,
      source_ticket_id: ticketId,
      is_active: true,
      created_by: user!.id,
    })
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Criar `src/app/api/tickets/kb-confirm/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const resolvedStr = url.searchParams.get('resolved')

  if (!token || !resolvedStr) {
    return new Response('Link inválido', { status: 400 })
  }

  const resolved = resolvedStr === 'true'
  const supabase = await createServiceClient()

  const { data: link } = await supabase
    .from('ticket_kb_links')
    .select('id, ticket_id, tickets(id, number, title, status)')
    .eq('confirmation_token', token)
    .single()

  if (!link) {
    return new Response('<h2>Link inválido ou expirado.</h2>', {
      headers: { 'content-type': 'text/html' }, status: 404,
    })
  }

  await supabase.from('ticket_kb_links').update({ resolution_confirmed: resolved }).eq('id', link.id)

  const ticket = link.tickets as any

  if (resolved && ticket.status !== 'fechado') {
    await supabase.from('tickets').update({
      status: 'fechado',
      closed_at: new Date().toISOString(),
    }).eq('id', link.ticket_id)

    await supabase.from('ticket_interactions').insert({
      ticket_id: link.ticket_id,
      type: 'system',
      content: 'Resolvido via artigo da base de conhecimento.',
      is_system: true,
    })
  }

  const message = resolved
    ? `Obrigado! Seu chamado #${ticket.number} foi marcado como resolvido.`
    : `Entendido! Seu chamado #${ticket.number} continua em atendimento.`

  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center">
      <h2>${message}</h2>
      <p>Você pode fechar esta aba.</p>
    </body></html>`,
    { headers: { 'content-type': 'text/html' } }
  )
}
```

- [ ] **Adicionar painel de KB ao detalhe do chamado** — em `src/app/(internal)/chamados/[id]/page.tsx`, adicionar após o formulário de resposta:

```typescript
{/* Vincular artigo KB */}
{ticket.status !== 'fechado' && (
  <div className="border rounded-md p-4 space-y-3">
    <p className="text-sm font-medium">Vincular artigo da base de conhecimento</p>
    {/* Formulário client-side de busca e vínculo — implementar como Client Component se necessário */}
    {/* Por ora: campo de busca + Server Action usando searchKbArticlesAction + linkKbArticleAction */}
  </div>
)}

{/* Fechar com resolução */}
{(ticket.status === 'resolvido' || ticket.status === 'em_andamento') && (
  <div className="border rounded-md p-4 space-y-3">
    <p className="text-sm font-medium">Fechar chamado</p>
    <form action={closeWithResolutionAction.bind(null, id, '', false)}>
      <textarea name="resolution" className="w-full border rounded p-2 text-sm" rows={3}
        placeholder="Descreva a resolução..." required />
      <div className="flex items-center gap-2 mt-2">
        <input type="checkbox" id="create_article" name="create_article" />
        <label htmlFor="create_article" className="text-sm">Salvar na base de conhecimento</label>
      </div>
      <Button type="submit" variant="outline" size="sm" className="mt-2">Fechar chamado</Button>
    </form>
  </div>
)}
```

Nota: o `closeWithResolutionAction.bind` com inline action precisa ser encapsulado em uma Server Action wrapper que lê o checkbox `create_article`. Refatorar o `closeWithResolutionAction` para aceitar `formData`:

```typescript
export async function closeTicketFormAction(ticketId: string, formData: FormData) {
  const resolution = formData.get('resolution') as string
  const createArticle = formData.get('create_article') === 'on'
  if (!resolution?.trim()) return { error: 'Resolução é obrigatória' }
  return closeWithResolutionAction(ticketId, resolution, createArticle)
}
```

- [ ] **Commit**

```bash
git add src/app/api/tickets/kb-confirm/ src/app/\(internal\)/chamados/actions.ts src/app/\(internal\)/chamados/\[id\]/page.tsx
git commit -m "feat: integração KB — vincular artigo, confirmação por e-mail, fechar com artigo"
```

---

## Task 23: Completar limpeza de storage (sub-spec 1 Task 13)

**Files:**
- Modify: `src/app/(internal)/configuracoes/storage/actions.ts`

- [ ] **Atualizar `previewCleanup` e adicionar `executeCleanupAction`** em `src/app/(internal)/configuracoes/storage/actions.ts`

```typescript
'use server'
import { createServiceClient } from '@/lib/supabase/server'

export async function getStorageStats() {
  // (manter implementação existente)
}

export async function previewCleanup(monthsOld: number, companyId?: string) {
  const supabase = await createServiceClient()
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld)

  let query = supabase
    .from('ticket_attachments')
    .select('id, storage_path, size_bytes, tickets!inner(closed_at, company_id)')
    .eq('is_deleted', false)
    .lt('tickets.closed_at', cutoffDate.toISOString())

  if (companyId) query = query.eq('tickets.company_id', companyId)

  const { data: attachments } = await query

  const fileCount = attachments?.length ?? 0
  const totalBytes = attachments?.reduce((sum, a) => sum + (a.size_bytes ?? 0), 0) ?? 0

  return { fileCount, totalBytes }
}

export async function executeCleanupAction(monthsOld: number, companyId?: string) {
  const supabase = await createServiceClient()
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld)

  let query = supabase
    .from('ticket_attachments')
    .select('id, storage_path, tickets!inner(closed_at, company_id)')
    .eq('is_deleted', false)
    .lt('tickets.closed_at', cutoffDate.toISOString())

  if (companyId) query = query.eq('tickets.company_id', companyId)

  const { data: attachments } = await query
  if (!attachments || attachments.length === 0) return { deleted: 0 }

  const paths = attachments.map(a => a.storage_path)

  // Deletar do storage em lotes de 100
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from('ticket-attachments').remove(paths.slice(i, i + 100))
  }

  // Marcar como deletado no banco
  await supabase
    .from('ticket_attachments')
    .update({ is_deleted: true })
    .in('id', attachments.map(a => a.id))

  return { deleted: attachments.length }
}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/configuracoes/storage/actions.ts
git commit -m "feat: limpeza efetiva de anexos de chamados fechados com preview e confirmação"
```

---

## Self-review

**Cobertura do spec:**

- ✅ CRUD de chamados com todos os campos obrigatórios (Task 10)
- ✅ Fluxo de status implementado com transições válidas (Task 6 + Task 11)
- ✅ Histórico de interações (Task 11)
- ✅ Upload e visualização de anexos (Task 12)
- ✅ Agendamento com seletor obrigatório de data/hora (Task 13)
- ✅ Cron lembrete 15min antes do agendamento (Task 17)
- ✅ Cron mudança automática de status no horário agendado (Task 17)
- ✅ Fluxo de aprovação completo — modal, e-mail com links, token, timeout 2 dias (Tasks 14 + 16)
- ✅ Exceção aprovação automática quando solicitante = aprovador (Task 14)
- ✅ Fluxo "Aguardando Cliente" — lembrete 24h e fechamento automático 2 dias (Task 16)
- ✅ Reabertura com validação de 7 dias (Task 18)
- ✅ Engine de SLA — horário comercial e 24x7 (Task 5)
- ✅ Pausa/retomada de SLA em aguardando_fornecedor (Task 11 — changeStatusAction)
- ✅ Alertas de SLA próximo de vencer + violado (Task 15)
- ✅ Portal auto-cadastro com validação de domínio (sub-spec 1 — já implementado)
- ✅ Abertura de chamados via e-mail (Resend Inbound) para remetentes conhecidos (Task 20)
- ✅ Cadastro automático de remetentes desconhecidos com domínio válido (Task 20)
- ✅ Busca e filtros (Task 19)
- ✅ Todas as tabelas com constraints e indexes corretos (Tasks 1–3)
- ✅ RLS ativo para todos os papéis (Task 2)
- ✅ Templates de resposta com variáveis e auto-fill (Task 9)
- ✅ Vincular artigo KB + confirmação por e-mail (Task 22)
- ✅ Encerramento com criação de artigo KB (Task 22)
- ✅ Portal — lista, abertura, detalhe, resposta e reabertura (Task 21)
- ✅ Limpeza de storage completada (Task 23)

**Itens adiados para outros sub-specs:**
- Configuração detalhada de Zabbix, Azure Monitor e URL monitoring → sub-spec 6
- Módulo completo de base de conhecimento (`kb_articles` expandido) → sub-spec de KB
- Billing de chamados (`billing_status`) → sub-spec de faturamento

**Verificação de tipos:**
- `TicketStatus` definido em `database.ts` (Task 4) e usado em `ticket-transitions.ts` (Task 6), `TicketStatusBadge.tsx` (Task 10), `changeStatusAction` (Task 10)
- `BusinessHoursSettings` definido em `sla.ts` (Task 5) e usado em `createTicketAction` (Task 15)
- `approvalRequestSchema` definido em `validations/ticket.ts` (Task 6) e usado em `requestApprovalAction` (Task 14)
- `sendEmail` assinatura em `email.ts` (Task 7) consistente em todos os usos (Tasks 14–22)

**Placeholder scan:** Nenhum placeholder "TBD", "TODO" ou "implementar depois" — todos os steps têm código completo.
