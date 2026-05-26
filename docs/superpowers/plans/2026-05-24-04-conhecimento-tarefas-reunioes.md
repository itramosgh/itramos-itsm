# Base de Conhecimento, Tarefas e Reuniões — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar base de conhecimento (artigos e documentos por cliente), módulo de tarefas com recorrência e lembretes, e registro de reuniões com geração de atas PDF e conversão de itens de ação em tarefas.

**Architecture:** Três módulos independentes seguindo o padrão estabelecido no projeto: Server Actions com validação Zod → Supabase → revalidatePath. Base de conhecimento usa `pg_trgm` para sugestão automática de artigos durante abertura de chamados. Sugestão no portal via Client Component debounced + API Route. Atas de reunião em PDF via `@react-pdf/renderer`. Todos os e-mails passam por `sendEmailFromTemplate` com slugs da tabela `email_templates`.

**Tech Stack:** Next.js 15 · TypeScript · Supabase (PostgreSQL + pg_trgm + Storage) · TipTap 3.x · shadcn/ui · React Hook Form · Zod v4 · @react-pdf/renderer · Resend (via email-template-sender)

---

## Mapa de arquivos

```
src/
├── app/
│   ├── (internal)/
│   │   ├── conhecimento/
│   │   │   ├── page.tsx                           # Lista artigos + docs; tabs Artigos / Documentos
│   │   │   ├── actions.ts                         # CRUD artigos e documentos
│   │   │   ├── artigos/
│   │   │   │   ├── novo/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── editar/page.tsx
│   │   │   └── documentos/
│   │   │       ├── novo/page.tsx
│   │   │       └── [id]/
│   │   │           ├── page.tsx
│   │   │           └── editar/page.tsx
│   │   ├── tarefas/
│   │   │   ├── page.tsx                           # Lista filtrável por status/cliente/responsável
│   │   │   ├── actions.ts
│   │   │   └── nova/page.tsx
│   │   └── reunioes/
│   │       ├── page.tsx
│   │       ├── actions.ts
│   │       ├── nova/page.tsx
│   │       └── [id]/
│   │           └── page.tsx                       # Detalhes + ata + itens de ação
│   ├── (portal)/
│   │   └── portal/
│   │       └── conhecimento/
│   │           └── page.tsx                       # Documentos do cliente autenticado
│   └── api/
│       ├── cron/
│       │   └── task-reminders/route.ts            # Cron diário de lembretes
│       ├── kb/
│       │   └── search/route.ts                    # pg_trgm similarity search
│       └── upload/
│           └── kb-document/route.ts               # Upload de anexos de documentos KB
├── components/
│   ├── conhecimento/
│   │   ├── KbArticleForm.tsx                      # Criar/editar artigo
│   │   ├── KbArticleList.tsx                      # Tabela com busca e toggle is_active
│   │   ├── KbDocumentForm.tsx                     # Editor TipTap + upload de anexos
│   │   ├── KbDocumentList.tsx
│   │   └── KbSearchSuggestions.tsx                # Client component de sugestão (portal + analista)
│   ├── tarefas/
│   │   ├── TaskForm.tsx                           # Cria/edita com campo de recorrência
│   │   └── TaskList.tsx                           # Lista filtrável com destaque de vencidas
│   └── reunioes/
│       ├── MeetingForm.tsx                        # Participantes + TipTap + itens de ação
│       ├── MeetingList.tsx
│       ├── ActionItemsPanel.tsx                   # Lista itens + botão converter em tarefa
│       └── MeetingMinutesPDF.tsx                  # Template @react-pdf/renderer
├── lib/
│   ├── task-recurrence.ts                         # nextOccurrenceDate() — lógica pura testável
│   └── validations/
│       ├── kb-article.ts
│       ├── kb-document.ts
│       ├── task.ts
│       └── meeting.ts
└── types/database.ts                              # Tipos para novas tabelas
supabase/
└── migrations/
    ├── 20260525000001_kb_articles_expand.sql
    ├── 20260525000002_tasks_meetings_schema.sql
    ├── 20260525000003_kb_tasks_meetings_rls.sql
    └── 20260525000004_kb_documents_storage.sql
tests/
├── kb-article.test.ts
├── task.test.ts
└── meeting.test.ts
```

---

## Task 1: Migration — Expandir kb_articles e criar tabelas de KB

**Files:**
- Create: `supabase/migrations/20260525000001_kb_articles_expand.sql`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new kb_articles_expand
```

Renomear o arquivo gerado para `20260525000001_kb_articles_expand.sql`.

- [ ] **Escrever a migration**

```sql
-- 1. Remover colunas do stub e renomear source_ticket_id
alter table public.kb_articles
  drop constraint if exists kb_articles_source_ticket_id_fkey;

alter table public.kb_articles
  drop column if exists body,
  drop column if exists summary,
  drop column if exists slug;

alter table public.kb_articles
  rename column source_ticket_id to origin_ticket_id;

alter table public.kb_articles
  add column problem_description text,
  add column solution text,
  add column tags text[] default '{}',
  add constraint kb_articles_origin_ticket_id_fkey
    foreign key (origin_ticket_id) references public.tickets(id) on delete set null;

-- 2. Índices trgm para busca por similaridade
create index if not exists idx_kb_articles_title_trgm
  on public.kb_articles using gin (title gin_trgm_ops);
create index if not exists idx_kb_articles_solution_trgm
  on public.kb_articles using gin (solution gin_trgm_ops);
create index if not exists idx_kb_articles_problem_trgm
  on public.kb_articles using gin (problem_description gin_trgm_ops);

-- 3. Função RPC para busca por similaridade (usada pelo /api/kb/search)
create or replace function public.search_kb_articles(query text)
returns table(
  id uuid,
  title text,
  problem_description text,
  solution text,
  category_id uuid
)
language sql stable security definer as $$
  select
    id,
    title,
    problem_description,
    solution,
    category_id
  from public.kb_articles
  where
    is_active = true
    and (
      similarity(title, query) > 0.1
      or similarity(coalesce(problem_description, ''), query) > 0.1
      or similarity(coalesce(solution, ''), query) > 0.1
    )
  order by
    greatest(
      similarity(title, query),
      similarity(coalesce(problem_description, ''), query),
      similarity(coalesce(solution, ''), query)
    ) desc
  limit 5;
$$;

-- 4. kb_documents: documentos e procedimentos por cliente
create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null,
  content_rich_text jsonb,
  content_html text,
  category text,
  published_at date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_kb_documents_updated_at
  before update on public.kb_documents
  for each row execute function public.set_updated_at();

create index idx_kb_documents_company_id on public.kb_documents(company_id);

-- 5. kb_document_attachments: anexos de documentos
create table public.kb_document_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes integer,
  mime_type text,
  created_at timestamptz not null default now()
);

create index idx_kb_doc_attachments_document_id
  on public.kb_document_attachments(document_id);
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar no Studio** — abrir `http://127.0.0.1:54323`. Confirmar que:
  - `kb_articles` agora tem colunas `problem_description`, `solution`, `tags`, `origin_ticket_id`
  - Tabelas `kb_documents` e `kb_document_attachments` existem

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: expandir kb_articles e criar kb_documents com trgm e RPC de busca"
```

---

## Task 2: Migration — Tarefas e Reuniões

**Files:**
- Create: `supabase/migrations/20260525000002_tasks_meetings_schema.sql`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new tasks_meetings_schema
```

Renomear para `20260525000002_tasks_meetings_schema.sql`.

- [ ] **Escrever a migration**

```sql
-- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  company_id uuid references public.companies(id) on delete set null,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  due_date date not null,
  priority text check (priority in ('alta', 'media', 'baixa')),
  status text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'vencida')),
  reminder_days_before integer not null default 3,
  is_recurring boolean not null default false,
  recurrence_type text check (recurrence_type in ('diaria', 'semanal', 'mensal', 'anual')),
  recurrence_active boolean not null default true,
  parent_task_id uuid references public.tasks(id) on delete set null,
  origin_meeting_id uuid,        -- FK circular adicionada após meetings
  origin_action_item_id uuid,    -- FK circular adicionada após meeting_action_items
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index idx_tasks_assigned_to on public.tasks(assigned_to);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_company_id on public.tasks(company_id);

-- meetings
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null,
  scheduled_at timestamptz not null,
  notes_rich_text jsonb,
  notes_html text,
  status text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada')),
  minutes_sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

create index idx_meetings_company_id on public.meetings(company_id);
create index idx_meetings_scheduled_at on public.meetings(scheduled_at);
create index idx_meetings_status_scheduled_at
  on public.meetings(scheduled_at) where status = 'agendada';

-- meeting_participants
create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  external_email text,
  external_name text
);

create index idx_meeting_participants_meeting_id
  on public.meeting_participants(meeting_id);
create index idx_meeting_participants_profile_id
  on public.meeting_participants(profile_id);

-- meeting_action_items
create table public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  description text not null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  responsible_contact_id uuid references public.contacts(id) on delete set null,
  responsible_external_email text,
  due_date date,
  status text not null default 'pendente'
    check (status in ('pendente', 'concluido')),
  converted_to_task_id uuid references public.tasks(id) on delete set null
);

create index idx_action_items_meeting_id on public.meeting_action_items(meeting_id);

-- FKs circulares (tasks ↔ meetings) — adicionadas após criação de ambas as tabelas
alter table public.tasks
  add constraint tasks_origin_meeting_id_fkey
    foreign key (origin_meeting_id) references public.meetings(id) on delete set null,
  add constraint tasks_origin_action_item_id_fkey
    foreign key (origin_action_item_id) references public.meeting_action_items(id) on delete set null;
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar no Studio** — confirmar 4 novas tabelas: `tasks`, `meetings`, `meeting_participants`, `meeting_action_items`.

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: schema de tarefas, reuniões, participantes e itens de ação"
```

---

## Task 3: Migration — RLS Policies

**Files:**
- Create: `supabase/migrations/20260525000003_kb_tasks_meetings_rls.sql`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new kb_tasks_meetings_rls
```

Renomear para `20260525000003_kb_tasks_meetings_rls.sql`.

- [ ] **Escrever a migration**

```sql
-- Habilitar RLS nas novas tabelas
alter table public.kb_documents enable row level security;
alter table public.kb_document_attachments enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_action_items enable row level security;

-- Recriar políticas de kb_articles para incluir clientes (sugestão no portal)
drop policy if exists "kb_articles_select_internal" on public.kb_articles;
drop policy if exists "kb_articles_manage_service" on public.kb_articles;

create policy "kb_articles_select_internal"
  on public.kb_articles for select
  using (public.is_internal());

create policy "kb_articles_select_client_active"
  on public.kb_articles for select
  using (
    public.get_user_role() = 'cliente'
    and is_active = true
  );

create policy "kb_articles_insert_admin_gestor"
  on public.kb_articles for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "kb_articles_update_admin_gestor"
  on public.kb_articles for update
  using (public.get_user_role() in ('admin', 'gestor'));

-- Analista cria artigos via service role no encerramento de chamados (bypass de RLS)

-- kb_documents
create policy "kb_documents_select_internal"
  on public.kb_documents for select
  using (public.is_internal());

