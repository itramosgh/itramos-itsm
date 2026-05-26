-- 1. Remover colunas do stub e renomear source_ticket_id
alter table public.kb_articles
  drop constraint if exists kb_articles_source_ticket_id_fkey;

alter table public.kb_articles
  drop column if exists body,
  drop column if exists summary,
  drop column if exists slug;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kb_articles'
      AND column_name = 'source_ticket_id'
  ) THEN
    ALTER TABLE public.kb_articles RENAME COLUMN source_ticket_id TO origin_ticket_id;
  END IF;
END $$;

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
language sql stable security definer
set search_path = public, extensions
as $$
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
create table if not exists public.kb_documents (
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

create index if not exists idx_kb_documents_company_id on public.kb_documents(company_id);

-- 5. kb_document_attachments: anexos de documentos
create table if not exists public.kb_document_attachments (
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
