-- Categoria: Chamados (8 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('chamado_aberto', 'Chamados', 'Chamado Aberto',
 'Disparado quando um novo chamado é criado pelo cliente ou pelo analista.',
 'Chamado #{{numero_chamado}} aberto com sucesso',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu chamado #{{numero_chamado}} — {{titulo_chamado}} foi registrado com sucesso.\n' ||
   E'Prioridade: {{prioridade}}\n' ||
   E'Nossa equipe irá analisar e em breve um analista assumirá o atendimento.\n' ||
   E'Acompanhe pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi registrado com sucesso.</p><p>Prioridade: {{prioridade}}</p><p>Nossa equipe irá analisar e em breve um analista assumirá o atendimento.</p><p>Acompanhe pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} aberto com sucesso',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu chamado #{{numero_chamado}} — {{titulo_chamado}} foi registrado com sucesso.\n' ||
   E'Prioridade: {{prioridade}}\n' ||
   E'Nossa equipe irá analisar e em breve um analista assumirá o atendimento.\n' ||
   E'Acompanhe pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi registrado com sucesso.</p><p>Prioridade: {{prioridade}}</p><p>Nossa equipe irá analisar e em breve um analista assumirá o atendimento.</p><p>Acompanhe pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true},{"key":"prioridade","label":"Prioridade","description":"Nível de prioridade do chamado","required":false},{"key":"nome_analista","label":"Analista responsável","description":"Analista atribuído ao chamado","required":false}]'::jsonb,
 false),

('analista_respondeu', 'Chamados', 'Analista Respondeu',
 'Disparado quando um analista publica uma resposta pública no chamado.',
 'Analista respondeu — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO analista {{nome_analista}} respondeu ao chamado #{{numero_chamado}} — {{titulo_chamado}}.\nAcesse o portal para ver a resposta e interagir: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O analista <strong>{{nome_analista}}</strong> respondeu ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}.</p><p>Acesse o portal para ver a resposta e interagir: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Analista respondeu — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO analista {{nome_analista}} respondeu ao chamado #{{numero_chamado}} — {{titulo_chamado}}.\nAcesse o portal para ver a resposta e interagir: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O analista <strong>{{nome_analista}}</strong> respondeu ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}.</p><p>Acesse o portal para ver a resposta e interagir: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista que respondeu","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('status_alterado', 'Chamados', 'Status Alterado',
 'Disparado quando o status do chamado é alterado manualmente pelo analista.',
 'Chamado #{{numero_chamado}} — status alterado',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO status do chamado #{{numero_chamado}} — {{titulo_chamado}} foi alterado para: {{novo_status}}\nAcesse o portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O status do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi alterado para: <strong>{{novo_status}}</strong></p><p>Acesse o portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} — status alterado',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO status do chamado #{{numero_chamado}} — {{titulo_chamado}} foi alterado para: {{novo_status}}\nAcesse o portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O status do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi alterado para: <strong>{{novo_status}}</strong></p><p>Acesse o portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"novo_status","label":"Novo status","description":"Status para o qual o chamado foi alterado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('chamado_fechado', 'Chamados', 'Chamado Fechado',
 'Disparado quando um analista fecha o chamado manualmente.',
 'Chamado #{{numero_chamado}} encerrado',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado.\nObrigado por utilizar o suporte ITRAMOS.\nCaso precise reabrir, acesse: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado.</p><p>Obrigado por utilizar o suporte ITRAMOS.</p><p>Caso precise reabrir, acesse: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} encerrado',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado.\nObrigado por utilizar o suporte ITRAMOS.\nCaso precise reabrir, acesse: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado.</p><p>Obrigado por utilizar o suporte ITRAMOS.</p><p>Caso precise reabrir, acesse: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('chamado_reaberto', 'Chamados', 'Chamado Reaberto',
 'Disparado quando um chamado fechado é reaberto pelo cliente ou pelo analista.',
 'Chamado #{{numero_chamado}} reaberto',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.\nAcompanhe: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} reaberto',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.\nAcompanhe: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('lembrete_retorno_24h', 'Chamados', 'Lembrete de Retorno (24h)',
 'Disparado pelo cron quando o chamado está em aguardando_cliente há mais de X horas (aviso antes do fechamento automático).',
 'Aguardamos seu retorno — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nSeu chamado #{{numero_chamado}} — {{titulo_chamado}} está aguardando sua resposta há {{horas_aguardando}} horas.\nSe não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.\nResponda pelo portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está aguardando sua resposta há <strong>{{horas_aguardando}} horas</strong>.</p><p>Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.</p><p>Responda pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Aguardamos seu retorno — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nSeu chamado #{{numero_chamado}} — {{titulo_chamado}} está aguardando sua resposta há {{horas_aguardando}} horas.\nSe não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.\nResponda pelo portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está aguardando sua resposta há <strong>{{horas_aguardando}} horas</strong>.</p><p>Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.</p><p>Responda pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"horas_aguardando","label":"Horas aguardando","description":"Quantas horas o chamado aguarda retorno","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('fechamento_sem_retorno', 'Chamados', 'Fechamento Automático por Falta de Retorno',
 'Disparado quando o cron encerra o chamado automaticamente por ausência de retorno do cliente.',
 'Chamado #{{numero_chamado}} encerrado por falta de retorno',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.\nCaso ainda precise de suporte, reabra o chamado pelo portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.</p><p>Caso ainda precise de suporte, reabra o chamado pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} encerrado por falta de retorno',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.\nCaso ainda precise de suporte, reabra o chamado pelo portal: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.</p><p>Caso ainda precise de suporte, reabra o chamado pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

