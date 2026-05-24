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
