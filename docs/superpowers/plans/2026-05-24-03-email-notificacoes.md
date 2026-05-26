# Sub-spec 3: Notificações por E-mail, Feriados e Comunicados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar notificações automáticas por e-mail para eventos de chamados, importação de feriados via BrasilAPI com aviso antecipado por e-mail, e módulo completo de comunicados para disparo manual ou agendado para contatos de clientes.

**Architecture:** Notificações de chamados são adicionadas diretamente nas Server Actions existentes usando `sendEmailFromTemplate` (padrão novo). Destinatários são resolvidos por um helper centralizado `email-notifications.ts`. Feriados migram do schema `is_national/municipality` para `type/year`. Comunicados usam TipTap + Supabase Storage bucket `announcements`. Todos os crons novos seguem o padrão Bearer existente.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + Storage) · Resend SDK · TipTap 2.x · Zod v4 · Vitest

---

## Mapa de arquivos

```
supabase/migrations/
├── 20260524200001_email_notifications_schema.sql   # migrar holidays + novas tabelas
└── 20260524200002_email_notifications_rls.sql      # RLS + bucket announcements

src/
├── lib/
│   ├── email.ts                                    # +replyTo + attachments em SendEmailParams
│   ├── email-template-sender.ts                    # +opts.replyTo
│   └── email-notifications.ts                      # CREATE: helpers de destinatários
│   └── validations/
│       └── announcement.ts                         # CREATE
├── types/
│   └── database.ts                                 # atualizar holidays + novas tabelas
├── app/
│   ├── (internal)/
│   │   ├── configuracoes/feriados/
│   │   │   ├── actions.ts                          # novo schema (type/year) + importHolidaysAction
│   │   │   └── page.tsx                            # novo schema + botão importar
│   │   ├── comunicados/
│   │   │   ├── page.tsx                            # CREATE: lista
│   │   │   ├── novo/page.tsx                       # CREATE: formulário novo
│   │   │   ├── [id]/page.tsx                       # CREATE: detalhe/edição
│   │   │   └── actions.ts                          # CREATE
│   │   └── chamados/
│   │       └── actions.ts                          # +notificações em 5 funções existentes
│   ├── (portal)/portal/chamados/[id]/page.tsx      # +notifica analista na resposta
│   └── api/
│       ├── email/inbound/route.ts                  # CREATE: reply de ticket por e-mail
│       └── cron/
│           ├── ticket-automations/route.ts          # fix: incluir responsáveis de contrato
│           ├── agendamento/route.ts                 # fix: incluir responsáveis de contrato
│           ├── holiday-import/route.ts              # CREATE
│           ├── holiday-notice/route.ts              # CREATE
│           └── announcement-dispatch/route.ts       # CREATE
├── components/
│   ├── comunicados/
│   │   ├── AnnouncementList.tsx                    # CREATE
│   │   ├── AnnouncementForm.tsx                    # CREATE
│   │   └── RecipientSelector.tsx                   # CREATE
│   └── layout/Sidebar.tsx                          # +link Comunicados
tests/
├── email-notifications.test.ts                     # CREATE
└── announcement.test.ts                            # CREATE
```

---

## Task 1: Migration — Migrar schema holidays + criar tabelas do módulo

**Files:**
- Create: `supabase/migrations/20260524200001_email_notifications_schema.sql`
- Modify: `src/types/database.ts`
- Modify: `src/app/(internal)/configuracoes/feriados/actions.ts`
- Modify: `src/app/(internal)/configuracoes/feriados/page.tsx`

> Escrever migration e atualizar código ANTES de aplicar o `db reset`, pois a migration remove colunas que o código atual usa.

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new email_notifications_schema
```

- [ ] **Escrever migration** `supabase/migrations/20260524200001_email_notifications_schema.sql`

```sql
-- 1. Adicionar colunas type e year à tabela holidays
alter table public.holidays
  add column type text,
  add column year integer;

-- 2. Backfill: mapear is_national → type, extrair year da data
update public.holidays
  set
    type = case when is_national then 'nacional' else 'municipal' end,
    year = extract(year from date)::integer;

-- 3. Aplicar NOT NULL após backfill
alter table public.holidays
  alter column type set not null,
  alter column year set not null;

-- 4. Check constraint no campo type
alter table public.holidays
  add constraint holidays_type_check
  check (type in ('nacional', 'municipal', 'manual'));

-- 5. Remover index e colunas antigas
drop index if exists uq_holidays_date_municipality;
alter table public.holidays
  drop column is_national,
  drop column municipality;

-- 6. Nova constraint única (date, type)
alter table public.holidays
  add constraint holidays_date_type_unique unique (date, type);

-- 7. Tabela de controle de envio de avisos de feriado
create table public.holiday_notice_sent (
  id uuid primary key default gen_random_uuid(),
  holiday_id uuid not null references public.holidays(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (holiday_id, contact_id)
);

create index idx_holiday_notice_sent_holiday_id
  on public.holiday_notice_sent(holiday_id);

-- 8. Comunicados
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_rich_text jsonb,
  body_html text,
  recipient_type text not null
    check (recipient_type in ('all', 'company', 'department', 'manual')),
  recipient_company_id uuid references public.companies(id) on delete set null,
  recipient_departments text[],
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendado', 'enviado', 'cancelado')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create index idx_announcements_status on public.announcements(status);
create index idx_announcements_scheduled_at
  on public.announcements(scheduled_at) where status = 'agendado';

-- 9. Destinatários manuais de comunicado
create table public.announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  unique (announcement_id, contact_id)
);

create index idx_announcement_recipients_announcement_id
  on public.announcement_recipients(announcement_id);

