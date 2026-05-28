-- Coluna gerada para ordenar chamados: ativos (0) antes de fechados/resolvidos (1).
-- Permite ordenar por status_sort_order ASC, created_at DESC com suporte correto à paginação.

alter table public.tickets
  add column if not exists status_sort_order int generated always as (
    case when status in ('fechado', 'resolvido') then 1 else 0 end
  ) stored;

create index if not exists idx_tickets_status_sort
  on public.tickets (status_sort_order asc, created_at desc);