('lembrete_agendamento', 'Chamados', 'Lembrete de Agendamento (15min)',
 'Disparado 15 minutos antes do horário de atendimento agendado.',
 'Lembrete: atendimento em 15 minutos — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nSeu atendimento referente ao chamado #{{numero_chamado}} — {{titulo_chamado}} ocorrerá em 15 minutos.\nHorário: {{horario_agendado}}\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>Seu atendimento referente ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} ocorrerá em <strong>15 minutos</strong>.</p><p>Horário: {{horario_agendado}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Lembrete: atendimento em 15 minutos — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nSeu atendimento referente ao chamado #{{numero_chamado}} — {{titulo_chamado}} ocorrerá em 15 minutos.\nHorário: {{horario_agendado}}\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_cliente}},</p><p>Seu atendimento referente ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} ocorrerá em <strong>15 minutos</strong>.</p><p>Horário: {{horario_agendado}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"horario_agendado","label":"Horário agendado","description":"Data e hora do atendimento","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false);

-- Categoria: SLA (2 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('sla_proximo_vencer', 'SLA', 'SLA Próximo de Vencer',
 'Disparado pelo cron quando o prazo de SLA está próximo de vencer (threshold configurável).',
 '⚠️ SLA próximo de vencer — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} vence em {{prazo_restante}}.\nAnalista responsável: {{nome_analista}}\nAcesse o chamado imediatamente: {{link_chamado}}'),
 '<p>O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} vence em <strong>{{prazo_restante}}</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Acesse o chamado imediatamente: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '⚠️ SLA próximo de vencer — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} vence em {{prazo_restante}}.\nAnalista responsável: {{nome_analista}}\nAcesse o chamado imediatamente: {{link_chamado}}'),
 '<p>O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} vence em <strong>{{prazo_restante}}</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Acesse o chamado imediatamente: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"prazo_restante","label":"Prazo restante","description":"Tempo restante até vencer o SLA","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista atribuído ao chamado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false),

('sla_violado', 'SLA', 'SLA Violado',
 'Disparado pelo cron quando o prazo de SLA é ultrapassado sem resolução.',
 '🚨 SLA VIOLADO — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} foi VIOLADO.\nAnalista responsável: {{nome_analista}}\nTome uma ação imediata: {{link_chamado}}'),
 '<p>⚠️ O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>VIOLADO</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Tome uma ação imediata: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '🚨 SLA VIOLADO — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} foi VIOLADO.\nAnalista responsável: {{nome_analista}}\nTome uma ação imediata: {{link_chamado}}'),
 '<p>⚠️ O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>VIOLADO</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Tome uma ação imediata: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista atribuído ao chamado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false);

-- Categoria: Aprovações (8 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('aprovacao_chamado', 'Aprovações', 'Solicitação de Aprovação (Chamado)',
 'Disparado quando um chamado entra em aguardando_aprovacao e é enviado para o aprovador.',
 'Solicitação de aprovação — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}}, solicitado por {{nome_solicitante}}, requer sua aprovação.\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}, solicitado por <strong>{{nome_solicitante}}</strong>, requer sua aprovação.</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 'Solicitação de aprovação — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}}, solicitado por {{nome_solicitante}}, requer sua aprovação.\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}, solicitado por <strong>{{nome_solicitante}}</strong>, requer sua aprovação.</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Destinatário da aprovação","required":true},{"key":"nome_solicitante","label":"Nome do solicitante","description":"Quem abriu o chamado","required":true},{"key":"link_aprovar","label":"Link para aprovar","description":"URL de aprovação com token","required":true},{"key":"link_reprovar","label":"Link para reprovar","description":"URL de reprovação com token","required":true}]'::jsonb,
 false),

('chamado_aprovado', 'Aprovações', 'Chamado Aprovado',
 'Disparado quando o aprovador aprova o chamado via link ou interface.',
 'Chamado #{{numero_chamado}} aprovado',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi aprovado por {{nome_aprovador}}.\nA equipe técnica dará prosseguimento ao atendimento.\nAcompanhe: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>aprovado</strong> por {{nome_aprovador}}.</p><p>A equipe técnica dará prosseguimento ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} aprovado',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi aprovado por {{nome_aprovador}}.\nA equipe técnica dará prosseguimento ao atendimento.\nAcompanhe: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>aprovado</strong> por {{nome_aprovador}}.</p><p>A equipe técnica dará prosseguimento ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_solicitante","label":"Nome do solicitante","description":"Quem abriu o chamado","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Quem aprovou","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false),

('chamado_reprovado', 'Aprovações', 'Chamado Reprovado',
 'Disparado quando o aprovador reprova o chamado.',
 'Chamado #{{numero_chamado}} reprovado',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi reprovado por {{nome_aprovador}}.\nMotivo: {{motivo_reprovacao}}\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>reprovado</strong> por {{nome_aprovador}}.</p><p>Motivo: {{motivo_reprovacao}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} reprovado',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi reprovado por {{nome_aprovador}}.\nMotivo: {{motivo_reprovacao}}\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>reprovado</strong> por {{nome_aprovador}}.</p><p>Motivo: {{motivo_reprovacao}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_solicitante","label":"Nome do solicitante","description":"Quem abriu o chamado","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Quem reprovou","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true},{"key":"motivo_reprovacao","label":"Motivo da reprovação","description":"Justificativa do aprovador","required":false}]'::jsonb,
 false),

('aprovacao_escalonamento', 'Aprovações', 'Alerta de Escalonamento por Ausência de Aprovação',
 'Disparado pelo cron quando uma aprovação está pendente sem resposta por tempo excessivo.',
 '⚠️ Aprovação pendente há {{horas_pendente}}h — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nA aprovação do chamado #{{numero_chamado}} — {{titulo_chamado}} está pendente há {{horas_pendente}} horas.\nAprovação necessária até: {{prazo_aprovacao}}\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>A aprovação do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está pendente há <strong>{{horas_pendente}} horas</strong>.</p><p>Aprovação necessária até: {{prazo_aprovacao}}</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 '⚠️ Aprovação pendente há {{horas_pendente}}h — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nA aprovação do chamado #{{numero_chamado}} — {{titulo_chamado}} está pendente há {{horas_pendente}} horas.\nAprovação necessária até: {{prazo_aprovacao}}\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>A aprovação do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está pendente há <strong>{{horas_pendente}} horas</strong>.</p><p>Aprovação necessária até: {{prazo_aprovacao}}</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Destinatário","required":true},{"key":"horas_pendente","label":"Horas pendente","description":"Horas sem resposta","required":true},{"key":"prazo_aprovacao","label":"Prazo de aprovação","description":"Data/hora limite","required":true},{"key":"link_aprovar","label":"Link para aprovar","description":"URL de aprovação com token","required":true},{"key":"link_reprovar","label":"Link para reprovar","description":"URL de reprovação com token","required":true}]'::jsonb,
 false),

