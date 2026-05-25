-- Habilitar RLS
alter table public.monitoring_integrations enable row level security;
alter table public.monitored_urls enable row level security;
alter table public.url_check_history enable row level security;
alter table public.teams_webhook_configs enable row level security;
alter table public.pending_monitoring_alerts enable row level security;

-- monitoring_integrations: Admin e Gestor gerenciam
create policy "monitoring_integrations_select_admin_gestor"
  on public.monitoring_integrations for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_insert_admin_gestor"
  on public.monitoring_integrations for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_update_admin_gestor"
  on public.monitoring_integrations for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_delete_admin"
  on public.monitoring_integrations for delete
  using (public.get_user_role() = 'admin');

-- monitored_urls: Analista pode ver, Admin/Gestor gerenciam
create policy "monitored_urls_select_internal"
  on public.monitored_urls for select
  using (public.is_internal());

create policy "monitored_urls_insert_admin_gestor"
  on public.monitored_urls for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "monitored_urls_update_admin_gestor"
  on public.monitored_urls for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitored_urls_delete_admin_gestor"
  on public.monitored_urls for delete
  using (public.get_user_role() in ('admin', 'gestor'));

-- url_check_history: interno pode ver, apenas service role insere
create policy "url_check_history_select_internal"
  on public.url_check_history for select
  using (public.is_internal());

-- teams_webhook_configs: Admin e Gestor
create policy "teams_webhook_configs_select_admin_gestor"
  on public.teams_webhook_configs for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_insert_admin_gestor"
  on public.teams_webhook_configs for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_update_admin_gestor"
  on public.teams_webhook_configs for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_delete_admin"
  on public.teams_webhook_configs for delete
  using (public.get_user_role() = 'admin');

-- pending_monitoring_alerts: apenas service role (sem policies de usuário)
-- (acessada apenas pelo service client em webhooks e cron)
