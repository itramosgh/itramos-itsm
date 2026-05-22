-- Helper functions
create or replace function public.get_user_role()
returns text language sql stable security definer as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'cliente'
  );
$$;

create or replace function public.is_internal()
returns boolean language sql stable security definer as $$
  select public.get_user_role() in ('admin', 'gestor', 'analista');
$$;

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.system_logs enable row level security;
alter table public.companies enable row level security;
alter table public.company_email_domains enable row level security;
alter table public.contacts enable row level security;
alter table public.contracts enable row level security;
alter table public.device_types enable row level security;
alter table public.contract_devices enable row level security;
alter table public.contract_sla_rules enable row level security;

-- profiles
create policy "profiles_select_internal"
  on public.profiles for select
  using (public.is_internal());

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_admin_gestor"
  on public.profiles for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- platform_settings
create policy "settings_select_internal"
  on public.platform_settings for select
  using (public.is_internal());

create policy "settings_write_admin_gestor"
  on public.platform_settings for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- system_logs
create policy "logs_select_admin_gestor"
  on public.system_logs for select
  using (public.get_user_role() in ('admin', 'gestor'));

-- companies
create policy "companies_select_internal"
  on public.companies for select
  using (public.is_internal());

create policy "companies_select_client"
  on public.companies for select
  using (
    public.get_user_role() = 'cliente'
    and id in (
      select company_id from public.contacts
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "companies_insert_admin"
  on public.companies for insert
  with check (public.get_user_role() = 'admin');

create policy "companies_update_admin_gestor"
  on public.companies for update
  using (public.get_user_role() in ('admin', 'gestor'));

-- company_email_domains
create policy "domains_select_internal"
  on public.company_email_domains for select
  using (public.is_internal());

create policy "domains_manage_admin"
  on public.company_email_domains for all
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- contacts
create policy "contacts_select_internal"
  on public.contacts for select
  using (public.is_internal());

create policy "contacts_select_own"
  on public.contacts for select
  using (public.get_user_role() = 'cliente' and user_id = auth.uid());

create policy "contacts_insert_admin_gestor"
  on public.contacts for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "contacts_update_admin_gestor"
  on public.contacts for update
  using (public.get_user_role() in ('admin', 'gestor'));

-- contracts
create policy "contracts_all_admin_gestor"
  on public.contracts for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- device_types
create policy "device_types_select_internal"
  on public.device_types for select
  using (public.is_internal());

create policy "device_types_manage_admin"
  on public.device_types for all
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- contract_devices
create policy "contract_devices_admin_gestor"
  on public.contract_devices for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- contract_sla_rules
create policy "contract_sla_rules_admin_gestor"
  on public.contract_sla_rules for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));