('aprovacao_encerramento', 'Aprovações', 'Encerramento Automático por Ausência de Aprovação',
 'Disparado quando o chamado é encerrado automaticamente porque nenhum aprovador respondeu.',
 'Chamado #{{numero_chamado}} encerrado por ausência de aprovação',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente pois nenhum aprovador respondeu dentro do prazo.\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente pois nenhum aprovador respondeu dentro do prazo.</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} encerrado por ausência de aprovação',
 public.text_to_tiptap(E'Olá {{nome_solicitante}},\nO chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente pois nenhum aprovador respondeu dentro do prazo.\nAcesse o chamado: {{link_chamado}}'),
 '<p>Olá {{nome_solicitante}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente pois nenhum aprovador respondeu dentro do prazo.</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_solicitante","label":"Nome do solicitante","description":"Quem abriu o chamado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false),

('aprovacao_gmud', 'Aprovações', 'Solicitação de Aprovação (GMUD)',
 'Disparado quando uma GMUD é submetida para aprovação.',
 'Aprovação de GMUD — {{titulo_gmud}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nA GMUD {{titulo_gmud}} requer sua aprovação.\nJanela: {{data_inicio}} às {{hora_inicio}}\nDescrição: {{descricao_gmud}}\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>A GMUD <strong>{{titulo_gmud}}</strong> requer sua aprovação.</p><p>Janela: {{data_inicio}} às {{hora_inicio}}</p><p>Descrição: {{descricao_gmud}}</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 'Aprovação de GMUD — {{titulo_gmud}}',
 public.text_to_tiptap(E'Olá {{nome_aprovador}},\nA GMUD {{titulo_gmud}} requer sua aprovação.\nJanela: {{data_inicio}} às {{hora_inicio}}\nDescrição: {{descricao_gmud}}\n✅ Aprovar: {{link_aprovar}}\n❌ Reprovar: {{link_reprovar}}'),
 '<p>Olá {{nome_aprovador}},</p><p>A GMUD <strong>{{titulo_gmud}}</strong> requer sua aprovação.</p><p>Janela: {{data_inicio}} às {{hora_inicio}}</p><p>Descrição: {{descricao_gmud}}</p><p><a href="{{link_aprovar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">✅ Aprovar</a>&nbsp;&nbsp;<a href="{{link_reprovar}}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">❌ Reprovar</a></p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Destinatário da aprovação","required":true},{"key":"data_inicio","label":"Data de início","description":"Data da janela de manutenção","required":true},{"key":"hora_inicio","label":"Hora de início","description":"Hora de início da janela","required":true},{"key":"descricao_gmud","label":"Descrição da GMUD","description":"Descrição detalhada da mudança","required":true},{"key":"link_aprovar","label":"Link para aprovar","description":"URL de aprovação com token","required":true},{"key":"link_reprovar","label":"Link para reprovar","description":"URL de reprovação com token","required":true}]'::jsonb,
 false),

('gmud_aprovada', 'Aprovações', 'GMUD Aprovada',
 'Disparado quando uma GMUD recebe aprovação de todos os aprovadores.',
 'GMUD aprovada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi aprovada por {{nome_aprovador}} e está liberada para execução na janela prevista.\nInício: {{data_inicio}} às {{hora_inicio}}'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi aprovada por {{nome_aprovador}} e está liberada para execução na janela prevista.</p><p>Início: {{data_inicio}} às {{hora_inicio}}</p>',
 'GMUD aprovada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi aprovada por {{nome_aprovador}} e está liberada para execução na janela prevista.\nInício: {{data_inicio}} às {{hora_inicio}}'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi aprovada por {{nome_aprovador}} e está liberada para execução na janela prevista.</p><p>Início: {{data_inicio}} às {{hora_inicio}}</p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Quem aprovou","required":true},{"key":"data_inicio","label":"Data de início","description":"Data da janela","required":true},{"key":"hora_inicio","label":"Hora de início","description":"Hora de início da janela","required":true}]'::jsonb,
 false),

('gmud_reprovada', 'Aprovações', 'GMUD Reprovada',
 'Disparado quando um aprovador reprova a GMUD.',
 'GMUD reprovada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi reprovada por {{nome_aprovador}}.\nMotivo: {{motivo_reprovacao}}\nA mudança não será executada.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi reprovada por {{nome_aprovador}}.</p><p>Motivo: {{motivo_reprovacao}}</p><p>A mudança não será executada.</p>',
 'GMUD reprovada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi reprovada por {{nome_aprovador}}.\nMotivo: {{motivo_reprovacao}}\nA mudança não será executada.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi reprovada por {{nome_aprovador}}.</p><p>Motivo: {{motivo_reprovacao}}</p><p>A mudança não será executada.</p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"nome_aprovador","label":"Nome do aprovador","description":"Quem reprovou","required":true},{"key":"motivo_reprovacao","label":"Motivo da reprovação","description":"Justificativa","required":true}]'::jsonb,
 false);

