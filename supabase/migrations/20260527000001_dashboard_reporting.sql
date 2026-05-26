-- pg_trgm já habilitado em 20260522000004_tickets_schema.sql

-- Índice GIN para detecção de chamados recorrentes por título
create index if not exists idx_tickets_title_trgm
  on public.tickets using gin (title gin_trgm_ops);

-- Índice para queries de dashboard por período
create index if not exists idx_tickets_created_at_dashboard
  on public.tickets (created_at, company_id, assigned_to, status);

-- Índice para relatório mensal (tickets fechados por cliente)
create index if not exists idx_tickets_closed_at
  on public.tickets (closed_at, company_id)
  where closed_at is not null;

-- Coluna para flag de recorrência detectada
alter table public.tickets
  add column if not exists recurrence_detected boolean not null default false;

-- Função para buscar chamados similares via similaridade de título
create or replace function public.find_similar_tickets(
  p_title      text,
  p_company_id uuid,
  p_exclude_id uuid,
  p_since      timestamptz,
  p_threshold  float8 default 0.3
)
returns table (id uuid, number integer, title text, created_at timestamptz)
language sql stable security definer
set search_path = public, extensions
as $$
  select t.id, t.number, t.title, t.created_at
  from public.tickets t
  where t.company_id  = p_company_id
    and t.id         != p_exclude_id
    and t.created_at >= p_since
    and similarity(t.title, p_title) >= p_threshold
  order by similarity(t.title, p_title) desc
  limit 20;
$$;
