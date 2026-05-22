-- profiles: usuários internos (admin, gestor, analista)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'gestor', 'analista')),
  notify_new_tickets boolean not null default false,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- platform_settings: singleton (sempre id = 1)
create table public.platform_settings (
  id integer primary key default 1 check (id = 1),
  company_name text,
  company_website text,
  company_address text,
  company_phone text,
  company_whatsapp text,
  logo_light_url text,
  logo_dark_url text,
  email_from_address text,
  email_from_name text,
  holiday_notice_days integer not null default 7,
  recurrence_min_tickets integer not null default 3,
  recurrence_window_days integer not null default 30,
  business_hours_start time not null default '09:00',
  business_hours_end time not null default '18:00',
  business_hours_days integer[] not null default '{1,2,3,4,5}',
  hourly_rate numeric(10,2),
  km_rate numeric(10,2),
  billing_alert_days integer not null default 7,
  updated_at timestamptz,
  updated_by uuid references public.profiles(id)
);

-- system_logs
create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'email_sent','email_received','webhook_received',
    'url_monitoring','cron_job','approval','auth'
  )),
  status text not null check (status in ('success','failure')),
  description text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  segment text,
  address text,
  logo_url text,
  is_blocked boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- company_email_domains
create table public.company_email_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),
  unique (company_id, domain)
);

-- contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  is_whatsapp boolean not null default false,
  department text,
  is_contract_responsible boolean not null default false,
  receives_ticket_cc boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- contracts
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  start_date date not null,
  end_date date,
  renewal_date date,
  services text[] not null default '{}',
  status text not null default 'ativo'
    check (status in ('ativo','expirado','renovacao_pendente')),
  is_24x7 boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- device_types
create table public.device_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- contract_devices
create table public.contract_devices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  device_type_id uuid not null references public.device_types(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unique (contract_id, device_type_id)
);

-- contract_sla_rules
create table public.contract_sla_rules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  priority text not null check (priority in ('critica','alta','media','baixa')),
  response_hours numeric(5,2) not null check (response_hours > 0),
  unique (contract_id, priority)
);

-- Trigger: atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger trg_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- Indexes
create index idx_company_email_domains_domain on public.company_email_domains(domain);
create index idx_contacts_company_id on public.contacts(company_id);
create index idx_contacts_user_id on public.contacts(user_id);
create index idx_contracts_company_id on public.contracts(company_id);
create index idx_system_logs_created_at on public.system_logs(created_at desc);
create index idx_system_logs_category_status on public.system_logs(category, status);
