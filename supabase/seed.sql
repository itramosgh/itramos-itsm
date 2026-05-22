insert into public.platform_settings (id, company_name, email_from_name)
values (1, 'ITRAMOS', 'ITRAMOS Suporte')
on conflict (id) do nothing;
