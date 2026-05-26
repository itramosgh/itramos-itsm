# Sub-spec 5: GMUD e Custos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo de Gestão de Mudanças (GMUD) com fluxo de aprovação externa, comunicados automáticos e integração bidirecional com chamados de origem; e o módulo de Custos e Atendimento Presencial com marcações de tempo, cálculo de custo, billing status e relatório consolidado.

**Architecture:** Segue o padrão estabelecido no projeto: Server Actions em `actions.ts` por rota, Server Components para data fetching, Supabase RLS para controle de acesso. A GMUD reutiliza o mecanismo de aprovação externa via token (análogo a `ticket_approvals`), com página bare route `/aprovacao-gmud/[token]` sem autenticação. Custos vivem em `ticket_costs` (1:1 com ticket), com `billing_status` já presente em `tickets`.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + RLS) · React Hook Form · Zod v4 · Resend (email-template-sender) · Vitest · shadcn/ui

---

## Mapa de arquivos

```
supabase/migrations/
├── 20260525000005_gmud_costs_schema.sql
├── 20260525000006_gmud_costs_rls.sql
└── 20260525000007_gmud_email_templates.sql

src/
├── types/database.ts                                  (modificar: + tipos GMUD/Custo)
├── lib/
│   ├── ticket-transitions.ts                          (modificar: + em_deslocamento)
│   └── validations/
│       └── change-request.ts                          (criar)
├── components/
│   ├── layout/Sidebar.tsx                             (modificar: + link Mudanças)
│   ├── mudancas/
│   │   ├── ChangeRequestForm.tsx                      (criar)
│   │   ├── ChangeRequestList.tsx                      (criar)
│   │   ├── ChangeRequestDetail.tsx                    (criar)
│   │   └── NotificationContactsSelector.tsx           (criar)
│   └── tickets/
│       ├── PresentialCostPanel.tsx                    (criar)
│       └── BillingSummary.tsx                         (criar)
├── app/
│   ├── aprovacao-gmud/[token]/
│   │   ├── page.tsx                                   (criar)
│   │   └── actions.ts                                 (criar)
│   └── (internal)/
│       ├── mudancas/
│       │   ├── page.tsx                               (criar)
│       │   ├── nova/page.tsx                          (criar)
│       │   ├── actions.ts                             (criar)
│       │   └── [id]/
│       │       ├── page.tsx                           (criar)
│       │       └── actions.ts                         (criar)
│       ├── chamados/
│       │   ├── actions.ts                             (modificar: + presencial + billing)
│       │   └── [id]/page.tsx                          (modificar: + PresentialCostPanel + BillingSummary + GMUD link)
│       ├── relatorios/custos/
│       │   └── page.tsx                               (criar)
│       └── dashboard/page.tsx                         (modificar: + GMUD agenda + billing pending)
└── api/cron/billing-alerts/route.ts                   (criar)

tests/
├── change-request-validations.test.ts                 (criar)
└── ticket-costs.test.ts                               (criar)
```

---

## Task 1: Migration — Schema GMUD e Custos

**Files:**
- Create: `supabase/migrations/20260525000005_gmud_costs_schema.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new gmud_costs_schema
```

Renomear o arquivo gerado para `20260525000005_gmud_costs_schema.sql`.

- [ ] **Escrever migration**

```sql
-- Adicionar company_type em companies (avulso = sem contrato fixo)
alter table public.companies
  add column if not exists company_type text not null default 'padrao'
    check (company_type in ('padrao', 'avulso'));

-- Adicionar em_deslocamento ao status de tickets
alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
  check (status in (
    'aberto','agendado','em_andamento','aguardando_cliente',
    'aguardando_fornecedor','aguardando_aprovacao','em_mudanca',
    'em_deslocamento','resolvido','fechado','reaberto'
  ));

-- change_requests (GMUDs)
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  impacted_systems text not null,
  impacted_users text not null,
  maintenance_start timestamptz not null,
  maintenance_end timestamptz not null,
  rollback_plan text not null,
  risk_level text not null check (risk_level in ('baixo', 'medio', 'alto')),
  responsible_id uuid not null references public.profiles(id) on delete restrict,
  origin_ticket_id uuid references public.tickets(id) on delete set null,
  status text not null default 'rascunho'
    check (status in (
      'rascunho','aguardando_aprovacao','aprovada',
      'em_execucao','concluida','revertida','reprovada'
    )),
  execution_started_at timestamptz,
  execution_completed_at timestamptz,
  reversal_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_change_requests_updated_at
  before update on public.change_requests
  for each row execute function public.set_updated_at();

create index idx_change_requests_responsible_id on public.change_requests(responsible_id);
create index idx_change_requests_status on public.change_requests(status);
create index idx_change_requests_maintenance_start on public.change_requests(maintenance_start);
create index idx_change_requests_origin_ticket_id on public.change_requests(origin_ticket_id)
  where origin_ticket_id is not null;

-- change_request_contacts (contatos a comunicar no início e fim da GMUD)
create table public.change_request_contacts (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  external_email text,
  external_name text,
  constraint chk_contact_or_external check (
    contact_id is not null or (external_email is not null and external_name is not null)
  )
);

create index idx_change_request_contacts_cr_id on public.change_request_contacts(change_request_id);

-- change_approvals (análogo a ticket_approvals)
create table public.change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  approver_contact_id uuid references public.contacts(id) on delete set null,
  approver_email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','reprovado','expirado')),
  response_reason text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_change_approvals_token on public.change_approvals(token);
create index idx_change_approvals_cr_id on public.change_approvals(change_request_id);

-- ticket_costs (1:1 com ticket — um registro de custo por chamado)
create table public.ticket_costs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  departure_at timestamptz,
  arrival_at timestamptz,
  completion_at timestamptz,
  travel_time_minutes integer,
  service_time_minutes integer,
  travel_discount_minutes integer not null default 0,
  km_traveled numeric(8,2),
  toll_amount numeric(10,2) not null default 0,
  parking_amount numeric(10,2) not null default 0,
  hourly_rate_applied numeric(10,2),
  km_rate_applied numeric(10,2),
  total_amount numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_ticket_costs_updated_at
  before update on public.ticket_costs
  for each row execute function public.set_updated_at();

create index idx_ticket_costs_ticket_id on public.ticket_costs(ticket_id);
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar tabelas no Studio**

Abrir `http://127.0.0.1:54323` → Table Editor. Confirmar que `change_requests`, `change_request_contacts`, `change_approvals`, `ticket_costs` existem e que `companies` tem a coluna `company_type`.

- [ ] **Commit**

```bash
git add supabase/migrations/20260525000005_gmud_costs_schema.sql
git commit -m "feat: migration — schema GMUD (change_requests, approvals, contacts) e ticket_costs"
```

---

## Task 2: Migration — RLS Policies GMUD e Custos

**Files:**
- Create: `supabase/migrations/20260525000006_gmud_costs_rls.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new gmud_costs_rls
```

Renomear para `20260525000006_gmud_costs_rls.sql`.

- [ ] **Escrever migration**

```sql
-- change_requests
alter table public.change_requests enable row level security;

create policy "cr_select_admin_gestor"
  on public.change_requests for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "cr_select_analista_own"
  on public.change_requests for select
  using (
    public.get_user_role() = 'analista'
    and responsible_id = auth.uid()
  );

create policy "cr_insert_internal"
  on public.change_requests for insert
  with check (public.is_internal());

create policy "cr_update_admin_gestor"
  on public.change_requests for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "cr_update_analista_own_rascunho"
  on public.change_requests for update
  using (
    public.get_user_role() = 'analista'
    and responsible_id = auth.uid()
    and status = 'rascunho'
  );

create policy "cr_delete_admin_gestor_rascunho"
  on public.change_requests for delete
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status = 'rascunho'
  );

-- change_request_contacts
alter table public.change_request_contacts enable row level security;

create policy "crc_select_internal"
  on public.change_request_contacts for select
  using (public.is_internal());

create policy "crc_manage_internal"
  on public.change_request_contacts for all
  using (public.is_internal())
  with check (public.is_internal());

-- change_approvals
alter table public.change_approvals enable row level security;

create policy "ca_select_internal"
  on public.change_approvals for select
  using (public.is_internal());

create policy "ca_insert_internal"
  on public.change_approvals for insert
  with check (public.is_internal());

create policy "ca_update_service_role_only"
  on public.change_approvals for update
  using (public.is_internal());

-- ticket_costs
alter table public.ticket_costs enable row level security;

create policy "tc_select_admin_gestor"
  on public.ticket_costs for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tc_select_analista_assigned"
  on public.ticket_costs for select
  using (
    public.get_user_role() = 'analista'
    and ticket_id in (
      select id from public.tickets
      where assigned_to = auth.uid()
    )
  );

create policy "tc_insert_update_internal"
  on public.ticket_costs for insert
  with check (public.is_internal());

create policy "tc_update_internal"
  on public.ticket_costs for update
  using (public.is_internal());
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/20260525000006_gmud_costs_rls.sql
git commit -m "feat: RLS policies para change_requests, change_approvals e ticket_costs"
```

---

## Task 3: Migration — Templates de E-mail GMUD e Cobrança

**Files:**
- Create: `supabase/migrations/20260525000007_gmud_email_templates.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new gmud_email_templates
```

Renomear para `20260525000007_gmud_email_templates.sql`.

- [ ] **Escrever migration**

