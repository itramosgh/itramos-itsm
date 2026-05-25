insert into storage.buckets (id, name, public)
values ('kb-documents', 'kb-documents', false)
on conflict (id) do nothing;

create policy "kb-documents: interno lê"
  on storage.objects for select
  using (bucket_id = 'kb-documents' and public.is_internal());

create policy "kb-documents: cliente lê próprios"
  on storage.objects for select
  using (bucket_id = 'kb-documents' and public.get_user_role() = 'cliente');

create policy "kb-documents: admin e gestor fazem upload"
  on storage.objects for insert
  with check (
    bucket_id = 'kb-documents'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "kb-documents: admin e gestor deletam"
  on storage.objects for delete
  using (
    bucket_id = 'kb-documents'
    and public.get_user_role() in ('admin', 'gestor')
  );
