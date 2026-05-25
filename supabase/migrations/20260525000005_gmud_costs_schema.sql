-- Adicionar company_type em companies (avulso = sem contrato fixo)
alter table public.companies
  add column if not exists company_type text not null default 'padrao'
    check (company_type in ('padrao', 'avulso'));

-- Adicionar em_deslocamento ao status de tickets
alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
  check (status in (
    'aberto','agendado','em_andamento','aguardando_cliente',
    'aguardando_fornecedor','aguardando_aprovacao','em_mudanca',
    'em_deslocamento','resolvido','fechado','reaberto'
  ));

-- change_requests (GMUDs)
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  impacted_systems text not null,
  impacted_users text not null,
  maintenance_start timestamptz not null,
  maintenance_end timestamptz not null,
  rollback_plan text not null,
  risk_level text not null check (risk_level in ('baixo', 'medio', 'alto')),
  responsible_id uuid not null references public.profiles(id) on delete restrict,
  origin_ticket_id uuid references public.tickets(id) on delete set null,
  status text not null default 'rascunho'
    check (status in (
      'rascunho','aguardando_aprovacao','aprovada',
      'em_execucao','concluida','revertida','reprovada'
    )),
  execution_started_at timestamptz,
  execution_completed_at timestamptz,
  reversal_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_change_requests_updated_at
  before update on public.change_requests
  for each row execute function public.set_updated_at();

create index idx_change_requests_responsible_id on public.change_requests(responsible_id);
create index idx_change_requests_status on public.change_requests(status);
create index idx_change_requests_maintenance_start on public.change_requests(maintenance_start);
create index idx_change_requests_origin_ticket_id on public.change_requests(origin_ticket_id)
  where origin_ticket_id is not null;

-- change_request_contacts (contatos a comunicar no início e fim da GMUD)
create table public.change_request_contacts (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  external_email text,
  external_name text,
  constraint chk_contact_or_external check (
    contact_id is not null or (external_email is not null and external_name is not null)
  )
);

create index idx_change_request_contacts_cr_id on public.change_request_contacts(change_request_id);

-- change_approvals (análogo a ticket_approvals)
create table public.change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  approver_contact_id uuid references public.contacts(id) on delete set null,
  approver_email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','reprovado','expirado')),
  response_reason text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_change_approvals_token on public.change_approvals(token);
create index idx_change_approvals_cr_id on public.change_approvals(change_request_id);

-- ticket_costs (1:1 com ticket — um registro de custo por chamado)
create table public.ticket_costs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  departure_at timestamptz,
  arrival_at timestamptz,
  completion_at timestamptz,
  travel_time_minutes integer,
  service_time_minutes integer,
  travel_discount_minutes integer not null default 0,
  km_traveled numeric(8,2),
  toll_amount numeric(10,2) not null default 0,
  parking_amount numeric(10,2) not null default 0,
  hourly_rate_applied numeric(10,2),
  km_rate_applied numeric(10,2),
  total_amount numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_ticket_costs_updated_at
  before update on public.ticket_costs
  for each row execute function public.set_updated_at();

create index idx_ticket_costs_ticket_id on public.ticket_costs(ticket_id);
