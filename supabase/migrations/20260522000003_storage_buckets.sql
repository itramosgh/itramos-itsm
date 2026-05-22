insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos: acesso público de leitura"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "logos: admin e gestor podem fazer upload"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and public.get_user_role() in ('admin', 'gestor')
  );

create policy "logos: admin e gestor podem deletar"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and public.get_user_role() in ('admin', 'gestor')
  );