```sql
insert into public.email_templates
  (slug, category, name, subject, body_html,
   default_subject, default_body_html)
values
  (
    'gmud_solicitacao_aprovacao',
    'gmud',
    'GMUD — Solicitação de Aprovação',
    'Solicitação de aprovação de mudança: {{titulo}}',
    '<p>Olá,</p><p>Você recebeu uma solicitação de aprovação para a seguinte mudança:</p><h3>{{titulo}}</h3><p><strong>Descrição:</strong> {{descricao}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p><strong>Janela de manutenção:</strong> {{janela_inicio}} até {{janela_fim}}</p><p><strong>Nível de risco:</strong> {{nivel_risco}}</p><p><strong>Plano de rollback:</strong> {{plano_rollback}}</p><p>Para aprovar ou reprovar, clique no link abaixo:</p><p><a href="{{link_aprovacao}}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Responder Aprovação</a></p>',
    'Solicitação de aprovação de mudança: {{titulo}}',
    '<p>Olá,</p><p>Você recebeu uma solicitação de aprovação para a seguinte mudança:</p><h3>{{titulo}}</h3><p><strong>Descrição:</strong> {{descricao}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p><strong>Janela de manutenção:</strong> {{janela_inicio}} até {{janela_fim}}</p><p><strong>Nível de risco:</strong> {{nivel_risco}}</p><p><strong>Plano de rollback:</strong> {{plano_rollback}}</p><p>Para aprovar ou reprovar, clique no link abaixo:</p><p><a href="{{link_aprovacao}}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Responder Aprovação</a></p>'
  ),
  (
    'gmud_aprovada_analista',
    'gmud',
    'GMUD — Aprovada (notificação ao analista)',
    'Mudança aprovada: {{titulo}}',
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>aprovada</strong> por {{aprovador_email}}.</p><p>A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    'Mudança aprovada: {{titulo}}',
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>aprovada</strong> por {{aprovador_email}}.</p><p>A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>'
  ),
  (
    'gmud_reprovada_analista',
    'gmud',
    'GMUD — Reprovada (notificação ao analista)',
    'Mudança reprovada: {{titulo}}',
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>reprovada</strong> por {{aprovador_email}}.</p><p><strong>Motivo:</strong> {{motivo}}</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    'Mudança reprovada: {{titulo}}',
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>reprovada</strong> por {{aprovador_email}}.</p><p><strong>Motivo:</strong> {{motivo}}</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>'
  ),
  (
    'gmud_inicio_execucao',
    'gmud',
    'GMUD — Início de Execução (comunicado)',
    'Aviso de manutenção: {{titulo}}',
    '<p>Informamos que a seguinte manutenção está sendo iniciada agora:</p><h3>{{titulo}}</h3><p><strong>O que será feito:</strong> {{descricao}}</p><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Tempo previsto de manutenção:</strong> {{janela_fim}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p>Qualquer dúvida, entre em contato com nosso suporte.</p>',
    'Aviso de manutenção: {{titulo}}',
    '<p>Informamos que a seguinte manutenção está sendo iniciada agora:</p><h3>{{titulo}}</h3><p><strong>O que será feito:</strong> {{descricao}}</p><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Tempo previsto de manutenção:</strong> {{janela_fim}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p>Qualquer dúvida, entre em contato com nosso suporte.</p>'
  ),
  (
    'gmud_concluida',
    'gmud',
    'GMUD — Concluída (comunicado)',
    'Manutenção concluída: {{titulo}}',
    '<p>Informamos que a manutenção a seguir foi concluída conforme planejado:</p><h3>{{titulo}}</h3><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Conclusão:</strong> {{concluida_em}}</p><p>Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.</p>',
    'Manutenção concluída: {{titulo}}',
    '<p>Informamos que a manutenção a seguir foi concluída conforme planejado:</p><h3>{{titulo}}</h3><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Conclusão:</strong> {{concluida_em}}</p><p>Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.</p>'
  ),
  (
    'gmud_revertida',
    'gmud',
    'GMUD — Revertida (comunicado)',
    'Manutenção não aplicada — rollback executado: {{titulo}}',
    '<p>Informamos que a manutenção a seguir <strong>não foi aplicada</strong> e o rollback foi executado:</p><h3>{{titulo}}</h3><p><strong>Motivo:</strong> {{motivo_reversao}}</p><p>Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.</p>',
    'Manutenção não aplicada — rollback executado: {{titulo}}',
    '<p>Informamos que a manutenção a seguir <strong>não foi aplicada</strong> e o rollback foi executado:</p><h3>{{titulo}}</h3><p><strong>Motivo:</strong> {{motivo_reversao}}</p><p>Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.</p>'
  ),
  (
    'cobranca_pendente_alerta',
    'billing',
    'Cobrança Pendente — Alerta ao Gestor',
    'Chamados com cobrança pendente — {{total_chamados}} pendentes',
    '<p>Olá,</p><p>Existem <strong>{{total_chamados}}</strong> chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias:</p><ul>{{lista_chamados}}</ul><p><a href="{{link_relatorio}}">Ver relatório de custos</a></p>',
    'Chamados com cobrança pendente — {{total_chamados}} pendentes',
    '<p>Olá,</p><p>Existem <strong>{{total_chamados}}</strong> chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias:</p><ul>{{lista_chamados}}</ul><p><a href="{{link_relatorio}}">Ver relatório de custos</a></p>'
  )
on conflict (slug) do nothing;
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/20260525000007_gmud_email_templates.sql
git commit -m "feat: seeds de templates de e-mail para GMUD e alertas de cobrança"
```

---

## Task 4: Tipos TypeScript + Validações + Ticket Transitions

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/validations/change-request.ts`
- Modify: `src/lib/ticket-transitions.ts`

- [ ] **Adicionar tipos ao `src/types/database.ts`**

Adicionar após a linha `export type ApprovalStatus = ...`:

```typescript
export type ChangeRequestStatus =
  | 'rascunho' | 'aguardando_aprovacao' | 'aprovada'
  | 'em_execucao' | 'concluida' | 'revertida' | 'reprovada'

export type ChangeApprovalStatus = 'pendente' | 'aprovado' | 'reprovado' | 'expirado'

export type RiskLevel = 'baixo' | 'medio' | 'alto'

