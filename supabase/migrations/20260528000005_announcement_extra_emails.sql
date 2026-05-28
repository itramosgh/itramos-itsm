alter table announcements
  add column if not exists recipient_extra_emails text[] not null default '{}';