-- Categoria: Base de Conhecimento (1 template)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('kb_artigo_vinculado', 'Base de Conhecimento', 'Artigo Vinculado ao Chamado',
 'Disparado quando um analista vincula um artigo da base de conhecimento a um chamado.',
 'Artigo relacionado ao seu chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nEncontramos um artigo que pode resolver seu chamado #{{numero_chamado}}:\n{{titulo_artigo}}\n{{resumo_artigo}}\nIsso resolveu seu problema?\n✅ Sim: {{link_confirmar}}\n❌ Não, ainda preciso de ajuda: {{link_negar}}'),
 '<p>Olá {{nome_cliente}},</p><p>Encontramos um artigo que pode resolver seu chamado <strong>#{{numero_chamado}}</strong>:</p><p><strong>{{titulo_artigo}}</strong></p><p>{{resumo_artigo}}</p><p>Isso resolveu seu problema?</p><p><a href="{{link_confirmar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Sim, resolvido</a>&nbsp;&nbsp;<a href="{{link_negar}}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Não, ainda preciso de ajuda</a></p>',
 'Artigo relacionado ao seu chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nEncontramos um artigo que pode resolver seu chamado #{{numero_chamado}}:\n{{titulo_artigo}}\n{{resumo_artigo}}\nIsso resolveu seu problema?\n✅ Sim: {{link_confirmar}}\n❌ Não, ainda preciso de ajuda: {{link_negar}}'),
 '<p>Olá {{nome_cliente}},</p><p>Encontramos um artigo que pode resolver seu chamado <strong>#{{numero_chamado}}</strong>:</p><p><strong>{{titulo_artigo}}</strong></p><p>{{resumo_artigo}}</p><p>Isso resolveu seu problema?</p><p><a href="{{link_confirmar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Sim, resolvido</a>&nbsp;&nbsp;<a href="{{link_negar}}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Não, ainda preciso de ajuda</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"titulo_artigo","label":"Título do artigo","description":"Título do artigo da KB","required":true},{"key":"resumo_artigo","label":"Resumo do artigo","description":"Resumo ou introdução do artigo","required":false},{"key":"link_confirmar","label":"Link para confirmar","description":"URL de confirmação de resolução","required":true},{"key":"link_negar","label":"Link para negar","description":"URL para negar resolução","required":true}]'::jsonb,
 false);

-- Categoria: Feriados e Contratos (2 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('aviso_feriado', 'Feriados e Contratos', 'Aviso de Feriado',
 'Disparado automaticamente X dias antes de um feriado cadastrado (configurável em platform_settings).',
 'Aviso de feriado — {{data_feriado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nInformamos que em {{data_feriado}} ({{nome_feriado}}) não haverá atendimento presencial.\nO suporte remoto permanece disponível conforme seu contrato.'),
 '<p>Olá {{nome_cliente}},</p><p>Informamos que em <strong>{{data_feriado}}</strong> (<strong>{{nome_feriado}}</strong>) não haverá atendimento presencial.</p><p>O suporte remoto permanece disponível conforme seu contrato.</p>',
 'Aviso de feriado — {{data_feriado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nInformamos que em {{data_feriado}} ({{nome_feriado}}) não haverá atendimento presencial.\nO suporte remoto permanece disponível conforme seu contrato.'),
 '<p>Olá {{nome_cliente}},</p><p>Informamos que em <strong>{{data_feriado}}</strong> (<strong>{{nome_feriado}}</strong>) não haverá atendimento presencial.</p><p>O suporte remoto permanece disponível conforme seu contrato.</p>',
 '[{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato destinatário","required":true},{"key":"data_feriado","label":"Data do feriado","description":"Data formatada do feriado","required":true},{"key":"nome_feriado","label":"Nome do feriado","description":"Nome do feriado","required":true}]'::jsonb,
 false),

('contrato_proximo_vencer', 'Feriados e Contratos', 'Contrato Próximo de Vencer',
 'Disparado pelo cron em 30, 60 e 90 dias antes do vencimento do contrato.',
 'Contrato próximo de vencer — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nO contrato da empresa {{nome_empresa}} vence em {{data_vencimento}} (em {{dias_restantes}} dias).\nEntre em contato com nossa equipe para iniciar o processo de renovação.'),
 '<p>Olá {{nome_responsavel}},</p><p>O contrato da empresa <strong>{{nome_empresa}}</strong> vence em <strong>{{data_vencimento}}</strong> (em <strong>{{dias_restantes}} dias</strong>).</p><p>Entre em contato com nossa equipe para iniciar o processo de renovação.</p>',
 'Contrato próximo de vencer — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nO contrato da empresa {{nome_empresa}} vence em {{data_vencimento}} (em {{dias_restantes}} dias).\nEntre em contato com nossa equipe para iniciar o processo de renovação.'),
 '<p>Olá {{nome_responsavel}},</p><p>O contrato da empresa <strong>{{nome_empresa}}</strong> vence em <strong>{{data_vencimento}}</strong> (em <strong>{{dias_restantes}} dias</strong>).</p><p>Entre em contato com nossa equipe para iniciar o processo de renovação.</p>',
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Contato responsável pelo contrato","required":true},{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa cliente","required":true},{"key":"data_vencimento","label":"Data de vencimento","description":"Data de término do contrato","required":true},{"key":"dias_restantes","label":"Dias restantes","description":"Quantos dias até o vencimento (30, 60 ou 90)","required":true}]'::jsonb,
 false);

-- Categoria: Financeiro (1 template)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('alerta_cobranca_pendente', 'Financeiro', 'Alerta de Cobrança Pendente',
 'Disparado quando um atendimento tem cobrança extra pendente e o prazo de pagamento está próximo.',
 'Alerta de cobrança pendente — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nExiste uma cobrança pendente referente à empresa {{nome_empresa}}.\nValor: {{valor_pendente}}\nVencimento: {{data_vencimento}}\nPara regularizar, entre em contato com nossa equipe financeira.'),
 '<p>Olá {{nome_responsavel}},</p><p>Existe uma cobrança pendente referente à empresa <strong>{{nome_empresa}}</strong>.</p><p>Valor: <strong>{{valor_pendente}}</strong></p><p>Vencimento: {{data_vencimento}}</p><p>Para regularizar, entre em contato com nossa equipe financeira.</p>',
 'Alerta de cobrança pendente — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nExiste uma cobrança pendente referente à empresa {{nome_empresa}}.\nValor: {{valor_pendente}}\nVencimento: {{data_vencimento}}\nPara regularizar, entre em contato com nossa equipe financeira.'),
 '<p>Olá {{nome_responsavel}},</p><p>Existe uma cobrança pendente referente à empresa <strong>{{nome_empresa}}</strong>.</p><p>Valor: <strong>{{valor_pendente}}</strong></p><p>Vencimento: {{data_vencimento}}</p><p>Para regularizar, entre em contato com nossa equipe financeira.</p>',
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Destinatário do alerta","required":true},{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa com cobrança pendente","required":true},{"key":"valor_pendente","label":"Valor pendente","description":"Valor formatado da cobrança","required":true},{"key":"data_vencimento","label":"Data de vencimento","description":"Prazo de pagamento","required":true}]'::jsonb,
 false);