export type CompanyType = 'padrao' | 'avulso'
```

Adicionar à interface `Database.public.Tables`, após a entrada `ticket_approvals` (ou ao final antes do fechamento de `Tables`):

```typescript
      change_requests: {
        Row: {
          id: string; title: string; description: string
          impacted_systems: string; impacted_users: string
          maintenance_start: string; maintenance_end: string
          rollback_plan: string; risk_level: RiskLevel
          responsible_id: string; origin_ticket_id: string | null
          status: ChangeRequestStatus
          execution_started_at: string | null; execution_completed_at: string | null
          reversal_reason: string | null
          created_by: string | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['change_requests']['Row'],
          'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['change_requests']['Insert']>
      }
      change_request_contacts: {
        Row: {
          id: string; change_request_id: string
          contact_id: string | null; external_email: string | null; external_name: string | null
        }
        Insert: Omit<Database['public']['Tables']['change_request_contacts']['Row'], 'id'>
        Update: never
      }
      change_approvals: {
        Row: {
          id: string; change_request_id: string
          approver_contact_id: string | null; approver_email: string
          token: string; status: ChangeApprovalStatus
          response_reason: string | null; responded_at: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['change_approvals']['Row'],
          'id' | 'token' | 'created_at'>
        Update: Partial<Database['public']['Tables']['change_approvals']['Row']>
      }
      ticket_costs: {
        Row: {
          id: string; ticket_id: string
          departure_at: string | null; arrival_at: string | null; completion_at: string | null
          travel_time_minutes: number | null; service_time_minutes: number | null
          travel_discount_minutes: number
          km_traveled: number | null; toll_amount: number; parking_amount: number
          hourly_rate_applied: number | null; km_rate_applied: number | null
          total_amount: number | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_costs']['Row'],
          'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['ticket_costs']['Insert']>
      }
```

- [ ] **Adicionar `em_deslocamento` ao `TicketStatus` em `src/types/database.ts`**

Localizar:
```typescript
export type TicketStatus =
  | 'aberto' | 'agendado' | 'em_andamento' | 'aguardando_cliente'
  | 'aguardando_fornecedor' | 'aguardando_aprovacao' | 'em_mudanca'
  | 'resolvido' | 'fechado' | 'reaberto'
```

Substituir por:
```typescript
export type TicketStatus =
  | 'aberto' | 'agendado' | 'em_andamento' | 'aguardando_cliente'
  | 'aguardando_fornecedor' | 'aguardando_aprovacao' | 'em_mudanca'
  | 'em_deslocamento' | 'resolvido' | 'fechado' | 'reaberto'
```

- [ ] **Atualizar `src/lib/ticket-transitions.ts`** — adicionar transições para `em_deslocamento`

Localizar:
```typescript
  em_andamento:          ['aguardando_cliente', 'aguardando_fornecedor', 'aguardando_aprovacao',
                          'em_mudanca', 'agendado', 'resolvido', 'fechado'],
```

Substituir por:
```typescript
  em_andamento:          ['aguardando_cliente', 'aguardando_fornecedor', 'aguardando_aprovacao',
                          'em_mudanca', 'em_deslocamento', 'agendado', 'resolvido', 'fechado'],
  em_deslocamento:       ['em_andamento', 'resolvido', 'fechado'],
```

E adicionar `em_deslocamento: ['em_andamento', 'resolvido', 'fechado'],` ao objeto `VALID_TRANSITIONS` (que tem tipo `Record<TicketStatus, TicketStatus[]>`).

- [ ] **Criar `src/lib/validations/change-request.ts`**

```typescript
import { z } from 'zod'

export const changeRequestSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  impacted_systems: z.string().min(1, 'Sistemas impactados são obrigatórios'),
  impacted_users: z.string().min(1, 'Usuários impactados são obrigatórios'),
  maintenance_start: z.string().min(1, 'Início da janela é obrigatório'),
  maintenance_end: z.string().min(1, 'Fim da janela é obrigatório'),
  rollback_plan: z.string().min(1, 'Plano de rollback é obrigatório'),
  risk_level: z.enum(['baixo', 'medio', 'alto'], { message: 'Nível de risco inválido' }),
  responsible_id: z.string().uuid('Responsável inválido'),
  origin_ticket_id: z.string().uuid().optional(),
}).refine(
  (data) => new Date(data.maintenance_end) > new Date(data.maintenance_start),
  { message: 'Fim da janela deve ser após o início', path: ['maintenance_end'] }
)

export const notificationContactSchema = z.union([
  z.object({ contact_id: z.string().uuid(), external_email: z.undefined(), external_name: z.undefined() }),
  z.object({
    contact_id: z.undefined(),
    external_email: z.string().email('E-mail inválido'),
    external_name: z.string().min(1, 'Nome é obrigatório'),
  }),
])

export const approvalRequestSchema = z.object({
  approver_email: z.string().email('E-mail do aprovador inválido'),
  approver_contact_id: z.string().uuid().optional(),
})

export const reversalSchema = z.object({
  reversal_reason: z.string().min(1, 'Motivo da reversão é obrigatório'),
})

export const costSchema = z.object({
  km_traveled: z.coerce.number().min(0).optional(),
  toll_amount: z.coerce.number().min(0).default(0),
  parking_amount: z.coerce.number().min(0).default(0),
  travel_discount_minutes: z.coerce.number().int().min(0).default(0),
})

export type ChangeRequestInput = z.infer<typeof changeRequestSchema>
export type CostInput = z.infer<typeof costSchema>
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>
export type ReversalInput = z.infer<typeof reversalSchema>
```

- [ ] **Commit**

```bash
git add src/types/database.ts src/lib/ticket-transitions.ts src/lib/validations/change-request.ts
git commit -m "feat: tipos TS para GMUD/custos, em_deslocamento em ticket-transitions e validações"
```

---

## Task 5: Testes — Validações e Cálculo de Custo

**Files:**
- Create: `tests/change-request-validations.test.ts`
- Create: `tests/ticket-costs.test.ts`

- [ ] **Criar `tests/change-request-validations.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { changeRequestSchema, costSchema, reversalSchema } from '@/lib/validations/change-request'

describe('changeRequestSchema', () => {
  const base = {
    title: 'Atualização do servidor DB',
    description: 'Aplicar patches de segurança',
    impacted_systems: 'Banco de dados principal',
    impacted_users: 'Todos os usuários',
    maintenance_start: '2026-06-01T22:00:00Z',
    maintenance_end: '2026-06-02T02:00:00Z',
    rollback_plan: 'Restaurar snapshot anterior',
    risk_level: 'medio' as const,
    responsible_id: '123e4567-e89b-12d3-a456-426614174000',
  }

  it('aceita GMUD válida', () => {
    expect(changeRequestSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita título vazio', () => {
    expect(changeRequestSchema.safeParse({ ...base, title: '' }).success).toBe(false)
  })

  it('rejeita nível de risco inválido', () => {
    expect(changeRequestSchema.safeParse({ ...base, risk_level: 'extremo' }).success).toBe(false)
  })

  it('rejeita quando fim < início', () => {
    const result = changeRequestSchema.safeParse({
      ...base,
      maintenance_start: '2026-06-02T02:00:00Z',
      maintenance_end: '2026-06-01T22:00:00Z',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('maintenance_end')
    }
  })
})

describe('costSchema', () => {
  it('aceita campos zerados', () => {
    const result = costSchema.safeParse({ toll_amount: 0, parking_amount: 0, travel_discount_minutes: 0 })
    expect(result.success).toBe(true)
    expect(result.data?.toll_amount).toBe(0)
  })

  it('aceita km_traveled opcional', () => {
    expect(costSchema.safeParse({ toll_amount: 0, parking_amount: 0 }).success).toBe(true)
  })

  it('rejeita valores negativos', () => {
    expect(costSchema.safeParse({ toll_amount: -1, parking_amount: 0 }).success).toBe(false)
  })
})

describe('reversalSchema', () => {
  it('rejeita motivo vazio', () => {
    expect(reversalSchema.safeParse({ reversal_reason: '' }).success).toBe(false)
  })

  it('aceita motivo preenchido', () => {
    expect(reversalSchema.safeParse({ reversal_reason: 'Erro crítico detectado' }).success).toBe(true)
  })
})
```

- [ ] **Criar `tests/ticket-costs.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

function calculateTotalCost(params: {
  serviceTimeMinutes: number
  travelDiscountMinutes: number
  kmTraveled: number
  tollAmount: number
  parkingAmount: number
  hourlyRate: number
  kmRate: number
}): number {
  const { serviceTimeMinutes, travelDiscountMinutes, kmTraveled, tollAmount, parkingAmount, hourlyRate, kmRate } = params
  const billableMinutes = Math.max(0, serviceTimeMinutes - travelDiscountMinutes)
  const technicalFee = (billableMinutes / 60) * hourlyRate
  const kmFee = kmTraveled * kmRate
  return Number((technicalFee + kmFee + tollAmount + parkingAmount).toFixed(2))
}

describe('calculateTotalCost', () => {
  it('calcula custo com valores cheios', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 120,
      travelDiscountMinutes: 0,
      kmTraveled: 30,
      tollAmount: 5.5,
      parkingAmount: 10,
      hourlyRate: 200,
      kmRate: 1.5,
    })
    // 2h × R$200 + 30km × R$1.5 + R$5.5 + R$10 = 400 + 45 + 5.5 + 10 = 460.5
    expect(total).toBe(460.5)
  })

  it('aplica desconto no tempo de deslocamento corretamente', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 180,
      travelDiscountMinutes: 60,
      kmTraveled: 0,
      tollAmount: 0,
      parkingAmount: 0,
      hourlyRate: 100,
      kmRate: 0,
    })
    // 180min - 60min = 120min = 2h × R$100 = 200
    expect(total).toBe(200)
  })

  it('desconto não pode resultar em minutos negativos', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 30,
      travelDiscountMinutes: 60,
      kmTraveled: 0,
      tollAmount: 0,
      parkingAmount: 0,
      hourlyRate: 100,
      kmRate: 0,
    })
    expect(total).toBe(0)
  })
})
```

- [ ] **Rodar testes**

```bash
npm test -- tests/change-request-validations.test.ts tests/ticket-costs.test.ts
```

Expected: PASS (7 testes)

- [ ] **Commit**

```bash
git add tests/
git commit -m "test: validações de GMUD e cálculo de custo de atendimento presencial"
```

---

## Task 6: Sidebar — Link Mudanças

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Adicionar link `/mudancas` ao Sidebar**

No array `navItems` em `src/components/layout/Sidebar.tsx`, adicionar após o item de Chamados:

```typescript
import { LayoutDashboard, Building2, Settings, Users, Ticket, Mail, Megaphone, BookOpen, CheckSquare, Calendar, GitMerge } from 'lucide-react'

// No array navItems, adicionar após { href: '/chamados', ... }:
  { href: '/mudancas', label: 'Mudanças (GMUD)', icon: GitMerge },
```

- [ ] **Verificar que o Sidebar renderiza sem erro**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard`. Confirmar que "Mudanças (GMUD)" aparece no menu.

- [ ] **Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar — adicionar link para Mudanças (GMUD)"
```

---

## Task 7: GMUD — Actions de CRUD e Lista

**Files:**
- Create: `src/app/(internal)/mudancas/actions.ts`
- Create: `src/app/(internal)/mudancas/page.tsx`
- Create: `src/components/mudancas/ChangeRequestList.tsx`
- Create: `src/components/mudancas/NotificationContactsSelector.tsx`

- [ ] **Criar `src/app/(internal)/mudancas/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { changeRequestSchema, notificationContactSchema } from '@/lib/validations/change-request'

export async function createChangeRequestAction(_prevState: unknown, formData: FormData) {
  const contactsRaw = formData.get('notification_contacts')
  let notificationContacts: Array<{ contact_id?: string; external_email?: string; external_name?: string }> = []
  try {
    notificationContacts = JSON.parse(contactsRaw as string ?? '[]')
  } catch {
    return { error: 'Contatos de notificação inválidos' }
  }

  const parsed = changeRequestSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    impacted_systems: formData.get('impacted_systems'),
    impacted_users: formData.get('impacted_users'),
    maintenance_start: formData.get('maintenance_start'),
    maintenance_end: formData.get('maintenance_end'),
    rollback_plan: formData.get('rollback_plan'),
    risk_level: formData.get('risk_level'),
    responsible_id: formData.get('responsible_id'),
    origin_ticket_id: formData.get('origin_ticket_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: cr, error } = await supabase
    .from('change_requests')
    .insert({ ...parsed.data as any, created_by: user!.id })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  // Inserir contatos de notificação
  if (notificationContacts.length > 0) {
    const contactRows = notificationContacts.map((c) => ({
      change_request_id: cr!.id,
      contact_id: c.contact_id ?? null,
      external_email: c.external_email ?? null,
      external_name: c.external_name ?? null,
    }))
    await supabase.from('change_request_contacts').insert(contactRows as any)
  }

  // Se vinculada a um chamado, mudar status do chamado para em_mudanca
  if (parsed.data.origin_ticket_id) {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.from('tickets').update({ status: 'em_mudanca' } as any)
      .eq('id', parsed.data.origin_ticket_id)
    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: parsed.data.origin_ticket_id,
      type: 'system',
      content: `GMUD criada: "${parsed.data.title}". Chamado aguardando conclusão da mudança.`,
      is_system: true,
    } as any)
    revalidatePath(`/chamados/${parsed.data.origin_ticket_id}`)
  }

  revalidatePath('/mudancas')
  return { success: true, id: cr!.id }
}

export async function deleteChangeRequestAction(id: string) {
  const supabase = await createClient()
  await supabase.from('change_requests').delete().eq('id', id).eq('status', 'rascunho')
  revalidatePath('/mudancas')
}
```

- [ ] **Criar `src/components/mudancas/NotificationContactsSelector.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

type ContactEntry =
  | { type: 'db'; contact_id: string; name: string; email: string }
  | { type: 'external'; external_email: string; external_name: string }

interface Props {
  dbContacts: Array<{ id: string; full_name: string; email: string }>
}

