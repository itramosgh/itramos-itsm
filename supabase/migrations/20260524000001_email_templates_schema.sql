-- Helper: converte texto com \n em TipTap JSON doc com parágrafos
create or replace function public.text_to_tiptap(txt text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'type', 'doc',
    'content', (
      select jsonb_agg(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', line)
          )
        ) order by ordinality
      )
      from unnest(string_to_array(txt, E'\n')) with ordinality as t(line)
    )
  );
$$;

create table public.email_templates (
  slug                   text primary key,
  category               text not null,
  name                   text not null,
  trigger_description    text not null,
  subject                text not null,
  body_rich_text         jsonb not null,
  body_html              text not null,
  default_subject        text not null,
  default_body_rich_text jsonb not null,
  default_body_html      text not null,
  available_variables    jsonb not null default '[]'::jsonb,
  is_customized          boolean not null default false,
  updated_at             timestamptz,
  updated_by             uuid references public.profiles(id) on delete set null
);

create index idx_email_templates_category on public.email_templates(category);

alter table public.email_templates enable row level security;

create policy "email_templates_select_admin_gestor"
  on public.email_templates for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "email_templates_update_admin_gestor"
  on public.email_templates for update
  using (public.get_user_role() in ('admin', 'gestor'))
  with check (public.get_user_role() in ('admin', 'gestor'));
