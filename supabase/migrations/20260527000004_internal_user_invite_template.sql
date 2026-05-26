insert into public.email_templates (
  slug, category, name, trigger_description,
  subject, body_rich_text, body_html,
  default_subject, default_body_rich_text, default_body_html,
  available_variables
) values (
  'usuario_interno_criado',
  'Acesso e Senha',
  'Convite para Usuário Interno',
  'Disparado quando um admin ou gestor cria um novo usuário interno (analista, gestor ou admin).',
  'Sua conta ITRAMOS foi criada — defina sua senha',
  public.text_to_tiptap(E'Olá {{nome_usuario}},\n\nSua conta de acesso ao sistema ITRAMOS foi criada com o perfil {{perfil}}.\n\nClique no link abaixo para definir sua senha (válido por 24 horas):\n{{link_definir_senha}}\n\nApós definir a senha, acesse o sistema em:\n{{app_url}}'),
  '<p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Sua conta de acesso ao sistema ITRAMOS foi criada com o perfil <strong>{{perfil}}</strong>.</p><p>Clique no link abaixo para definir sua senha (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">Definir minha senha</a></p><p>Após definir a senha, acesse o sistema em: <a href="{{app_url}}">{{app_url}}</a></p><p>Se você não esperava este e-mail, entre em contato com o administrador.</p>',
  'Sua conta ITRAMOS foi criada — defina sua senha',
  public.text_to_tiptap(E'Olá {{nome_usuario}},\n\nSua conta de acesso ao sistema ITRAMOS foi criada com o perfil {{perfil}}.\n\nClique no link abaixo para definir sua senha (válido por 24 horas):\n{{link_definir_senha}}\n\nApós definir a senha, acesse o sistema em:\n{{app_url}}'),
  '<p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Sua conta de acesso ao sistema ITRAMOS foi criada com o perfil <strong>{{perfil}}</strong>.</p><p>Clique no link abaixo para definir sua senha (válido por 24 horas):</p><p><a href="{{link_definir_senha}}">Definir minha senha</a></p><p>Após definir a senha, acesse o sistema em: <a href="{{app_url}}">{{app_url}}</a></p><p>Se você não esperava este e-mail, entre em contato com o administrador.</p>',
  '[{"key":"nome_usuario","label":"Nome do usuário","description":"Nome completo do novo usuário","required":true},{"key":"perfil","label":"Perfil","description":"Perfil/role do usuário (Admin, Gestor, Analista)","required":true},{"key":"link_definir_senha","label":"Link para definir senha","description":"URL com token para definição de senha (gerado pelo Supabase)","required":true},{"key":"app_url","label":"URL do sistema","description":"Endereço do sistema ITRAMOS","required":true}]'::jsonb
)
on conflict (slug) do nothing;
