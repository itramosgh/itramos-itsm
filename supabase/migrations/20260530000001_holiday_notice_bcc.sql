-- supabase/migrations/20260530000001_holiday_notice_bcc.sql
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS holiday_notice_bcc_emails text[] NOT NULL DEFAULT '{}';
