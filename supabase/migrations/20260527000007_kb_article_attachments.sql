-- supabase/migrations/20260527000007_kb_article_attachments.sql

create table if not exists public.kb_article_attachments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.kb_article_attachments enable row level security;

-- Usuários internos autenticados podem ver/inserir/deletar
create policy "internal users can manage kb article attachments"
  on public.kb_article_attachments
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Storage bucket para anexos de artigos da KB
insert into storage.buckets (id, name, public)
values ('kb-article-attachments', 'kb-article-attachments', false)
on conflict (id) do nothing;

-- Usuários internos podem fazer upload
create policy "internal users upload kb article attachments"
  on storage.objects
  for insert
  with check (
    bucket_id = 'kb-article-attachments' and
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Usuários internos podem ler
create policy "internal users read kb article attachments"
  on storage.objects
  for select
  using (
    bucket_id = 'kb-article-attachments' and
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );
