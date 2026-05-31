-- Campo para controlar envio do lembrete de 24h
alter table public.meetings
  add column if not exists reminder_24h_sent_at timestamptz;

-- Template de e-mail para lembrete de reunião
insert into public.email_templates (
  slug, category, name, subject,
  body_rich_text, body_html,
  default_subject, default_body_rich_text, default_body_html
) values (
  'reuniao_lembrete',
  'Reuniões',
  'Lembrete de Reunião (24h antes)',
  'Lembrete: {{titulo_reuniao}} amanhã',
  public.text_to_tiptap(E'Olá {{nome_participante}},\n\nVocê tem uma reunião agendada para amanhã.\n\nPauta: {{titulo_reuniao}}\nData e horário: {{data_reuniao}}\n\nAcesse o sistema para mais detalhes: {{link_reuniao}}'),
  '<p>Olá {{nome_participante}},</p><p>Você tem uma reunião agendada para amanhã.</p><p><strong>Pauta:</strong> {{titulo_reuniao}}<br><strong>Data e horário:</strong> {{data_reuniao}}</p><p><a href="{{link_reuniao}}">Ver detalhes no sistema</a></p>',
  'Lembrete: {{titulo_reuniao}} amanhã',
  public.text_to_tiptap(E'Olá {{nome_participante}},\n\nVocê tem uma reunião agendada para amanhã.\n\nPauta: {{titulo_reuniao}}\nData e horário: {{data_reuniao}}\n\nAcesse o sistema para mais detalhes: {{link_reuniao}}'),
  '<p>Olá {{nome_participante}},</p><p>Você tem uma reunião agendada para amanhã.</p><p><strong>Pauta:</strong> {{titulo_reuniao}}<br><strong>Data e horário:</strong> {{data_reuniao}}</p><p><a href="{{link_reuniao}}">Ver detalhes no sistema</a></p>'
) on conflict (slug) do nothing;
