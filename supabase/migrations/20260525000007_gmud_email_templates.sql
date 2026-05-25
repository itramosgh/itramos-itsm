insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values
  (
    'gmud_solicitacao_aprovacao',
    'GMUD',
    'GMUD — Solicitação de Aprovação',
    'Disparado quando uma GMUD é submetida para aprovação e um link de resposta é enviado ao aprovador.',
    'Solicitação de aprovação de mudança: {{titulo}}',
    public.text_to_tiptap(
      E'Olá,\n' ||
      E'Você recebeu uma solicitação de aprovação para a seguinte mudança:\n' ||
      E'{{titulo}}\n' ||
      E'Descrição: {{descricao}}\n' ||
      E'Sistemas impactados: {{sistemas_impactados}}\n' ||
      E'Janela de manutenção: {{janela_inicio}} até {{janela_fim}}\n' ||
      E'Nível de risco: {{nivel_risco}}\n' ||
      E'Plano de rollback: {{plano_rollback}}\n' ||
      E'Para aprovar ou reprovar, acesse: {{link_aprovacao}}'
    ),
    '<p>Olá,</p><p>Você recebeu uma solicitação de aprovação para a seguinte mudança:</p><h3>{{titulo}}</h3><p><strong>Descrição:</strong> {{descricao}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p><strong>Janela de manutenção:</strong> {{janela_inicio}} até {{janela_fim}}</p><p><strong>Nível de risco:</strong> {{nivel_risco}}</p><p><strong>Plano de rollback:</strong> {{plano_rollback}}</p><p>Para aprovar ou reprovar, clique no link abaixo:</p><p><a href="{{link_aprovacao}}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Responder Aprovação</a></p>',
    'Solicitação de aprovação de mudança: {{titulo}}',
    public.text_to_tiptap(
      E'Olá,\n' ||
      E'Você recebeu uma solicitação de aprovação para a seguinte mudança:\n' ||
      E'{{titulo}}\n' ||
      E'Descrição: {{descricao}}\n' ||
      E'Sistemas impactados: {{sistemas_impactados}}\n' ||
      E'Janela de manutenção: {{janela_inicio}} até {{janela_fim}}\n' ||
      E'Nível de risco: {{nivel_risco}}\n' ||
      E'Plano de rollback: {{plano_rollback}}\n' ||
      E'Para aprovar ou reprovar, acesse: {{link_aprovacao}}'
    ),
    '<p>Olá,</p><p>Você recebeu uma solicitação de aprovação para a seguinte mudança:</p><h3>{{titulo}}</h3><p><strong>Descrição:</strong> {{descricao}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p><strong>Janela de manutenção:</strong> {{janela_inicio}} até {{janela_fim}}</p><p><strong>Nível de risco:</strong> {{nivel_risco}}</p><p><strong>Plano de rollback:</strong> {{plano_rollback}}</p><p>Para aprovar ou reprovar, clique no link abaixo:</p><p><a href="{{link_aprovacao}}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Responder Aprovação</a></p>',
    '[{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança solicitada","required":true},{"key":"descricao","label":"Descrição","description":"Descrição detalhada da mudança","required":true},{"key":"sistemas_impactados","label":"Sistemas impactados","description":"Lista de sistemas afetados","required":true},{"key":"janela_inicio","label":"Início da janela","description":"Data e hora de início da manutenção","required":true},{"key":"janela_fim","label":"Fim da janela","description":"Data e hora de término previsto","required":true},{"key":"nivel_risco","label":"Nível de risco","description":"Classificação de risco da mudança","required":true},{"key":"plano_rollback","label":"Plano de rollback","description":"Procedimento de reversão em caso de falha","required":true},{"key":"link_aprovacao","label":"Link de aprovação","description":"URL para responder à solicitação","required":true}]'::jsonb,
    false
  ),
  (
    'gmud_aprovada_analista',
    'GMUD',
    'GMUD — Aprovada (notificação ao analista)',
    'Disparado quando todos os aprovadores aprovam a GMUD, notificando o analista responsável.',
    'Mudança aprovada: {{titulo}}',
    public.text_to_tiptap(
      E'Olá {{analista_nome}},\n' ||
      E'A mudança {{titulo}} foi aprovada por {{aprovador_email}}.\n' ||
      E'A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.\n' ||
      E'Acesse a GMUD: {{link_gmud}}'
    ),
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>aprovada</strong> por {{aprovador_email}}.</p><p>A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    'Mudança aprovada: {{titulo}}',
    public.text_to_tiptap(
      E'Olá {{analista_nome}},\n' ||
      E'A mudança {{titulo}} foi aprovada por {{aprovador_email}}.\n' ||
      E'A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.\n' ||
      E'Acesse a GMUD: {{link_gmud}}'
    ),
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>aprovada</strong> por {{aprovador_email}}.</p><p>A mudança pode agora ser iniciada na janela de manutenção: {{janela_inicio}} até {{janela_fim}}.</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    '[{"key":"analista_nome","label":"Nome do analista","description":"Analista responsável pela GMUD","required":true},{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"aprovador_email","label":"E-mail do aprovador","description":"Quem aprovou a mudança","required":true},{"key":"janela_inicio","label":"Início da janela","description":"Data e hora de início","required":true},{"key":"janela_fim","label":"Fim da janela","description":"Data e hora de término","required":true},{"key":"link_gmud","label":"Link da GMUD","description":"URL para acessar a GMUD no sistema","required":true}]'::jsonb,
    false
  ),
  (
    'gmud_reprovada_analista',
    'GMUD',
    'GMUD — Reprovada (notificação ao analista)',
    'Disparado quando um aprovador reprova a GMUD, notificando o analista responsável.',
    'Mudança reprovada: {{titulo}}',
    public.text_to_tiptap(
      E'Olá {{analista_nome}},\n' ||
      E'A mudança {{titulo}} foi reprovada por {{aprovador_email}}.\n' ||
      E'Motivo: {{motivo}}\n' ||
      E'Acesse a GMUD: {{link_gmud}}'
    ),
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>reprovada</strong> por {{aprovador_email}}.</p><p><strong>Motivo:</strong> {{motivo}}</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    'Mudança reprovada: {{titulo}}',
    public.text_to_tiptap(
      E'Olá {{analista_nome}},\n' ||
      E'A mudança {{titulo}} foi reprovada por {{aprovador_email}}.\n' ||
      E'Motivo: {{motivo}}\n' ||
      E'Acesse a GMUD: {{link_gmud}}'
    ),
    '<p>Olá {{analista_nome}},</p><p>A mudança <strong>{{titulo}}</strong> foi <strong>reprovada</strong> por {{aprovador_email}}.</p><p><strong>Motivo:</strong> {{motivo}}</p><p><a href="{{link_gmud}}">Acessar GMUD</a></p>',
    '[{"key":"analista_nome","label":"Nome do analista","description":"Analista responsável pela GMUD","required":true},{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança","required":true},{"key":"aprovador_email","label":"E-mail do aprovador","description":"Quem reprovou a mudança","required":true},{"key":"motivo","label":"Motivo","description":"Justificativa da reprovação","required":true},{"key":"link_gmud","label":"Link da GMUD","description":"URL para acessar a GMUD no sistema","required":true}]'::jsonb,
    false
  ),
  (
    'gmud_inicio_execucao',
    'GMUD',
    'GMUD — Início de Execução (comunicado)',
    'Disparado quando a execução da GMUD é iniciada, comunicando os afetados sobre a manutenção em andamento.',
    'Aviso de manutenção: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a seguinte manutenção está sendo iniciada agora:\n' ||
      E'{{titulo}}\n' ||
      E'O que será feito: {{descricao}}\n' ||
      E'Início: {{janela_inicio}}\n' ||
      E'Tempo previsto de manutenção: {{janela_fim}}\n' ||
      E'Sistemas impactados: {{sistemas_impactados}}\n' ||
      E'Qualquer dúvida, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a seguinte manutenção está sendo iniciada agora:</p><h3>{{titulo}}</h3><p><strong>O que será feito:</strong> {{descricao}}</p><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Tempo previsto de manutenção:</strong> {{janela_fim}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p>Qualquer dúvida, entre em contato com nosso suporte.</p>',
    'Aviso de manutenção: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a seguinte manutenção está sendo iniciada agora:\n' ||
      E'{{titulo}}\n' ||
      E'O que será feito: {{descricao}}\n' ||
      E'Início: {{janela_inicio}}\n' ||
      E'Tempo previsto de manutenção: {{janela_fim}}\n' ||
      E'Sistemas impactados: {{sistemas_impactados}}\n' ||
      E'Qualquer dúvida, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a seguinte manutenção está sendo iniciada agora:</p><h3>{{titulo}}</h3><p><strong>O que será feito:</strong> {{descricao}}</p><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Tempo previsto de manutenção:</strong> {{janela_fim}}</p><p><strong>Sistemas impactados:</strong> {{sistemas_impactados}}</p><p>Qualquer dúvida, entre em contato com nosso suporte.</p>',
    '[{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança em execução","required":true},{"key":"descricao","label":"Descrição","description":"O que será executado na manutenção","required":true},{"key":"janela_inicio","label":"Início","description":"Data e hora de início real","required":true},{"key":"janela_fim","label":"Previsão de término","description":"Data e hora de término previsto","required":true},{"key":"sistemas_impactados","label":"Sistemas impactados","description":"Lista de sistemas afetados","required":true}]'::jsonb,
    false
  ),
  (
    'gmud_concluida',
    'GMUD',
    'GMUD — Concluída (comunicado)',
    'Disparado quando a GMUD é concluída com sucesso, comunicando os afetados sobre a normalização.',
    'Manutenção concluída: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a manutenção a seguir foi concluída conforme planejado:\n' ||
      E'{{titulo}}\n' ||
      E'Início: {{janela_inicio}}\n' ||
      E'Conclusão: {{concluida_em}}\n' ||
      E'Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a manutenção a seguir foi concluída conforme planejado:</p><h3>{{titulo}}</h3><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Conclusão:</strong> {{concluida_em}}</p><p>Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.</p>',
    'Manutenção concluída: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a manutenção a seguir foi concluída conforme planejado:\n' ||
      E'{{titulo}}\n' ||
      E'Início: {{janela_inicio}}\n' ||
      E'Conclusão: {{concluida_em}}\n' ||
      E'Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a manutenção a seguir foi concluída conforme planejado:</p><h3>{{titulo}}</h3><p><strong>Início:</strong> {{janela_inicio}}</p><p><strong>Conclusão:</strong> {{concluida_em}}</p><p>Os sistemas estão operacionais. Em caso de problemas, entre em contato com nosso suporte.</p>',
    '[{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança concluída","required":true},{"key":"janela_inicio","label":"Início","description":"Data e hora de início real","required":true},{"key":"concluida_em","label":"Concluída em","description":"Data e hora de conclusão","required":true}]'::jsonb,
    false
  ),
  (
    'gmud_revertida',
    'GMUD',
    'GMUD — Revertida (comunicado)',
    'Disparado quando a GMUD precisa ser revertida e o rollback é executado, comunicando os afetados.',
    'Manutenção não aplicada — rollback executado: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a manutenção a seguir não foi aplicada e o rollback foi executado:\n' ||
      E'{{titulo}}\n' ||
      E'Motivo: {{motivo_reversao}}\n' ||
      E'Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a manutenção a seguir <strong>não foi aplicada</strong> e o rollback foi executado:</p><h3>{{titulo}}</h3><p><strong>Motivo:</strong> {{motivo_reversao}}</p><p>Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.</p>',
    'Manutenção não aplicada — rollback executado: {{titulo}}',
    public.text_to_tiptap(
      E'Informamos que a manutenção a seguir não foi aplicada e o rollback foi executado:\n' ||
      E'{{titulo}}\n' ||
      E'Motivo: {{motivo_reversao}}\n' ||
      E'Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.'
    ),
    '<p>Informamos que a manutenção a seguir <strong>não foi aplicada</strong> e o rollback foi executado:</p><h3>{{titulo}}</h3><p><strong>Motivo:</strong> {{motivo_reversao}}</p><p>Os sistemas estão operando no estado anterior à manutenção. Em caso de problemas, entre em contato com nosso suporte.</p>',
    '[{"key":"titulo","label":"Título da GMUD","description":"Nome da mudança revertida","required":true},{"key":"motivo_reversao","label":"Motivo da reversão","description":"Justificativa para o rollback","required":true}]'::jsonb,
    false
  ),
  (
    'cobranca_pendente_alerta',
    'Financeiro',
    'Cobrança Pendente — Alerta ao Gestor',
    'Disparado pelo cron quando há chamados com cobrança pendente acima do limite de dias configurado.',
    'Chamados com cobrança pendente — {{total_chamados}} pendentes',
    public.text_to_tiptap(
      E'Olá,\n' ||
      E'Existem {{total_chamados}} chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias.\n' ||
      E'{{lista_chamados}}\n' ||
      E'Ver relatório de custos: {{link_relatorio}}'
    ),
    '<p>Olá,</p><p>Existem <strong>{{total_chamados}}</strong> chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias:</p><ul>{{lista_chamados}}</ul><p><a href="{{link_relatorio}}">Ver relatório de custos</a></p>',
    'Chamados com cobrança pendente — {{total_chamados}} pendentes',
    public.text_to_tiptap(
      E'Olá,\n' ||
      E'Existem {{total_chamados}} chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias.\n' ||
      E'{{lista_chamados}}\n' ||
      E'Ver relatório de custos: {{link_relatorio}}'
    ),
    '<p>Olá,</p><p>Existem <strong>{{total_chamados}}</strong> chamado(s) com cobrança pendente há mais de {{dias_pendente}} dias:</p><ul>{{lista_chamados}}</ul><p><a href="{{link_relatorio}}">Ver relatório de custos</a></p>',
    '[{"key":"total_chamados","label":"Total de chamados","description":"Quantidade de chamados com cobrança pendente","required":true},{"key":"dias_pendente","label":"Dias pendente","description":"Limite de dias configurado","required":true},{"key":"lista_chamados","label":"Lista de chamados","description":"HTML com os chamados pendentes (gerado dinamicamente)","required":true},{"key":"link_relatorio","label":"Link do relatório","description":"URL para o relatório de custos","required":true}]'::jsonb,
    false
  )
on conflict (slug) do nothing;