-- 10. Anexos de comunicado
create table public.announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes integer,
  mime_type text,
  created_at timestamptz not null default now()
);
```

- [ ] **Atualizar `src/types/database.ts`** — substituir o bloco `holidays` e adicionar as novas tabelas logo após

Substituir:
```typescript
      holidays: {
        Row: {
          id: string; date: string; name: string
          is_national: boolean; municipality: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['holidays']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
      }
```

Por:
```typescript
      holidays: {
        Row: {
          id: string; date: string; name: string
          type: 'nacional' | 'municipal' | 'manual'; year: number; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['holidays']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
      }
      holiday_notice_sent: {
        Row: { id: string; holiday_id: string; contact_id: string; sent_at: string }
        Insert: Omit<Database['public']['Tables']['holiday_notice_sent']['Row'], 'id' | 'sent_at'>
        Update: never
      }
      announcements: {
        Row: {
          id: string; subject: string; body_rich_text: Json | null; body_html: string | null
          recipient_type: 'all' | 'company' | 'department' | 'manual'
          recipient_company_id: string | null; recipient_departments: string[] | null
          status: 'rascunho' | 'agendado' | 'enviado' | 'cancelado'
          scheduled_at: string | null; sent_at: string | null; recipient_count: number | null
          created_by: string; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>
      }
      announcement_recipients: {
        Row: { id: string; announcement_id: string; contact_id: string }
        Insert: Omit<Database['public']['Tables']['announcement_recipients']['Row'], 'id'>
        Update: never
      }
      announcement_attachments: {
        Row: {
          id: string; announcement_id: string; filename: string; storage_path: string
          size_bytes: number | null; mime_type: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcement_attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
```

- [ ] **Reescrever `src/app/(internal)/configuracoes/feriados/actions.ts`** com novo schema

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const holidaySchema = z.object({
  date: z.string().date('Data inválida'),
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['nacional', 'municipal', 'manual']).default('nacional'),
})

export async function createHolidayAction(formData: FormData) {
  const parsed = holidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
    type: formData.get('type') ?? 'nacional',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const year = new Date(parsed.data.date + 'T12:00:00').getFullYear()
  const supabase = await createClient()
  const { error } = await supabase
    .from('holidays')
    .insert({ ...parsed.data, year } as never)
  if (error?.code === '23505') return { error: 'Feriado já cadastrado nesta data e tipo.' }
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

- [ ] **Reescrever `src/app/(internal)/configuracoes/feriados/page.tsx`** com novo schema

```typescript
import { createClient } from '@/lib/supabase/server'
import { createHolidayAction, deleteHolidayAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const typeLabels: Record<string, string> = {
  nacional: 'Nacional',
  municipal: 'Municipal — SP',
  manual: 'Manual',
}

export default async function FeriadosPage() {
  const supabase = await createClient()
  const { data: holidays } = (await supabase
    .from('holidays')
    .select('id, date, name, type')
    .order('date')) as { data: any[] | null }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Feriados</h1>

      <form action={createHolidayAction as any} className="space-y-3 border rounded-md p-4">
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
          <Label htmlFor="type">Tipo</Label>
          <select
            id="type"
            name="type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="nacional">Nacional</option>
            <option value="municipal">Municipal — SP</option>
            <option value="manual">Manual</option>
          </select>
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
            {(holidays ?? []).map((h: any) => (
              <tr key={h.id} className="border-b">
                <td className="p-3">{new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-3">{h.name}</td>
                <td className="p-3 text-muted-foreground text-xs">{typeLabels[h.type] ?? h.type}</td>
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

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar no Studio** `http://127.0.0.1:54323` → `holidays` tem `type` e `year`; `holiday_notice_sent`, `announcements`, `announcement_recipients`, `announcement_attachments` existem.

- [ ] **Commit**

```bash
git add supabase/ src/types/database.ts src/app/(internal)/configuracoes/feriados/
git commit -m "feat: migrar schema holidays para type/year + criar tabelas holiday_notice_sent e announcements"
```

---

## Task 2: RLS + Storage bucket para comunicados

**Files:**
- Create: `supabase/migrations/20260524200002_email_notifications_rls.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new email_notifications_rls
```

- [ ] **Escrever migration** `supabase/migrations/20260524200002_email_notifications_rls.sql`

```sql
-- holiday_notice_sent: service role bypassa RLS automaticamente; sem policy necessária

-- RLS para announcements
alter table public.announcements enable row level security;

create policy "announcements_select_internal"
  on public.announcements for select
  using (public.is_internal());

create policy "announcements_insert_admin_gestor"
  on public.announcements for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "announcements_update_admin_gestor"
  on public.announcements for update
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status in ('rascunho', 'agendado')
  );

create policy "announcements_delete_admin_gestor"
  on public.announcements for delete
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status in ('rascunho', 'agendado')
  );

-- RLS para announcement_recipients e announcement_attachments
alter table public.announcement_recipients enable row level security;
alter table public.announcement_attachments enable row level security;

create policy "announcement_recipients_manage_admin_gestor"
  on public.announcement_recipients for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "announcement_attachments_manage_admin_gestor"
  on public.announcement_attachments for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- Bucket privado para anexos de comunicados
insert into storage.buckets (id, name, public)
values ('announcements', 'announcements', false)
on conflict (id) do nothing;

create policy "announcements_storage_insert_admin_gestor"
  on storage.objects for insert
  with check (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "announcements_storage_select_admin_gestor"
  on storage.objects for select
  using (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "announcements_storage_delete_admin_gestor"
  on storage.objects for delete
  using (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/
git commit -m "feat: RLS para announcements + storage bucket announcements"
```

---

## Task 3: Adicionar replyTo em sendEmail e sendEmailFromTemplate

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email-template-sender.ts`

- [ ] **Atualizar interface `SendEmailParams` e função `sendEmail` em `src/lib/email.ts`**

Substituir a interface e função existentes (manter todas as funções HTML hardcoded abaixo intocadas):

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from: string
  replyTo?: string
  attachments?: Array<{ filename: string; content: Buffer | Uint8Array; contentType?: string }>
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { error } = await resend.emails.send({
    from: params.from,
    to: typeof params.to === 'string' ? [params.to] : params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(params.attachments ? { attachments: params.attachments as any } : {}),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}
```

- [ ] **Atualizar `sendEmailFromTemplate` em `src/lib/email-template-sender.ts`** — adicionar parâmetro `opts`

```typescript
export async function sendEmailFromTemplate(
  slug: string,
  to: string | string[],
  vars: Record<string, string>,
  opts?: { replyTo?: string }
): Promise<void> {
  const supabase = await createServiceClient()

  const { data: templateRow, error } = await supabase
    .from('email_templates')
    .select('subject, body_html')
    .eq('slug', slug)
    .single()

  if (error || !templateRow) {
    throw new Error(`Template "${slug}" não encontrado: ${error?.message}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = templateRow as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('email_from_name, email_from_address, logo_light_url, company_name')
    .eq('id', 1)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any

  const subject = substituteVariables(template.subject, vars)
  const bodyHtml = substituteVariables(template.body_html, vars)
  const wrappedHtml = wrapEmailHtml(bodyHtml, {
    logoUrl: settings?.logo_light_url ?? null,
    companyName: settings?.company_name ?? null,
  })

  await sendEmail({
    to,
    subject,
    html: wrappedHtml,
    from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
    ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
  })
}
```

- [ ] **Commit**

```bash
git add src/lib/email.ts src/lib/email-template-sender.ts
git commit -m "feat: suporte a replyTo e attachments em sendEmail + replyTo em sendEmailFromTemplate"
```

---

## Task 4: Helper email-notifications.ts + teste de integração

**Files:**
- Create: `src/lib/email-notifications.ts`
- Create: `tests/email-notifications.test.ts`

- [ ] **Escrever teste** em `tests/email-notifications.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveContactEmails } from '@/lib/email-notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let companyId: string
let mainContactId: string
let responsibleContactId: string

beforeAll(async () => {
  const { data: company } = await supabase
    .from('companies')
    .insert({ name: 'Empresa Teste Notif' })
    .select('id')
    .single()
  companyId = company!.id

  const { data: contacts } = await supabase
    .from('contacts')
    .insert([
      { company_id: companyId, full_name: 'Contato Principal', email: 'principal@notif.test', is_contract_responsible: false, receives_ticket_cc: false },
      { company_id: companyId, full_name: 'Responsável', email: 'responsavel@notif.test', is_contract_responsible: true, receives_ticket_cc: false },
      { company_id: companyId, full_name: 'CC', email: 'cc@notif.test', is_contract_responsible: false, receives_ticket_cc: true },
      { company_id: companyId, full_name: 'Outro', email: 'outro@notif.test', is_contract_responsible: false, receives_ticket_cc: false },
    ])
    .select('id, email')

  mainContactId = contacts!.find(c => c.email === 'principal@notif.test')!.id
  responsibleContactId = contacts!.find(c => c.email === 'responsavel@notif.test')!.id
})

afterAll(async () => {
  await supabase.from('contacts').delete().eq('company_id', companyId)
  await supabase.from('companies').delete().eq('id', companyId)
})

describe('resolveContactEmails', () => {
  it('inclui contato principal + responsável + CC, exclui outros', async () => {
    const emails = await resolveContactEmails(supabase as any, mainContactId, companyId)
    expect(emails).toContain('principal@notif.test')
    expect(emails).toContain('responsavel@notif.test')
    expect(emails).toContain('cc@notif.test')
    expect(emails).not.toContain('outro@notif.test')
  })

  it('não duplica quando o contato principal também é responsável', async () => {
    const emails = await resolveContactEmails(supabase as any, responsibleContactId, companyId)
    const count = emails.filter(e => e === 'responsavel@notif.test').length
    expect(count).toBe(1)
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npm run supabase:start
npm test -- tests/email-notifications.test.ts
```

Expected: FAIL — `resolveContactEmails is not a function`

- [ ] **Criar `src/lib/email-notifications.ts`**

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any

export async function resolveContactEmails(
  supabase: SupabaseAny,
  contactId: string,
  companyId: string
): Promise<string[]> {
  const emails: string[] = []

  const { data: contact } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', contactId)
    .single()
  if ((contact as any)?.email) emails.push((contact as any).email)

  const { data: extras } = await supabase
    .from('contacts')
    .select('email')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .neq('id', contactId)
    .or('is_contract_responsible.eq.true,receives_ticket_cc.eq.true')

  for (const c of (extras ?? []) as any[]) {
    if (c.email && !emails.includes(c.email)) emails.push(c.email)
  }

  return emails
}

export async function resolveAnalystEmail(
  serviceSupabase: SupabaseAny,
  assignedTo: string | null
): Promise<string | null> {
  if (!assignedTo) return null
  const { data } = await serviceSupabase.auth.admin.getUserById(assignedTo)
  return (data as any).user?.email ?? null
}

export async function resolveNewTicketNotifyEmails(
  serviceSupabase: SupabaseAny
): Promise<string[]> {
  const { data: profiles } = await serviceSupabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'gestor'])
    .eq('notify_new_tickets', true)
    .eq('is_active', true)

  const emails: string[] = []
  for (const p of (profiles ?? []) as any[]) {
    const { data } = await serviceSupabase.auth.admin.getUserById(p.id)
    if ((data as any).user?.email) emails.push((data as any).user.email)
  }
  return emails
}
```

- [ ] **Rodar testes**

```bash
npm test -- tests/email-notifications.test.ts
```

Expected: PASS (2 testes)

- [ ] **Commit**

```bash
git add src/lib/email-notifications.ts tests/email-notifications.test.ts
git commit -m "feat: helper email-notifications — resolveContactEmails, resolveAnalystEmail, resolveNewTicketNotifyEmails"
```

---

## Task 5: Notificação chamado_aberto

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts`

Template `chamado_aberto` → vars: `numero_chamado`, `titulo_chamado`, `nome_cliente`, `link_chamado`, `prioridade`.
Destinatários: solicitante + responsáveis + gestores com `notify_new_tickets`.
`reply-to`: `chamado-{number}@reply.itramos.com.br` (requer domínio Resend Inbound configurado).

- [ ] **Adicionar `createServiceClient` ao import existente** na linha 4 de `actions.ts`

```typescript
import { createClient, createServiceClient } from '@/lib/supabase/server'
```

- [ ] **Adicionar notificação ao final de `createTicketAction`**, após o bloco de cálculo de SLA e antes do `redirect`

```typescript
  // Notificar solicitante + responsáveis + gestores com notify_new_tickets
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, priority, contact_id, company_id, contacts(full_name)')
      .eq('id', ticket!.id)
      .single()
    const tf = ticketFull as any
    const { resolveContactEmails, resolveNewTicketNotifyEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const [contactEmails, gestorEmails] = await Promise.all([
      resolveContactEmails(supabase, parsed.data.contact_id, parsed.data.company_id),
      resolveNewTicketNotifyEmails(serviceSupabase),
    ])
    const allEmails = [...new Set([...contactEmails, ...gestorEmails])]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (allEmails.length > 0) {
      await sendEmailFromTemplate(
        'chamado_aberto',
        allEmails,
        {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/portal/chamados/${ticket!.id}`,
          prioridade: tf.priority,
        },
        { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
      )
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_aberto:', e)
  }
```

- [ ] **Verificar manualmente**

```bash
npm run dev
```

Criar um chamado. Verificar console sem erros de envio.

- [ ] **Commit**

```bash
git add src/app/(internal)/chamados/actions.ts
git commit -m "feat: notificação chamado_aberto ao criar ticket"
```

---

## Task 6: Notificações analista_respondeu + cliente_atualizou

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts` (addInteractionAction)
- Modify: `src/app/(portal)/portal/chamados/[id]/page.tsx` (sendPortalReplyAction)

Template `analista_respondeu` → vars: `numero_chamado`, `titulo_chamado`, `nome_cliente`, `nome_analista`, `link_chamado`.
Não existe template para notificar analista quando cliente responde — usar `sendEmail` com HTML inline (padrão legado) até criação de template `cliente_respondeu`.

- [ ] **Adicionar notificação ao final de `addInteractionAction`** em `actions.ts`, após o bloco `if (isFirstResponse)` e antes do `revalidatePath`

```typescript
  // Notificar solicitante + responsáveis quando analista posta mensagem
  if (parsed.data.type === 'mensagem') {
    try {
      const serviceSupabase = await createServiceClient()
      const { data: ticketFull } = await supabase
        .from('tickets')
        .select('number, title, contact_id, company_id, contacts(full_name)')
        .eq('id', parsed.data.ticket_id)
        .single()
      const tf = ticketFull as any
      const { data: analystProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user!.id)
        .single()
      const { resolveContactEmails } = await import('@/lib/email-notifications')
      const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate(
          'analista_respondeu',
          contactEmails,
          {
            numero_chamado: String(tf.number),
            titulo_chamado: tf.title,
            nome_cliente: (tf.contacts as any)?.full_name ?? '',
            nome_analista: (analystProfile as any)?.full_name ?? '',
            link_chamado: `${appUrl}/portal/chamados/${parsed.data.ticket_id}`,
          },
          { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
        )
      }
    } catch (e) {
      console.error('Erro ao enviar notificação analista_respondeu:', e)
    }
  }
```

- [ ] **Adicionar notificação em `sendPortalReplyAction`** em `src/app/(portal)/portal/chamados/[id]/page.tsx`, após o insert da interação e antes de `revalidatePath`

```typescript
  // Notificar analista quando cliente responde via portal
  try {
    const { data: ticketForNotif } = await supabase
      .from('tickets')
      .select('number, title, assigned_to')
      .eq('id', ticketId)
      .single()
    const tn = ticketForNotif as any
    if (tn.assigned_to) {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const serviceSupabase = await createServiceClient()
      const { resolveAnalystEmail } = await import('@/lib/email-notifications')
      const analystEmail = await resolveAnalystEmail(serviceSupabase, tn.assigned_to)
      if (analystEmail) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('full_name')
          .eq('id', contact.id)
          .single()
        const { data: settingsRaw } = await serviceSupabase
          .from('platform_settings')
          .select('email_from_name, email_from_address')
          .single()
        const settings = settingsRaw as any
        const { sendEmail, buildFromAddress } = await import('@/lib/email')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL!
        await sendEmail({
          to: analystEmail,
          subject: `Retorno do cliente — Chamado #${tn.number}`,
          from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
          html: `<p>O cliente <strong>${(contactData as any)?.full_name ?? ''}</strong> respondeu ao chamado <strong>#${tn.number} — ${tn.title}</strong>.</p><p><a href="${appUrl}/chamados/${ticketId}">Abrir chamado</a></p>`,
        })
      }
    }
  } catch (e) {
    console.error('Erro ao notificar analista sobre resposta do cliente:', e)
  }
```

- [ ] **Commit**

```bash
git add src/app/(internal)/chamados/actions.ts src/app/(portal)/portal/chamados/[id]/page.tsx
git commit -m "feat: notificação analista_respondeu ao solicitante + notifica analista quando cliente responde"
```

---

## Task 7: Notificações status_alterado, chamado_fechado, chamado_reaberto

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts` (changeStatusAction, closeWithResolutionAction, reopenTicketAction)

Templates:
- `status_alterado` → vars: `numero_chamado`, `titulo_chamado`, `nome_cliente`, `novo_status`, `link_chamado` → para contatos
- `chamado_fechado` → vars: `numero_chamado`, `titulo_chamado`, `nome_cliente`, `link_chamado` → para contatos
- `chamado_reaberto` → vars: `numero_chamado`, `titulo_chamado`, `nome_cliente`, `link_chamado` → para analista (`nome_cliente` = nome do contato para contexto de qual chamado foi reaberto)

- [ ] **Em `changeStatusAction`**, adicionar bloco após `revalidatePath`

```typescript
  // Notificações por e-mail na mudança de status
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, contact_id, company_id, assigned_to, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    const { resolveContactEmails, resolveAnalystEmail } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')

    if (newStatus === 'fechado') {
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate('chamado_fechado', contactEmails, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
        }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
      }
    } else if (newStatus === 'reaberto') {
      const analystEmail = await resolveAnalystEmail(serviceSupabase, tf.assigned_to)
      if (analystEmail) {
        await sendEmailFromTemplate('chamado_reaberto', analystEmail, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/chamados/${ticketId}`,
        })
      }
    } else {
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate('status_alterado', contactEmails, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          novo_status: newStatus,
          link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
        }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
      }
    }
  } catch (e) {
    console.error('Erro ao enviar notificação de status:', e)
  }
```

- [ ] **Em `closeWithResolutionAction`**, adicionar bloco após o `if (createArticle)` e antes de `revalidatePath`

```typescript
  // Notificar contatos sobre fechamento com resolução
  try {
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, contact_id, company_id, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const { resolveContactEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (contactEmails.length > 0) {
      await sendEmailFromTemplate('chamado_fechado', contactEmails, {
        numero_chamado: String(tf.number),
        titulo_chamado: ticket!.title,
        nome_cliente: (tf.contacts as any)?.full_name ?? '',
        link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
      }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_fechado em closeWithResolution:', e)
  }
```

- [ ] **Em `reopenTicketAction`**, adicionar bloco após o insert da interação e antes de `revalidatePath`

```typescript
  // Notificar analista sobre reabertura
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, assigned_to, contact_id, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const { resolveAnalystEmail } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const analystEmail = await resolveAnalystEmail(serviceSupabase, tf.assigned_to)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (analystEmail) {
      await sendEmailFromTemplate('chamado_reaberto', analystEmail, {
        numero_chamado: String(tf.number),
        titulo_chamado: tf.title,
        nome_cliente: (tf.contacts as any)?.full_name ?? '',
        link_chamado: `${appUrl}/chamados/${ticketId}`,
      })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_reaberto:', e)
  }
```

- [ ] **Commit**

```bash
git add src/app/(internal)/chamados/actions.ts
git commit -m "feat: notificações status_alterado, chamado_fechado e chamado_reaberto"
```

---

## Task 8: Migrar linkKbArticleAction para sendEmailFromTemplate + responsáveis

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts` (linkKbArticleAction)

Template `kb_artigo_vinculado` → vars: `numero_chamado`, `nome_cliente`, `titulo_artigo`, `resumo_artigo`, `link_confirmar`, `link_negar`.

- [ ] **Atualizar o select de tickets em `linkKbArticleAction`** para incluir `contact_id`, `company_id`, `contacts(full_name)`

Substituir a linha do select de tickets:
```typescript
    supabase.from('tickets').select('number, title, contact_id, company_id, contacts(full_name)').eq('id', ticketId).single(),
```

- [ ] **Substituir o bloco de envio de e-mail** (de `const contactEmail = ...` até o fim do `if (contactEmail)`) por

```typescript
  // Enviar kb_artigo_vinculado para solicitante + responsáveis via sendEmailFromTemplate
  try {
    const tf = ticket as any
    const art = article as any
    const { resolveContactEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (contactEmails.length > 0) {
      await sendEmailFromTemplate(
        'kb_artigo_vinculado',
        contactEmails,
        {
          numero_chamado: String(tf.number),
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          titulo_artigo: art.title,
          resumo_artigo: art.summary ?? '',
          link_confirmar: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=true`,
          link_negar: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=false`,
        },
        { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
      )
    }
  } catch (e) {
    console.error('Erro ao enviar kb_artigo_vinculado:', e)
  }
```

- [ ] **Verificar imports** — `kbLinkHtml` pode ser removido do import se não for mais referenciado em nenhuma outra função do arquivo. Manter `approvalRequestHtml` e `buildFromAddress`.

```bash
npm run lint
```

Expected: Sem erros.

- [ ] **Commit**

```bash
git add src/app/(internal)/chamados/actions.ts
git commit -m "feat: migrar linkKbArticleAction para sendEmailFromTemplate + incluir responsáveis de contrato"
```

---

## Task 9: Corrigir destinatários nos crons existentes (responsáveis de contrato)

**Files:**
- Modify: `src/app/api/cron/ticket-automations/route.ts`
- Modify: `src/app/api/cron/agendamento/route.ts`

Os crons existentes enviam apenas para o contato principal. O spec exige `is_contract_responsible` e `receives_ticket_cc` também. Mantêm padrão legado de HTML.

- [ ] **Em `ticket-automations/route.ts`**, atualizar select dos tickets aguardando cliente para incluir `contact_id` e `company_id`

```typescript
  const { data: awaitingClientTickets } = await supabase
    .from('tickets')
    .select('id, number, title, updated_at, contact_id, company_id, contacts(email, full_name), assigned_to')
    .eq('status', 'aguardando_cliente')
```

- [ ] **Adicionar função helper inline** logo após o `const now = new Date()` no handler de `ticket-automations`

```typescript
  async function resolveTicketContactEmails(contactId: string, companyId: string): Promise<string[]> {
    const { data: main } = await supabase.from('contacts').select('email').eq('id', contactId).single()
    const { data: extras } = await supabase
      .from('contacts').select('email')
      .eq('company_id', companyId).eq('is_active', true).neq('id', contactId)
      .or('is_contract_responsible.eq.true,receives_ticket_cc.eq.true')
    const emails: string[] = []
    if ((main as any)?.email) emails.push((main as any).email)
    for (const c of (extras ?? []) as any[]) {
      if (c.email && !emails.includes(c.email)) emails.push(c.email)
    }
    return emails
  }
```

- [ ] **Substituir `to: contactEmail` pelo array resolvido** no bloco de lembrete de 24h

```typescript
      const contactEmails = await resolveTicketContactEmails(ticket.contact_id, ticket.company_id)
      if (contactEmails.length > 0) {
        await sendEmail({
          to: contactEmails,
          subject: `Aguardamos seu retorno — Chamado #${ticket.number}`,
          from,
          html: awaitingClientReminderHtml({
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            portalUrl: appUrl,
          }),
        })
        // ...resto do bloco existente (insert da interação)
      }
```

- [ ] **Em `agendamento/route.ts`**, atualizar select dos scheduled tickets

```typescript
  const { data: scheduledTickets } = await supabase
    .from('tickets')
    .select('id, number, title, scheduled_at, assigned_to, contact_id, company_id, contacts(email)')
    .eq('status', 'agendado')
    .not('scheduled_at', 'is', null)
```

- [ ] **Substituir montagem de `recipients`** no bloco do lembrete de 15min em `agendamento`

```typescript
      const recipients: string[] = []
      if (ticket.assigned_to) {
        const { data: au } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (au.user?.email) recipients.push(au.user.email)
      }
      const { data: mainContact } = await supabase
        .from('contacts').select('email').eq('id', ticket.contact_id).single()
      const { data: extraContacts } = await supabase
        .from('contacts').select('email')
        .eq('company_id', ticket.company_id).eq('is_active', true)
        .neq('id', ticket.contact_id)
        .or('is_contract_responsible.eq.true,receives_ticket_cc.eq.true')
      if ((mainContact as any)?.email) recipients.push((mainContact as any).email)
      for (const c of (extraContacts ?? []) as any[]) {
        if (c.email && !recipients.includes(c.email)) recipients.push(c.email)
      }
```

- [ ] **Commit**

```bash
git add src/app/api/cron/ticket-automations/route.ts src/app/api/cron/agendamento/route.ts
git commit -m "fix: incluir responsáveis de contrato nos destinatários dos crons de automação e agendamento"
```

---

## Task 10: Endpoint de resposta por e-mail — /api/email/inbound

**Files:**
- Create: `src/app/api/email/inbound/route.ts`

Recebe replies a `chamado-{number}@reply.itramos.com.br` via Resend Inbound. Requer configuração do domínio `reply.itramos.com.br` como Inbound Domain no painel Resend e apontamento do webhook para `POST /api/email/inbound`.

Respostas após 7 dias do fechamento → descartadas com e-mail informativo.
Texto citado (linhas com `>`) → ignorado. Imagens inline → nunca processadas.

- [ ] **Criar `src/app/api/email/inbound/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, buildFromAddress } from '@/lib/email'

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractTicketNumber(to: string): number | null {
  const match = to.match(/chamado-(\d+)@/)
  return match ? parseInt(match[1], 10) : null
}

function stripQuotedText(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.startsWith('>'))
    .join('\n')
    .trim()
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_INBOUND_SECRET
  if (secret) {
    const signature = request.headers.get('svix-signature')
    if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  let payload: { from: string; to: string; subject?: string; text?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fromEmail = extractEmail(payload.from).toLowerCase()
  const ticketNumber = extractTicketNumber(payload.to)
  if (!ticketNumber) {
    return NextResponse.json({ ok: true, action: 'discarded_no_ticket_number' })
  }

  const supabase = await createServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, number, title, status, closed_at, contact_id, company_id, assigned_to')
    .eq('number', ticketNumber)
    .single()

  if (!ticket) {
    return NextResponse.json({ ok: true, action: 'discarded_ticket_not_found' })
  }
  const tf = ticket as any

  // Verificar se remetente é contato autorizado da empresa
  const { data: senderContact } = await supabase
    .from('contacts')
    .select('id, full_name')
    .eq('email', fromEmail)
    .eq('company_id', tf.company_id)
    .eq('is_active', true)
    .single()

  if (!senderContact) {
    return NextResponse.json({ ok: true, action: 'discarded_unauthorized_sender' })
  }

  // Verificar prazo de reabertura (7 dias após fechamento)
  if (tf.status === 'fechado' && tf.closed_at) {
    const closedAt = new Date(tf.closed_at)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000)
    if (closedAt < sevenDaysAgo) {
      const { data: settings } = await supabase
        .from('platform_settings').select('email_from_name, email_from_address').single()
      const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
      await sendEmail({
        to: fromEmail,
        subject: `Re: Chamado #${tf.number} — prazo expirado`,
        from,
        html: `<p>O chamado <strong>#${tf.number}</strong> foi encerrado há mais de 7 dias. Para nova solicitação, abra um novo chamado no portal.</p>`,
      })
      return NextResponse.json({ ok: true, action: 'discarded_reopen_expired' })
    }
  }

  // Extrair corpo da resposta (ignorar texto citado)
  const rawText = payload.text ?? ''
  const replyText = stripQuotedText(rawText)
  if (!replyText) {
    return NextResponse.json({ ok: true, action: 'discarded_empty_reply' })
  }

  // Adicionar interação ao chamado
  await supabase.from('ticket_interactions').insert({
    ticket_id: tf.id,
    type: 'mensagem',
    content: replyText,
    author_contact_id: (senderContact as any).id,
  } as never)

  // Se aguardando cliente → retomar em_andamento
  if (tf.status === 'aguardando_cliente') {
    await supabase.from('tickets').update({ status: 'em_andamento' } as never).eq('id', tf.id)
  }

  // Notificar analista responsável
  if (tf.assigned_to) {
    const { data: au } = await supabase.auth.admin.getUserById(tf.assigned_to)
    if (au.user?.email) {
      const { data: settings } = await supabase
        .from('platform_settings').select('email_from_name, email_from_address').single()
      const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      await sendEmail({
        to: au.user.email,
        subject: `Retorno por e-mail — Chamado #${tf.number}`,
        from,
        html: `<p>O cliente <strong>${(senderContact as any).full_name}</strong> respondeu ao chamado <strong>#${tf.number} — ${tf.title}</strong> via e-mail.</p><p><a href="${appUrl}/chamados/${tf.id}">Abrir chamado</a></p>`,
      })
    }
  }

  await supabase.from('system_logs').insert({
    category: 'email_received',
    status: 'success',
    description: `Resposta de ${fromEmail} adicionada ao chamado #${tf.number}`,
  } as never)

  return NextResponse.json({ ok: true, action: 'reply_added' })
}
```

- [ ] **Adicionar `RESEND_INBOUND_SECRET` ao `.env.local`**

```
RESEND_INBOUND_SECRET=  # signing secret do Resend Inbound (pode deixar vazio em dev)
```

- [ ] **Commit**

```bash
git add src/app/api/email/inbound/route.ts .env.local
git commit -m "feat: endpoint /api/email/inbound para respostas de chamado via e-mail (Resend Inbound)"
```

---

## Task 11: Importação de feriados via BrasilAPI

**Files:**
- Create: `src/app/api/cron/holiday-import/route.ts`
- Modify: `src/app/(internal)/configuracoes/feriados/actions.ts`
- Modify: `src/app/(internal)/configuracoes/feriados/page.tsx`

BrasilAPI: `GET https://brasilapi.com.br/api/feriados/v1/{ano}` → `[{ date: "YYYY-MM-DD", name: "...", type: "national"|"bank"|... }]`

- [ ] **Criar `src/app/api/cron/holiday-import/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface BrasilAPIHoliday {
  date: string
  name: string
  type: 'national' | 'bank' | 'optional' | 'observance'
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const year = new URL(request.url).searchParams.get('year')
    ?? new Date().getFullYear().toString()

  const supabase = await createServiceClient()

  const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`)
  if (!response.ok) {
    await supabase.from('system_logs').insert({
      category: 'cron_job',
      status: 'failure',
      description: `Falha ao importar feriados ${year} da BrasilAPI`,
      details: { status: response.status },
    } as never)
    return NextResponse.json({ error: 'BrasilAPI request failed' }, { status: 502 })
  }

  const holidays: BrasilAPIHoliday[] = await response.json()
  let imported = 0
  let skipped = 0

  for (const h of holidays) {
    const type = h.type === 'national' ? 'nacional' : 'municipal'
    const { error } = await supabase
      .from('holidays')
      .insert({ date: h.date, name: h.name, type, year: parseInt(year) } as never)

    if (error?.code === '23505') skipped++
    else if (!error) imported++
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Feriados ${year} importados da BrasilAPI`,
    details: { imported, skipped, total: holidays.length },
  } as never)

  return NextResponse.json({ ok: true, year, imported, skipped })
}
```

- [ ] **Adicionar `importHolidaysAction`** ao final de `src/app/(internal)/configuracoes/feriados/actions.ts`

```typescript
export async function importHolidaysAction(year?: number) {
  const targetYear = year ?? new Date().getFullYear()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const response = await fetch(
    `${appUrl}/api/cron/holiday-import?year=${targetYear}`,
    { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
  )

  if (!response.ok) return { error: 'Falha ao importar feriados. Tente novamente.' }

  const result = await response.json()
  revalidatePath('/configuracoes/feriados')
  return { success: true, imported: result.imported as number, skipped: result.skipped as number }
}
```

- [ ] **Adicionar botão de importação à `page.tsx` de feriados** — criar componente client e incluir abaixo do `<h1>`

Adicionar no topo do arquivo:

```typescript
import { ImportHolidaysButton } from './ImportHolidaysButton'
```

Criar `src/app/(internal)/configuracoes/feriados/ImportHolidaysButton.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { importHolidaysAction } from './actions'
import { Button } from '@/components/ui/button'

export function ImportHolidaysButton() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleImport() {
    setLoading(true)
    setMsg(null)
    const result = await (importHolidaysAction as () => Promise<any>)()
    setLoading(false)
    if (result.error) setMsg(`Erro: ${result.error}`)
    else setMsg(`${result.imported} importados, ${result.skipped} já existentes.`)
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={handleImport} disabled={loading}>
        {loading ? 'Importando...' : 'Importar feriados nacionais (BrasilAPI)'}
      </Button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  )
}
```

- [ ] **Verificar manualmente**

```bash
npm run dev
```

Abrir `/configuracoes/feriados` → clicar "Importar feriados nacionais" → confirmar que feriados aparecem na tabela.

- [ ] **Commit**

```bash
git add src/app/api/cron/holiday-import/route.ts src/app/(internal)/configuracoes/feriados/
git commit -m "feat: importação de feriados via BrasilAPI — cron + action + botão na UI"
```

---

## Task 12: Cron de aviso de feriado

**Files:**
- Create: `src/app/api/cron/holiday-notice/route.ts`

Template `aviso_feriado` → vars: `nome_cliente`, `data_feriado`, `nome_feriado`.
Destinatários: contatos com `is_contract_responsible = true` de empresas com contrato ativo.
Antecedência: `platform_settings.holiday_notice_days` (padrão 7).
Controle de reenvio: `holiday_notice_sent` (unique holiday_id + contact_id).

- [ ] **Criar `src/app/api/cron/holiday-notice/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings').select('holiday_notice_days').single()
  const noticeDays = (settings as any)?.holiday_notice_days ?? 7

  const windowStart = now.toISOString().slice(0, 10)
  const windowEnd = new Date(now.getTime() + noticeDays * 24 * 3_600_000)
    .toISOString().slice(0, 10)

  const { data: upcomingHolidays } = await supabase
    .from('holidays')
    .select('id, name, date')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  if (!upcomingHolidays?.length) {
    return NextResponse.json({ ok: true, noticesSent: 0 })
  }

  // Responsáveis de contratos ativos
  const { data: responsibles } = await supabase
    .from('contacts')
    .select('id, full_name, email, company_id, companies!inner(contracts(status))')
    .eq('is_contract_responsible', true)
    .eq('is_active', true)

  let noticesSent = 0

  for (const holiday of upcomingHolidays) {
    for (const contact of (responsibles ?? []) as any[]) {
      const hasActiveContract = (contact.companies?.contracts ?? [])
        .some((c: any) => c.status === 'ativo')
      if (!hasActiveContract) continue

      // Verificar se já enviado para este par (holiday, contact)
      const { data: alreadySent } = await supabase
        .from('holiday_notice_sent')
        .select('id')
        .eq('holiday_id', holiday.id)
        .eq('contact_id', contact.id)
        .single()
      if (alreadySent) continue

      const formattedDate = new Date(holiday.date + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })

      try {
        await sendEmailFromTemplate('aviso_feriado', contact.email, {
          nome_cliente: contact.full_name,
          data_feriado: formattedDate,
          nome_feriado: holiday.name,
        })

        await supabase.from('holiday_notice_sent').insert({
          holiday_id: holiday.id,
          contact_id: contact.id,
        } as never)

        noticesSent++
      } catch (e) {
        console.error(`Erro ao enviar aviso feriado ${holiday.name} para ${contact.email}:`, e)
      }
    }
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Avisos de feriado enviados`,
    details: { noticesSent, holidaysChecked: upcomingHolidays.length },
  } as never)

  return NextResponse.json({ ok: true, noticesSent })
}
```

- [ ] **Testar o endpoint localmente**

```bash
curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/holiday-notice
```

Expected: `{"ok":true,"noticesSent":0}` (0 se não há feriados na janela atual).

- [ ] **Commit**

```bash
git add src/app/api/cron/holiday-notice/route.ts
git commit -m "feat: cron de aviso de feriado com controle de reenvio via holiday_notice_sent"
```

---

## Task 13: Comunicados — Validação, CRUD e lista

**Files:**
- Create: `src/lib/validations/announcement.ts`
- Create: `tests/announcement.test.ts`
- Create: `src/app/(internal)/comunicados/actions.ts`
- Create: `src/app/(internal)/comunicados/page.tsx`
- Create: `src/components/comunicados/AnnouncementList.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Escrever teste** em `tests/announcement.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { announcementSchema } from '@/lib/validations/announcement'

describe('announcementSchema', () => {
  it('rejeita assunto vazio', () => {
    const result = announcementSchema.safeParse({
      subject: '',
      body_html: '<p>teste</p>',
      recipient_type: 'all',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita recipient_type inválido', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>teste</p>',
      recipient_type: 'todos',
    })
    expect(result.success).toBe(false)
  })

  it('aceita comunicado válido para todos', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado Dezembro',
      body_html: '<p>Olá</p>',
      recipient_type: 'all',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita tipo company sem recipient_company_id', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>Olá</p>',
      recipient_type: 'company',
    })
    expect(result.success).toBe(false)
  })

  it('aceita comunicado agendado com data válida', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>Olá</p>',
      recipient_type: 'company',
      recipient_company_id: '123e4567-e89b-12d3-a456-426614174000',
      scheduled_at: '2026-12-25T09:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npm test -- tests/announcement.test.ts
```

Expected: FAIL — `announcementSchema is not a function`

- [ ] **Criar `src/lib/validations/announcement.ts`**

```typescript
import { z } from 'zod'

export const announcementSchema = z.object({
  subject: z.string().min(1, 'Assunto é obrigatório'),
  body_html: z.string().min(1, 'Conteúdo é obrigatório'),
  body_rich_text: z.record(z.string(), z.unknown()).optional(),
  recipient_type: z.enum(['all', 'company', 'department', 'manual']),
  recipient_company_id: z.string().uuid().optional(),
  recipient_departments: z.array(z.string()).optional(),
  scheduled_at: z.string().datetime().optional(),
}).refine(
  data => data.recipient_type !== 'company' || !!data.recipient_company_id,
  { message: 'Empresa é obrigatória para tipo "company"', path: ['recipient_company_id'] }
).refine(
  data => data.recipient_type !== 'department' || (data.recipient_departments?.length ?? 0) > 0,
  { message: 'Selecione ao menos um departamento', path: ['recipient_departments'] }
)

export type AnnouncementInput = z.infer<typeof announcementSchema>
```

- [ ] **Rodar testes**

```bash
npm test -- tests/announcement.test.ts
```

Expected: PASS (5 testes)

- [ ] **Criar `src/app/(internal)/comunicados/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { announcementSchema } from '@/lib/validations/announcement'

export async function createAnnouncementAction(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries())
  const depts = formData.getAll('recipient_departments')
  if (depts.length > 0) raw.recipient_departments = depts

  const parsed = announcementSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      ...parsed.data,
      status: parsed.data.scheduled_at ? 'agendado' : 'rascunho',
      created_by: user!.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  revalidatePath('/comunicados')
  return { success: true, id: announcement!.id }
}

export async function updateAnnouncementAction(id: string, formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries())
  const depts = formData.getAll('recipient_departments')
  if (depts.length > 0) raw.recipient_departments = depts

  const parsed = announcementSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({
      ...parsed.data,
      status: parsed.data.scheduled_at ? 'agendado' : 'rascunho',
    } as never)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/comunicados')
  revalidatePath(`/comunicados/${id}`)
  return { success: true }
}

export async function saveBodyAction(id: string, bodyHtml: string, bodyRichText: object) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ body_html: bodyHtml, body_rich_text: bodyRichText } as never)
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function cancelAnnouncementAction(id: string) {
  const supabase = await createClient()
  await supabase.from('announcements').update({ status: 'cancelado' } as never).eq('id', id)
  revalidatePath('/comunicados')
}

export async function deleteAnnouncementAction(id: string) {
  const supabase = await createClient()
  await supabase.from('announcements').delete().eq('id', id)
  revalidatePath('/comunicados')
}

// Resolver destinatários conforme recipient_type
async function resolveAnnouncementRecipients(
  supabase: ReturnType<Awaited<ReturnType<typeof createServiceClient>>>,
  ann: any
): Promise<Array<{ id: string; email: string; full_name: string }>> {
  if (ann.recipient_type === 'all') {
    const { data } = await (supabase as any).from('contacts').select('id, email, full_name').eq('is_active', true)
    return data ?? []
  }
  if (ann.recipient_type === 'company') {
    const { data } = await (supabase as any).from('contacts').select('id, email, full_name')
      .eq('company_id', ann.recipient_company_id).eq('is_active', true)
    return data ?? []
  }
  if (ann.recipient_type === 'department') {
    const { data } = await (supabase as any).from('contacts').select('id, email, full_name')
      .in('department', ann.recipient_departments ?? []).eq('is_active', true)
    return data ?? []
  }
  // manual
  const { data } = await (supabase as any).from('announcement_recipients')
    .select('contacts(id, email, full_name)').eq('announcement_id', ann.id)
  return (data ?? []).map((r: any) => r.contacts).filter(Boolean)
}

export async function sendAnnouncementAction(id: string) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: ann } = (await supabase.from('announcements').select('*').eq('id', id).single()) as { data: any }
  if (!ann) return { error: 'Comunicado não encontrado' }
  if (!['rascunho', 'agendado'].includes(ann.status)) return { error: 'Comunicado já enviado ou cancelado' }
  if (!ann.body_html) return { error: 'Conteúdo do comunicado está vazio' }

  const recipients = await resolveAnnouncementRecipients(serviceSupabase as any, ann)
  if (recipients.length === 0) return { error: 'Nenhum destinatário encontrado' }

  const { data: settings } = (await (serviceSupabase as any)
    .from('platform_settings')
    .select('email_from_name, email_from_address, logo_light_url, company_name')
    .single()) as { data: any }

  const { wrapEmailHtml } = await import('@/lib/email-template-sender')
  const { sendEmail, buildFromAddress } = await import('@/lib/email')

  // Buscar e baixar anexos do Storage
  const { data: attachments } = (await (serviceSupabase as any)
    .from('announcement_attachments')
    .select('filename, storage_path, mime_type')
    .eq('announcement_id', id)) as { data: any[] | null }

  const emailAttachments: Array<{ filename: string; content: Buffer; contentType?: string }> = []
  for (const att of attachments ?? []) {
    const { data: fileData } = await (serviceSupabase as any).storage
      .from('announcements').download(att.storage_path)
    if (fileData) {
      emailAttachments.push({
        filename: att.filename,
        content: Buffer.from(await (fileData as Blob).arrayBuffer()),
        contentType: att.mime_type ?? undefined,
      })
    }
  }

  const wrappedHtml = wrapEmailHtml(ann.body_html, {
    logoUrl: settings?.logo_light_url ?? null,
    companyName: settings?.company_name ?? null,
  })
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  let sent = 0
  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: ann.subject,
        html: wrappedHtml,
        from,
        ...(emailAttachments.length > 0 ? { attachments: emailAttachments } : {}),
      })
      sent++
    } catch (e) {
      console.error(`Erro ao enviar comunicado para ${recipient.email}:`, e)
    }
  }

  await supabase
    .from('announcements')
    .update({ status: 'enviado', sent_at: new Date().toISOString(), recipient_count: sent } as never)
    .eq('id', id)

  await (serviceSupabase as any).from('system_logs').insert({
    category: 'email_sent',
    status: 'success',
    description: `Comunicado "${ann.subject}" enviado para ${sent} destinatários`,
  } as never)

  revalidatePath('/comunicados')
  return { success: true, sent }
}
```

- [ ] **Criar `src/components/comunicados/AnnouncementList.tsx`**

```typescript
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cancelAnnouncementAction } from '@/app/(internal)/comunicados/actions'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  rascunho: { label: 'Rascunho', variant: 'secondary' },
  agendado: { label: 'Agendado', variant: 'default' },
  enviado: { label: 'Enviado', variant: 'outline' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

const recipientLabels: Record<string, string> = {
  all: 'Todos os contatos',
  company: 'Por empresa',
  department: 'Por departamento',
  manual: 'Seleção manual',
}

export function AnnouncementList({ announcements, canManage }: {
  announcements: any[]
  canManage: boolean
}) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left">Assunto</th>
            <th className="p-3 text-left">Destinatários</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Agendado</th>
            <th className="p-3 text-left">Enviados</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {(announcements ?? []).map((a: any) => {
            const st = statusConfig[a.status] ?? { label: a.status, variant: 'secondary' as const }
            return (
              <tr key={a.id} className="border-b">
                <td className="p-3 font-medium">
                  <Link href={`/comunicados/${a.id}`} className="hover:underline">{a.subject}</Link>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{recipientLabels[a.recipient_type]}</td>
                <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">
                  {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {a.status === 'enviado' ? (a.recipient_count ?? '—') : '—'}
                </td>
                <td className="p-3 text-right">
                  {canManage && ['rascunho', 'agendado'].includes(a.status) && (
                    <div className="flex gap-1 justify-end">
                      <Link href={`/comunicados/${a.id}`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>
                      <form action={cancelAnnouncementAction.bind(null, a.id)}>
                        <Button variant="ghost" size="sm" type="submit">Cancelar</Button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {announcements.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum comunicado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/comunicados/page.tsx`**

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementList } from '@/components/comunicados/AnnouncementList'
import { Button } from '@/components/ui/button'

export default async function ComunicadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const userRole = (profile as any)?.role ?? 'analista'
  const canManage = ['admin', 'gestor'].includes(userRole)

  const { data: announcements } = (await supabase
    .from('announcements')
    .select('id, subject, recipient_type, status, scheduled_at, sent_at, recipient_count')
    .order('created_at', { ascending: false })
    .limit(100)) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunicados</h1>
        {canManage && (
          <Link href="/comunicados/novo"><Button>Novo Comunicado</Button></Link>
        )}
      </div>
      <AnnouncementList announcements={announcements ?? []} canManage={canManage} />
    </div>
  )
}
```

- [ ] **Adicionar link "Comunicados" ao Sidebar** em `src/components/layout/Sidebar.tsx`

Adicionar `Megaphone` ao import do lucide-react e o item ao array `navItems`:

```typescript
import { LayoutDashboard, Building2, Settings, Users, FileText, Megaphone } from 'lucide-react'

// No array navItems, adicionar:
{ href: '/comunicados', label: 'Comunicados', icon: Megaphone },
```

- [ ] **Instalar Badge se não existir**

```bash
npx shadcn@latest add badge
```

- [ ] **Rodar testes**

```bash
npm test -- tests/announcement.test.ts
```

Expected: PASS

- [ ] **Verificar manualmente**

```bash
npm run dev
```

Abrir `/comunicados` → lista aparece, link no Sidebar presente, botão "Novo Comunicado" visível para admin/gestor.

- [ ] **Commit**

```bash
git add src/ tests/announcement.test.ts
git commit -m "feat: comunicados — validação Zod, CRUD actions, lista e link no Sidebar"
```

---

## Task 14: Comunicados — Editor TipTap, seleção de destinatários, envio e cron

**Files:**
- Create: `src/app/(internal)/comunicados/novo/page.tsx`
- Create: `src/app/(internal)/comunicados/[id]/page.tsx`
- Create: `src/components/comunicados/AnnouncementForm.tsx`
- Create: `src/components/comunicados/RecipientSelector.tsx`
- Create: `src/app/api/cron/announcement-dispatch/route.ts`

- [ ] **Instalar dependências TipTap** (verificar se já instaladas pelo módulo email-templates)

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
```

- [ ] **Criar `src/components/comunicados/RecipientSelector.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Label } from '@/components/ui/label'

const DEPARTMENTS = ['TI', 'Financeiro', 'RH', 'Operações', 'Comercial', 'Jurídico', 'Diretoria']

interface Company { id: string; name: string }

export function RecipientSelector({ companies, initialType = 'all', initialCompanyId = '', initialDepartments = [] }: {
  companies: Company[]
  initialType?: string
  initialCompanyId?: string
  initialDepartments?: string[]
}) {
  const [type, setType] = useState(initialType)

  return (
    <div className="space-y-3">
      <Label>Destinatários</Label>
      <div className="grid grid-cols-2 gap-2">
        {(['all', 'company', 'department', 'manual'] as const).map(t => (
          <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="recipient_type" value={t}
              defaultChecked={t === initialType} onChange={() => setType(t)} />
            {t === 'all' && 'Todos os contatos'}
            {t === 'company' && 'Por empresa'}
            {t === 'department' && 'Por departamento'}
            {t === 'manual' && 'Seleção manual'}
          </label>
        ))}
      </div>

      {type === 'company' && (
        <div>
          <Label>Empresa</Label>
          <select name="recipient_company_id" defaultValue={initialCompanyId}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="">Selecione...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {type === 'department' && (
        <div className="space-y-1">
          <Label>Departamentos</Label>
          <div className="grid grid-cols-2 gap-1">
            {DEPARTMENTS.map(dept => (
              <label key={dept} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recipient_departments" value={dept}
                  defaultChecked={initialDepartments.includes(dept)} />
                {dept}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/components/comunicados/AnnouncementForm.tsx`**

```typescript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { saveBodyAction, sendAnnouncementAction } from '@/app/(internal)/comunicados/actions'

export function AnnouncementForm({ announcementId, initialBodyHtml = '', initialBodyRichText, readOnly = false }: {
  announcementId: string
  initialBodyHtml?: string
  initialBodyRichText?: object | null
  readOnly?: boolean
}) {
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: (initialBodyRichText as any) ?? initialBodyHtml,
    editable: !readOnly,
  })

  async function handleSend() {
    if (!editor) return
    setSending(true)
    setMsg(null)

    const saveResult = await (saveBodyAction as any)(announcementId, editor.getHTML(), editor.getJSON())
    if (saveResult.error) { setMsg(`Erro ao salvar: ${saveResult.error}`); setSending(false); return }

    const sendResult = await (sendAnnouncementAction as any)(announcementId)
    setSending(false)
    if (sendResult.error) setMsg(`Erro: ${sendResult.error}`)
    else setMsg(`Comunicado enviado para ${sendResult.sent} destinatários!`)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Conteúdo</Label>
        <div className="border rounded-md min-h-[200px] p-3 prose prose-sm max-w-none">
          <EditorContent editor={editor} />
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-3 items-center">
          <Button onClick={handleSend} disabled={sending}>
            {sending ? 'Enviando...' : 'Enviar agora'}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/comunicados/novo/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAnnouncementAction } from '../actions'
import { RecipientSelector } from '@/components/comunicados/RecipientSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function NovoComunicadoPage() {
  const supabase = await createClient()
  const { data: companies } = (await supabase
    .from('companies').select('id, name').eq('is_active', true).order('name')) as { data: any[] | null }

  async function handleCreate(formData: FormData) {
    'use server'
    // body_html inicial mínimo para passar validação
    if (!formData.get('body_html')) formData.set('body_html', '<p></p>')
    const result = await createAnnouncementAction(formData)
    if (result.success && result.id) redirect(`/comunicados/${result.id}`)
    return result
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Novo Comunicado</h1>
      <form action={handleCreate as any} className="space-y-4">
        <div>
          <Label>Assunto</Label>
          <Input name="subject" placeholder="Assunto do e-mail" required />
        </div>
        <RecipientSelector companies={companies ?? []} />
        <div>
          <Label>Agendamento (opcional)</Label>
          <Input name="scheduled_at" type="datetime-local" />
        </div>
        <Button type="submit">Criar e editar conteúdo</Button>
      </form>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/comunicados/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementForm } from '@/components/comunicados/AnnouncementForm'

export default async function ComunicadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: ann } = (await supabase
    .from('announcements').select('*').eq('id', id).single()) as { data: any }

  if (!ann) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = ['admin', 'gestor'].includes((profile as any)?.role ?? '')
    && ['rascunho', 'agendado'].includes(ann.status)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{ann.subject}</h1>
        <span className="text-sm text-muted-foreground capitalize">{ann.status}</span>
      </div>
      {ann.sent_at && (
        <p className="text-sm text-muted-foreground">
          Enviado em {new Date(ann.sent_at).toLocaleString('pt-BR')} para {ann.recipient_count ?? '?'} destinatários.
        </p>
      )}
      <AnnouncementForm
        announcementId={id}
        initialBodyHtml={ann.body_html ?? ''}
        initialBodyRichText={ann.body_rich_text}
        readOnly={!canEdit}
      />
    </div>
  )
}
```

- [ ] **Criar `src/app/api/cron/announcement-dispatch/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAnnouncementAction } from '@/app/(internal)/comunicados/actions'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: scheduled } = (await (supabase as any)
    .from('announcements')
    .select('id, subject')
    .eq('status', 'agendado')
    .lte('scheduled_at', now)) as { data: any[] | null }

  let dispatched = 0
  for (const ann of scheduled ?? []) {
    const result = await (sendAnnouncementAction as any)(ann.id)
    if (result.success) dispatched++
    else console.error(`Falha ao despachar comunicado ${ann.id}:`, result.error)
  }

  return NextResponse.json({ ok: true, dispatched })
}
```

- [ ] **Verificar manualmente**

```bash
npm run dev
```

1. Abrir `/comunicados/novo` → preencher assunto, escolher "Todos os contatos" → submit
2. Redireciona para `/comunicados/{id}` → editor TipTap carrega
3. Digitar conteúdo → clicar "Enviar agora" → verificar mensagem de sucesso (ou erro de RESEND_API_KEY em dev)
4. Abrir `/comunicados` → comunicado aparece com status "enviado"

- [ ] **Verificar lint**

```bash
npm run lint
```

Expected: Sem erros.

- [ ] **Commit**

```bash
git add src/
git commit -m "feat: comunicados — editor TipTap, RecipientSelector, envio com anexos e cron de despacho agendado"
```

---

## Self-review

### Cobertura do spec

| Critério | Implementado em |
|---|---|
| E-mails para todos os eventos de chamado listados | Tasks 5–8 |
| Destinatários corretos por evento (contato, responsável, analista, gestor) | Task 4 (helper) + Tasks 5–8 |
| Conteúdo inline ignorado no processamento inbound | Task 10 (`stripQuotedText`; imagens não são processadas) |
| Resposta por e-mail adicionada ao histórico do chamado | Task 10 |
| Endereço reply único por chamado | Tasks 3, 5–8 (`reply-to` header) |
| Importação BrasilAPI (manual e automática) | Task 11 |
| Cadastro manual de feriados | Task 1 (novo schema + UI) |
| Cron aviso de feriado com N dias de antecedência | Task 12 |
| Sem reenvio duplicado de aviso | Task 12 (`holiday_notice_sent`) |
| CRUD de comunicados com editor TipTap | Tasks 13–14 |
| Todos os tipos de segmentação de destinatários | Task 14 (`RecipientSelector` + `resolveAnnouncementRecipients`) |
| Agendamento com status correto | Task 13 (status `agendado`) + Task 14 (cron dispatch) |
| Registro de envio com data e quantidade de destinatários | Task 14 (`sendAnnouncementAction`) |

### Notas de design

**`chamado_reaberto` → analista:** O template usa `{{nome_cliente}}` para saudação. Quando enviado ao analista, `nome_cliente` recebe o nome do contato para contexto de qual chamado foi reaberto. O texto resultante é funcional mas impreciso — criar template `analista_chamado_reaberto` numa versão futura.

**`cliente_respondeu → analista`:** Não existe template para este fluxo. Tasks 6 e 10 usam `sendEmail` com HTML inline. Criar template `cliente_respondeu` futuramente para migração completa ao padrão `sendEmailFromTemplate`.

**Resend Inbound (`/api/email/inbound`):** Requer configuração do domínio `reply.itramos.com.br` como Inbound Domain no painel Resend e cadastro do webhook apontando para `POST {NEXT_PUBLIC_APP_URL}/api/email/inbound`.

**Cron `holiday-import` em 1º de janeiro:** Deve ser configurado no serviço de cron (Vercel Cron Jobs ou equivalente) com schedule `0 6 1 1 *` passando o header `Authorization: Bearer {CRON_SECRET}`.

### Scan de placeholders

Nenhum TBD, TODO, "implementar depois" ou step sem código encontrado.

### Consistência de tipos

- `resolveContactEmails`, `resolveAnalystEmail`, `resolveNewTicketNotifyEmails` definidos em Task 4 e chamados de forma consistente em Tasks 5–9 e 12.
- Template slugs verificados no seed `20260524000002_email_templates_seed.sql`: `chamado_aberto`, `analista_respondeu`, `status_alterado`, `chamado_fechado`, `chamado_reaberto`, `kb_artigo_vinculado`, `aviso_feriado` — todos existem.
- Colunas `type` e `year` em `holidays` — definidas na migration Task 1 e usadas nas Tasks 1 (UI), 11 (import) e 12 (cron).