-- Categoria: GMUD (3 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('gmud_inicio_janela', 'GMUD', 'Comunicado de Início de Janela de Manutenção',
 'Disparado no momento em que a janela de manutenção da GMUD tem início.',
 'GMUD iniciada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A janela de manutenção para a GMUD {{titulo_gmud}} foi iniciada.\nInício: {{data_inicio}} às {{hora_inicio}}\nPrevisão de término: {{hora_fim}}\nEquipe responsável: {{responsavel_gmud}}'),
 '<p>A janela de manutenção para a GMUD <strong>{{titulo_gmud}}</strong> foi iniciada.</p><p>Início: {{data_inicio}} às {{hora_inicio}} | Previsão de término: {{hora_fim}}</p><p>Equipe responsável: {{responsavel_gmud}}</p>',
 'GMUD iniciada — {{titulo_gmud}}',
 public.text_to_tiptap(E'A janela de manutenção para a GMUD {{titulo_gmud}} foi iniciada.\nInício: {{data_inicio}} às {{hora_inicio}}\nPrevisão de término: {{hora_fim}}\nEquipe responsável: {{responsavel_gmud}}'),
 '<p>A janela de manutenção para a GMUD <strong>{{titulo_gmud}}</strong> foi iniciada.</p><p>Início: {{data_inicio}} às {{hora_inicio}} | Previsão de término: {{hora_fim}}</p><p>Equipe responsável: {{responsavel_gmud}}</p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"data_inicio","label":"Data de início","description":"Data da janela","required":true},{"key":"hora_inicio","label":"Hora de início","description":"Hora de início","required":true},{"key":"hora_fim","label":"Previsão de término","description":"Hora prevista de encerramento","required":true},{"key":"responsavel_gmud","label":"Responsável","description":"Equipe ou pessoa responsável","required":true}]'::jsonb,
 false),

('gmud_conclusao_sucesso', 'GMUD', 'Comunicado de Conclusão com Sucesso',
 'Disparado quando a GMUD é finalizada com sucesso.',
 'GMUD concluída com sucesso — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi concluída com sucesso.\nInício: {{hora_inicio}} | Fim: {{hora_fim}}\nTodas as atividades foram executadas conforme planejado.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi concluída com sucesso.</p><p>Início: {{hora_inicio}} | Fim: {{hora_fim}}</p><p>Todas as atividades foram executadas conforme planejado.</p>',
 'GMUD concluída com sucesso — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} foi concluída com sucesso.\nInício: {{hora_inicio}} | Fim: {{hora_fim}}\nTodas as atividades foram executadas conforme planejado.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> foi concluída com sucesso.</p><p>Início: {{hora_inicio}} | Fim: {{hora_fim}}</p><p>Todas as atividades foram executadas conforme planejado.</p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"hora_inicio","label":"Hora de início","description":"Hora real de início","required":true},{"key":"hora_fim","label":"Hora de fim","description":"Hora real de encerramento","required":true}]'::jsonb,
 false),

('gmud_reversao', 'GMUD', 'Comunicado de Reversão',
 'Disparado quando a GMUD precisa ser revertida durante ou após a janela de manutenção.',
 'GMUD revertida — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} precisou ser revertida.\nMotivo: {{motivo_reversao}}\nA equipe de suporte está monitorando o ambiente.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> precisou ser revertida.</p><p>Motivo: {{motivo_reversao}}</p><p>A equipe de suporte está monitorando o ambiente.</p>',
 'GMUD revertida — {{titulo_gmud}}',
 public.text_to_tiptap(E'A GMUD {{titulo_gmud}} precisou ser revertida.\nMotivo: {{motivo_reversao}}\nA equipe de suporte está monitorando o ambiente.'),
 '<p>A GMUD <strong>{{titulo_gmud}}</strong> precisou ser revertida.</p><p>Motivo: {{motivo_reversao}}</p><p>A equipe de suporte está monitorando o ambiente.</p>',
 '[{"key":"titulo_gmud","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"motivo_reversao","label":"Motivo da reversão","description":"Justificativa para reversão","required":true}]'::jsonb,
 false);

-- Categoria: Reuniões (1 template)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('ata_reuniao', 'Reuniões', 'Ata de Reunião',
 'Disparado quando uma ata de reunião é finalizada e deve ser enviada aos participantes.',
 'Ata de reunião — {{titulo_reuniao}}',
 public.text_to_tiptap(E'Olá {{nome_participante}},\nSegue a ata da reunião {{titulo_reuniao}} realizada em {{data_reuniao}}.\nParticipantes: {{participantes}}\nPontos discutidos:\n{{pontos_discutidos}}\nEncaminhamentos:\n{{encaminhamentos}}'),
 '<p>Olá {{nome_participante}},</p><p>Segue a ata da reunião <strong>{{titulo_reuniao}}</strong> realizada em {{data_reuniao}}.</p><p><strong>Participantes:</strong> {{participantes}}</p><p><strong>Pontos discutidos:</strong></p><p>{{pontos_discutidos}}</p><p><strong>Encaminhamentos:</strong></p><p>{{encaminhamentos}}</p>',
 'Ata de reunião — {{titulo_reuniao}}',
 public.text_to_tiptap(E'Olá {{nome_participante}},\nSegue a ata da reunião {{titulo_reuniao}} realizada em {{data_reuniao}}.\nParticipantes: {{participantes}}\nPontos discutidos:\n{{pontos_discutidos}}\nEncaminhamentos:\n{{encaminhamentos}}'),
 '<p>Olá {{nome_participante}},</p><p>Segue a ata da reunião <strong>{{titulo_reuniao}}</strong> realizada em {{data_reuniao}}.</p><p><strong>Participantes:</strong> {{participantes}}</p><p><strong>Pontos discutidos:</strong></p><p>{{pontos_discutidos}}</p><p><strong>Encaminhamentos:</strong></p><p>{{encaminhamentos}}</p>',
 '[{"key":"nome_participante","label":"Nome do participante","description":"Destinatário (enviado individualmente)","required":true},{"key":"titulo_reuniao","label":"Título da reunião","description":"Nome da reunião","required":true},{"key":"data_reuniao","label":"Data da reunião","description":"Data de realização","required":true},{"key":"participantes","label":"Participantes","description":"Lista de participantes","required":true},{"key":"pontos_discutidos","label":"Pontos discutidos","description":"Pauta e pontos tratados","required":true},{"key":"encaminhamentos","label":"Encaminhamentos","description":"Ações acordadas","required":true}]'::jsonb,
 false);

