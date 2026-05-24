-- holiday_notice_sent: service role bypassa RLS automaticamente; sem policy necessária
alter table public.holiday_notice_sent enable row level security;

-- Block all direct user access to holiday_notice_sent (only service role writes it)
create policy "holiday_notice_sent_no_user_access"
  on public.holiday_notice_sent for all
  using (false)
  with check (false);

-- RLS para announcements
alter table public.announcements enable row level security;

create policy "announcements_select_internal"
  on public.announcements for select
  using (public.is_internal());

create policy "announcements_insert_admin_gestor"
  on public.announcements for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "announcements_update_admin_gestor"
  on public.announcements for update
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status in ('rascunho', 'agendado')
  );

create policy "announcements_delete_admin_gestor"
  on public.announcements for delete
  using (
    public.get_user_role() in ('admin', 'gestor')
    and status in ('rascunho', 'agendado')
  );

-- RLS para announcement_recipients e announcement_attachments
alter table public.announcement_recipients enable row level security;
alter table public.announcement_attachments enable row level security;

create policy "announcement_recipients_manage_admin_gestor"
  on public.announcement_recipients for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "announcement_attachments_manage_admin_gestor"
  on public.announcement_attachments for all
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));

-- Bucket privado para anexos de comunicados
insert into storage.buckets (id, name, public)
values ('announcements', 'announcements', false)
on conflict (id) do nothing;

create policy "announcements_storage_insert_admin_gestor"
  on storage.objects for insert
  with check (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "announcements_storage_select_admin_gestor"
  on storage.objects for select
  using (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "announcements_storage_delete_admin_gestor"
  on storage.objects for delete
  using (
    bucket_id = 'announcements'
    and public.get_user_role() in ('admin', 'gestor')
  );

-- Missing index on announcement_attachments(announcement_id) (omitted in Task 1 migration)
create index if not exists idx_announcement_attachments_announcement_id
  on public.announcement_attachments(announcement_id);