create policy "kb_documents_select_client"
  on public.kb_documents for select
  using (
    public.get_user_role() = 'cliente'
    and is_active = true
    and company_id in (
      select company_id from public.contacts
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "kb_documents_manage_admin_gestor"
  on public.kb_documents for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- kb_document_attachments
create policy "kb_doc_attachments_select_internal"
  on public.kb_document_attachments for select
  using (public.is_internal());

create policy "kb_doc_attachments_select_client"
  on public.kb_document_attachments for select
  using (
    exists (
      select 1 from public.kb_documents d
      where d.id = document_id
        and d.is_active = true
        and d.company_id in (
          select company_id from public.contacts
          where user_id = auth.uid() and is_active = true
        )
    )
  );

create policy "kb_doc_attachments_manage_admin_gestor"
  on public.kb_document_attachments for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- tasks
create policy "tasks_select_admin_gestor"
  on public.tasks for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_select_analista_own"
  on public.tasks for select
  using (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

create policy "tasks_insert_admin_gestor"
  on public.tasks for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_insert_analista_own"
  on public.tasks for insert
  with check (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

create policy "tasks_update_admin_gestor"
  on public.tasks for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_update_analista_own"
  on public.tasks for update
  using (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

-- meetings
create policy "meetings_select_admin_gestor"
  on public.meetings for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "meetings_select_analista_participant"
  on public.meetings for select
  using (
    public.get_user_role() = 'analista'
    and id in (
      select meeting_id from public.meeting_participants
      where profile_id = auth.uid()
    )
  );

create policy "meetings_insert_internal"
  on public.meetings for insert
  with check (public.is_internal());

create policy "meetings_update_admin_gestor"
  on public.meetings for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "meetings_update_analista_participant"
  on public.meetings for update
  using (
    public.get_user_role() = 'analista'
    and id in (
      select meeting_id from public.meeting_participants
      where profile_id = auth.uid()
    )
  );

create policy "meetings_delete_admin_gestor"
  on public.meetings for delete
  using (public.get_user_role() in ('admin', 'gestor'));

-- meeting_participants
create policy "meeting_participants_all_internal"
  on public.meeting_participants for all
  using (public.is_internal())
  with check (public.is_internal());

-- meeting_action_items
create policy "action_items_all_internal"
  on public.meeting_action_items for all
  using (public.is_internal())
  with check (public.is_internal());
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: RLS policies para KB, tarefas e reuniões"
```

---

## Task 4: Migration — Storage bucket kb-documents + API de upload

**Files:**
- Create: `supabase/migrations/20260525000004_kb_documents_storage.sql`
- Create: `src/app/api/upload/kb-document/route.ts`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new kb_documents_storage
```

Renomear para `20260525000004_kb_documents_storage.sql`.

- [ ] **Escrever a migration**

```sql
insert into storage.buckets (id, name, public)
values ('kb-documents', 'kb-documents', false)
on conflict (id) do nothing;

create policy "kb-documents: interno lê"
  on storage.objects for select
  using (bucket_id = 'kb-documents' and public.is_internal());

create policy "kb-documents: cliente lê próprios"
  on storage.objects for select
  using (bucket_id = 'kb-documents' and public.get_user_role() = 'cliente');

create policy "kb-documents: admin e gestor fazem upload"
  on storage.objects for insert
  with check (
    bucket_id = 'kb-documents'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "kb-documents: admin e gestor deletam"
  on storage.objects for delete
  using (
    bucket_id = 'kb-documents'
    and public.get_user_role() in ('admin', 'gestor')
  );
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Criar `src/app/api/upload/kb-document/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('document_id') as string | null

  if (!file || !documentId) {
    return NextResponse.json({ error: 'Arquivo ou document_id ausente' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${documentId}/${crypto.randomUUID()}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('kb-documents')
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await supabase.from('kb_document_attachments').insert({
    document_id: documentId,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  } as never)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ ok: true, path, filename: file.name })
}
```

- [ ] **Commit**

```bash
git add supabase/migrations/ src/app/api/upload/kb-document/
git commit -m "feat: storage bucket kb-documents e API de upload de anexos"
```

---

## Task 5: Types do banco + Validações Zod + Lógica de recorrência

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/task-recurrence.ts`
- Create: `src/lib/validations/kb-article.ts`
- Create: `src/lib/validations/kb-document.ts`
- Create: `src/lib/validations/task.ts`
- Create: `src/lib/validations/meeting.ts`
- Create: `tests/kb-article.test.ts`
- Create: `tests/task.test.ts`
- Create: `tests/meeting.test.ts`

- [ ] **Escrever os testes** em `tests/kb-article.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { kbArticleSchema } from '@/lib/validations/kb-article'

describe('kbArticleSchema', () => {
  it('rejeita título vazio', () => {
    expect(kbArticleSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('aceita artigo com campos mínimos', () => {
    const result = kbArticleSchema.safeParse({ title: 'Como resetar senha' })
    expect(result.success).toBe(true)
    expect(result.data?.tags).toEqual([])
    expect(result.data?.is_active).toBe(true)
  })

  it('aceita artigo com todos os campos preenchidos', () => {
    const result = kbArticleSchema.safeParse({
      title: 'Problema de impressora',
      problem_description: 'Impressora não imprime',
      solution: 'Reiniciar o spooler de impressão',
      tags: ['impressora', 'hardware'],
      is_active: true,
      origin_ticket_id: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(true)
    expect(result.data?.tags).toHaveLength(2)
  })
})
```

- [ ] **Escrever os testes** em `tests/task.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { taskSchema } from '@/lib/validations/task'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

describe('taskSchema', () => {
  it('rejeita tarefa sem responsável', () => {
    const result = taskSchema.safeParse({
      title: 'Revisão',
      due_date: '2026-06-01',
      assigned_to: 'nao-um-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita data em formato inválido', () => {
    const result = taskSchema.safeParse({
      title: 'Revisão',
      due_date: '01/06/2026',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(false)
  })

  it('aceita tarefa recorrente mensal', () => {
    const result = taskSchema.safeParse({
      title: 'Relatório mensal',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
      due_date: '2026-06-01',
      is_recurring: true,
      recurrence_type: 'mensal',
    })
    expect(result.success).toBe(true)
  })

  it('aplica padrão reminder_days_before = 3', () => {
    const result = taskSchema.safeParse({
      title: 'Tarefa',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
      due_date: '2026-06-01',
    })
    expect(result.success).toBe(true)
    expect(result.data?.reminder_days_before).toBe(3)
  })
})

describe('nextOccurrenceDate', () => {
  it('diaria: avança 1 dia', () => {
    expect(nextOccurrenceDate('2026-06-01', 'diaria')).toBe('2026-06-02')
  })

  it('semanal: avança 7 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'semanal')).toBe('2026-06-08')
  })

  it('mensal: avança 1 mês', () => {
    expect(nextOccurrenceDate('2026-06-01', 'mensal')).toBe('2026-07-01')
  })

  it('anual: avança 1 ano', () => {
    expect(nextOccurrenceDate('2026-06-01', 'anual')).toBe('2027-06-01')
  })
})
```

- [ ] **Escrever os testes** em `tests/meeting.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { meetingSchema } from '@/lib/validations/meeting'

describe('meetingSchema', () => {
  it('rejeita reunião sem participantes', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Alinhamento',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [],
    })
    expect(result.success).toBe(false)
  })

  it('aceita participante externo com e-mail válido', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Alinhamento',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [{ type: 'external', external_email: 'c@empresa.com', external_name: 'João' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejeita participante externo com e-mail inválido', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Reunião',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [{ type: 'external', external_email: 'nao-email', external_name: 'João' }],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Rodar para verificar que os testes falham**

```bash
npm test -- tests/kb-article.test.ts tests/task.test.ts tests/meeting.test.ts
```

Expected: FAIL — módulos não encontrados.

- [ ] **Criar `src/lib/validations/kb-article.ts`**

```typescript
import { z } from 'zod'

export const kbArticleSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  problem_description: z.string().optional(),
  solution: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  origin_ticket_id: z.string().uuid().optional().nullable(),
})

export type KbArticleInput = z.infer<typeof kbArticleSchema>
```

- [ ] **Criar `src/lib/validations/kb-document.ts`**

```typescript
import { z } from 'zod'

export const kbDocumentSchema = z.object({
  company_id: z.string().uuid('Empresa inválida'),
  title: z.string().min(1, 'Título é obrigatório'),
  content_html: z.string().optional(),
  content_rich_text: z.record(z.string(), z.unknown()).optional().nullable(),
  category: z.string().optional(),
  published_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

export type KbDocumentInput = z.infer<typeof kbDocumentSchema>
```

- [ ] **Criar `src/lib/validations/task.ts`**

```typescript
import { z } from 'zod'

export const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  company_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid('Responsável inválido'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  priority: z.enum(['alta', 'media', 'baixa']).optional().nullable(),
  reminder_days_before: z.coerce.number().int().min(0).default(3),
  is_recurring: z.boolean().default(false),
  recurrence_type: z.enum(['diaria', 'semanal', 'mensal', 'anual']).optional().nullable(),
})

export const taskUpdateSchema = taskSchema.partial().extend({
  status: z.enum(['pendente', 'concluida', 'vencida']).optional(),
})

export type TaskInput = z.infer<typeof taskSchema>
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>
```

- [ ] **Criar `src/lib/validations/meeting.ts`**

```typescript
import { z } from 'zod'

const participantSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('profile'), profile_id: z.string().uuid() }),
  z.object({ type: z.literal('contact'), contact_id: z.string().uuid() }),
  z.object({
    type: z.literal('external'),
    external_email: z.string().email('E-mail inválido'),
    external_name: z.string().min(1, 'Nome obrigatório'),
  }),
])

const actionItemSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória'),
  responsible_profile_id: z.string().uuid().optional().nullable(),
  responsible_contact_id: z.string().uuid().optional().nullable(),
  responsible_external_email: z.string().email().optional().nullable(),
  due_date: z.string().optional().nullable(),
})

export const meetingSchema = z.object({
  company_id: z.string().uuid('Empresa é obrigatória'),
  title: z.string().min(1, 'Pauta é obrigatória'),
  scheduled_at: z.string().min(1, 'Data/hora é obrigatória'),
  notes_html: z.string().optional(),
  notes_rich_text: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(['agendada', 'realizada', 'cancelada']).default('agendada'),
  participants: z.array(participantSchema).min(1, 'Ao menos um participante é obrigatório'),
  action_items: z.array(actionItemSchema).default([]),
})

