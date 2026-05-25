-- change_requests
alter table public.change_requests enable row level security;

create policy "cr_select_admin_gestor"
  on public.change_requests for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "cr_select_analista_own"
  on public.change_requests for select
  using (
    public.get_user_role() = 'analista'
    and responsible_id = auth.uid()
  );

create policy "cr_insert_internal"
  on public.change_requests for insert
  with check (public.is_internal());

create policy "cr_update_admin_gestor"
  on public.change_requests for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "cr_update_analista_own_rascunho"
  on public.change_requests for update
  using (
    public.get_user_role() = 'analista'
    and responsible_id = auth.uid()
    and status = 'rascunho'
  );

create policy "cr_delete_admin_gestor_rascunho"
  on public.change_requests for delete
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status = 'rascunho'
  );

-- change_request_contacts
alter table public.change_request_contacts enable row level security;

create policy "crc_select_internal"
  on public.change_request_contacts for select
  using (public.is_internal());

create policy "crc_manage_internal"
  on public.change_request_contacts for all
  using (public.is_internal())
  with check (public.is_internal());

-- change_approvals
alter table public.change_approvals enable row level security;

create policy "ca_select_internal"
  on public.change_approvals for select
  using (public.is_internal());

create policy "ca_insert_internal"
  on public.change_approvals for insert
  with check (public.is_internal());

create policy "ca_update_internal"
  on public.change_approvals for update
  using (public.is_internal());

-- ticket_costs
alter table public.ticket_costs enable row level security;

create policy "tc_select_admin_gestor"
  on public.ticket_costs for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tc_select_analista_assigned"
  on public.ticket_costs for select
  using (
    public.get_user_role() = 'analista'
    and ticket_id in (
      select id from public.tickets
      where assigned_to = auth.uid()
    )
  );

create policy "tc_insert_internal"
  on public.ticket_costs for insert
  with check (public.is_internal());

create policy "tc_update_internal"
  on public.ticket_costs for update
  using (public.is_internal());
