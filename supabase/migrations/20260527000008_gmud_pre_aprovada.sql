-- supabase/migrations/20260527000008_gmud_pre_aprovada.sql
alter table public.change_requests
  add column if not exists is_pre_approved boolean not null default false;
