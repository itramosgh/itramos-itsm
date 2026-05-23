-- Habilitar RLS nas novas tabelas
alter table public.ticket_categories enable row level security;
alter table public.holidays enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_interactions enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_reopens enable row level security;
alter table public.ticket_approvals enable row level security;
alter table public.response_templates enable row level security;
alter table public.ticket_kb_links enable row level security;
alter table public.kb_articles enable row level security;
alter table public.pending_email_tickets enable row level security;

-- Função auxiliar: retorna company_id do contato autenticado (cliente)
create or replace function public.get_contact_company_id()
returns uuid language sql stable security definer as $$
  select company_id from public.contacts
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

-- ticket_categories: todos internos leem; admin e gestor gerenciam
create policy "categories_select_internal"
  on public.ticket_categories for select
  using (public.is_internal());

create policy "categories_select_portal"
  on public.ticket_categories for select
  using (public.get_user_role() = 'cliente');

create policy "categories_manage_admin"
  on public.ticket_categories for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- holidays: internos leem; admin e gestor gerenciam
create policy "holidays_select_internal"
  on public.holidays for select
  using (public.is_internal());

create policy "holidays_manage_admin_gestor"
  on public.holidays for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- tickets: internos veem todos; cliente vê apenas da própria empresa
create policy "tickets_select_internal"
  on public.tickets for select
  using (public.is_internal());

create policy "tickets_select_client"
  on public.tickets for select
  using (
    public.get_user_role() = 'cliente'
    and company_id = public.get_contact_company_id()
  );

create policy "tickets_insert_internal"
  on public.tickets for insert
  with check (public.is_internal());

create policy "tickets_insert_service"
  on public.tickets for insert
  with check (auth.role() = 'service_role');

create policy "tickets_update_admin_gestor"
  on public.tickets for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tickets_update_analista_assigned"
  on public.tickets for update
  using (
    public.get_user_role() = 'analista'
    and (assigned_to = auth.uid() or assigned_to is null)
  );

-- ticket_interactions: visibilidade vinculada ao chamado pai
create policy "interactions_select_internal"
  on public.ticket_interactions for select
  using (
    public.is_internal()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

create policy "interactions_select_client"
  on public.ticket_interactions for select
  using (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "interactions_insert_internal"
  on public.ticket_interactions for insert
  with check (public.is_internal());

create policy "interactions_insert_client"
  on public.ticket_interactions for insert
  with check (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "interactions_insert_service"
  on public.ticket_interactions for insert
  with check (auth.role() = 'service_role');

-- ticket_attachments
create policy "attachments_select_internal"
  on public.ticket_attachments for select
  using (
    public.is_internal()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

create policy "attachments_select_client"
  on public.ticket_attachments for select
  using (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

create policy "attachments_insert_internal"
  on public.ticket_attachments for insert
  with check (public.is_internal());

create policy "attachments_insert_service"
  on public.ticket_attachments for insert
  with check (auth.role() = 'service_role');

create policy "attachments_update_service"
  on public.ticket_attachments for update
  using (auth.role() = 'service_role');

-- ticket_reopens
create policy "reopens_select_internal"
  on public.ticket_reopens for select
  using (public.is_internal());

create policy "reopens_insert_internal"
  on public.ticket_reopens for insert
  with check (public.is_internal());

create policy "reopens_insert_client"
  on public.ticket_reopens for insert
  with check (
    public.get_user_role() = 'cliente'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
      and t.company_id = public.get_contact_company_id()
    )
  );

-- ticket_approvals
create policy "approvals_select_admin_gestor"
  on public.ticket_approvals for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "approvals_select_analista_own"
  on public.ticket_approvals for select
  using (
    public.get_user_role() = 'analista'
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.assigned_to = auth.uid()
    )
  );

create policy "approvals_write_service"
  on public.ticket_approvals for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- response_templates
create policy "templates_select_internal"
  on public.response_templates for select
  using (public.is_internal() and is_active = true);

create policy "templates_manage_admin_gestor"
  on public.response_templates for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- ticket_kb_links
create policy "kb_links_select_internal"
  on public.ticket_kb_links for select
  using (public.is_internal());

create policy "kb_links_insert_internal"
  on public.ticket_kb_links for insert
  with check (public.is_internal());

create policy "kb_links_update_service"
  on public.ticket_kb_links for update
  using (auth.role() = 'service_role');

-- kb_articles
create policy "kb_articles_select_internal"
  on public.kb_articles for select
  using (public.is_internal() and is_active = true);

create policy "kb_articles_manage_service"
  on public.kb_articles for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- pending_email_tickets: apenas service_role
create policy "pending_email_service"
  on public.pending_email_tickets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