-- Categoria: Tarefas (2 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('tarefa_lembrete_x_dias', 'Tarefas', 'Lembrete de Vencimento (X dias antes)',
 'Disparado pelo cron X dias antes do vencimento de uma tarefa (configurável por tarefa).',
 'Lembrete: tarefa vence em {{dias_restantes}} dias',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nA tarefa {{titulo_tarefa}} vence em {{dias_restantes}} dias ({{data_vencimento}}).\nAcesse para verificar: {{link_tarefa}}'),
 '<p>Olá {{nome_responsavel}},</p><p>A tarefa <strong>{{titulo_tarefa}}</strong> vence em <strong>{{dias_restantes}} dias</strong> ({{data_vencimento}}).</p><p>Acesse para verificar: <a href="{{link_tarefa}}">{{link_tarefa}}</a></p>',
 'Lembrete: tarefa vence em {{dias_restantes}} dias',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nA tarefa {{titulo_tarefa}} vence em {{dias_restantes}} dias ({{data_vencimento}}).\nAcesse para verificar: {{link_tarefa}}'),
 '<p>Olá {{nome_responsavel}},</p><p>A tarefa <strong>{{titulo_tarefa}}</strong> vence em <strong>{{dias_restantes}} dias</strong> ({{data_vencimento}}).</p><p>Acesse para verificar: <a href="{{link_tarefa}}">{{link_tarefa}}</a></p>',
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Responsável pela tarefa","required":true},{"key":"titulo_tarefa","label":"Título da tarefa","description":"Nome da tarefa","required":true},{"key":"dias_restantes","label":"Dias restantes","description":"Quantos dias até o vencimento","required":true},{"key":"data_vencimento","label":"Data de vencimento","description":"Data de prazo da tarefa","required":true},{"key":"link_tarefa","label":"Link da tarefa","description":"URL direto para a tarefa","required":true}]'::jsonb,
 false),

('tarefa_vencimento_hoje', 'Tarefas', 'Lembrete no Dia do Vencimento',
 'Disparado no dia do vencimento da tarefa.',
 'Tarefa vence hoje — {{titulo_tarefa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nA tarefa {{titulo_tarefa}} vence hoje.\nAcesse e atualize o status: {{link_tarefa}}'),
 '<p>Olá {{nome_responsavel}},</p><p>A tarefa <strong>{{titulo_tarefa}}</strong> vence <strong>hoje</strong>.</p><p>Acesse e atualize o status: <a href="{{link_tarefa}}">{{link_tarefa}}</a></p>',
 'Tarefa vence hoje — {{titulo_tarefa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nA tarefa {{titulo_tarefa}} vence hoje.\nAcesse e atualize o status: {{link_tarefa}}'),
 '<p>Olá {{nome_responsavel}},</p><p>A tarefa <strong>{{titulo_tarefa}}</strong> vence <strong>hoje</strong>.</p><p>Acesse e atualize o status: <a href="{{link_tarefa}}">{{link_tarefa}}</a></p>',
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Responsável pela tarefa","required":true},{"key":"titulo_tarefa","label":"Título da tarefa","description":"Nome da tarefa","required":true},{"key":"link_tarefa","label":"Link da tarefa","description":"URL direto para a tarefa","required":true}]'::jsonb,
 false);

-- Categoria: Acesso e Senha (5 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('boas_vindas_contato', 'Acesso e Senha', 'Boas-vindas para Novo Contato',
 'Disparado quando um novo contato é criado via e-mail recebido e um acesso ao portal é criado.',
 'Bem-vindo(a) ao portal ITRAMOS — {{nome_contato}}',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nSua conta no portal de suporte ITRAMOS foi criada.\nEmpresa: {{nome_empresa}}\nDefina sua senha pelo link abaixo (válido por 24 horas):\n{{link_definir_senha}}'),
 '<p>Olá {{nome_contato}},</p><p>Sua conta no portal de suporte ITRAMOS foi criada.</p><p>Empresa: <strong>{{nome_empresa}}</strong></p><p>Defina sua senha pelo link abaixo (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p>',
 'Bem-vindo(a) ao portal ITRAMOS — {{nome_contato}}',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nSua conta no portal de suporte ITRAMOS foi criada.\nEmpresa: {{nome_empresa}}\nDefina sua senha pelo link abaixo (válido por 24 horas):\n{{link_definir_senha}}'),
 '<p>Olá {{nome_contato}},</p><p>Sua conta no portal de suporte ITRAMOS foi criada.</p><p>Empresa: <strong>{{nome_empresa}}</strong></p><p>Defina sua senha pelo link abaixo (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p>',
 '[{"key":"nome_contato","label":"Nome do contato","description":"Nome completo do novo contato","required":true},{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa à qual o contato pertence","required":true},{"key":"link_definir_senha","label":"Link para definir senha","description":"URL com token para definição de senha","required":true}]'::jsonb,
 false),

('definicao_senha_link', 'Acesso e Senha', 'Link de Definição de Senha',
 'Disparado quando um analista ou admin concede acesso ao portal para um contato existente.',
 'Defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nClique no link abaixo para definir sua senha de acesso ao portal ITRAMOS (válido por 24 horas):\n{{link_definir_senha}}\nSe não solicitou este acesso, ignore este e-mail.'),
 '<p>Olá {{nome_contato}},</p><p>Clique no link abaixo para definir sua senha de acesso ao portal ITRAMOS (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p><p>Se não solicitou este acesso, ignore este e-mail.</p>',
 'Defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nClique no link abaixo para definir sua senha de acesso ao portal ITRAMOS (válido por 24 horas):\n{{link_definir_senha}}\nSe não solicitou este acesso, ignore este e-mail.'),
 '<p>Olá {{nome_contato}},</p><p>Clique no link abaixo para definir sua senha de acesso ao portal ITRAMOS (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p><p>Se não solicitou este acesso, ignore este e-mail.</p>',
 '[{"key":"nome_contato","label":"Nome do contato","description":"Nome do destinatário","required":true},{"key":"link_definir_senha","label":"Link para definir senha","description":"URL com token de acesso","required":true}]'::jsonb,
 false),

