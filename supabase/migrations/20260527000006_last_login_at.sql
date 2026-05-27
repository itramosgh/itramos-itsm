-- supabase/migrations/20260527000006_last_login_at.sql
alter table public.profiles
  add column if not exists last_login_at timestamptz;

alter table public.contacts
  add column if not exists last_login_at timestamptz;
