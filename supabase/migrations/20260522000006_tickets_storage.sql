insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy "ticket-attachments: internos fazem upload"
  on storage.objects for insert
  with check (
    bucket_id = 'ticket-attachments'
    and public.is_internal()
  );

create policy "ticket-attachments: service_role faz upload"
  on storage.objects for insert
  with check (
    bucket_id = 'ticket-attachments'
    and auth.role() = 'service_role'
  );

create policy "ticket-attachments: internos leem"
  on storage.objects for select
  using (
    bucket_id = 'ticket-attachments'
    and public.is_internal()
  );

create policy "ticket-attachments: cliente lê próprios"
  on storage.objects for select
  using (
    bucket_id = 'ticket-attachments'
    and public.get_user_role() = 'cliente'
    and (storage.foldername(name))[1] in (
      select t.id::text from public.tickets t
      where t.company_id = public.get_contact_company_id()
    )
  );

create policy "ticket-attachments: service_role atualiza (soft delete)"
  on storage.objects for update
  using (
    bucket_id = 'ticket-attachments'
    and auth.role() = 'service_role'
  );
