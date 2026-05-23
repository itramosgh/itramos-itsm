-- Adicionar índice trigram no nome do contato para busca
create index if not exists idx_contacts_full_name_trgm
  on public.contacts using gin (full_name gin_trgm_ops);
