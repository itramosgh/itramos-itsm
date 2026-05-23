-- Habilitar pg_trgm para busca por texto
create extension if not exists pg_trgm;

-- ticket_categories
create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  requires_approval boolean not null default false,
  is_active boolean not null default true
);

-- holidays: feriados para pausar SLA
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  is_national boolean not null default true,
  municipality text,
  created_at timestamptz not null default now()
);

-- Unique funcional: (date, coalesce(municipality,'')) — não suportado como inline constraint
create unique index uq_holidays_date_municipality
  on public.holidays (date, coalesce(municipality, ''));

-- kb_articles: stub — expandido no sub-spec de Base de Conhecimento
create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  slug text unique,
  body text not null default '',
  category_id uuid references public.ticket_categories(id) on delete set null,
  source_ticket_id uuid,  -- FK adicionada após criar tickets (ver abaixo)
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique generated always as identity,
  title text not null,
  description text,
  category_id uuid references public.ticket_categories(id) on delete set null,
  priority text not null check (priority in ('critica', 'alta', 'media', 'baixa')),
  status text not null default 'aberto'
    check (status in ('aberto','agendado','em_andamento','aguardando_cliente',
                      'aguardando_fornecedor','aguardando_aprovacao','em_mudanca',
                      'resolvido','fechado','reaberto')),
  channel text not null
    check (channel in ('portal','email','zabbix','azure_monitor','url_monitoring')),
  company_id uuid not null references public.companies(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  external_alert_id text,
  sla_deadline timestamptz,
  sla_first_response_at timestamptz,
  sla_met boolean,
  sla_breach_minutes integer,
  sla_paused_at timestamptz,
  sla_paused_minutes integer not null default 0,
  billing_status text check (billing_status in ('pendente', 'cobrado')),
  resolution text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adicionar FK circular após criar tickets
alter table public.kb_articles
  add constraint kb_articles_source_ticket_id_fkey
  foreign key (source_ticket_id) references public.tickets(id) on delete set null;

-- ticket_interactions
create table public.ticket_interactions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  type text not null
    check (type in ('mensagem', 'status_change', 'assignment', 'system')),
  content text,
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_contact_id uuid references public.contacts(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ticket_attachments
create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  interaction_id uuid references public.ticket_interactions(id) on delete set null,
  filename text not null,
  storage_path text not null,
  size_bytes integer,
  mime_type text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ticket_reopens
create table public.ticket_reopens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  reopened_by_profile_id uuid references public.profiles(id) on delete set null,
  reopened_by_contact_id uuid references public.contacts(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- ticket_approvals
create table public.ticket_approvals (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  approver_contact_id uuid references public.contacts(id) on delete set null,
  approver_email text not null,
  token uuid not null unique default gen_random_uuid(),
  previous_status text not null default 'em_andamento',
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','reprovado','expirado','automatico')),
  response_reason text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- response_templates
create table public.response_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  body text not null,
  variables jsonb not null default '[]',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ticket_kb_links
create table public.ticket_kb_links (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kb_article_id uuid not null references public.kb_articles(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  confirmation_token uuid not null unique default gen_random_uuid(),
  resolution_confirmed boolean,
  created_at timestamptz not null default now()
);

-- pending_email_tickets: estado temporário para e-mails de remetentes desconhecidos
create table public.pending_email_tickets (
  id uuid primary key default gen_random_uuid(),
  from_email text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  original_subject text not null,
  original_body text not null,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Triggers updated_at
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger trg_response_templates_updated_at
  before update on public.response_templates
  for each row execute function public.set_updated_at();

create trigger trg_kb_articles_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

-- Indexes
create index idx_tickets_company_id on public.tickets(company_id);
create index idx_tickets_contact_id on public.tickets(contact_id);
create index idx_tickets_status on public.tickets(status);
create index idx_tickets_assigned_to on public.tickets(assigned_to);
create index idx_tickets_sla_deadline on public.tickets(sla_deadline) where sla_first_response_at is null;
create index idx_tickets_scheduled_at on public.tickets(scheduled_at) where scheduled_at is not null;
create index idx_ticket_interactions_ticket_id on public.ticket_interactions(ticket_id);
create index idx_ticket_attachments_ticket_id on public.ticket_attachments(ticket_id);
create index idx_ticket_approvals_token on public.ticket_approvals(token);
create index idx_ticket_approvals_ticket_id on public.ticket_approvals(ticket_id);
create index idx_ticket_kb_links_token on public.ticket_kb_links(confirmation_token);
create index idx_holidays_date on public.holidays(date);
create index idx_pending_email_from on public.pending_email_tickets(from_email);

-- Índices GIN para busca full-text em tickets
create index idx_tickets_title_trgm on public.tickets using gin (title gin_trgm_ops);
create index idx_tickets_description_trgm on public.tickets using gin (description gin_trgm_ops);

insert into public.ticket_categories (name, slug) values
  ('Suporte Técnico',           'suporte_tecnico'),
  ('Incidente',                 'incidente'),
  ('Solicitação de Serviço',    'solicitacao_servico'),
  ('Mudança de Infraestrutura', 'mudanca_infraestrutura'),
  ('Criação de Site Institucional', 'criacao_site'),
  ('Landing Page',              'landing_page'),
  ('Agente de IA',              'agente_ia');
