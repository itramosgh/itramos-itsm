-- Allow contacts without a company (internal ITRAMOS contacts)
alter table public.contacts
  alter column company_id drop not null;