('lembrete_senha_1', 'Acesso e Senha', 'Lembrete de Definição de Senha (1º envio)',
 'Disparado pelo cron se o contato não definiu a senha após X dias do convite inicial.',
 'Lembrete: defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nSua senha de acesso ao portal ITRAMOS ainda não foi definida.\nClique no link para defini-la (válido por 24 horas):\n{{link_definir_senha}}'),
 '<p>Olá {{nome_contato}},</p><p>Sua senha de acesso ao portal ITRAMOS ainda não foi definida.</p><p>Clique no link para defini-la (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p>',
 'Lembrete: defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nSua senha de acesso ao portal ITRAMOS ainda não foi definida.\nClique no link para defini-la (válido por 24 horas):\n{{link_definir_senha}}'),
 '<p>Olá {{nome_contato}},</p><p>Sua senha de acesso ao portal ITRAMOS ainda não foi definida.</p><p>Clique no link para defini-la (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p>',
 '[{"key":"nome_contato","label":"Nome do contato","description":"Nome do destinatário","required":true},{"key":"link_definir_senha","label":"Link para definir senha","description":"URL com token renovado","required":true}]'::jsonb,
 false),

('lembrete_senha_2', 'Acesso e Senha', 'Lembrete de Definição de Senha (2º envio)',
 'Disparado pelo cron se o contato ainda não definiu a senha após o primeiro lembrete.',
 'Último aviso: defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nEste é o último lembrete para definir sua senha no portal ITRAMOS.\nLink de acesso (expira em breve):\n{{link_definir_senha}}\nApós o vencimento, solicite um novo link ao administrador.'),
 '<p>Olá {{nome_contato}},</p><p>Este é o último lembrete para definir sua senha no portal ITRAMOS.</p><p>Link de acesso (expira em breve):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p><p>Após o vencimento, solicite um novo link ao administrador.</p>',
 'Último aviso: defina sua senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nEste é o último lembrete para definir sua senha no portal ITRAMOS.\nLink de acesso (expira em breve):\n{{link_definir_senha}}\nApós o vencimento, solicite um novo link ao administrador.'),
 '<p>Olá {{nome_contato}},</p><p>Este é o último lembrete para definir sua senha no portal ITRAMOS.</p><p>Link de acesso (expira em breve):</p><p><a href="{{link_definir_senha}}">{{link_definir_senha}}</a></p><p>Após o vencimento, solicite um novo link ao administrador.</p>',
 '[{"key":"nome_contato","label":"Nome do contato","description":"Nome do destinatário","required":true},{"key":"link_definir_senha","label":"Link para definir senha","description":"URL com token renovado","required":true}]'::jsonb,
 false),

('redefinicao_senha', 'Acesso e Senha', 'Redefinição de Senha',
 'Disparado quando o contato solicita redefinição de senha na tela de login do portal.',
 'Redefinição de senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nRecebemos uma solicitação de redefinição de senha para sua conta.\nClique no link abaixo para criar uma nova senha (válido por 1 hora):\n{{link_redefinir_senha}}\nSe não solicitou, ignore este e-mail.'),
 '<p>Olá {{nome_contato}},</p><p>Recebemos uma solicitação de redefinição de senha para sua conta.</p><p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p><p><a href="{{link_redefinir_senha}}">{{link_redefinir_senha}}</a></p><p>Se não solicitou, ignore este e-mail.</p>',
 'Redefinição de senha — portal ITRAMOS',
 public.text_to_tiptap(E'Olá {{nome_contato}},\nRecebemos uma solicitação de redefinição de senha para sua conta.\nClique no link abaixo para criar uma nova senha (válido por 1 hora):\n{{link_redefinir_senha}}\nSe não solicitou, ignore este e-mail.'),
 '<p>Olá {{nome_contato}},</p><p>Recebemos uma solicitação de redefinição de senha para sua conta.</p><p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p><p><a href="{{link_redefinir_senha}}">{{link_redefinir_senha}}</a></p><p>Se não solicitou, ignore este e-mail.</p>',
 '[{"key":"nome_contato","label":"Nome do contato","description":"Nome do destinatário","required":true},{"key":"link_redefinir_senha","label":"Link para redefinir senha","description":"URL com token de redefinição","required":true}]'::jsonb,
 false);

