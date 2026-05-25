-- tasks
create table if not exists public.tasks (
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

create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_company_id on public.tasks(company_id);

-- meetings
create table if not exists public.meetings (
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

create index if not exists idx_meetings_company_id on public.meetings(company_id);
create index if not exists idx_meetings_scheduled_at on public.meetings(scheduled_at);
create index if not exists idx_meetings_status_scheduled_at
  on public.meetings(scheduled_at) where status = 'agendada';

-- meeting_participants
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  external_email text,
  external_name text
);

create index if not exists idx_meeting_participants_meeting_id
  on public.meeting_participants(meeting_id);
create index if not exists idx_meeting_participants_profile_id
  on public.meeting_participants(profile_id);

-- meeting_action_items
create table if not exists public.meeting_action_items (
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

create index if not exists idx_action_items_meeting_id on public.meeting_action_items(meeting_id);

-- FKs circulares (tasks ↔ meetings) — adicionadas após criação de ambas as tabelas
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_origin_meeting_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_origin_meeting_id_fkey
        foreign key (origin_meeting_id) references public.meetings(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_origin_action_item_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_origin_action_item_id_fkey
        foreign key (origin_action_item_id) references public.meeting_action_items(id) on delete set null;
  end if;
end $$;
