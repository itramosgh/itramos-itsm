alter table public.platform_settings
  add column if not exists monitoring_contact_id uuid references public.contacts(id) on delete set null;
