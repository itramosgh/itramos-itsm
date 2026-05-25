-- Habilitar RLS nas novas tabelas
alter table public.kb_documents enable row level security;
alter table public.kb_document_attachments enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_action_items enable row level security;

-- Recriar políticas de kb_articles para incluir clientes (sugestão no portal)
drop policy if exists "kb_articles_select_internal" on public.kb_articles;
drop policy if exists "kb_articles_manage_service" on public.kb_articles;

create policy "kb_articles_select_internal"
  on public.kb_articles for select
  using (public.is_internal());

create policy "kb_articles_select_client_active"
  on public.kb_articles for select
  using (
    public.get_user_role() = 'cliente'
    and is_active = true
  );

create policy "kb_articles_insert_admin_gestor"
  on public.kb_articles for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "kb_articles_update_admin_gestor"
  on public.kb_articles for update
  using (public.get_user_role() in ('admin', 'gestor'));

-- kb_documents
create policy "kb_documents_select_internal"
  on public.kb_documents for select
  using (public.is_internal());

create policy "kb_documents_select_client"
  on public.kb_documents for select
  using (
    public.get_user_role() = 'cliente'
    and is_active = true
    and company_id in (
      select company_id from public.contacts
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "kb_documents_manage_admin_gestor"
  on public.kb_documents for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- kb_document_attachments
create policy "kb_doc_attachments_select_internal"
  on public.kb_document_attachments for select
  using (public.is_internal());

create policy "kb_doc_attachments_select_client"
  on public.kb_document_attachments for select
  using (
    exists (
      select 1 from public.kb_documents d
      where d.id = document_id
        and d.is_active = true
        and d.company_id in (
          select company_id from public.contacts
          where user_id = auth.uid() and is_active = true
        )
    )
  );

create policy "kb_doc_attachments_manage_admin_gestor"
  on public.kb_document_attachments for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- tasks
create policy "tasks_select_admin_gestor"
  on public.tasks for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_select_analista_own"
  on public.tasks for select
  using (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

create policy "tasks_insert_admin_gestor"
  on public.tasks for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_insert_analista_own"
  on public.tasks for insert
  with check (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

create policy "tasks_update_admin_gestor"
  on public.tasks for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "tasks_update_analista_own"
  on public.tasks for update
  using (
    public.get_user_role() = 'analista'
    and assigned_to = auth.uid()
  );

-- meetings
create policy "meetings_select_admin_gestor"
  on public.meetings for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "meetings_select_analista_participant"
  on public.meetings for select
  using (
    public.get_user_role() = 'analista'
    and id in (
      select meeting_id from public.meeting_participants
      where profile_id = auth.uid()
    )
  );

create policy "meetings_insert_internal"
  on public.meetings for insert
  with check (public.is_internal());

create policy "meetings_update_admin_gestor"
  on public.meetings for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "meetings_update_analista_participant"
  on public.meetings for update
  using (
    public.get_user_role() = 'analista'
    and id in (
      select meeting_id from public.meeting_participants
      where profile_id = auth.uid()
    )
  );

create policy "meetings_delete_admin_gestor"
  on public.meetings for delete
  using (public.get_user_role() in ('admin', 'gestor'));

-- meeting_participants
create policy "meeting_participants_all_internal"
  on public.meeting_participants for all
  using (public.is_internal())
  with check (public.is_internal());

-- meeting_action_items
create policy "action_items_all_internal"
  on public.meeting_action_items for all
  using (public.is_internal())
  with check (public.is_internal());
