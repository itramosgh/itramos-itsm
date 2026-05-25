-- monitoring_integrations: configurações de Zabbix e Azure Monitor por cliente
create table public.monitoring_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connector_type text not null check (connector_type in ('zabbix', 'azure_monitor')),
  webhook_token uuid not null default gen_random_uuid() unique,
  window_type text not null default 'horario_comercial'
    check (window_type in ('24x7', 'horario_comercial', 'personalizado')),
  window_custom_days integer[],
  window_custom_start time,
  window_custom_end time,
  out_of_window_behavior text not null default 'descartar'
    check (out_of_window_behavior in ('descartar', 'aguardar_e_abrir')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_custom_window check (
    window_type != 'personalizado' or (
      window_custom_days is not null and
      window_custom_start is not null and
      window_custom_end is not null
    )
  )
);

-- monitored_urls: URLs monitoradas por cliente
create table public.monitored_urls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  name text not null,
  check_interval_minutes integer not null default 10
    check (check_interval_minutes in (5, 10, 15, 30)),
  last_checked_at timestamptz,
  last_status text check (last_status in ('up', 'down')),
  current_ticket_id uuid references public.tickets(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- url_check_history: histórico de verificações para o painel de status
create table public.url_check_history (
  id uuid primary key default gen_random_uuid(),
  monitored_url_id uuid not null references public.monitored_urls(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('up', 'down')),
  http_status_code integer,
  response_time_ms integer,
  error_message text
);

-- teams_webhook_configs: configurações de canais do Microsoft Teams
create table public.teams_webhook_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  webhook_url text not null,
  is_active boolean not null default true,
  notify_new_tickets boolean not null default true,
  notify_sla_warning boolean not null default true,
  notify_sla_breach boolean not null default true,
  notify_url_down boolean not null default true,
  notify_url_up boolean not null default false,
  notify_monitoring_alert boolean not null default true,
  notify_ticket_reopened boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- pending_monitoring_alerts: alertas recebidos fora da janela com aguardar_e_abrir
create table public.pending_monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  monitoring_integration_id uuid not null references public.monitoring_integrations(id) on delete cascade,
  external_alert_id text,
  alert_title text not null,
  alert_description text,
  priority text not null check (priority in ('critica', 'alta', 'media', 'baixa')),
  raw_payload jsonb,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Triggers updated_at
create trigger trg_monitoring_integrations_updated_at
  before update on public.monitoring_integrations
  for each row execute function public.set_updated_at();

create trigger trg_monitored_urls_updated_at
  before update on public.monitored_urls
  for each row execute function public.set_updated_at();

create trigger trg_teams_webhook_configs_updated_at
  before update on public.teams_webhook_configs
  for each row execute function public.set_updated_at();

-- Indexes
create index idx_monitoring_integrations_company_id
  on public.monitoring_integrations(company_id);
create index idx_monitoring_integrations_token
  on public.monitoring_integrations(webhook_token);
create index idx_monitored_urls_company_id
  on public.monitored_urls(company_id);
create index idx_monitored_urls_active
  on public.monitored_urls(is_active) where is_active = true;
create index idx_url_check_history_url_id_checked
  on public.url_check_history(monitored_url_id, checked_at desc);
create index idx_pending_alerts_integration_id
  on public.pending_monitoring_alerts(monitoring_integration_id);
create index idx_pending_alerts_event_at
  on public.pending_monitoring_alerts(event_at);
