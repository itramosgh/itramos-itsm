-- Campo para controlar envio do lembrete de 24h
alter table public.meetings
  add column if not exists reminder_24h_sent_at timestamptz;

-- Template de e-mail para lembrete de reunião
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values (
  'reuniao_lembrete',
  'Reuniões',
  'Lembrete de Reunião (24h antes)',
  'Disparado pelo cron 24h antes de uma reunião agendada, enviado a todos os participantes.',
  'Lembrete: {{titulo_reuniao}} amanhã',
  public.text_to_tiptap(E'Olá {{nome_participante}},\n\nVocê tem uma reunião agendada para amanhã.\n\nPauta: {{titulo_reuniao}}\nData e horário: {{data_reuniao}}\n\nAcesse o sistema para mais detalhes: {{link_reuniao}}'),
  '<p>Olá {{nome_participante}},</p><p>Você tem uma reunião agendada para amanhã.</p><p><strong>Pauta:</strong> {{titulo_reuniao}}<br><strong>Data e horário:</strong> {{data_reuniao}}</p><p><a href="{{link_reuniao}}">Ver detalhes no sistema</a></p>',
  'Lembrete: {{titulo_reuniao}} amanhã',
  public.text_to_tiptap(E'Olá {{nome_participante}},\n\nVocê tem uma reunião agendada para amanhã.\n\nPauta: {{titulo_reuniao}}\nData e horário: {{data_reuniao}}\n\nAcesse o sistema para mais detalhes: {{link_reuniao}}'),
  '<p>Olá {{nome_participante}},</p><p>Você tem uma reunião agendada para amanhã.</p><p><strong>Pauta:</strong> {{titulo_reuniao}}<br><strong>Data e horário:</strong> {{data_reuniao}}</p><p><a href="{{link_reuniao}}">Ver detalhes no sistema</a></p>',
  '[{"key":"nome_participante","label":"Nome do participante","description":"Destinatário do lembrete","required":true},{"key":"titulo_reuniao","label":"Pauta da reunião","description":"Título da reunião","required":true},{"key":"data_reuniao","label":"Data e horário","description":"Data e hora formatada da reunião","required":true},{"key":"link_reuniao","label":"Link da reunião","description":"URL para ver detalhes no sistema","required":true}]'::jsonb,
  false
) on conflict (slug) do nothing;