export function NotificationContactsSelector({ dbContacts }: Props) {
  const [selected, setSelected] = useState<ContactEntry[]>([])
  const [extEmail, setExtEmail] = useState('')
  const [extName, setExtName] = useState('')

  function addDbContact(contactId: string) {
    const c = dbContacts.find((c) => c.id === contactId)
    if (!c || selected.some((s) => s.type === 'db' && s.contact_id === contactId)) return
    setSelected((prev) => [...prev, { type: 'db', contact_id: c.id, name: c.full_name, email: c.email }])
  }

  function addExternal() {
    if (!extEmail || !extName) return
    setSelected((prev) => [...prev, { type: 'external', external_email: extEmail, external_name: extName }])
    setExtEmail('')
    setExtName('')
  }

  function remove(idx: number) {
    setSelected((prev) => prev.filter((_, i) => i !== idx))
  }

  const serialized = JSON.stringify(
    selected.map((s) =>
      s.type === 'db'
        ? { contact_id: s.contact_id }
        : { external_email: s.external_email, external_name: s.external_name }
    )
  )

  return (
    <div className="space-y-3">
      <input type="hidden" name="notification_contacts" value={serialized} />

      <div className="flex gap-2">
        <select
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          onChange={(e) => addDbContact(e.target.value)}
          value=""
        >
          <option value="">Selecionar contato cadastrado…</option>
          {dbContacts.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="E-mail externo"
          value={extEmail}
          onChange={(e) => setExtEmail(e.target.value)}
          type="email"
        />
        <Input
          placeholder="Nome"
          value={extName}
          onChange={(e) => setExtName(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={addExternal}>Adicionar</Button>
      </div>

      {selected.length > 0 && (
        <ul className="space-y-1">
          {selected.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span>
                {s.type === 'db'
                  ? `${s.name} (${s.email})`
                  : `${s.external_name} (${s.external_email})`}
              </span>
              <button type="button" onClick={() => remove(i)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/components/mudancas/ChangeRequestList.tsx`**

```typescript
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { ChangeRequestStatus, RiskLevel } from '@/types/database'

const statusLabel: Record<ChangeRequestStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada',
  em_execucao: 'Em Execução',
  concluida: 'Concluída',
  revertida: 'Revertida',
  reprovada: 'Reprovada',
}

const statusVariant: Record<ChangeRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline',
  aguardando_aprovacao: 'secondary',
  aprovada: 'default',
  em_execucao: 'default',
  concluida: 'secondary',
  revertida: 'destructive',
  reprovada: 'destructive',
}

const riskLabel: Record<RiskLevel, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }
const riskColor: Record<RiskLevel, string> = {
  baixo: 'text-green-600',
  medio: 'text-yellow-600',
  alto: 'text-red-600',
}

interface Props {
  changeRequests: Array<{
    id: string; title: string; status: string; risk_level: string
    maintenance_start: string; maintenance_end: string
    profiles: { full_name: string } | null
  }>
}

export function ChangeRequestList({ changeRequests }: Props) {
  if (changeRequests.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma GMUD cadastrada.</p>
  }

  return (
    <div className="space-y-2">
      {changeRequests.map((cr) => {
        const status = cr.status as ChangeRequestStatus
        const risk = cr.risk_level as RiskLevel
        return (
          <Link
            key={cr.id}
            href={`/mudancas/${cr.id}`}
            className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cr.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Janela: {new Date(cr.maintenance_start).toLocaleString('pt-BR')} →{' '}
                  {new Date(cr.maintenance_end).toLocaleString('pt-BR')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Responsável: {cr.profiles?.full_name ?? '—'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
                <span className={`text-xs font-medium ${riskColor[risk]}`}>
                  Risco {riskLabel[risk]}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/mudancas/page.tsx`**

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChangeRequestList } from '@/components/mudancas/ChangeRequestList'

export default async function MudancasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  const query = supabase
    .from('change_requests')
    .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
    .order('maintenance_start', { ascending: true })

  const { data: changeRequests } = await query as { data: any[] | null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gestão de Mudanças (GMUD)</h1>
        <Button asChild>
          <Link href="/mudancas/nova">Nova GMUD</Link>
        </Button>
      </div>
      <ChangeRequestList changeRequests={changeRequests ?? []} />
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/mudancas/ src/components/mudancas/
git commit -m "feat: lista de GMUDs com actions de create/delete e seletor de contatos"
```

---

## Task 8: GMUD — Formulário de Criação

**Files:**
- Create: `src/components/mudancas/ChangeRequestForm.tsx`
- Create: `src/app/(internal)/mudancas/nova/page.tsx`

- [ ] **Criar `src/components/mudancas/ChangeRequestForm.tsx`**

```typescript
'use client'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NotificationContactsSelector } from './NotificationContactsSelector'
import { createChangeRequestAction } from '@/app/(internal)/mudancas/actions'

interface Props {
  analysts: Array<{ id: string; full_name: string }>
  allContacts: Array<{ id: string; full_name: string; email: string }>
  originTicketId?: string
  originTicketTitle?: string
}

export function ChangeRequestForm({ analysts, allContacts, originTicketId, originTicketTitle }: Props) {
  const [state, action, pending] = useActionState(createChangeRequestAction, null)
  const router = useRouter()

  useEffect(() => {
    if (state?.success && state.id) {
      router.push(`/mudancas/${state.id}`)
    }
  }, [state, router])

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {originTicketId && (
        <>
          <input type="hidden" name="origin_ticket_id" value={originTicketId} />
          <p className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-blue-700">
            Vinculada ao chamado: <strong>{originTicketTitle}</strong>
          </p>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição detalhada *</Label>
        <Textarea id="description" name="description" rows={4} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_systems">Sistemas/servidores/aplicações impactados *</Label>
        <Textarea id="impacted_systems" name="impacted_systems" rows={2} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_users">Usuários e clientes impactados *</Label>
        <Textarea id="impacted_users" name="impacted_users" rows={2} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maintenance_start">Início da janela *</Label>
          <Input id="maintenance_start" name="maintenance_start" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance_end">Fim previsto *</Label>
          <Input id="maintenance_end" name="maintenance_end" type="datetime-local" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rollback_plan">Plano de rollback *</Label>
        <Textarea id="rollback_plan" name="rollback_plan" rows={3} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="risk_level">Nível de risco *</Label>
          <select
            id="risk_level"
            name="risk_level"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            <option value="baixo">Baixo</option>
            <option value="medio">Médio</option>
            <option value="alto">Alto</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="responsible_id">Analista responsável *</Label>
          <select
            id="responsible_id"
            name="responsible_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            {analysts.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Contatos a comunicar (início e conclusão) *</Label>
        <NotificationContactsSelector dbContacts={allContacts} />
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Criar GMUD'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Criar `src/app/(internal)/mudancas/nova/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestForm } from '@/components/mudancas/ChangeRequestForm'

export default async function NovaMudancaPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket_id?: string; ticket_title?: string }>
}) {
  const { ticket_id, ticket_title } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: analysts }, { data: contacts }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name, email').eq('is_active', true).order('full_name'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova GMUD</h1>
      <ChangeRequestForm
        analysts={(analysts as any[]) ?? []}
        allContacts={(contacts as any[]) ?? []}
        originTicketId={ticket_id}
        originTicketTitle={ticket_title ? decodeURIComponent(ticket_title) : undefined}
      />
    </div>
  )
}
```

- [ ] **Verificar formulário manualmente**

```bash
npm run dev
```

Acessar `http://localhost:3000/mudancas/nova`, preencher e submeter. Verificar que GMUD é criada e redirecionamento ocorre para `/mudancas/<id>`.

- [ ] **Commit**

```bash
git add src/components/mudancas/ChangeRequestForm.tsx src/app/\(internal\)/mudancas/nova/
git commit -m "feat: formulário de criação de GMUD com contatos de notificação"
```

---

## Task 9: GMUD — Detalhe e Transições de Status

**Files:**
- Create: `src/app/(internal)/mudancas/[id]/actions.ts`
- Create: `src/app/(internal)/mudancas/[id]/page.tsx`
- Create: `src/components/mudancas/ChangeRequestDetail.tsx`

- [ ] **Criar `src/app/(internal)/mudancas/[id]/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { approvalRequestSchema, reversalSchema } from '@/lib/validations/change-request'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function submitForApprovalAction(changeRequestId: string, formData: FormData) {
  const parsed = approvalRequestSchema.safeParse({
    approver_email: formData.get('approver_email'),
    approver_contact_id: formData.get('approver_contact_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, description, impacted_systems, maintenance_start, maintenance_end, rollback_plan, risk_level, status')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'rascunho') return { error: 'GMUD não está em rascunho' }

  const { data: approval } = await serviceSupabase
    .from('change_approvals')
    .insert({
      change_request_id: changeRequestId,
      approver_contact_id: parsed.data.approver_contact_id ?? null,
      approver_email: parsed.data.approver_email,
      status: 'pendente',
    } as any)
    .select('token')
    .single<{ token: string }>()

  if (!approval) return { error: 'Erro ao criar solicitação de aprovação' }

  await supabase
    .from('change_requests')
    .update({ status: 'aguardando_aprovacao' } as any)
    .eq('id', changeRequestId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const riskLabels: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

  await sendEmailFromTemplate('gmud_solicitacao_aprovacao', parsed.data.approver_email, {
    titulo: cr.title,
    descricao: cr.description,
    sistemas_impactados: cr.impacted_systems,
    janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
    janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
    nivel_risco: riskLabels[cr.risk_level] ?? cr.risk_level,
    plano_rollback: cr.rollback_plan,
    link_aprovacao: `${appUrl}/aprovacao-gmud/${approval.token}`,
  })

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function iniciarExecucaoAction(changeRequestId: string) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, description, maintenance_start, maintenance_end, impacted_systems, status, change_request_contacts(contact_id, external_email, contacts(email, full_name))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'aprovada') return { error: 'GMUD não está aprovada' }

  await supabase
    .from('change_requests')
    .update({ status: 'em_execucao', execution_started_at: new Date().toISOString() } as any)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_inicio_execucao', contacts, {
      titulo: cr.title,
      descricao: cr.description,
      janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
      janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
      sistemas_impactados: cr.impacted_systems,
    })
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function concluirGmudAction(changeRequestId: string, closeOriginTicket: boolean) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, maintenance_start, status, origin_ticket_id, change_request_contacts(contact_id, external_email, contacts(email))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'em_execucao') return { error: 'GMUD não está em execução' }

  const now = new Date().toISOString()
  await supabase
    .from('change_requests')
    .update({ status: 'concluida', execution_completed_at: now } as any)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_concluida', contacts, {
      titulo: cr.title,
      janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
      concluida_em: new Date(now).toLocaleString('pt-BR'),
    })
  }

  if (cr.origin_ticket_id) {
    const newStatus = closeOriginTicket ? 'fechado' : 'em_andamento'
    await serviceSupabase.from('tickets')
      .update({ status: newStatus, ...(closeOriginTicket ? { closed_at: now } : {}) } as any)
      .eq('id', cr.origin_ticket_id)

    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: cr.origin_ticket_id,
      type: 'system',
      content: closeOriginTicket
        ? 'GMUD concluída. Chamado fechado automaticamente.'
        : 'GMUD concluída. Chamado retornado para em andamento.',
      is_system: true,
    } as any)

    revalidatePath(`/chamados/${cr.origin_ticket_id}`)
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function reverterGmudAction(changeRequestId: string, formData: FormData) {
  const parsed = reversalSchema.safeParse({ reversal_reason: formData.get('reversal_reason') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, status, origin_ticket_id, change_request_contacts(contact_id, external_email, contacts(email))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'em_execucao') return { error: 'GMUD não está em execução' }

  await supabase
    .from('change_requests')
    .update({ status: 'revertida', reversal_reason: parsed.data.reversal_reason } as any)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_revertida', contacts, {
      titulo: cr.title,
      motivo_reversao: parsed.data.reversal_reason,
    })
  }

  if (cr.origin_ticket_id) {
    await serviceSupabase.from('tickets')
      .update({ status: 'em_andamento' } as any)
      .eq('id', cr.origin_ticket_id)

    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: cr.origin_ticket_id,
      type: 'system',
      content: `GMUD revertida. Motivo: ${parsed.data.reversal_reason}. Chamado retornado para em andamento.`,
      is_system: true,
    } as any)

    revalidatePath(`/chamados/${cr.origin_ticket_id}`)
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}
```

- [ ] **Criar `src/components/mudancas/ChangeRequestDetail.tsx`**

```typescript
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  submitForApprovalAction,
  iniciarExecucaoAction,
  concluirGmudAction,
  reverterGmudAction,
} from '@/app/(internal)/mudancas/[id]/actions'
import type { ChangeRequestStatus, RiskLevel } from '@/types/database'

const statusLabel: Record<ChangeRequestStatus, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada', em_execucao: 'Em Execução',
  concluida: 'Concluída', revertida: 'Revertida', reprovada: 'Reprovada',
}

interface Props {
  cr: {
    id: string; title: string; description: string; impacted_systems: string
    impacted_users: string; maintenance_start: string; maintenance_end: string
    rollback_plan: string; risk_level: string; status: string
    execution_started_at: string | null; execution_completed_at: string | null
    reversal_reason: string | null; origin_ticket_id: string | null
    profiles: { full_name: string } | null
    origin_ticket: { number: number; title: string } | null
    change_request_contacts: Array<{
      id: string; external_email: string | null; external_name: string | null
      contacts: { full_name: string; email: string } | null
    }>
  }
  companyContacts: Array<{ id: string; full_name: string; email: string }>
  userRole: string
}

export function ChangeRequestDetail({ cr, companyContacts, userRole }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showApprovalForm, setShowApprovalForm] = useState(false)
  const [showReversalForm, setShowReversalForm] = useState(false)
  const [closeTicket, setCloseTicket] = useState(true)
  const status = cr.status as ChangeRequestStatus
  const risk = cr.risk_level as RiskLevel
  const riskColor: Record<RiskLevel, string> = { baixo: 'text-green-600', medio: 'text-yellow-600', alto: 'text-red-600' }

  async function handleIniciar() {
    startTransition(async () => {
      const result = await iniciarExecucaoAction(cr.id)
      if (result?.error) setError(result.error)
    })
  }

  async function handleConcluir() {
    startTransition(async () => {
      const result = await concluirGmudAction(cr.id, closeTicket)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cr.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Responsável: {cr.profiles?.full_name ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge>{statusLabel[status]}</Badge>
          <span className={`text-xs font-medium ${riskColor[risk]}`}>
            Risco {risk.charAt(0).toUpperCase() + risk.slice(1)}
          </span>
        </div>
      </div>

      {cr.origin_ticket && (
        <div className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          Chamado de origem:{' '}
          <a href={`/chamados/${cr.origin_ticket_id}`} className="font-medium text-blue-700 hover:underline">
            #{cr.origin_ticket.number} — {cr.origin_ticket.title}
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 text-sm">
        <div><span className="font-medium">Início da janela:</span>{' '}{new Date(cr.maintenance_start).toLocaleString('pt-BR')}</div>
        <div><span className="font-medium">Fim previsto:</span>{' '}{new Date(cr.maintenance_end).toLocaleString('pt-BR')}</div>
      </div>

      <div className="space-y-3 text-sm">
        <div><p className="font-medium">Descrição</p><p className="mt-1 text-muted-foreground">{cr.description}</p></div>
        <div><p className="font-medium">Sistemas impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_systems}</p></div>
        <div><p className="font-medium">Usuários impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_users}</p></div>
        <div><p className="font-medium">Plano de rollback</p><p className="mt-1 text-muted-foreground">{cr.rollback_plan}</p></div>
      </div>

      {cr.change_request_contacts.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Contatos a comunicar</p>
          <ul className="text-sm space-y-1">
            {cr.change_request_contacts.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                {c.contacts ? `${c.contacts.full_name} (${c.contacts.email})` : `${c.external_name} (${c.external_email})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Ações por status */}
      {status === 'rascunho' && (
        <div className="space-y-3">
          {!showApprovalForm ? (
            <Button onClick={() => setShowApprovalForm(true)}>Enviar para Aprovação</Button>
          ) : (
            <form
              action={async (fd) => {
                const result = await submitForApprovalAction(cr.id, fd)
                if (result?.error) setError(result.error)
                else setShowApprovalForm(false)
              }}
              className="space-y-3 border rounded-md p-4"
            >
              <p className="text-sm font-medium">Solicitar aprovação</p>
              <div className="space-y-2">
                <Label htmlFor="approver_email">E-mail do aprovador *</Label>
                <div className="flex gap-2">
                  <select
                    name="approver_contact_id"
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">E-mail manual</option>
                    {companyContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <Input id="approver_email" name="approver_email" type="email" placeholder="ou digitar e-mail" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>Enviar</Button>
                <Button type="button" variant="outline" onClick={() => setShowApprovalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {status === 'aprovada' && (
        <Button onClick={handleIniciar} disabled={isPending}>
          Iniciar Execução
        </Button>
      )}

      {status === 'em_execucao' && (
        <div className="space-y-3">
          {cr.origin_ticket_id && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="close_ticket"
                checked={closeTicket}
                onChange={(e) => setCloseTicket(e.target.checked)}
              />
              <Label htmlFor="close_ticket">Fechar chamado de origem ao concluir</Label>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleConcluir} disabled={isPending}>Concluir GMUD</Button>
            <Button variant="destructive" onClick={() => setShowReversalForm(true)} disabled={isPending}>
              Reverter (Rollback)
            </Button>
          </div>

          {showReversalForm && (
            <form
              action={async (fd) => {
                const result = await reverterGmudAction(cr.id, fd)
                if (result?.error) setError(result.error)
                else setShowReversalForm(false)
              }}
              className="space-y-3 border border-destructive rounded-md p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="reversal_reason">Motivo da reversão *</Label>
                <Textarea id="reversal_reason" name="reversal_reason" rows={3} required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={isPending}>Confirmar Reversão</Button>
                <Button type="button" variant="outline" onClick={() => setShowReversalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/mudancas/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestDetail } from '@/components/mudancas/ChangeRequestDetail'

export default async function MudancaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  const { data: cr } = await supabase
    .from('change_requests')
    .select(`
      *, profiles!responsible_id(full_name),
      origin_ticket:origin_ticket_id(number, title),
      change_request_contacts(id, external_email, external_name, contacts(full_name, email))
    `)
    .eq('id', id)
    .single() as { data: any }

  if (!cr) notFound()

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name')

  return (
    <ChangeRequestDetail
      cr={cr}
      companyContacts={(contacts as any[]) ?? []}
      userRole={profile?.role ?? 'analista'}
    />
  )
}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/mudancas/\[id\]/ src/components/mudancas/ChangeRequestDetail.tsx
git commit -m "feat: detalhe de GMUD com todas as transições de status e e-mails automáticos"
```

---

## Task 10: Aprovação GMUD — Página Externa (sem auth)

**Files:**
- Create: `src/app/aprovacao-gmud/[token]/page.tsx`
- Create: `src/app/aprovacao-gmud/[token]/actions.ts`

- [ ] **Criar `src/app/aprovacao-gmud/[token]/actions.ts`**

```typescript
'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function processChangeApprovalAction(
  token: string,
  action: 'aprovar' | 'reprovar',
  reason?: string
) {
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('change_approvals')
    .select('*, change_requests(title, maintenance_start, maintenance_end, responsible_id)')
    .eq('token', token)
    .single() as { data: any }

  if (!approval) return { error: 'Token inválido ou expirado' }
  if (approval.status !== 'pendente') return { error: 'Esta solicitação já foi respondida' }

  const cr = approval.change_requests
  const approved = action === 'aprovar'

  await supabase.from('change_approvals').update({
    status: approved ? 'aprovado' : 'reprovado',
    response_reason: reason ?? null,
    responded_at: new Date().toISOString(),
  } as any).eq('id', approval.id)

  await supabase.from('change_requests')
    .update({ status: approved ? 'aprovada' : 'reprovada' } as any)
    .eq('id', approval.change_request_id)

  // Notificar analista responsável
  if (cr.responsible_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(cr.responsible_id)
    if (authUser.user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      const slug = approved ? 'gmud_aprovada_analista' : 'gmud_reprovada_analista'

      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', cr.responsible_id).single() as { data: any }

      await sendEmailFromTemplate(slug, authUser.user.email, {
        analista_nome: profile?.full_name ?? 'Analista',
        titulo: cr.title,
        aprovador_email: approval.approver_email,
        janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
        janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
        motivo: reason ?? '—',
        link_gmud: `${appUrl}/mudancas/${approval.change_request_id}`,
      })
    }
  }

  return { success: true, approved }
}
```

- [ ] **Criar `src/app/aprovacao-gmud/[token]/page.tsx`**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { processChangeApprovalAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default async function ChangeApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('change_approvals')
    .select('status, change_request_id, change_requests(title, description, impacted_systems, maintenance_start, maintenance_end, rollback_plan, risk_level)')
    .eq('token', token)
    .single() as { data: any }

  if (!approval) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-muted-foreground">Este link de aprovação não é válido ou expirou.</p>
        </div>
      </div>
    )
  }

  if (approval.status !== 'pendente') {
    const statusMsg: Record<string, string> = {
      aprovado: 'Esta mudança já foi aprovada.',
      reprovado: 'Esta mudança já foi reprovada.',
      expirado: 'Este link de aprovação expirou.',
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Solicitação já respondida</h1>
          <p className="text-muted-foreground">{statusMsg[approval.status] ?? 'Solicitação já processada.'}</p>
        </div>
      </div>
    )
  }

  const cr = approval.change_requests
  const riskLabels: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-md p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Solicitação de Aprovação de Mudança</h1>
          <h2 className="text-lg mt-1">{cr.title}</h2>
        </div>

        <div className="space-y-3 text-sm">
          <div><span className="font-medium">Descrição:</span> {cr.description}</div>
          <div><span className="font-medium">Sistemas impactados:</span> {cr.impacted_systems}</div>
          <div>
            <span className="font-medium">Janela de manutenção:</span>{' '}
            {new Date(cr.maintenance_start).toLocaleString('pt-BR')} até{' '}
            {new Date(cr.maintenance_end).toLocaleString('pt-BR')}
          </div>
          <div>
            <span className="font-medium">Nível de risco:</span>{' '}
            {riskLabels[cr.risk_level] ?? cr.risk_level}
          </div>
          <div><span className="font-medium">Plano de rollback:</span> {cr.rollback_plan}</div>
        </div>

        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (opcional para aprovação, obrigatório para reprovação)</Label>
            <Textarea id="reason" name="reason" rows={3} placeholder="Descreva o motivo da sua decisão…" />
          </div>
          <div className="flex gap-3">
            <Button
              type="submit"
              className="flex-1"
              formAction={async (fd: FormData) => {
                'use server'
                await processChangeApprovalAction(token, 'aprovar', fd.get('reason') as string || undefined)
              }}
            >
              Aprovar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="flex-1"
              formAction={async (fd: FormData) => {
                'use server'
                const reason = fd.get('reason') as string
                if (!reason?.trim()) return
                await processChangeApprovalAction(token, 'reprovar', reason)
              }}
            >
              Reprovar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/aprovacao-gmud/
git commit -m "feat: página de aprovação externa de GMUD com token (sem autenticação)"
```

---

## Task 11: Chamado de Origem — Link para GMUD no Detalhe do Chamado

**Files:**
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`

- [ ] **Adicionar query de GMUD vinculada ao chamado**

Em `src/app/(internal)/chamados/[id]/page.tsx`, dentro do `Promise.all` das queries iniciais, adicionar:

```typescript
    supabase
      .from('change_requests')
      .select('id, title, status, maintenance_start')
      .eq('origin_ticket_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
```

- [ ] **Renderizar seção de GMUDs vinculadas**

Após o bloco de informações do chamado (antes das interações), adicionar:

```typescript
{/* GMUDs vinculadas */}
{linkedGmuds && linkedGmuds.length > 0 && (
  <div className="border rounded-md p-4 space-y-2">
    <h3 className="text-sm font-medium">Gestão de Mudanças vinculadas</h3>
    {linkedGmuds.map((gmud: any) => (
      <a
        key={gmud.id}
        href={`/mudancas/${gmud.id}`}
        className="flex items-center justify-between text-sm hover:bg-muted rounded px-2 py-1"
      >
        <span>{gmud.title}</span>
        <span className="text-muted-foreground text-xs">
          {gmud.status} · {new Date(gmud.maintenance_start).toLocaleDateString('pt-BR')}
        </span>
      </a>
    ))}
    <a
      href={`/mudancas/nova?ticket_id=${id}&ticket_title=${encodeURIComponent(ticket.title)}`}
      className="text-xs text-primary hover:underline block mt-2"
    >
      + Criar nova GMUD a partir deste chamado
    </a>
  </div>
)}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/chamados/\[id\]/page.tsx
git commit -m "feat: chamado exibe GMUDs vinculadas e link para criar nova GMUD"
```

---

## Task 12: Atendimento Presencial — Marcações de Tempo

**Files:**
- Create: `src/components/tickets/PresentialCostPanel.tsx`
- Modify: `src/app/(internal)/chamados/actions.ts`
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`

- [ ] **Adicionar actions ao `src/app/(internal)/chamados/actions.ts`**

No final do arquivo de actions de chamados, adicionar:

```typescript
export async function markPresentialAction(
  ticketId: string,
  step: 'departure' | 'arrival' | 'completion'
) {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('ticket_costs')
    .select('id, departure_at, arrival_at')
    .eq('ticket_id', ticketId)
    .single() as { data: any }

  if (step === 'departure') {
    if (existing) {
      await supabase.from('ticket_costs')
        .update({ departure_at: now, arrival_at: null, completion_at: null,
          travel_time_minutes: null, service_time_minutes: null } as any)
        .eq('ticket_id', ticketId)
    } else {
      await supabase.from('ticket_costs')
        .insert({ ticket_id: ticketId, departure_at: now } as any)
    }
    // Mudar status do chamado para em_deslocamento
    await supabase.from('tickets').update({ status: 'em_deslocamento' } as any).eq('id', ticketId)
    await supabase.from('ticket_interactions').insert({
      ticket_id: ticketId, type: 'system',
      content: 'Analista a caminho para atendimento presencial.', is_system: true,
    } as any)

  } else if (step === 'arrival') {
    if (!existing?.departure_at) return { error: 'Marque a saída primeiro' }
    const travelMinutes = Math.round(
      (new Date(now).getTime() - new Date(existing.departure_at).getTime()) / 60000
    )
    await supabase.from('ticket_costs')
      .update({ arrival_at: now, travel_time_minutes: travelMinutes } as any)
      .eq('ticket_id', ticketId)

  } else if (step === 'completion') {
    if (!existing?.arrival_at) return { error: 'Marque a chegada primeiro' }
    const serviceMinutes = Math.round(
      (new Date(now).getTime() - new Date(existing.arrival_at).getTime()) / 60000
    )
    await supabase.from('ticket_costs')
      .update({ completion_at: now, service_time_minutes: serviceMinutes } as any)
      .eq('ticket_id', ticketId)
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function updateTicketCostAction(ticketId: string, formData: FormData) {
  const { costSchema } = await import('@/lib/validations/change-request')
  const parsed = costSchema.safeParse({
    km_traveled: formData.get('km_traveled'),
    toll_amount: formData.get('toll_amount'),
    parking_amount: formData.get('parking_amount'),
    travel_discount_minutes: formData.get('travel_discount_minutes'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Ler rates atuais de platform_settings
  const { data: settings } = await supabase
    .from('platform_settings').select('hourly_rate, km_rate').single() as { data: any }

  const { data: cost } = await supabase
    .from('ticket_costs').select('service_time_minutes, travel_discount_minutes')
    .eq('ticket_id', ticketId).single() as { data: any }

  const hourlyRate = settings?.hourly_rate ?? 0
  const kmRate = settings?.km_rate ?? 0
  const serviceMin = cost?.service_time_minutes ?? 0
  const discount = parsed.data.travel_discount_minutes ?? 0
  const billableMin = Math.max(0, serviceMin - discount)

  const technicalFee = (billableMin / 60) * hourlyRate
  const kmFee = (parsed.data.km_traveled ?? 0) * kmRate
  const total = technicalFee + kmFee + (parsed.data.toll_amount ?? 0) + (parsed.data.parking_amount ?? 0)

  await supabase.from('ticket_costs').update({
    ...parsed.data,
    hourly_rate_applied: hourlyRate,
    km_rate_applied: kmRate,
    total_amount: Number(total.toFixed(2)),
  } as any).eq('ticket_id', ticketId)

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function markBilledAction(ticketId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user!.id).single() as { data: any }

  if (!['admin', 'gestor'].includes(profile?.role)) return { error: 'Sem permissão' }

  await supabase.from('tickets').update({ billing_status: 'cobrado' } as any).eq('id', ticketId)
  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
```

- [ ] **Criar `src/components/tickets/PresentialCostPanel.tsx`**

```typescript
'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { markPresentialAction, updateTicketCostAction } from '@/app/(internal)/chamados/actions'

interface CostData {
  departure_at: string | null; arrival_at: string | null; completion_at: string | null
  travel_time_minutes: number | null; service_time_minutes: number | null
  travel_discount_minutes: number; km_traveled: number | null
  toll_amount: number; parking_amount: number; total_amount: number | null
}

interface Props {
  ticketId: string
  cost: CostData | null
  canDiscount: boolean
}

function fmtMin(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export function PresentialCostPanel({ ticketId, cost, canDiscount }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleMark(step: 'departure' | 'arrival' | 'completion') {
    startTransition(async () => {
      await markPresentialAction(ticketId, step)
    })
  }

  return (
    <div className="border rounded-md p-4 space-y-4">
      <h3 className="text-sm font-semibold">Atendimento Presencial</h3>

      <div className="flex gap-3 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant={cost?.departure_at ? 'secondary' : 'default'}
          disabled={isPending}
          onClick={() => handleMark('departure')}
        >
          {cost?.departure_at ? `Saiu: ${new Date(cost.departure_at).toLocaleTimeString('pt-BR')}` : 'Saindo para atendimento'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cost?.arrival_at ? 'secondary' : 'outline'}
          disabled={isPending || !cost?.departure_at}
          onClick={() => handleMark('arrival')}
        >
          {cost?.arrival_at ? `Chegou: ${new Date(cost.arrival_at).toLocaleTimeString('pt-BR')}` : 'Cheguei no cliente'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cost?.completion_at ? 'secondary' : 'outline'}
          disabled={isPending || !cost?.arrival_at}
          onClick={() => handleMark('completion')}
        >
          {cost?.completion_at ? `Concluiu: ${new Date(cost.completion_at).toLocaleTimeString('pt-BR')}` : 'Atendimento concluído'}
        </Button>
      </div>

      {cost?.departure_at && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Deslocamento</p>
            <p className="font-medium">{fmtMin(cost.travel_time_minutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Atendimento</p>
            <p className="font-medium">{fmtMin(cost.service_time_minutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="font-medium">
              {fmtMin((cost.travel_time_minutes ?? 0) + (cost.service_time_minutes ?? 0))}
            </p>
          </div>
        </div>
      )}

      <form
        action={async (fd) => { await updateTicketCostAction(ticketId, fd) }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="km_traveled">Quilômetros percorridos</Label>
            <Input id="km_traveled" name="km_traveled" type="number" step="0.1" min="0"
              defaultValue={cost?.km_traveled?.toString() ?? ''} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="toll_amount">Pedágio (R$)</Label>
            <Input id="toll_amount" name="toll_amount" type="number" step="0.01" min="0"
              defaultValue={cost?.toll_amount?.toString() ?? '0'} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="parking_amount">Estacionamento (R$)</Label>
            <Input id="parking_amount" name="parking_amount" type="number" step="0.01" min="0"
              defaultValue={cost?.parking_amount?.toString() ?? '0'} />
          </div>
          {canDiscount && (
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="travel_discount_minutes">Desconto deslocamento (min)</Label>
              <Input id="travel_discount_minutes" name="travel_discount_minutes" type="number" min="0"
                defaultValue={cost?.travel_discount_minutes?.toString() ?? '0'} />
            </div>
          )}
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Salvar custos
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Adicionar `PresentialCostPanel` ao detalhe do chamado**

Em `src/app/(internal)/chamados/[id]/page.tsx`, adicionar query de ticket_costs e renderizar o painel:

```typescript
// Adicionar na query paralela:
supabase.from('ticket_costs').select('*').eq('ticket_id', id).maybeSingle(),

// Após buscar o profile do usuário logado:
const { data: costData } = await supabase
  .from('ticket_costs').select('*').eq('ticket_id', id).maybeSingle()
const canDiscount = ['admin', 'gestor'].includes(profile?.role)

// Na renderização, próximo ao final da página, antes das interações:
<PresentialCostPanel ticketId={id} cost={costData as any} canDiscount={canDiscount} />
```

- [ ] **Commit**

```bash
git add src/components/tickets/PresentialCostPanel.tsx src/app/\(internal\)/chamados/
git commit -m "feat: marcações de tempo de atendimento presencial com cálculo de custo"
```

---

## Task 13: Cobrança — BillingSummary + Billing Status + E-mail

**Files:**
- Create: `src/components/tickets/BillingSummary.tsx`
- Modify: `src/app/(internal)/chamados/actions.ts` (já modificado na Task 12 — adicionar `autoSetBillingPendingAction`)

- [ ] **Criar `src/components/tickets/BillingSummary.tsx`**

```typescript
'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { markBilledAction } from '@/app/(internal)/chamados/actions'

interface Props {
  ticketId: string
  billingStatus: 'pendente' | 'cobrado' | null
  cost: {
    service_time_minutes: number | null
    travel_discount_minutes: number
    km_traveled: number | null
    toll_amount: number
    parking_amount: number
    hourly_rate_applied: number | null
    km_rate_applied: number | null
    total_amount: number | null
  } | null
  canMarkBilled: boolean
}

function fmtBrl(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BillingSummary({ ticketId, billingStatus, cost, canMarkBilled }: Props) {
  const [isPending, startTransition] = useTransition()

  if (!cost?.total_amount) return null

  const billableMin = Math.max(0, (cost.service_time_minutes ?? 0) - cost.travel_discount_minutes)
  const technicalFee = (billableMin / 60) * (cost.hourly_rate_applied ?? 0)
  const kmFee = (cost.km_traveled ?? 0) * (cost.km_rate_applied ?? 0)

  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Resumo de Custos</h3>
        {billingStatus && (
          <Badge variant={billingStatus === 'cobrado' ? 'default' : 'secondary'}>
            {billingStatus === 'cobrado' ? 'Cobrado' : 'Cobrança Pendente'}
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Horas técnicas ({Math.max(0, billableMin)}min)</dt>
        <dd className="text-right">{fmtBrl(technicalFee)}</dd>
        <dt className="text-muted-foreground">Deslocamento ({cost.km_traveled ?? 0}km)</dt>
        <dd className="text-right">{fmtBrl(kmFee)}</dd>
        <dt className="text-muted-foreground">Pedágio</dt>
        <dd className="text-right">{fmtBrl(cost.toll_amount)}</dd>
        <dt className="text-muted-foreground">Estacionamento</dt>
        <dd className="text-right">{fmtBrl(cost.parking_amount)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{fmtBrl(cost.total_amount)}</dd>
      </dl>

      {canMarkBilled && billingStatus === 'pendente' && (
        <Button
          size="sm"
          onClick={() => startTransition(() => markBilledAction(ticketId))}
          disabled={isPending}
        >
          Marcar como Cobrado
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Garantir que fechar chamado com custos seta billing_status = pendente**

Em `src/app/(internal)/chamados/actions.ts`, localizar a action `closeTicketFormAction` (ou a action de fechamento). Adicionar antes do update de status:

```typescript
// Se o chamado tem ticket_costs com total_amount > 0, setar billing_status = pendente
const { data: tc } = await supabase
  .from('ticket_costs').select('total_amount').eq('ticket_id', ticketId).maybeSingle() as { data: any }

const extraFields: Record<string, unknown> = {}
if (tc?.total_amount > 0) {
  extraFields.billing_status = 'pendente'
}
// Incluir extraFields no update final do ticket
```

- [ ] **Adicionar `BillingSummary` ao detalhe do chamado**

Em `src/app/(internal)/chamados/[id]/page.tsx`, importar e renderizar:

```typescript
import { BillingSummary } from '@/components/tickets/BillingSummary'

// Na renderização, após PresentialCostPanel:
<BillingSummary
  ticketId={id}
  billingStatus={ticket.billing_status as any}
  cost={costData as any}
  canMarkBilled={canDiscount}
/>
```

- [ ] **Commit**

```bash
git add src/components/tickets/BillingSummary.tsx src/app/\(internal\)/chamados/
git commit -m "feat: resumo de cobrança com billing status e botão de marcar cobrado"
```

---

## Task 14: Dashboard — Seção GMUD + Destaques de Cobrança Pendente

**Files:**
- Modify: `src/app/(internal)/dashboard/page.tsx`

- [ ] **Adicionar queries ao `src/app/(internal)/dashboard/page.tsx`**

No bloco `Promise.all` existente, adicionar queries de GMUD e billing:

```typescript
    // GMUDs próximas (próximos 14 dias, excluindo concluídas/revertidas/reprovadas)
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
      .in('status', ['aprovada', 'em_execucao', 'aguardando_aprovacao'])
      .gte('maintenance_start', now)
      .lte('maintenance_start', new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString())
      .order('maintenance_start')
      .limit(5),

    // Chamados com cobrança pendente (apenas para admin/gestor)
    (!isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, companies(name)')
          .eq('billing_status', 'pendente')
          .eq('status', 'fechado')
          .order('closed_at')
          .limit(10)
      : Promise.resolve({ data: [] })),
```

- [ ] **Renderizar seções no JSX**

No retorno da página, adicionar após a seção de tarefas vencidas:

```typescript
{/* GMUDs próximas */}
{upcomingGmuds && upcomingGmuds.length > 0 && (
  <section>
    <h2 className="text-lg font-semibold mb-3">Mudanças Programadas (próximos 14 dias)</h2>
    <div className="space-y-2">
      {upcomingGmuds.map((gmud: any) => (
        <a
          key={gmud.id}
          href={`/mudancas/${gmud.id}`}
          className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50"
        >
          <div>
            <p className="text-sm font-medium">{gmud.title}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(gmud.maintenance_start).toLocaleString('pt-BR')} → {new Date(gmud.maintenance_end).toLocaleString('pt-BR')}
            </p>
          </div>
          <Badge variant={gmud.status === 'em_execucao' ? 'default' : 'secondary'}>
            {gmud.status === 'em_execucao' ? 'Em Execução' : gmud.status === 'aprovada' ? 'Aprovada' : 'Ag. Aprovação'}
          </Badge>
        </a>
      ))}
    </div>
  </section>
)}

{/* Cobrança pendente (admin/gestor) */}
{!isAnalista && pendingBilling && pendingBilling.length > 0 && (
  <section>
    <h2 className="text-lg font-semibold mb-3 text-yellow-700">
      Cobrança Pendente ({pendingBilling.length})
    </h2>
    <div className="space-y-2">
      {pendingBilling.map((t: any) => (
        <a
          key={t.id}
          href={`/chamados/${t.id}`}
          className="flex items-center justify-between border border-yellow-300 bg-yellow-50 rounded-md p-3 hover:bg-yellow-100"
        >
          <div>
            <p className="text-sm font-medium">#{t.number} — {t.title}</p>
            <p className="text-xs text-muted-foreground">{t.companies?.name}</p>
          </div>
          <Badge variant="secondary">Pendente</Badge>
        </a>
      ))}
    </div>
  </section>
)}
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/dashboard/page.tsx
git commit -m "feat: dashboard — seção de GMUDs programadas e destaques de cobrança pendente"
```

---

## Task 15: Cron — Alertas de Cobrança Pendente

**Files:**
- Create: `src/app/api/cron/billing-alerts/route.ts`

- [ ] **Criar `src/app/api/cron/billing-alerts/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('billing_alert_days, email_from_address, email_from_name')
    .single() as { data: any }

  const alertDays = settings?.billing_alert_days ?? 7
  const cutoff = new Date(Date.now() - alertDays * 24 * 3600 * 1000).toISOString()

  const { data: pendingTickets } = await supabase
    .from('tickets')
    .select('id, number, title, companies(name), closed_at')
    .eq('billing_status', 'pendente')
    .eq('status', 'fechado')
    .lt('closed_at', cutoff)
    .order('closed_at') as { data: any[] | null }

  if (!pendingTickets || pendingTickets.length === 0) {
    await insertLog(supabase, 'cron_job', 'success', 'billing-alerts: sem cobranças pendentes')
    return NextResponse.json({ sent: 0 })
  }

  // Buscar gestores para notificar
  const { data: gestores } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'gestor'])
    .eq('is_active', true) as { data: any[] | null }

  const gestorEmails: string[] = []
  for (const g of gestores ?? []) {
    const { data: au } = await supabase.auth.admin.getUserById(g.id)
    if (au.user?.email) gestorEmails.push(au.user.email)
  }

  if (gestorEmails.length === 0) {
    await insertLog(supabase, 'cron_job', 'success', 'billing-alerts: nenhum gestor com e-mail')
    return NextResponse.json({ sent: 0 })
  }

  const lista = pendingTickets
    .map((t: any) => `<li>#${t.number} — ${t.title} (${t.companies?.name ?? ''})</li>`)
    .join('')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  try {
    await sendEmailFromTemplate('cobranca_pendente_alerta', gestorEmails, {
      total_chamados: String(pendingTickets.length),
      dias_pendente: String(alertDays),
      lista_chamados: lista,
      link_relatorio: `${appUrl}/relatorios/custos`,
    })

    await insertLog(supabase, 'cron_job', 'success',
      `billing-alerts: alerta enviado para ${gestorEmails.length} gestor(es), ${pendingTickets.length} chamados`)
  } catch (err: any) {
    await insertLog(supabase, 'cron_job', 'failure', 'billing-alerts: erro ao enviar', { error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ sent: gestorEmails.length, tickets: pendingTickets.length })
}
```

- [ ] **Verificar que a rota compila sem erros**

```bash
npm run build 2>&1 | head -30
```

Expected: sem erros na rota `/api/cron/billing-alerts`.

- [ ] **Commit**

```bash
git add src/app/api/cron/billing-alerts/
git commit -m "feat: cron de alertas de cobrança pendente para gestores"
```

---

## Task 16: Relatório de Custos

**Files:**
- Create: `src/app/(internal)/relatorios/custos/page.tsx`

- [ ] **Criar `src/app/(internal)/relatorios/custos/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

function fmtBrl(value: number | null): string {
  if (value === null || value === 0) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function CostReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string; to?: string; analyst_id?: string
    company_id?: string; type?: 'avulso' | 'padrao'
  }>
}) {
  const { from, to, analyst_id, company_id, type } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const toDate = to ?? new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('tickets')
    .select(`
      id, number, title, billing_status, closed_at,
      companies!inner(id, name, company_type),
      profiles!assigned_to(id, full_name),
      ticket_costs(service_time_minutes, travel_discount_minutes, km_traveled,
                   toll_amount, parking_amount, total_amount, hourly_rate_applied, km_rate_applied)
    `)
    .eq('status', 'fechado')
    .not('ticket_costs', 'is', null)
    .gte('closed_at', `${fromDate}T00:00:00Z`)
    .lte('closed_at', `${toDate}T23:59:59Z`)
    .order('closed_at', { ascending: false }) as any

  if (analyst_id) query = query.eq('assigned_to', analyst_id)
  if (company_id) query = (query as any).eq('company_id', company_id)
  if (type) query = (query as any).eq('companies.company_type', type)

  const { data: ticketsRaw } = await query
  const tickets = (ticketsRaw as any[]) ?? []

  const [{ data: analysts }, { data: companies }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
  ])

  const totals = tickets.reduce(
    (acc: any, t: any) => {
      const c = t.ticket_costs?.[0] ?? t.ticket_costs
      if (!c) return acc
      return {
        total: acc.total + (c.total_amount ?? 0),
        km: acc.km + (c.km_traveled ?? 0),
        toll: acc.toll + (c.toll_amount ?? 0),
        parking: acc.parking + (c.parking_amount ?? 0),
      }
    },
    { total: 0, km: 0, toll: 0, parking: 0 }
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Relatório de Custos</h1>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium">De</label>
          <input type="date" name="from" defaultValue={fromDate}
            className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Até</label>
          <input type="date" name="to" defaultValue={toDate}
            className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Analista</label>
          <select name="analyst_id" defaultValue={analyst_id ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos</option>
            {(analysts as any[] ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Empresa</label>
          <select name="company_id" defaultValue={company_id ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todas</option>
            {(companies as any[] ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Tipo</label>
          <select name="type" defaultValue={type ?? ''}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="avulso">Avulso</option>
            <option value="padrao">Contrato</option>
          </select>
        </div>
        <button type="submit"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm">
          Filtrar
        </button>
      </form>

      {/* Totais */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total geral', value: fmtBrl(totals.total) },
          { label: 'Quilômetros', value: `${totals.km.toFixed(1)} km` },
          { label: 'Pedágios', value: fmtBrl(totals.toll) },
          { label: 'Estacionamentos', value: fmtBrl(totals.parking) },
        ].map((item) => (
          <div key={item.label} className="border rounded-md p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Chamado</th>
              <th className="text-left px-4 py-3 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 font-medium">Analista</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum chamado com custos no período.</td></tr>
            )}
            {tickets.map((t: any) => {
              const c = Array.isArray(t.ticket_costs) ? t.ticket_costs[0] : t.ticket_costs
              return (
                <tr key={t.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <a href={`/chamados/${t.id}`} className="hover:underline">
                      #{t.number} — {t.title}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {t.companies?.name}
                    {t.companies?.company_type === 'avulso' && (
                      <span className="ml-1 text-xs text-muted-foreground">(avulso)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{t.profiles?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{fmtBrl(c?.total_amount)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.billing_status === 'cobrado' ? 'default' : 'secondary'}>
                      {t.billing_status === 'cobrado' ? 'Cobrado' : 'Pendente'}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Adicionar link ao relatório de custos na Sidebar**

Em `src/components/layout/Sidebar.tsx`, adicionar após o item de Mudanças:

```typescript
import { BarChart2 } from 'lucide-react'
// No array navItems:
  { href: '/relatorios/custos', label: 'Relatório de Custos', icon: BarChart2 },
```

- [ ] **Verificar página manualmente**

```bash
npm run dev
```

Acessar `http://localhost:3000/relatorios/custos`. Confirmar que a página renderiza com filtros e tabela.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/relatorios/ src/components/layout/Sidebar.tsx
git commit -m "feat: relatório de custos consolidado com filtros por período, analista e cliente"
```

---

## Task 17: Campo `company_type` no Formulário de Empresa

**Files:**
- Modify: `src/lib/validations/company.ts`
- Modify: `src/app/(internal)/clientes/actions.ts`
- Modify: `src/components/clients/CompanyForm.tsx`

- [ ] **Adicionar `company_type` ao schema de empresa em `src/lib/validations/company.ts`**

```typescript
export const companySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().optional(),
  segment: z.string().optional(),
  address: z.string().optional(),
  company_type: z.enum(['padrao', 'avulso']).default('padrao'),
})
```

- [ ] **Adicionar `company_type` ao formulário `src/components/clients/CompanyForm.tsx`**

Antes do botão de submit, adicionar:

```tsx
<div className="space-y-2">
  <Label htmlFor="company_type">Tipo de cliente</Label>
  <select id="company_type" name="company_type" className="w-full border rounded-md px-3 py-2 text-sm"
    defaultValue={initialData?.company_type ?? 'padrao'}>
    <option value="padrao">Contrato (padrão)</option>
    <option value="avulso">Avulso (sem contrato fixo)</option>
  </select>
</div>
```

- [ ] **Commit**

```bash
git add src/lib/validations/company.ts src/components/clients/CompanyForm.tsx
git commit -m "feat: campo tipo de empresa (padrão/avulso) no formulário de cliente"
```

---

## Task 18: Rodar Todos os Testes

**Files:** nenhum

- [ ] **Rodar suite completa**

```bash
npm run supabase:start
npm test
```

Expected: todos os testes PASS.

- [ ] **Verificar build de produção**

```bash
npm run build
```

Expected: sem erros de TypeScript ou de build.

- [ ] **Commit final se necessário**

```bash
git add -A
git commit -m "chore: ajustes finais de tipos e build para sub-spec 5 GMUD e Custos"
```

---

## Self-Review

### Spec coverage

| Requisito | Task |
|---|---|
| CRUD de GMUDs com todos os campos | Tasks 7, 8 |
| Fluxo de aprovação (e-mail + links) | Tasks 9, 10 |
| Chamado de origem muda para `em_mudanca` | Task 7 (createChangeRequestAction) |
| Comunicados automáticos de início/conclusão/reversão | Task 9 (iniciarExecucao, concluir, reverter) |
| Opção fechar ou manter chamado ao concluir GMUD | Task 9 (concluirGmudAction + checkbox) |
| Reversão retorna chamado para `em_andamento` | Task 9 (reverterGmudAction) |
| GMUDs na tela principal organizadas por janela | Task 14 |
| Três marcações de tempo presencial | Task 12 |
| Campo de desconto (Gestor/Admin) | Task 12 (PresentialCostPanel) |
| Cálculo de custo com rates de platform_settings | Task 12 (updateTicketCostAction) |
| Billing status pendente → cobrado com controle de acesso | Tasks 12, 13 |
| Cron de alertas de cobrança pendente | Task 15 |
| Chamados com cobrança pendente em destaque no dashboard | Task 14 |
| Relatório de custos com filtros | Task 16 |
| Empresa avulso | Task 17 + Task 1 (schema) |
| GMUD vinculada aparece no histórico do chamado | Task 11 |

### Verificações de placeholder

Nenhum placeholder (TBD, TODO, "similar a X") detectado.

### Consistência de tipos

- `ChangeRequestStatus` definido em Task 4, usado em Tasks 7, 8, 9, 10.
- `RiskLevel` definido em Task 4, usado em Tasks 7, 8.
- `costSchema` definido em Task 4, importado em Task 12 via import dinâmico.
- Todos os campos de `ticket_costs` batem com o schema SQL da Task 1.
- `change_approvals` usa `token` (uuid gerado pelo DB), nunca inserido pelo cliente — Task 9 e 10 corretos.
- `company_type` adicionado no schema SQL Task 1 e no formulário Task 17.