-- Categoria: Relatórios (1 template)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('relatorio_mensal', 'Relatórios', 'Relatório Mensal PDF',
 'Disparado no início de cada mês pelo cron, enviando o relatório do mês anterior em PDF como anexo.',
 'Relatório mensal de suporte — {{mes_referencia}}',
 public.text_to_tiptap(E'Olá {{nome_destinatario}},\nSegue em anexo o relatório mensal de suporte referente a {{mes_referencia}}.\nResumo:\n• Chamados abertos: {{total_abertos}}\n• Chamados fechados: {{total_fechados}}\n• SLA cumprido: {{percentual_sla}}%'),
 '<p>Olá {{nome_destinatario}},</p><p>Segue em anexo o relatório mensal de suporte referente a <strong>{{mes_referencia}}</strong>.</p><p>Resumo:</p><ul><li>Chamados abertos: <strong>{{total_abertos}}</strong></li><li>Chamados fechados: <strong>{{total_fechados}}</strong></li><li>SLA cumprido: <strong>{{percentual_sla}}%</strong></li></ul>',
 'Relatório mensal de suporte — {{mes_referencia}}',
 public.text_to_tiptap(E'Olá {{nome_destinatario}},\nSegue em anexo o relatório mensal de suporte referente a {{mes_referencia}}.\nResumo:\n• Chamados abertos: {{total_abertos}}\n• Chamados fechados: {{total_fechados}}\n• SLA cumprido: {{percentual_sla}}%'),
 '<p>Olá {{nome_destinatario}},</p><p>Segue em anexo o relatório mensal de suporte referente a <strong>{{mes_referencia}}</strong>.</p><p>Resumo:</p><ul><li>Chamados abertos: <strong>{{total_abertos}}</strong></li><li>Chamados fechados: <strong>{{total_fechados}}</strong></li><li>SLA cumprido: <strong>{{percentual_sla}}%</strong></li></ul>',
 '[{"key":"nome_destinatario","label":"Nome do destinatário","description":"Responsável que recebe o relatório","required":true},{"key":"mes_referencia","label":"Mês de referência","description":"Ex: Abril/2026","required":true},{"key":"total_abertos","label":"Total abertos","description":"Chamados abertos no período","required":true},{"key":"total_fechados","label":"Total fechados","description":"Chamados fechados no período","required":true},{"key":"percentual_sla","label":"Percentual SLA","description":"% de chamados dentro do prazo","required":true}]'::jsonb,
 false);

-- Categoria: Monitoramento (2 templates)
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

('url_indisponivel', 'Monitoramento', 'URL Indisponível',
 'Disparado pelo cron de monitoramento quando uma URL cadastrada retorna erro ou timeout.',
 '⚠️ URL indisponível — {{url_monitorada}}',
 public.text_to_tiptap(E'Alerta de monitoramento:\nA URL {{url_monitorada}} está indisponível desde {{hora_deteccao}}.\nStatus HTTP: {{status_http}}\nEste e-mail foi enviado automaticamente pelo sistema de monitoramento.'),
 '<p><strong>Alerta de monitoramento:</strong></p><p>A URL <code>{{url_monitorada}}</code> está indisponível desde <strong>{{hora_deteccao}}</strong>.</p><p>Status HTTP: <strong>{{status_http}}</strong></p><p><em>Este e-mail foi enviado automaticamente pelo sistema de monitoramento.</em></p>',
 '⚠️ URL indisponível — {{url_monitorada}}',
 public.text_to_tiptap(E'Alerta de monitoramento:\nA URL {{url_monitorada}} está indisponível desde {{hora_deteccao}}.\nStatus HTTP: {{status_http}}\nEste e-mail foi enviado automaticamente pelo sistema de monitoramento.'),
 '<p><strong>Alerta de monitoramento:</strong></p><p>A URL <code>{{url_monitorada}}</code> está indisponível desde <strong>{{hora_deteccao}}</strong>.</p><p>Status HTTP: <strong>{{status_http}}</strong></p><p><em>Este e-mail foi enviado automaticamente pelo sistema de monitoramento.</em></p>',
 '[{"key":"url_monitorada","label":"URL monitorada","description":"URL que está indisponível","required":true},{"key":"hora_deteccao","label":"Hora de detecção","description":"Quando a indisponibilidade foi detectada","required":true},{"key":"status_http","label":"Status HTTP","description":"Código de resposta ou erro","required":true}]'::jsonb,
 false),

('problema_recorrente', 'Monitoramento', 'Alerta de Problema Recorrente',
 'Disparado pelo cron quando a engine de recorrência detecta padrão de chamados repetidos para uma empresa.',
 '⚠️ Problema recorrente detectado — {{nome_empresa}}',
 public.text_to_tiptap(E'Atenção: foi detectado um padrão de recorrência de chamados para a empresa {{nome_empresa}}.\nChamados similares nos últimos {{janela_dias}} dias: {{total_chamados}}\nCategoria mais frequente: {{categoria_chamados}}\nRecomenda-se uma análise proativa.'),
 '<p>Atenção: foi detectado um padrão de recorrência de chamados para a empresa <strong>{{nome_empresa}}</strong>.</p><p>Chamados similares nos últimos <strong>{{janela_dias}} dias</strong>: <strong>{{total_chamados}}</strong></p><p>Categoria mais frequente: {{categoria_chamados}}</p><p>Recomenda-se uma análise proativa.</p>',
 '⚠️ Problema recorrente detectado — {{nome_empresa}}',
 public.text_to_tiptap(E'Atenção: foi detectado um padrão de recorrência de chamados para a empresa {{nome_empresa}}.\nChamados similares nos últimos {{janela_dias}} dias: {{total_chamados}}\nCategoria mais frequente: {{categoria_chamados}}\nRecomenda-se uma análise proativa.'),
 '<p>Atenção: foi detectado um padrão de recorrência de chamados para a empresa <strong>{{nome_empresa}}</strong>.</p><p>Chamados similares nos últimos <strong>{{janela_dias}} dias</strong>: <strong>{{total_chamados}}</strong></p><p>Categoria mais frequente: {{categoria_chamados}}</p><p>Recomenda-se uma análise proativa.</p>',
 '[{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa com problema recorrente","required":true},{"key":"janela_dias","label":"Janela em dias","description":"Período de análise","required":true},{"key":"total_chamados","label":"Total de chamados","description":"Quantidade de chamados similares","required":true},{"key":"categoria_chamados","label":"Categoria mais frequente","description":"Tipo de problema mais recorrente","required":true}]'::jsonb,
 false);
