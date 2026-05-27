-- supabase/migrations/20260527000005_other_modules_attachments.sql

-- =============================================
-- GMUD ATTACHMENTS
-- =============================================
create table if not exists public.change_request_attachments (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_cr_attachments_cr_id on public.change_request_attachments(change_request_id);
alter table public.change_request_attachments enable row level security;

create policy "cr-attachments: internos gerenciam"
  on public.change_request_attachments for all
  using (public.is_internal())
  with check (public.is_internal());

create policy "cr-attachments: service_role tudo"
  on public.change_request_attachments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =============================================
-- MEETING ATTACHMENTS
-- =============================================
create table if not exists public.meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_attachments_meeting_id on public.meeting_attachments(meeting_id);
alter table public.meeting_attachments enable row level security;

create policy "meeting-attachments: internos gerenciam"
  on public.meeting_attachments for all
  using (public.is_internal())
  with check (public.is_internal());

create policy "meeting-attachments: service_role tudo"
  on public.meeting_attachments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =============================================
-- TASK ATTACHMENTS
-- =============================================
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_attachments_task_id on public.task_attachments(task_id);
alter table public.task_attachments enable row level security;

create policy "task-attachments: internos gerenciam"
  on public.task_attachments for all
  using (public.is_internal())
  with check (public.is_internal());

create policy "task-attachments: service_role tudo"
  on public.task_attachments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =============================================
-- STORAGE BUCKETS
-- =============================================
insert into storage.buckets (id, name, public)
values
  ('gmud-attachments', 'gmud-attachments', false),
  ('meeting-attachments', 'meeting-attachments', false),
  ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- GMUD bucket policies
create policy "gmud-attachments: service_role upload"
  on storage.objects for insert
  with check (bucket_id = 'gmud-attachments' and auth.role() = 'service_role');

create policy "gmud-attachments: internos leem"
  on storage.objects for select
  using (bucket_id = 'gmud-attachments' and public.is_internal());

create policy "gmud-attachments: service_role atualiza"
  on storage.objects for update
  using (bucket_id = 'gmud-attachments' and auth.role() = 'service_role');

-- Meeting bucket policies
create policy "meeting-attachments: service_role upload"
  on storage.objects for insert
  with check (bucket_id = 'meeting-attachments' and auth.role() = 'service_role');

create policy "meeting-attachments: internos leem"
  on storage.objects for select
  using (bucket_id = 'meeting-attachments' and public.is_internal());

create policy "meeting-attachments: service_role atualiza"
  on storage.objects for update
  using (bucket_id = 'meeting-attachments' and auth.role() = 'service_role');

-- Task bucket policies
create policy "task-attachments: service_role upload"
  on storage.objects for insert
  with check (bucket_id = 'task-attachments' and auth.role() = 'service_role');

create policy "task-attachments: internos leem"
  on storage.objects for select
  using (bucket_id = 'task-attachments' and public.is_internal());

create policy "task-attachments: service_role atualiza"
  on storage.objects for update
  using (bucket_id = 'task-attachments' and auth.role() = 'service_role');