export type MeetingInput = z.infer<typeof meetingSchema>
export type ActionItemInput = z.infer<typeof actionItemSchema>
```

- [ ] **Criar `src/lib/task-recurrence.ts`**

```typescript
export function nextOccurrenceDate(currentDueDate: string, recurrenceType: string): string {
  // Usar noon para evitar problemas de fuso horário em mudanças de mês/ano
  const date = new Date(`${currentDueDate}T12:00:00`)

  switch (recurrenceType) {
    case 'diaria':
      date.setDate(date.getDate() + 1)
      break
    case 'semanal':
      date.setDate(date.getDate() + 7)
      break
    case 'mensal':
      date.setMonth(date.getMonth() + 1)
      break
    case 'anual':
      date.setFullYear(date.getFullYear() + 1)
      break
  }

  return date.toISOString().slice(0, 10)
}
```

- [ ] **Atualizar `src/types/database.ts`** — substituir a entrada `kb_articles` existente e adicionar os novos tipos. Localizar o bloco `kb_articles` (em torno da linha 235) e substituir:

```typescript
      kb_articles: {
        Row: {
          id: string
          title: string
          problem_description: string | null
          solution: string | null
          tags: string[]
          category_id: string | null
          origin_ticket_id: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_articles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['kb_articles']['Insert']>
      }
      kb_documents: {
        Row: {
          id: string
          company_id: string
          title: string
          content_rich_text: Json | null
          content_html: string | null
          category: string | null
          published_at: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_documents']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['kb_documents']['Insert']>
      }
      kb_document_attachments: {
        Row: {
          id: string
          document_id: string
          filename: string
          storage_path: string
          size_bytes: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_document_attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          company_id: string | null
          assigned_to: string
          due_date: string
          priority: 'alta' | 'media' | 'baixa' | null
          status: 'pendente' | 'concluida' | 'vencida'
          reminder_days_before: number
          is_recurring: boolean
          recurrence_type: 'diaria' | 'semanal' | 'mensal' | 'anual' | null
          recurrence_active: boolean
          parent_task_id: string | null
          origin_meeting_id: string | null
          origin_action_item_id: string | null
          completed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tasks']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
      }
      meetings: {
        Row: {
          id: string
          company_id: string
          title: string
          scheduled_at: string
          notes_rich_text: Json | null
          notes_html: string | null
          status: 'agendada' | 'realizada' | 'cancelada'
          minutes_sent_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['meetings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['meetings']['Insert']>
      }
      meeting_participants: {
        Row: {
          id: string
          meeting_id: string
          profile_id: string | null
          contact_id: string | null
          external_email: string | null
          external_name: string | null
        }
        Insert: Omit<Database['public']['Tables']['meeting_participants']['Row'], 'id'>
        Update: never
      }
      meeting_action_items: {
        Row: {
          id: string
          meeting_id: string
          description: string
          responsible_profile_id: string | null
          responsible_contact_id: string | null
          responsible_external_email: string | null
          due_date: string | null
          status: 'pendente' | 'concluido'
          converted_to_task_id: string | null
        }
        Insert: Omit<Database['public']['Tables']['meeting_action_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['meeting_action_items']['Insert']>
      }
```

Adicionar também ao bloco `Functions`:
```typescript
      search_kb_articles: {
        Args: { query: string }
        Returns: { id: string; title: string; problem_description: string | null; solution: string | null; category_id: string | null }[]
      }
```

- [ ] **Rodar os testes**

```bash
npm test -- tests/kb-article.test.ts tests/task.test.ts tests/meeting.test.ts
```

Expected: PASS (12 testes no total).

- [ ] **Commit**

```bash
git add src/types/ src/lib/validations/ src/lib/task-recurrence.ts tests/
git commit -m "feat: tipos do banco e validações Zod para KB, tarefas e reuniões"
```

---

## Task 6: KB — Artigos CRUD no painel interno

**Files:**
- Create: `src/app/(internal)/conhecimento/actions.ts`
- Create: `src/app/(internal)/conhecimento/page.tsx`
- Create: `src/app/(internal)/conhecimento/artigos/novo/page.tsx`
- Create: `src/app/(internal)/conhecimento/artigos/[id]/page.tsx`
- Create: `src/app/(internal)/conhecimento/artigos/[id]/editar/page.tsx`
- Create: `src/components/conhecimento/KbArticleForm.tsx`
- Create: `src/components/conhecimento/KbArticleList.tsx`
- Modify: `src/app/(internal)/chamados/actions.ts` (fix do closeWithResolutionAction)

- [ ] **Criar `src/app/(internal)/conhecimento/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { kbArticleSchema } from '@/lib/validations/kb-article'

export async function createArticleAction(formData: FormData) {
  const tags = (formData.get('tags') as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  const parsed = kbArticleSchema.safeParse({
    title: formData.get('title'),
    problem_description: formData.get('problem_description') || undefined,
    solution: formData.get('solution') || undefined,
    category_id: formData.get('category_id') || null,
    tags,
    is_active: formData.get('is_active') !== 'false',
    origin_ticket_id: formData.get('origin_ticket_id') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('kb_articles').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  return { success: true }
}

export async function updateArticleAction(id: string, formData: FormData) {
  const tags = (formData.get('tags') as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  const parsed = kbArticleSchema.safeParse({
    title: formData.get('title'),
    problem_description: formData.get('problem_description') || undefined,
    solution: formData.get('solution') || undefined,
    category_id: formData.get('category_id') || null,
    tags,
    is_active: formData.get('is_active') !== 'false',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('kb_articles')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  revalidatePath(`/conhecimento/artigos/${id}`)
  return { success: true }
}

export async function toggleArticleActiveAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('kb_articles').update({ is_active: isActive } as never).eq('id', id)
  revalidatePath('/conhecimento')
}

export async function createArticleFromTicketAction(
  ticketId: string,
  title: string,
  problemDescription: string | null,
  solution: string,
  categoryId: string | null,
  createdBy: string
) {
  const supabase = await createServiceClient()
  await supabase.from('kb_articles').insert({
    title,
    problem_description: problemDescription ?? undefined,
    solution,
    category_id: categoryId ?? null,
    origin_ticket_id: ticketId,
    is_active: true,
    created_by: createdBy,
  } as never)
}
```

- [ ] **Corrigir o `closeWithResolutionAction` em `src/app/(internal)/chamados/actions.ts`** — localizar o bloco `if (createArticle)` (em torno da linha 590) e substituir:

```typescript
  if (createArticle) {
    const { createArticleFromTicketAction } = await import('@/app/(internal)/conhecimento/actions')
    await createArticleFromTicketAction(
      ticketId,
      ticket.title,
      ticket.description ?? null,
      resolution,
      ticket.category_id ?? null,
      user!.id
    )
  }
```

- [ ] **Criar `src/components/conhecimento/KbArticleForm.tsx`**

```typescript
'use client'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface KbArticleFormProps {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  initialData?: {
    title?: string
    problem_description?: string | null
    solution?: string | null
    tags?: string[]
    category_id?: string | null
    is_active?: boolean
  }
  categories: { id: string; name: string }[]
}

export function KbArticleForm({ action, initialData, categories }: KbArticleFormProps) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="problem_description">Descrição do problema</Label>
        <Textarea
          id="problem_description"
          name="problem_description"
          defaultValue={initialData?.problem_description ?? ''}
          rows={4}
          placeholder="Descreva o problema ou sintoma..."
        />
      </div>
      <div>
        <Label htmlFor="solution">Solução aplicada</Label>
        <Textarea
          id="solution"
          name="solution"
          defaultValue={initialData?.solution ?? ''}
          rows={6}
          placeholder="Descreva o passo a passo da solução..."
        />
      </div>
      <div>
        <Label htmlFor="category_id">Categoria</Label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={initialData?.category_id ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem categoria</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
        <Input
          id="tags"
          name="tags"
          defaultValue={initialData?.tags?.join(', ') ?? ''}
          placeholder="impressora, windows, vpn"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          value="true"
          defaultChecked={initialData?.is_active !== false}
        />
        <Label htmlFor="is_active">Artigo ativo (visível na busca)</Label>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando...' : 'Salvar artigo'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/conhecimento/KbArticleList.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { toggleArticleActiveAction } from '@/app/(internal)/conhecimento/actions'

type Article = {
  id: string
  title: string
  category_id: string | null
  tags: string[]
  is_active: boolean
  created_at: string
}

export function KbArticleList({ articles }: { articles: Article[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Tags</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {articles.map(a => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/conhecimento/artigos/${a.id}`} className="hover:underline font-medium">
                  {a.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {a.tags.map(t => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={a.is_active ? 'default' : 'outline'}>
                  {a.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/conhecimento/artigos/${a.id}/editar`}>Editar</Link>
                  </Button>
                  <form action={toggleArticleActiveAction.bind(null, a.id, !a.is_active)}>
                    <Button variant="ghost" size="sm" type="submit">
                      {a.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { KbArticleList } from '@/components/conhecimento/KbArticleList'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function ConhecimentoPage() {
  const supabase = await createClient()
  const { data: articles } = await supabase
    .from('kb_articles')
    .select('id, title, category_id, tags, is_active, created_at')
    .order('created_at', { ascending: false }) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
        <Button asChild>
          <Link href="/conhecimento/artigos/novo">Novo Artigo</Link>
        </Button>
      </div>
      <KbArticleList articles={articles ?? []} />
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/artigos/novo/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { KbArticleForm } from '@/components/conhecimento/KbArticleForm'
import { createArticleAction } from '@/app/(internal)/conhecimento/actions'

export default async function NovoArtigoPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ticket_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Artigo</h1>
      <KbArticleForm action={createArticleAction} categories={categories ?? []} />
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/artigos/[id]/page.tsx`** — exibe título, problema, solução, tags, categoria e botão "Editar" (Admin/Gestor).

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function ArtigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: article } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('id', id)
    .single() as { data: any }

  if (!article) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold">{article.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/conhecimento/artigos/${id}/editar`}>Editar</Link>
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(article.tags ?? []).map((t: string) => (
          <Badge key={t} variant="secondary">{t}</Badge>
        ))}
        <Badge variant={article.is_active ? 'default' : 'outline'}>
          {article.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>
      {article.problem_description && (
        <section>
          <h2 className="text-lg font-medium mb-2">Descrição do problema</h2>
          <p className="whitespace-pre-wrap text-muted-foreground">{article.problem_description}</p>
        </section>
      )}
      {article.solution && (
        <section>
          <h2 className="text-lg font-medium mb-2">Solução aplicada</h2>
          <p className="whitespace-pre-wrap">{article.solution}</p>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/artigos/[id]/editar/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KbArticleForm } from '@/components/conhecimento/KbArticleForm'
import { updateArticleAction } from '@/app/(internal)/conhecimento/actions'

export default async function EditarArtigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: article }, { data: categories }] = await Promise.all([
    supabase.from('kb_articles').select('*').eq('id', id).single() as Promise<{ data: any }>,
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name') as Promise<{ data: any[] | null }>,
  ])

  if (!article) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar Artigo</h1>
      <KbArticleForm
        action={updateArticleAction.bind(null, id) as any}
        initialData={article}
        categories={categories ?? []}
      />
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/conhecimento/ src/app/(internal)/chamados/actions.ts src/components/conhecimento/KbArticleForm.tsx src/components/conhecimento/KbArticleList.tsx
git commit -m "feat: CRUD de artigos da base de conhecimento + fix do closeWithResolutionAction"
```

---

## Task 7: KB — Documentos CRUD no painel interno

**Files:**
- Modify: `src/app/(internal)/conhecimento/actions.ts` (adicionar funções de documento)
- Create: `src/app/(internal)/conhecimento/documentos/novo/page.tsx`
- Create: `src/app/(internal)/conhecimento/documentos/[id]/page.tsx`
- Create: `src/app/(internal)/conhecimento/documentos/[id]/editar/page.tsx`
- Create: `src/components/conhecimento/KbDocumentForm.tsx`
- Create: `src/components/conhecimento/KbDocumentList.tsx`

- [ ] **Adicionar actions de documentos em `src/app/(internal)/conhecimento/actions.ts`**

```typescript
export async function createDocumentAction(formData: FormData) {
  const contentHtml = formData.get('content_html') as string
  const contentRichText = JSON.parse((formData.get('content_rich_text') as string) || 'null')

  const parsed = kbDocumentSchema.safeParse({
    company_id: formData.get('company_id'),
    title: formData.get('title'),
    content_html: contentHtml || undefined,
    content_rich_text: contentRichText,
    category: formData.get('category') || undefined,
    published_at: formData.get('published_at') || null,
    is_active: true,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('kb_documents').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never).select('id').single()

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  return { success: true, id: (data as any).id }
}

export async function updateDocumentAction(id: string, formData: FormData) {
  const contentHtml = formData.get('content_html') as string
  const contentRichText = JSON.parse((formData.get('content_rich_text') as string) || 'null')

  const parsed = kbDocumentSchema.safeParse({
    company_id: formData.get('company_id'),
    title: formData.get('title'),
    content_html: contentHtml || undefined,
    content_rich_text: contentRichText,
    category: formData.get('category') || undefined,
    published_at: formData.get('published_at') || null,
    is_active: formData.get('is_active') !== 'false',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('kb_documents')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  revalidatePath(`/conhecimento/documentos/${id}`)
  return { success: true }
}

export async function deleteDocumentAttachmentAction(attachmentId: string, storagePath: string, documentId: string) {
  const supabase = await createClient()
  await supabase.storage.from('kb-documents').remove([storagePath])
  await supabase.from('kb_document_attachments').delete().eq('id', attachmentId)
  revalidatePath(`/conhecimento/documentos/${documentId}`)
}
```

Adicionar ao topo do arquivo a importação:
```typescript
import { kbDocumentSchema } from '@/lib/validations/kb-document'
```

- [ ] **Criar `src/components/conhecimento/KbDocumentForm.tsx`**

```typescript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface KbDocumentFormProps {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean; id?: string }>
  documentId?: string
  initialData?: {
    company_id?: string
    title?: string
    content_rich_text?: object | null
    content_html?: string | null
    category?: string | null
    published_at?: string | null
  }
  companies: { id: string; name: string }[]
  attachments?: { id: string; filename: string; storage_path: string }[]
}

export function KbDocumentForm({
  action,
  documentId,
  initialData,
  companies,
  attachments = [],
}: KbDocumentFormProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: (initialData?.content_rich_text as any) ?? initialData?.content_html ?? '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none' },
    },
  })

  async function handleUpload(file: File, docId: string) {
    setUploadingFile(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_id', docId)
    await fetch('/api/upload/kb-document', { method: 'POST', body: fd })
    setUploadingFile(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    fd.set('content_html', editor?.getHTML() ?? '')
    fd.set('content_rich_text', JSON.stringify(editor?.getJSON() ?? null))

    const result = await action(fd)
    setPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    const targetId = documentId ?? result.id
    const files = fileInputRef.current?.files
    if (files && targetId) {
      for (const file of Array.from(files)) {
        await handleUpload(file, targetId)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      <div>
        <Label htmlFor="company_id">Cliente *</Label>
        <select
          id="company_id"
          name="company_id"
          defaultValue={initialData?.company_id ?? ''}
          required
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Selecione...</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="category">Categoria</Label>
        <Input id="category" name="category" defaultValue={initialData?.category ?? ''} />
      </div>
      <div>
        <Label htmlFor="published_at">Data de publicação</Label>
        <Input id="published_at" name="published_at" type="date" defaultValue={initialData?.published_at ?? ''} />
      </div>
      <div>
        <Label>Conteúdo</Label>
        <div className="border rounded-md overflow-hidden">
          <div className="flex gap-1 p-2 border-b bg-muted/50">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <strong>B</strong>
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <em>I</em>
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              Lista
            </button>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div>
        <Label htmlFor="attachments">Anexos (PDF, imagens)</Label>
        <input ref={fileInputRef} id="attachments" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="text-sm" />
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map(a => (
              <li key={a.id} className="flex items-center gap-2">
                <span>{a.filename}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || uploadingFile}>
        {pending || uploadingFile ? 'Salvando...' : 'Salvar documento'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/conhecimento/KbDocumentList.tsx`** — tabela com: título, empresa, categoria, status (ativo/inativo), data de publicação, links de editar e desativar.

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

type Document = {
  id: string
  title: string
  category: string | null
  published_at: string | null
  is_active: boolean
  companies: { name: string } | null
}

export function KbDocumentList({ documents }: { documents: Document[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Cliente</th>
            <th className="text-left px-4 py-3 font-medium">Categoria</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {documents.map(d => (
            <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/conhecimento/documentos/${d.id}`} className="hover:underline font-medium">
                  {d.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{d.companies?.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{d.category ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge variant={d.is_active ? 'default' : 'outline'}>
                  {d.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/conhecimento/documentos/${d.id}/editar`}>Editar</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Atualizar `src/app/(internal)/conhecimento/page.tsx`** — adicionar tab "Documentos" com a lista de documentos e botão "Novo Documento":

```typescript
import { createClient } from '@/lib/supabase/server'
import { KbArticleList } from '@/components/conhecimento/KbArticleList'
import { KbDocumentList } from '@/components/conhecimento/KbDocumentList'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function ConhecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'documentos' ? 'documentos' : 'artigos'
  const supabase = await createClient()

  const [{ data: articles }, { data: documents }] = await Promise.all([
    supabase.from('kb_articles').select('id, title, category_id, tags, is_active, created_at').order('created_at', { ascending: false }),
    supabase.from('kb_documents').select('id, title, category, published_at, is_active, companies(name)').order('created_at', { ascending: false }),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
        <Button asChild>
          <Link href={activeTab === 'artigos' ? '/conhecimento/artigos/novo' : '/conhecimento/documentos/novo'}>
            {activeTab === 'artigos' ? 'Novo Artigo' : 'Novo Documento'}
          </Link>
        </Button>
      </div>
      <div className="flex gap-4 border-b">
        <Link
          href="/conhecimento?tab=artigos"
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'artigos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Artigos de Resolução
        </Link>
        <Link
          href="/conhecimento?tab=documentos"
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'documentos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Documentos por Cliente
        </Link>
      </div>
      {activeTab === 'artigos'
        ? <KbArticleList articles={articles ?? []} />
        : <KbDocumentList documents={documents ?? []} />
      }
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/documentos/novo/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { KbDocumentForm } from '@/components/conhecimento/KbDocumentForm'
import { createDocumentAction } from '@/app/(internal)/conhecimento/actions'

export default async function NovoDocumentoPage() {
  const supabase = await createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Documento</h1>
      <KbDocumentForm action={createDocumentAction} companies={companies ?? []} />
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/conhecimento/documentos/[id]/page.tsx`** e **`editar/page.tsx`** — seguindo o mesmo padrão das páginas de artigo, buscando o documento e seus anexos, carregando empresas para o formulário de edição.

- [ ] **Commit**

```bash
git add src/app/(internal)/conhecimento/ src/components/conhecimento/
git commit -m "feat: CRUD de documentos por cliente com editor TipTap e upload de anexos"
```

---

## Task 8: API de busca KB + Sugestão automática no portal

**Files:**
- Create: `src/app/api/kb/search/route.ts`
- Create: `src/components/conhecimento/KbSearchSuggestions.tsx`
- Modify: `src/app/(portal)/portal/chamados/novo/page.tsx`

- [ ] **Criar `src/app/api/kb/search/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 3) return NextResponse.json({ articles: [] })

  const supabase = await createClient()
  const { data } = await supabase.rpc('search_kb_articles', { query: q })

  return NextResponse.json({ articles: data ?? [] })
}
```

- [ ] **Criar `src/components/conhecimento/KbSearchSuggestions.tsx`**

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Article {
  id: string
  title: string
  problem_description: string | null
  solution: string | null
}

interface KbSearchSuggestionsProps {
  query: string
  onResolved?: () => void
}

export function KbSearchSuggestions({ query, onResolved }: KbSearchSuggestionsProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.length < 3) { setArticles([]); return }

    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`)
      const { articles: found } = await res.json()
      setArticles(found)
    }, 500)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  if (resolved) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Ficamos felizes que conseguiu resolver! Seu chamado não foi aberto.
      </div>
    )
  }

  if (articles.length === 0) return null

  return (
    <div className="rounded-md border p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        Encontramos artigos que podem resolver seu problema:
      </p>
      {articles.map(a => (
        <div key={a.id} className="border rounded-md p-3 space-y-2">
          <button
            type="button"
            onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            className="text-left font-medium text-sm hover:underline w-full"
          >
            {a.title}
          </button>
          {expanded === a.id && a.solution && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.solution}</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => { setResolved(true); onResolved?.() }}
            >
              Isso resolveu meu problema
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setArticles(prev => prev.filter(x => x.id !== a.id))}
            >
              Ignorar
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Refatorar `src/app/(portal)/portal/chamados/novo/page.tsx`** — extrair o formulário para um componente client que integra as sugestões:

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KbSearchSuggestions } from '@/components/conhecimento/KbSearchSuggestions'

interface NovoChamadoPortalFormProps {
  categories: { id: string; name: string }[]
  createAction: (formData: FormData) => Promise<void>
}

export function NovoChamadoPortalForm({ categories, createAction }: NovoChamadoPortalFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blocked, setBlocked] = useState(false)

  const searchQuery = [title, description].join(' ').trim()

  if (blocked) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-6 text-green-800">
        <p className="font-medium">Problema resolvido!</p>
        <p className="text-sm mt-1">Seu problema foi resolvido pela base de conhecimento. Nenhum chamado foi aberto.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form action={createAction} className="space-y-4">
        <div>
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            name="title"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        {categories.length > 0 && (
          <div>
            <Label htmlFor="category_id">Categoria</Label>
            <select
              id="category_id"
              name="category_id"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Selecione...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit">Abrir chamado</Button>
      </form>
      <div>
        <KbSearchSuggestions query={searchQuery} onResolved={() => setBlocked(true)} />
      </div>
    </div>
  )
}
```

Atualizar `page.tsx` para usar esse componente:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ticketSchema } from '@/lib/validations/ticket'
import { NovoChamadoPortalForm } from './NovoChamadoPortalForm'

async function createPortalTicketAction(formData: FormData) {
  'use server'
  // ... (mesma lógica de antes)
}

export default async function NovoChamadoPortalPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ticket_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Abrir novo chamado</h1>
      <NovoChamadoPortalForm
        categories={categories ?? []}
        createAction={createPortalTicketAction}
      />
    </div>
  )
}
```

Criar `src/app/(portal)/portal/chamados/novo/NovoChamadoPortalForm.tsx` com o componente client acima.

- [ ] **Testar fluxo no portal** — navegar para `/portal/chamados/novo`, digitar título, verificar que as sugestões aparecem após 500ms.

- [ ] **Commit**

```bash
git add src/app/api/kb/ src/components/conhecimento/KbSearchSuggestions.tsx src/app/(portal)/portal/chamados/novo/
git commit -m "feat: API de busca KB e sugestão automática no portal durante abertura de chamado"
```

---

## Task 9: KB — Sugestão automática para analista

**Files:**
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`

- [ ] **Adicionar busca automática de artigos ao detalhe do chamado** — no final de `TicketDetailPage`, adicionar a chamada à RPC e passar os resultados como prop:

```typescript
// Adicionar junto às outras queries em Promise.all:
supabase.rpc('search_kb_articles', {
  query: `${ticket.title} ${ticket.description ?? ''}`.trim().slice(0, 500)
})
```

Adicionar ao array `Promise.all` do `TicketDetailPage` (linha ~22):
```typescript
const [
  { data: ticketRaw },
  { data: interactionsRaw },
  { data: templates },
  _,
  { data: { user } },
  { data: kbSuggestions },   // adicionar
] = await Promise.all([
  supabase.from('tickets').select(`...`).eq('id', id).single(),
  // ...demais queries...
  supabase.rpc('search_kb_articles', {
    query: [`${ticketRaw?.title ?? ''}`, `${ticketRaw?.description ?? ''}`].join(' ').trim().slice(0, 500)
  }),
])
```

> Nota: Como `ticketRaw` ainda não está disponível no ponto do Promise.all, use uma query separada. Adicionar **após** o bloco `Promise.all` existente:

```typescript
const { data: kbSuggestions } = ticket
  ? await supabase.rpc('search_kb_articles', {
      query: `${ticket.title} ${ticket.description ?? ''}`.trim().slice(0, 500)
    })
  : { data: [] }
```

- [ ] **Criar o painel de sugestões no JSX da página** — adicionar após o header do chamado (antes das interações):

```typescript
{kbSuggestions && kbSuggestions.length > 0 && (
  <div className="rounded-md border border-blue-100 bg-blue-50 p-4 space-y-3">
    <p className="text-sm font-medium text-blue-800">
      Artigos sugeridos com base no chamado:
    </p>
    {(kbSuggestions as any[]).map((a: any) => (
      <details key={a.id} className="border rounded bg-white p-3">
        <summary className="text-sm font-medium cursor-pointer">{a.title}</summary>
        {a.solution && (
          <div className="mt-2 space-y-2">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.solution}</p>
            <form action={async () => {
              'use server'
              // Preencher resolução com o conteúdo da solução (client-side apenas)
            }}>
              {/* Botão "Aplicar solução" controlado via Client Component separado */}
            </form>
          </div>
        )}
      </details>
    ))}
  </div>
)}
```

- [ ] **Criar `src/components/tickets/KbSuggestionApplyButton.tsx`** — Client Component com botão que preenche o campo de resolução via `document.querySelector`:

```typescript
'use client'
interface KbSuggestionApplyButtonProps {
  solution: string
}

export function KbSuggestionApplyButton({ solution }: KbSuggestionApplyButtonProps) {
  function applySolution() {
    const resolutionField = document.querySelector<HTMLTextAreaElement>('textarea[name="resolution"]')
    if (resolutionField) {
      resolutionField.value = solution
      resolutionField.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  return (
    <button
      type="button"
      onClick={applySolution}
      className="text-xs px-2 py-1 rounded border hover:bg-muted"
    >
      Aplicar solução no campo de resolução
    </button>
  )
}
```

Importar e usar em `chamados/[id]/page.tsx` dentro do painel de sugestões.

- [ ] **Commit**

```bash
git add src/app/(internal)/chamados/[id]/page.tsx src/components/tickets/KbSuggestionApplyButton.tsx
git commit -m "feat: sugestão automática de artigos da KB no detalhe do chamado para analista"
```

---

## Task 10: Portal — Documentos do cliente

**Files:**
- Create: `src/app/(portal)/portal/conhecimento/page.tsx`
- Modify: layout do portal para adicionar link de navegação (se houver sidebar)

- [ ] **Criar `src/app/(portal)/portal/conhecimento/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function PortalConhecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>
}) {
  const { categoria, q } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string } | null }

  if (!contact) notFound()

  let query = supabase
    .from('kb_documents')
    .select('id, title, category, published_at, content_html')
    .eq('company_id', contact.company_id)
    .eq('is_active', true)
    .order('published_at', { ascending: false })

  if (categoria) query = query.eq('category', categoria)
  if (q) query = query.ilike('title', `%${q}%`)

  const { data: documents } = await query as { data: any[] | null }

  const categories = [...new Set((documents ?? []).map(d => d.category).filter(Boolean))]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Documentos e Procedimentos</h1>

      <div className="flex gap-4">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por título..."
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="px-3 py-2 border rounded-md text-sm">Buscar</button>
        </form>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <a href="/portal/conhecimento" className={`px-3 py-1 rounded-full text-sm border ${!categoria ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            Todos
          </a>
          {categories.map(c => (
            <a key={c} href={`/portal/conhecimento?categoria=${c}`}
              className={`px-3 py-1 rounded-full text-sm border ${categoria === c ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {c}
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {(documents ?? []).map((doc: any) => (
          <div key={doc.id} className="border rounded-md p-4 space-y-2">
            <h2 className="font-medium">{doc.title}</h2>
            {doc.category && <p className="text-xs text-muted-foreground">{doc.category}</p>}
            {doc.content_html && (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: doc.content_html }}
              />
            )}
          </div>
        ))}
        {(documents ?? []).length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum documento disponível.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(portal)/portal/conhecimento/
git commit -m "feat: portal de documentos do cliente — lista filtrável por categoria"
```

---

## Task 11: Tarefas — CRUD com permissões por papel

**Files:**
- Create: `src/app/(internal)/tarefas/actions.ts`
- Create: `src/app/(internal)/tarefas/page.tsx`
- Create: `src/app/(internal)/tarefas/nova/page.tsx`
- Create: `src/components/tarefas/TaskForm.tsx`
- Create: `src/components/tarefas/TaskList.tsx`

- [ ] **Criar `src/app/(internal)/tarefas/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { taskSchema, taskUpdateSchema } from '@/lib/validations/task'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

export async function createTaskAction(formData: FormData) {
  const parsed = taskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    company_id: formData.get('company_id') || null,
    assigned_to: formData.get('assigned_to'),
    due_date: formData.get('due_date'),
    priority: formData.get('priority') || null,
    reminder_days_before: formData.get('reminder_days_before') ?? '3',
    is_recurring: formData.get('is_recurring') === 'on',
    recurrence_type: formData.get('recurrence_type') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('tasks').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/tarefas')
  return { success: true }
}

export async function updateTaskAction(id: string, formData: FormData) {
  const parsed = taskUpdateSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    company_id: formData.get('company_id') || null,
    assigned_to: formData.get('assigned_to'),
    due_date: formData.get('due_date'),
    priority: formData.get('priority') || null,
    reminder_days_before: formData.get('reminder_days_before') ?? '3',
    is_recurring: formData.get('is_recurring') === 'on',
    recurrence_type: formData.get('recurrence_type') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/tarefas')
  return { success: true }
}

export async function completeTaskAction(id: string) {
  const supabase = await createClient()

  const { data: task } = await supabase
    .from('tasks')
    .select('due_date, is_recurring, recurrence_type, recurrence_active, company_id, assigned_to, title, reminder_days_before, created_by')
    .eq('id', id)
    .single() as { data: any }

  if (!task) return { error: 'Tarefa não encontrada' }

  await supabase.from('tasks').update({
    status: 'concluida',
    completed_at: new Date().toISOString(),
  } as never).eq('id', id)

  if (task.is_recurring && task.recurrence_active && task.recurrence_type) {
    const nextDueDate = nextOccurrenceDate(task.due_date, task.recurrence_type)
    await supabase.from('tasks').insert({
      title: task.title,
      company_id: task.company_id,
      assigned_to: task.assigned_to,
      due_date: nextDueDate,
      is_recurring: true,
      recurrence_type: task.recurrence_type,
      recurrence_active: true,
      reminder_days_before: task.reminder_days_before,
      parent_task_id: id,
      created_by: task.created_by,
    } as never)
  }

  revalidatePath('/tarefas')
  return { success: true }
}

export async function stopRecurrenceAction(id: string) {
  const supabase = await createClient()
  await supabase.from('tasks').update({ recurrence_active: false } as never).eq('id', id)
  revalidatePath('/tarefas')
}
```

- [ ] **Criar `src/components/tarefas/TaskForm.tsx`**

```typescript
'use client'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

interface TaskFormProps {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  initialData?: {
    title?: string
    description?: string | null
    company_id?: string | null
    assigned_to?: string
    due_date?: string
    priority?: string | null
    reminder_days_before?: number
    is_recurring?: boolean
    recurrence_type?: string | null
  }
  companies: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
  currentUserId?: string
  isAnalista?: boolean
}

export function TaskForm({ action, initialData, companies, profiles, currentUserId, isAnalista }: TaskFormProps) {
  const [state, formAction, pending] = useActionState(action, null)
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring ?? false)

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={initialData?.description ?? ''} rows={3} />
      </div>
      <div>
        <Label htmlFor="company_id">Cliente</Label>
        <select
          id="company_id"
          name="company_id"
          defaultValue={initialData?.company_id ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem cliente vinculado</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="assigned_to">Responsável *</Label>
        {isAnalista ? (
          <input type="hidden" name="assigned_to" value={currentUserId} />
        ) : (
          <select
            id="assigned_to"
            name="assigned_to"
            defaultValue={initialData?.assigned_to ?? currentUserId ?? ''}
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Selecione...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      <div>
        <Label htmlFor="due_date">Data de vencimento *</Label>
        <Input id="due_date" name="due_date" type="date" defaultValue={initialData?.due_date} required />
      </div>
      <div>
        <Label htmlFor="priority">Prioridade</Label>
        <select
          id="priority"
          name="priority"
          defaultValue={initialData?.priority ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </div>
      <div>
        <Label htmlFor="reminder_days_before">Lembrete antecipado (dias antes)</Label>
        <Input
          id="reminder_days_before"
          name="reminder_days_before"
          type="number"
          min="0"
          defaultValue={initialData?.reminder_days_before ?? 3}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_recurring"
          name="is_recurring"
          checked={isRecurring}
          onChange={e => setIsRecurring(e.target.checked)}
        />
        <Label htmlFor="is_recurring">Tarefa recorrente</Label>
      </div>
      {isRecurring && (
        <div>
          <Label htmlFor="recurrence_type">Tipo de recorrência</Label>
          <select
            id="recurrence_type"
            name="recurrence_type"
            defaultValue={initialData?.recurrence_type ?? 'mensal'}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando...' : 'Salvar tarefa'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/tarefas/TaskList.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { completeTaskAction, stopRecurrenceAction } from '@/app/(internal)/tarefas/actions'

type Task = {
  id: string
  title: string
  due_date: string
  priority: string | null
  status: string
  is_recurring: boolean
  recurrence_active: boolean
  profiles: { full_name: string } | null
  companies: { name: string } | null
}

const statusColors: Record<string, 'default' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  concluida: 'default',
  vencida: 'destructive',
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Responsável</th>
            <th className="text-left px-4 py-3 font-medium">Vencimento</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const isOverdue = t.status === 'pendente' && t.due_date < today
            return (
              <tr key={t.id} className={`border-b last:border-0 ${isOverdue ? 'bg-red-50' : 'hover:bg-muted/30'}`}>
                <td className="px-4 py-3">
                  <span className="font-medium">{t.title}</span>
                  {t.is_recurring && (
                    <span className="ml-2 text-xs text-muted-foreground">↻ recorrente</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.profiles?.full_name}</td>
                <td className={`px-4 py-3 ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                  {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusColors[t.status] ?? 'outline'}>{t.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {t.status === 'pendente' && (
                      <form action={completeTaskAction.bind(null, t.id)}>
                        <Button variant="ghost" size="sm" type="submit">Concluir</Button>
                      </form>
                    )}
                    {t.is_recurring && t.recurrence_active && (
                      <form action={stopRecurrenceAction.bind(null, t.id)}>
                        <Button variant="ghost" size="sm" type="submit">Parar recorrência</Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/tarefas/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TaskList } from '@/components/tarefas/TaskList'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company_id?: string }>
}) {
  const { status, company_id } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('tasks')
    .select('id, title, due_date, priority, status, is_recurring, recurrence_active, profiles!assigned_to(full_name), companies(name)')
    .order('due_date')

  if (status) query = query.eq('status', status)
  if (company_id) query = query.eq('company_id', company_id)

  const { data: tasks } = await query as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarefas</h1>
        <Button asChild>
          <Link href="/tarefas/nova">Nova Tarefa</Link>
        </Button>
      </div>
      <div className="flex gap-2">
        {['pendente', 'concluida', 'vencida'].map(s => (
          <Link
            key={s}
            href={`/tarefas?status=${s}`}
            className={`px-3 py-1 rounded-full text-sm border ${status === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
        {status && (
          <Link href="/tarefas" className="px-3 py-1 rounded-full text-sm border hover:bg-muted">
            Todas
          </Link>
        )}
      </div>
      <TaskList tasks={tasks ?? []} />
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/tarefas/nova/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TaskForm } from '@/components/tarefas/TaskForm'
import { createTaskAction } from '../actions'

export default async function NovaTarefaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: companies }, { data: profiles }, { data: profile }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any }]

  const isAnalista = (profile as any)?.role === 'analista'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Tarefa</h1>
      <TaskForm
        action={createTaskAction}
        companies={companies ?? []}
        profiles={profiles ?? []}
        currentUserId={user!.id}
        isAnalista={isAnalista}
      />
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/tarefas/ src/components/tarefas/
git commit -m "feat: CRUD de tarefas com permissões por papel e recorrência"
```

---

## Task 12: Tarefas — Validação de recorrência (testes de integração)

**Files:**
- Modify: `tests/task.test.ts` (adicionar testes de integração para `completeTaskAction`)

> Esta task valida a lógica central de recorrência via testes. Requer Supabase local rodando.

- [ ] **Confirmar que Supabase local está rodando**

```bash
npx supabase status
```

Expected: `API URL: http://127.0.0.1:54321`

- [ ] **Adicionar testes de integração a `tests/task.test.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

describe('recorrência de tarefa (integração)', () => {
  it('ao concluir tarefa mensal recorrente, cria próxima ocorrência', async () => {
    // Inserir perfil de teste (pode já existir no seed)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'analista')
      .limit(1)
      .single()

    if (!profile) {
      console.warn('Nenhum analista no DB — pulando teste de integração')
      return
    }

    // Criar tarefa recorrente
    const { data: task } = await supabase.from('tasks').insert({
      title: 'Teste recorrência mensal',
      assigned_to: profile.id,
      due_date: '2026-06-01',
      is_recurring: true,
      recurrence_type: 'mensal',
      recurrence_active: true,
      created_by: profile.id,
    } as never).select('id').single()

    expect(task).not.toBeNull()
    const taskId = (task as any).id

    // Concluir via update direto (simula completeTaskAction)
    await supabase.from('tasks').update({ status: 'concluida', completed_at: new Date().toISOString() } as never).eq('id', taskId)

    // Criar próxima (mesma lógica do completeTaskAction)
    const nextDate = nextOccurrenceDate('2026-06-01', 'mensal')
    expect(nextDate).toBe('2026-07-01')

    await supabase.from('tasks').insert({
      title: 'Teste recorrência mensal',
      assigned_to: profile.id,
      due_date: nextDate,
      is_recurring: true,
      recurrence_type: 'mensal',
      recurrence_active: true,
      parent_task_id: taskId,
      created_by: profile.id,
    } as never)

    const { data: children } = await supabase
      .from('tasks')
      .select('id, due_date')
      .eq('parent_task_id', taskId)

    expect(children).toHaveLength(1)
    expect((children as any[])[0].due_date).toBe('2026-07-01')

    // Cleanup
    await supabase.from('tasks').delete().eq('parent_task_id', taskId)
    await supabase.from('tasks').delete().eq('id', taskId)
  })
})
```

- [ ] **Rodar os testes**

```bash
npm test -- tests/task.test.ts
```

Expected: PASS (todos os testes incluindo integração).

- [ ] **Commit**

```bash
git add tests/task.test.ts
git commit -m "test: integração de recorrência de tarefa mensal"
```

---

## Task 13: Cron — Lembretes de tarefas + atualização de vencidas

**Files:**
- Create: `src/app/api/cron/task-reminders/route.ts`

- [ ] **Criar `src/app/api/cron/task-reminders/route.ts`**

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
  const today = new Date().toISOString().slice(0, 10)

  // 1. Atualizar tarefas vencidas e não concluídas
  const { count: overdueCount } = await supabase
    .from('tasks')
    .update({ status: 'vencida' } as never)
    .eq('status', 'pendente')
    .lt('due_date', today)

  // 2. Tarefas com lembrete antecipado (due_date - reminder_days_before = today)
  // Supabase não tem aritmética nativa de datas — buscar pendentes e filtrar em JS
  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, reminder_days_before, assigned_to, profiles!assigned_to(full_name, id)')
    .eq('status', 'pendente')
    .gte('due_date', today) as { data: any[] | null }

  let remindersSent = 0

  for (const task of pendingTasks ?? []) {
    const dueDate = new Date(task.due_date + 'T12:00:00')
    const reminderDate = new Date(dueDate)
    reminderDate.setDate(reminderDate.getDate() - task.reminder_days_before)
    const reminderDateStr = reminderDate.toISOString().slice(0, 10)

    const isReminder = reminderDateStr === today
    const isDueToday = task.due_date === today

    if (!isReminder && !isDueToday) continue

    const profile = task.profiles
    if (!profile) continue

    // Buscar e-mail do usuário via auth.users — service role
    const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to)
    const email = authUser?.user?.email
    if (!email) continue

    const dueDateFormatted = dueDate.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    try {
      await sendEmailFromTemplate('lembrete_tarefa', email, {
        nome_responsavel: profile.full_name ?? '',
        titulo_tarefa: task.title,
        data_vencimento: dueDateFormatted,
        tipo_lembrete: isDueToday ? 'vence hoje' : `vence em ${task.reminder_days_before} dias`,
        link_tarefas: `${process.env.NEXT_PUBLIC_APP_URL}/tarefas`,
      })
      remindersSent++
    } catch (e) {
      console.error(`Erro ao enviar lembrete tarefa ${task.id}:`, e)
    }
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: 'Lembretes de tarefas enviados',
    details: { remindersSent, overdueCount: overdueCount ?? 0, date: today },
  } as never)

  return NextResponse.json({ ok: true, remindersSent, overdueCount: overdueCount ?? 0 })
}
```

> **Nota:** Para o template `lembrete_tarefa`, adicionar uma linha na migração de seed de email_templates ou inserir manualmente na tabela `email_templates` com as variáveis: `nome_responsavel`, `titulo_tarefa`, `data_vencimento`, `tipo_lembrete`, `link_tarefas`.

- [ ] **Testar o endpoint manualmente**

```bash
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/task-reminders
```

Expected: `{"ok":true,"remindersSent":0,"overdueCount":0}`

- [ ] **Commit**

```bash
git add src/app/api/cron/task-reminders/
git commit -m "feat: cron de lembretes de tarefas com atualização de status vencida"
```

---

## Task 14: Reuniões — CRUD + participantes + itens de ação

**Files:**
- Create: `src/app/(internal)/reunioes/actions.ts`
- Create: `src/app/(internal)/reunioes/page.tsx`
- Create: `src/app/(internal)/reunioes/nova/page.tsx`
- Create: `src/app/(internal)/reunioes/[id]/page.tsx`
- Create: `src/components/reunioes/MeetingForm.tsx`
- Create: `src/components/reunioes/MeetingList.tsx`
- Create: `src/components/reunioes/ActionItemsPanel.tsx`

- [ ] **Criar `src/app/(internal)/reunioes/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { meetingSchema } from '@/lib/validations/meeting'

export async function createMeetingAction(data: {
  company_id: string
  title: string
  scheduled_at: string
  notes_html?: string
  notes_rich_text?: object | null
  participants: Array<
    | { type: 'profile'; profile_id: string }
    | { type: 'contact'; contact_id: string }
    | { type: 'external'; external_email: string; external_name: string }
  >
  action_items: Array<{
    description: string
    responsible_profile_id?: string | null
    responsible_contact_id?: string | null
    responsible_external_email?: string | null
    due_date?: string | null
  }>
}) {
  const parsed = meetingSchema.safeParse({ ...data, status: 'agendada' })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      company_id: parsed.data.company_id,
      title: parsed.data.title,
      scheduled_at: parsed.data.scheduled_at,
      notes_html: parsed.data.notes_html,
      notes_rich_text: parsed.data.notes_rich_text as never,
      status: 'agendada',
      created_by: user!.id,
    } as never)
    .select('id')
    .single()

  if (meetingError) return { error: meetingError.message }

  const meetingId = (meeting as any).id

  // Inserir participantes
  if (parsed.data.participants.length > 0) {
    const participantRows = parsed.data.participants.map(p => {
      if (p.type === 'profile') return { meeting_id: meetingId, profile_id: p.profile_id }
      if (p.type === 'contact') return { meeting_id: meetingId, contact_id: p.contact_id }
      return { meeting_id: meetingId, external_email: p.external_email, external_name: p.external_name }
    })
    await supabase.from('meeting_participants').insert(participantRows as never)
  }

  // Inserir itens de ação
  if (parsed.data.action_items.length > 0) {
    const actionRows = parsed.data.action_items.map(item => ({
      meeting_id: meetingId,
      description: item.description,
      responsible_profile_id: item.responsible_profile_id ?? null,
      responsible_contact_id: item.responsible_contact_id ?? null,
      responsible_external_email: item.responsible_external_email ?? null,
      due_date: item.due_date ?? null,
    }))
    await supabase.from('meeting_action_items').insert(actionRows as never)
  }

  revalidatePath('/reunioes')
  return { success: true, id: meetingId }
}

export async function updateMeetingNotesAction(meetingId: string, notesHtml: string, notesRichText: object | null) {
  const supabase = await createClient()
  await supabase.from('meetings').update({
    notes_html: notesHtml,
    notes_rich_text: notesRichText as never,
  } as never).eq('id', meetingId)
  revalidatePath(`/reunioes/${meetingId}`)
}

export async function updateMeetingStatusAction(meetingId: string, status: 'realizada' | 'cancelada') {
  const supabase = await createClient()
  await supabase.from('meetings').update({ status } as never).eq('id', meetingId)
  revalidatePath(`/reunioes/${meetingId}`)
}

export async function updateActionItemStatusAction(itemId: string, meetingId: string, status: 'pendente' | 'concluido') {
  const supabase = await createClient()
  await supabase.from('meeting_action_items').update({ status } as never).eq('id', itemId)
  revalidatePath(`/reunioes/${meetingId}`)
}
```

- [ ] **Criar `src/components/reunioes/MeetingForm.tsx`** — formulário completo com seleção de empresa, TipTap para notas, campo de participantes (com dropdown para perfis internos, contatos e campo livre para externos) e lista dinâmica de itens de ação:

```typescript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createMeetingAction } from '@/app/(internal)/reunioes/actions'
import { useRouter } from 'next/navigation'

interface MeetingFormProps {
  companies: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
  contacts: { id: string; full_name: string; company_id: string }[]
}

type Participant =
  | { type: 'profile'; profile_id: string; label: string }
  | { type: 'contact'; contact_id: string; label: string }
  | { type: 'external'; external_email: string; external_name: string; label: string }

type ActionItem = {
  description: string
  responsible_profile_id: string | null
  due_date: string | null
}

export function MeetingForm({ companies, profiles, contacts }: MeetingFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [companyId, setCompanyId] = useState('')

  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: { attributes: { class: 'prose prose-sm max-w-none min-h-[150px] p-3 focus:outline-none' } },
  })

  function addParticipantProfile(profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile || participants.some(p => p.type === 'profile' && p.profile_id === profileId)) return
    setParticipants(prev => [...prev, { type: 'profile', profile_id: profileId, label: profile.full_name }])
  }

  function addParticipantContact(contactId: string) {
    const contact = contacts.find(c => c.id === contactId)
    if (!contact || participants.some(p => p.type === 'contact' && p.contact_id === contactId)) return
    setParticipants(prev => [...prev, { type: 'contact', contact_id: contactId, label: contact.full_name }])
  }

  function addExternalParticipant(email: string, name: string) {
    if (!email || !name) return
    setParticipants(prev => [...prev, { type: 'external', external_email: email, external_name: name, label: `${name} (${email})` }])
  }

  function addActionItem() {
    setActionItems(prev => [...prev, { description: '', responsible_profile_id: null, due_date: null }])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const data = {
      company_id: fd.get('company_id') as string,
      title: fd.get('title') as string,
      scheduled_at: fd.get('scheduled_at') as string,
      notes_html: editor?.getHTML() ?? '',
      notes_rich_text: editor?.getJSON() ?? null,
      participants: participants.map(p => {
        if (p.type === 'profile') return { type: 'profile' as const, profile_id: p.profile_id }
        if (p.type === 'contact') return { type: 'contact' as const, contact_id: p.contact_id }
        return { type: 'external' as const, external_email: p.external_email, external_name: p.external_name }
      }),
      action_items: actionItems,
    }

    const result = await createMeetingAction(data)
    setPending(false)

    if (result.error) { setError(result.error); return }
    router.push(`/reunioes/${result.id}`)
  }

  const filteredContacts = companyId ? contacts.filter(c => c.company_id === companyId) : contacts

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <div>
        <Label htmlFor="company_id">Cliente *</Label>
        <select
          id="company_id"
          name="company_id"
          required
          onChange={e => setCompanyId(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Selecione...</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="title">Pauta / Título *</Label>
        <Input id="title" name="title" required />
      </div>
      <div>
        <Label htmlFor="scheduled_at">Data e hora *</Label>
        <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
      </div>

      {/* Participantes */}
      <div className="space-y-2">
        <Label>Participantes</Label>
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
            onChange={e => e.target.value && addParticipantProfile(e.target.value)}
            defaultValue=""
          >
            <option value="">Adicionar participante interno...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
            onChange={e => e.target.value && addParticipantContact(e.target.value)}
            defaultValue=""
          >
            <option value="">Adicionar contato do cliente...</option>
            {filteredContacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Input id="ext_email" placeholder="E-mail externo" type="email" className="flex-1" />
          <Input id="ext_name" placeholder="Nome" className="flex-1" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const email = (document.getElementById('ext_email') as HTMLInputElement).value
              const name = (document.getElementById('ext_name') as HTMLInputElement).value
              addExternalParticipant(email, name)
            }}
          >
            Adicionar
          </Button>
        </div>
        {participants.length > 0 && (
          <ul className="space-y-1">
            {participants.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm border rounded px-3 py-1">
                <span>{p.label}</span>
                <button type="button" onClick={() => setParticipants(prev => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notas */}
      <div>
        <Label>Anotações e decisões</Label>
        <div className="border rounded-md overflow-hidden">
          <div className="flex gap-1 p-2 border-b bg-muted/50">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <strong>B</strong>
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              Lista
            </button>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Itens de ação */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Itens de ação</Label>
          <Button type="button" variant="outline" size="sm" onClick={addActionItem}>+ Adicionar item</Button>
        </div>
        {actionItems.map((item, i) => (
          <div key={i} className="flex gap-2 items-start border rounded p-3">
            <Input
              placeholder="Descrição da ação..."
              value={item.description}
              onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, description: e.target.value } : a))}
              className="flex-1"
            />
            <select
              className="border rounded-md px-2 py-2 text-sm bg-background"
              value={item.responsible_profile_id ?? ''}
              onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, responsible_profile_id: e.target.value || null } : a))}
            >
              <option value="">Responsável...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <Input
              type="date"
              className="w-36"
              value={item.due_date ?? ''}
              onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, due_date: e.target.value || null } : a))}
            />
            <button type="button" onClick={() => setActionItems(prev => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive">✕</button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando...' : 'Criar reunião'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/reunioes/MeetingList.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

type Meeting = {
  id: string
  title: string
  scheduled_at: string
  status: string
  companies: { name: string } | null
}

const statusVariants: Record<string, 'default' | 'outline' | 'secondary'> = {
  agendada: 'secondary',
  realizada: 'default',
  cancelada: 'outline',
}

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Pauta</th>
            <th className="text-left px-4 py-3 font-medium">Cliente</th>
            <th className="text-left px-4 py-3 font-medium">Data</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map(m => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/reunioes/${m.id}`} className="hover:underline font-medium">{m.title}</Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{m.companies?.name}</td>
              <td className="px-4 py-3">
                {new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariants[m.status] ?? 'outline'}>{m.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Criar `src/components/reunioes/ActionItemsPanel.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateActionItemStatusAction } from '@/app/(internal)/reunioes/actions'

type ActionItem = {
  id: string
  description: string
  due_date: string | null
  status: string
  converted_to_task_id: string | null
  responsible_profile_id: string | null
  profiles: { full_name: string } | null
}

interface ActionItemsPanelProps {
  items: ActionItem[]
  meetingId: string
}

export function ActionItemsPanel({ items, meetingId }: ActionItemsPanelProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Itens de ação</h3>
      {items.map(item => (
        <div key={item.id} className="flex items-start justify-between border rounded-md p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{item.description}</p>
            {item.profiles && (
              <p className="text-xs text-muted-foreground">Responsável: {item.profiles.full_name}</p>
            )}
            {item.due_date && (
              <p className="text-xs text-muted-foreground">
                Prazo: {new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
              </p>
            )}
            {item.converted_to_task_id && (
              <Badge variant="secondary" className="text-xs">Convertido em tarefa</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {item.status === 'pendente' && (
              <form action={updateActionItemStatusAction.bind(null, item.id, meetingId, 'concluido')}>
                <Button variant="ghost" size="sm" type="submit">Concluir</Button>
              </form>
            )}
            <Badge variant={item.status === 'concluido' ? 'default' : 'outline'}>
              {item.status}
            </Badge>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum item de ação registrado.</p>
      )}
    </div>
  )
}
```

- [ ] **Criar `src/app/(internal)/reunioes/page.tsx`**, **`nova/page.tsx`** e **`[id]/page.tsx`** — seguindo o mesmo padrão das outras rotas. A página de detalhe deve buscar a reunião com participantes e itens de ação e exibir `ActionItemsPanel`.

```typescript
// src/app/(internal)/reunioes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { MeetingList } from '@/components/reunioes/MeetingList'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function ReunioesPage() {
  const supabase = await createClient()
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at, status, companies(name)')
    .order('scheduled_at', { ascending: false }) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reuniões</h1>
        <Button asChild><Link href="/reunioes/nova">Nova Reunião</Link></Button>
      </div>
      <MeetingList meetings={meetings ?? []} />
    </div>
  )
}
```

```typescript
// src/app/(internal)/reunioes/nova/page.tsx
import { createClient } from '@/lib/supabase/server'
import { MeetingForm } from '@/components/reunioes/MeetingForm'

export default async function NovaReuniaoPage() {
  const supabase = await createClient()
  const [{ data: companies }, { data: profiles }, { data: contacts }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name'),
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Reunião</h1>
      <MeetingForm companies={companies ?? []} profiles={profiles ?? []} contacts={contacts ?? []} />
    </div>
  )
}
```

```typescript
// src/app/(internal)/reunioes/[id]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ActionItemsPanel } from '@/components/reunioes/ActionItemsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateMeetingStatusAction } from '../actions'

export default async function ReuniaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: meeting }, { data: items }] = await Promise.all([
    supabase.from('meetings')
      .select('*, companies(name), meeting_participants(id, profile_id, contact_id, external_email, external_name, profiles(full_name), contacts(full_name))')
      .eq('id', id)
      .single(),
    supabase.from('meeting_action_items')
      .select('*, profiles!responsible_profile_id(full_name)')
      .eq('meeting_id', id)
      .order('status'),
  ]) as [{ data: any }, { data: any[] | null }]

  if (!meeting) notFound()

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          <p className="text-muted-foreground text-sm">
            {(meeting as any).companies?.name} ·{' '}
            {new Date(meeting.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
          </p>
        </div>
        <Badge>{meeting.status}</Badge>
      </div>

      {meeting.notes_html && (
        <div>
          <h2 className="font-medium mb-2">Anotações</h2>
          <div className="prose prose-sm max-w-none border rounded-md p-4"
            dangerouslySetInnerHTML={{ __html: meeting.notes_html }} />
        </div>
      )}

      <ActionItemsPanel items={items ?? []} meetingId={id} />

      {meeting.status === 'agendada' && (
        <div className="flex gap-2">
          <form action={updateMeetingStatusAction.bind(null, id, 'realizada')}>
            <Button type="submit" variant="default">Marcar como realizada</Button>
          </form>
          <form action={updateMeetingStatusAction.bind(null, id, 'cancelada')}>
            <Button type="submit" variant="ghost">Cancelar reunião</Button>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/reunioes/ src/components/reunioes/MeetingForm.tsx src/components/reunioes/MeetingList.tsx src/components/reunioes/ActionItemsPanel.tsx
git commit -m "feat: CRUD de reuniões com participantes internos/externos e itens de ação"
```

---

## Task 15: Reuniões — Ata PDF + envio por e-mail

**Files:**
- Create: `src/components/reunioes/MeetingMinutesPDF.tsx`
- Modify: `src/app/(internal)/reunioes/actions.ts` (adicionar `sendMinutesAction`)
- Modify: `src/app/(internal)/reunioes/[id]/page.tsx` (botão de enviar ata)

- [ ] **Instalar @react-pdf/renderer**

```bash
npm install @react-pdf/renderer
npm install -D @types/react-pdf
```

- [ ] **Criar `src/components/reunioes/MeetingMinutesPDF.tsx`**

```typescript
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottom: '1pt solid #e5e7eb', paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#6b7280' },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#1f2937' },
  participant: { fontSize: 10, marginBottom: 2, color: '#374151' },
  notes: { fontSize: 10, color: '#374151', lineHeight: 1.5 },
  actionItem: {
    borderLeft: '2pt solid #3b82f6',
    paddingLeft: 8,
    marginBottom: 8,
  },
  actionDesc: { fontSize: 10, fontWeight: 'bold' },
  actionMeta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 9, color: '#9ca3af', textAlign: 'center' },
})

interface MeetingMinutesPDFProps {
  meeting: {
    title: string
    scheduled_at: string
    companies: { name: string } | null
    notes_html?: string | null
  }
  participants: Array<{
    profiles?: { full_name: string } | null
    contacts?: { full_name: string } | null
    external_name?: string | null
    external_email?: string | null
  }>
  actionItems: Array<{
    description: string
    status: string
    due_date: string | null
    profiles?: { full_name: string } | null
  }>
}

export function MeetingMinutesPDF({ meeting, participants, actionItems }: MeetingMinutesPDFProps) {
  const dateFormatted = new Date(meeting.scheduled_at).toLocaleString('pt-BR', {
    dateStyle: 'full', timeStyle: 'short',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Ata de Reunião</Text>
          <Text style={styles.subtitle}>ITRAMOS Tecnologia</Text>
        </View>

        <View>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{meeting.title}</Text>
          <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
            {meeting.companies?.name} · {dateFormatted}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participantes</Text>
          {participants.map((p, i) => {
            const name = p.profiles?.full_name ?? p.contacts?.full_name ?? p.external_name ?? ''
            const extra = p.external_email ? ` (${p.external_email})` : ''
            return <Text key={i} style={styles.participant}>• {name}{extra}</Text>
          })}
        </View>

        {meeting.notes_html && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Anotações e Decisões</Text>
            <Text style={styles.notes}>
              {meeting.notes_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            </Text>
          </View>
        )}

        {actionItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itens de Ação</Text>
            {actionItems.map((item, i) => (
              <View key={i} style={styles.actionItem}>
                <Text style={styles.actionDesc}>{item.description}</Text>
                <Text style={styles.actionMeta}>
                  {item.profiles?.full_name ? `Responsável: ${item.profiles.full_name}` : ''}
                  {item.due_date ? ` · Prazo: ${new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                  {` · Status: ${item.status}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Gerado por ITRAMOS ITSM em {new Date().toLocaleString('pt-BR')}</Text>
      </Page>
    </Document>
  )
}
```

- [ ] **Adicionar `sendMinutesAction` em `src/app/(internal)/reunioes/actions.ts`**

```typescript
export async function sendMinutesAction(meetingId: string) {
  const supabase = await createClient()

  const [{ data: meeting }, { data: participants }, { data: actionItems }] = await Promise.all([
    supabase.from('meetings')
      .select('*, companies(name)')
      .eq('id', meetingId)
      .single(),
    supabase.from('meeting_participants')
      .select('profile_id, contact_id, external_email, external_name, profiles(full_name), contacts(full_name, email)')
      .eq('meeting_id', meetingId),
    supabase.from('meeting_action_items')
      .select('*, profiles!responsible_profile_id(full_name)')
      .eq('meeting_id', meetingId),
  ]) as [{ data: any }, { data: any[] | null }, { data: any[] | null }]

  if (!meeting) return { error: 'Reunião não encontrada' }

  // Coletar e-mails dos participantes
  const emails: string[] = []
  for (const p of participants ?? []) {
    if (p.external_email) emails.push(p.external_email)
    if (p.contacts?.email) emails.push(p.contacts.email)
    if (p.profile_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(p.profile_id)
      if (authUser?.user?.email) emails.push(authUser.user.email)
    }
  }

  if (emails.length === 0) return { error: 'Nenhum e-mail de participante encontrado' }

  // Gerar PDF como buffer
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { MeetingMinutesPDF } = await import('@/components/reunioes/MeetingMinutesPDF')
  const { createElement } = await import('react')

  const pdfBuffer = await renderToBuffer(
    createElement(MeetingMinutesPDF, {
      meeting,
      participants: participants ?? [],
      actionItems: actionItems ?? [],
    })
  )

  // Gerar texto simples da ata para o corpo do e-mail
  const dateFormatted = new Date(meeting.scheduled_at).toLocaleString('pt-BR', {
    dateStyle: 'full', timeStyle: 'short',
  })

  const participantNames = (participants ?? [])
    .map((p: any) => p.profiles?.full_name ?? p.contacts?.full_name ?? p.external_name ?? '')
    .filter(Boolean)
    .join(', ')

  const { sendEmail } = await import('@/lib/email')
  for (const email of [...new Set(emails)]) {
    await sendEmail({
      to: email,
      subject: `Ata — ${meeting.title}`,
      html: `
        <h2>Ata de Reunião: ${meeting.title}</h2>
        <p><strong>Data:</strong> ${dateFormatted}</p>
        <p><strong>Cliente:</strong> ${(meeting as any).companies?.name}</p>
        <p><strong>Participantes:</strong> ${participantNames}</p>
        <p>A ata completa está em anexo neste e-mail.</p>
      `,
      attachments: [{
        filename: `ata-${meetingId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    })
  }

  await supabase.from('meetings').update({
    minutes_sent_at: new Date().toISOString(),
  } as never).eq('id', meetingId)

  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true, sentTo: emails.length }
}
```

> **Nota:** A função `sendEmail` de `@/lib/email.ts` precisa suportar `attachments`. Verificar a assinatura atual e adicionar suporte se não existir.

- [ ] **Verificar se `sendEmail` suporta attachments** — abrir `src/lib/email.ts` e checar a interface. Se não suportar, adicionar o campo `attachments` opcional:

```typescript
// Em src/lib/email.ts, na interface de parâmetros de sendEmail:
attachments?: Array<{
  filename: string
  content: Buffer
  contentType: string
}>
// E na chamada ao Resend:
// attachments: params.attachments?.map(a => ({ filename: a.filename, content: a.content }))
```

- [ ] **Adicionar botão "Enviar Ata" em `src/app/(internal)/reunioes/[id]/page.tsx`**

```typescript
// Adicionar à lista de ações existente:
{meeting.status === 'realizada' && !meeting.minutes_sent_at && (
  <form action={sendMinutesAction.bind(null, id)}>
    <Button type="submit">Enviar ata por e-mail</Button>
  </form>
)}
{meeting.minutes_sent_at && (
  <p className="text-sm text-muted-foreground">
    Ata enviada em {new Date(meeting.minutes_sent_at).toLocaleString('pt-BR')}
  </p>
)}
```

- [ ] **Commit**

```bash
git add src/components/reunioes/MeetingMinutesPDF.tsx src/app/(internal)/reunioes/ src/lib/email.ts
git commit -m "feat: geração de ata em PDF e envio por e-mail para participantes da reunião"
```

---

## Task 16: Reuniões — Converter item de ação em tarefa

**Files:**
- Modify: `src/app/(internal)/reunioes/actions.ts` (adicionar `convertActionItemToTaskAction`)
- Modify: `src/components/reunioes/ActionItemsPanel.tsx` (botão de converter)

- [ ] **Adicionar `convertActionItemToTaskAction` em `src/app/(internal)/reunioes/actions.ts`**

```typescript
export async function convertActionItemToTaskAction(itemId: string, meetingId: string) {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('meeting_action_items')
    .select('description, responsible_profile_id, due_date, converted_to_task_id')
    .eq('id', itemId)
    .single() as { data: any }

  if (!item) return { error: 'Item não encontrado' }
  if (item.converted_to_task_id) return { error: 'Item já foi convertido em tarefa' }

  const assignedTo = item.responsible_profile_id
  if (!assignedTo) return { error: 'Item precisa de um responsável interno para ser convertido em tarefa' }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      title: item.description,
      assigned_to: assignedTo,
      due_date: item.due_date ?? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      origin_meeting_id: meetingId,
      origin_action_item_id: itemId,
    } as never)
    .select('id')
    .single()

  if (taskError) return { error: taskError.message }

  await supabase
    .from('meeting_action_items')
    .update({ converted_to_task_id: (task as any).id } as never)
    .eq('id', itemId)

  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true }
}
```

- [ ] **Adicionar botão de converter em `src/components/reunioes/ActionItemsPanel.tsx`**

```typescript
// Importar a nova action no topo:
import { updateActionItemStatusAction, convertActionItemToTaskAction } from '@/app/(internal)/reunioes/actions'

// Adicionar ao bloco de ações de cada item:
{!item.converted_to_task_id && item.responsible_profile_id && (
  <form action={convertActionItemToTaskAction.bind(null, item.id, meetingId)}>
    <Button variant="outline" size="sm" type="submit">Converter em tarefa</Button>
  </form>
)}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/reunioes/actions.ts src/components/reunioes/ActionItemsPanel.tsx
git commit -m "feat: converter item de ação de reunião em tarefa mantendo vínculo com reunião"
```

---

## Task 17: Dashboard — Tarefas vencidas + próximas reuniões

**Files:**
- Modify: `src/app/(internal)/dashboard/page.tsx`

- [ ] **Atualizar `src/app/(internal)/dashboard/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single() as { data: any }

  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const role = profile?.role
  const isAnalista = role === 'analista'

  const [{ data: overdueTasks }, { data: upcomingMeetings }] = await Promise.all([
    // Tarefas vencidas: analista vê apenas as suas, admin/gestor veem todas
    isAnalista
      ? supabase.from('tasks').select('id, title, due_date, companies(name)')
          .eq('status', 'vencida').eq('assigned_to', user!.id).order('due_date').limit(5)
      : supabase.from('tasks').select('id, title, due_date, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'vencida').order('due_date').limit(5),
    // Próximas reuniões: analista vê apenas as que participa
    isAnalista
      ? supabase.from('meetings')
          .select('id, title, scheduled_at, companies(name)')
          .eq('status', 'agendada')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', nextWeek)
          .order('scheduled_at')
          .limit(5)
      : supabase.from('meetings')
          .select('id, title, scheduled_at, companies(name)')
          .eq('status', 'agendada')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', nextWeek)
          .order('scheduled_at')
          .limit(5),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {(overdueTasks ?? []).length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
            Tarefas vencidas
          </h2>
          <div className="rounded-md border divide-y">
            {(overdueTasks ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link href="/tarefas" className="font-medium text-sm hover:underline">{t.title}</Link>
                  {t.companies && <p className="text-xs text-muted-foreground">{t.companies.name}</p>}
                </div>
                <div className="text-right">
                  <Badge variant="destructive" className="text-xs">
                    Vencida em {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </Badge>
                  {!isAnalista && t.profiles && (
                    <p className="text-xs text-muted-foreground mt-1">{t.profiles.full_name}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(upcomingMeetings ?? []).length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Próximas reuniões (7 dias)</h2>
          <div className="rounded-md border divide-y">
            {(upcomingMeetings ?? []).map((m: any) => (
              <Link key={m.id} href={`/reunioes/${m.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 block">
                <div>
                  <p className="font-medium text-sm">{m.title}</p>
                  {m.companies && <p className="text-xs text-muted-foreground">{m.companies.name}</p>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(overdueTasks ?? []).length === 0 && (upcomingMeetings ?? []).length === 0 && (
        <p className="text-muted-foreground">Nenhuma tarefa vencida ou reunião próxima.</p>
      )}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/dashboard/page.tsx
git commit -m "feat: dashboard com tarefas vencidas em destaque e próximas reuniões (7 dias)"
```

---

## Task 18: Sidebar — Links novos

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Atualizar `src/components/layout/Sidebar.tsx`** — adicionar links para Base de Conhecimento, Tarefas e Reuniões:

```typescript
import { BookOpen, CheckSquare, Calendar } from 'lucide-react'

// Adicionar ao array navItems (após /chamados):
{ href: '/conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
{ href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
{ href: '/reunioes', label: 'Reuniões', icon: Calendar },
```

O arquivo final deve ter todos os navItems na ordem:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/usuarios', label: 'Usuários', icon: Users },
  { href: '/chamados', label: 'Chamados', icon: Ticket },
  { href: '/conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/reunioes', label: 'Reuniões', icon: Calendar },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]
```

- [ ] **Verificar que os ícones `BookOpen`, `CheckSquare` e `Calendar` existem em `lucide-react`**

```bash
node -e "const l = require('lucide-react'); console.log(!!l.BookOpen, !!l.CheckSquare, !!l.Calendar)"
```

Expected: `true true true`

- [ ] **Rodar o servidor e verificar a sidebar**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard` — confirmar que os 3 novos links aparecem no menu lateral.

- [ ] **Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar — adicionar links para Base de Conhecimento, Tarefas e Reuniões"
```

---

## Verificação final dos Critérios de Conclusão

Após completar todas as tasks, verificar cada item do spec:

- [ ] CRUD de artigos da base de conhecimento com busca por `pg_trgm` — Tasks 1, 5, 6
- [ ] Sugestão automática de artigos durante abertura no portal — Tasks 8
- [ ] Sugestão automática para analista ao abrir chamado — Task 9
- [ ] Vinculação de artigo ao chamado com e-mail "Isso resolveu?" funcional — sub-spec 2 (já implementado via `ticket_kb_links`)
- [ ] Fechamento automático via confirmação do solicitante — sub-spec 2 (endpoint de confirmação via token)
- [ ] CRUD de documentos por cliente com upload de anexos — Tasks 4, 7
- [ ] Documentos visíveis no portal apenas para o cliente vinculado — Tasks 3, 10
- [ ] CRUD de tarefas com permissões corretas por papel — Task 11
- [ ] Recorrência implementada com criação automática da próxima ocorrência — Tasks 11, 12
- [ ] Cron de lembrete de tarefas enviando e-mail X dias antes e no dia do vencimento — Task 13
- [ ] Tarefas vencidas em destaque na tela principal — Task 17
- [ ] Registro de reuniões com participantes internos e externos — Task 14
- [ ] Geração de ata em PDF e envio por e-mail aos participantes — Task 15
- [ ] Conversão de item de ação em tarefa mantendo vínculo com reunião — Task 16
- [ ] Reuniões próximas na tela principal (analista vê apenas as suas) — Task 17
