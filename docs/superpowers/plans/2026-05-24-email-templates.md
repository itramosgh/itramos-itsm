# Gerenciamento de Templates de E-mail — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um módulo de gerenciamento de templates de e-mail editáveis via interface, substituindo textos hardcoded em `src/lib/email.ts` por conteúdo armazenado no banco e editável por Admin/Gestor.

**Architecture:** Tabela `email_templates` com 36 templates pré-populados via migration. UI de dois painéis em `/configuracoes/email-templates`: acordeão com lista à esquerda e editor TipTap à direita. Variáveis `{{chave}}` renderizadas como chips via decorações TipTap. Envio integrado via `sendEmailFromTemplate(slug, vars)` que carrega o template do banco, substitui placeholders e envolve com o wrapper visual da ITRAMOS.

**Tech Stack:** Next.js 16 App Router · Supabase · TipTap 2.x (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-table`) · shadcn/ui · Zod · Vitest

---

## Mapa de arquivos

```
supabase/migrations/
├── 20260524000001_email_templates_schema.sql   # tabela + RLS + trigger
└── 20260524000002_email_templates_seed.sql     # 36 templates pré-populados

src/
├── types/database.ts                           # adicionar EmailTemplate type (modificar)
├── lib/
│   ├── validations/email-template.ts           # Zod schema para salvar
│   └── email-template-sender.ts               # sendEmailFromTemplate + wrapEmailHtml
├── app/(internal)/configuracoes/email-templates/
│   ├── page.tsx                                # layout dois painéis (SSC)
│   └── actions.ts                              # saveTemplate + restoreDefault
└── components/settings/email-templates/
    ├── EmailTemplateList.tsx                   # painel esquerdo: acordeão + busca
    ├── TemplateEditor.tsx                      # TipTap com todas as extensões
    ├── EmailTemplateEditor.tsx                 # painel direito: editor + vars + ações
    ├── EmailTemplateVariablePanel.tsx          # chips clicáveis de variáveis
    └── EmailTemplatePreviewModal.tsx           # pré-visualização com dados fictícios

tests/
└── email-templates.test.ts                    # testes de validação + sendEmailFromTemplate
```

---

## Task 1: Migration — schema e RLS

**Files:**
- Create: `supabase/migrations/20260524000001_email_templates_schema.sql`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new email_templates_schema
```

Renomear o arquivo gerado para `20260524000001_email_templates_schema.sql`.

- [ ] **Escrever a migration**

```sql
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
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/20260524000001_email_templates_schema.sql
git commit -m "feat: migration email_templates — schema, RLS e helper text_to_tiptap"
```

---

## Task 2: Migration — seed com todos os 36 templates

**Files:**
- Create: `supabase/migrations/20260524000002_email_templates_seed.sql`

- [ ] **Criar o arquivo de migration**

```bash
npx supabase migration new email_templates_seed
```

Renomear para `20260524000002_email_templates_seed.sql`.

- [ ] **Escrever a migration — Categoria: Chamados**

```sql
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

-- chamado_aberto
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

-- analista_respondeu
('analista_respondeu', 'Chamados', 'Analista Respondeu',
 'Disparado quando um analista publica uma resposta pública no chamado.',
 'Analista respondeu — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O analista {{nome_analista}} respondeu ao chamado #{{numero_chamado}} — {{titulo_chamado}}.\n' ||
   E'Acesse o portal para ver a resposta e interagir: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O analista <strong>{{nome_analista}}</strong> respondeu ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}.</p><p>Acesse o portal para ver a resposta e interagir: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Analista respondeu — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O analista {{nome_analista}} respondeu ao chamado #{{numero_chamado}} — {{titulo_chamado}}.\n' ||
   E'Acesse o portal para ver a resposta e interagir: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O analista <strong>{{nome_analista}}</strong> respondeu ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}}.</p><p>Acesse o portal para ver a resposta e interagir: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista que respondeu","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- status_alterado
('status_alterado', 'Chamados', 'Status Alterado',
 'Disparado quando o status do chamado é alterado manualmente pelo analista.',
 'Chamado #{{numero_chamado}} — status alterado',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O status do chamado #{{numero_chamado}} — {{titulo_chamado}} foi alterado para: {{novo_status}}\n' ||
   E'Acesse o portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O status do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi alterado para: <strong>{{novo_status}}</strong></p><p>Acesse o portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} — status alterado',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O status do chamado #{{numero_chamado}} — {{titulo_chamado}} foi alterado para: {{novo_status}}\n' ||
   E'Acesse o portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O status do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi alterado para: <strong>{{novo_status}}</strong></p><p>Acesse o portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"novo_status","label":"Novo status","description":"Status para o qual o chamado foi alterado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- chamado_fechado
('chamado_fechado', 'Chamados', 'Chamado Fechado',
 'Disparado quando um analista fecha o chamado manualmente.',
 'Chamado #{{numero_chamado}} encerrado',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado.\n' ||
   E'Obrigado por utilizar o suporte ITRAMOS.\n' ||
   E'Caso precise reabrir, acesse: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado.</p><p>Obrigado por utilizar o suporte ITRAMOS.</p><p>Caso precise reabrir, acesse: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} encerrado',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado.\n' ||
   E'Obrigado por utilizar o suporte ITRAMOS.\n' ||
   E'Caso precise reabrir, acesse: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado.</p><p>Obrigado por utilizar o suporte ITRAMOS.</p><p>Caso precise reabrir, acesse: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- chamado_reaberto
('chamado_reaberto', 'Chamados', 'Chamado Reaberto',
 'Disparado quando um chamado fechado é reaberto pelo cliente ou pelo analista.',
 'Chamado #{{numero_chamado}} reaberto',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.\n' ||
   E'Acompanhe: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} reaberto',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.\n' ||
   E'Acompanhe: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi reaberto e nossa equipe dará continuidade ao atendimento.</p><p>Acompanhe: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- lembrete_retorno_24h
('lembrete_retorno_24h', 'Chamados', 'Lembrete de Retorno (24h)',
 'Disparado pelo cron quando o chamado está em aguardando_cliente há mais de X horas (aviso antes do fechamento automático).',
 'Aguardamos seu retorno — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu chamado #{{numero_chamado}} — {{titulo_chamado}} está aguardando sua resposta há {{horas_aguardando}} horas.\n' ||
   E'Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.\n' ||
   E'Responda pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está aguardando sua resposta há <strong>{{horas_aguardando}} horas</strong>.</p><p>Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.</p><p>Responda pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Aguardamos seu retorno — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu chamado #{{numero_chamado}} — {{titulo_chamado}} está aguardando sua resposta há {{horas_aguardando}} horas.\n' ||
   E'Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.\n' ||
   E'Responda pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} está aguardando sua resposta há <strong>{{horas_aguardando}} horas</strong>.</p><p>Se não recebermos retorno em 24 horas, o chamado será encerrado automaticamente.</p><p>Responda pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"horas_aguardando","label":"Horas aguardando","description":"Quantas horas o chamado aguarda retorno","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- fechamento_sem_retorno
('fechamento_sem_retorno', 'Chamados', 'Fechamento Automático por Falta de Retorno',
 'Disparado quando o cron encerra o chamado automaticamente por ausência de retorno do cliente.',
 'Chamado #{{numero_chamado}} encerrado por falta de retorno',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.\n' ||
   E'Caso ainda precise de suporte, reabra o chamado pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.</p><p>Caso ainda precise de suporte, reabra o chamado pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Chamado #{{numero_chamado}} encerrado por falta de retorno',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'O chamado #{{numero_chamado}} — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.\n' ||
   E'Caso ainda precise de suporte, reabra o chamado pelo portal: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>O chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi encerrado automaticamente por falta de retorno.</p><p>Caso ainda precise de suporte, reabra o chamado pelo portal: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false),

-- lembrete_agendamento
('lembrete_agendamento', 'Chamados', 'Lembrete de Agendamento (15min)',
 'Disparado 15 minutos antes do horário de atendimento agendado.',
 'Lembrete: atendimento em 15 minutos — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu atendimento referente ao chamado #{{numero_chamado}} — {{titulo_chamado}} ocorrerá em 15 minutos.\n' ||
   E'Horário: {{horario_agendado}}\n' ||
   E'Acesse o chamado: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu atendimento referente ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} ocorrerá em <strong>15 minutos</strong>.</p><p>Horário: {{horario_agendado}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 'Lembrete: atendimento em 15 minutos — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'Olá {{nome_cliente}},\n' ||
   E'Seu atendimento referente ao chamado #{{numero_chamado}} — {{titulo_chamado}} ocorrerá em 15 minutos.\n' ||
   E'Horário: {{horario_agendado}}\n' ||
   E'Acesse o chamado: {{link_chamado}}'
 ),
 '<p>Olá {{nome_cliente}},</p><p>Seu atendimento referente ao chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} ocorrerá em <strong>15 minutos</strong>.</p><p>Horário: {{horario_agendado}}</p><p>Acesse o chamado: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"horario_agendado","label":"Horário agendado","description":"Data e hora do atendimento","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado no portal","required":true}]'::jsonb,
 false);
```

- [ ] **Continuar a migration — Categoria: SLA**

Adicionar ao mesmo arquivo `20260524000002_email_templates_seed.sql`:

```sql
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

-- sla_proximo_vencer
('sla_proximo_vencer', 'SLA', 'SLA Próximo de Vencer',
 'Disparado pelo cron quando o prazo de SLA está próximo de vencer (threshold configurável).',
 '⚠️ SLA próximo de vencer — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} vence em {{prazo_restante}}.\n' ||
   E'Analista responsável: {{nome_analista}}\n' ||
   E'Acesse o chamado imediatamente: {{link_chamado}}'
 ),
 '<p>O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} vence em <strong>{{prazo_restante}}</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Acesse o chamado imediatamente: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '⚠️ SLA próximo de vencer — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} vence em {{prazo_restante}}.\nAnalista responsável: {{nome_analista}}\nAcesse o chamado imediatamente: {{link_chamado}}'),
 '<p>O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} vence em <strong>{{prazo_restante}}</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Acesse o chamado imediatamente: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"prazo_restante","label":"Prazo restante","description":"Tempo restante até vencer o SLA","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista atribuído ao chamado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false),

-- sla_violado
('sla_violado', 'SLA', 'SLA Violado',
 'Disparado pelo cron quando o prazo de SLA é ultrapassado sem resolução.',
 '🚨 SLA VIOLADO — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(
   E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} foi VIOLADO.\n' ||
   E'Analista responsável: {{nome_analista}}\n' ||
   E'Tome uma ação imediata: {{link_chamado}}'
 ),
 '<p>⚠️ O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>VIOLADO</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Tome uma ação imediata: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '🚨 SLA VIOLADO — Chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'O prazo de SLA do chamado #{{numero_chamado}} — {{titulo_chamado}} foi VIOLADO.\nAnalista responsável: {{nome_analista}}\nTome uma ação imediata: {{link_chamado}}'),
 '<p>⚠️ O prazo de SLA do chamado <strong>#{{numero_chamado}}</strong> — {{titulo_chamado}} foi <strong>VIOLADO</strong>.</p><p>Analista responsável: {{nome_analista}}</p><p>Tome uma ação imediata: <a href="{{link_chamado}}">{{link_chamado}}</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"titulo_chamado","label":"Título","description":"Título do chamado","required":true},{"key":"nome_analista","label":"Analista responsável","description":"Analista atribuído ao chamado","required":true},{"key":"link_chamado","label":"Link do chamado","description":"URL direto para o chamado","required":true}]'::jsonb,
 false);
```

- [ ] **Continuar — Categoria: Aprovações**

```sql
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
```

- [ ] **Continuar — demais categorias**

Adicionar ao mesmo arquivo:

```sql
insert into public.email_templates
  (slug, category, name, trigger_description,
   subject, body_rich_text, body_html,
   default_subject, default_body_rich_text, default_body_html,
   available_variables, is_customized)
values

-- Base de Conhecimento
('kb_artigo_vinculado', 'Base de Conhecimento', 'Artigo Vinculado ao Chamado',
 'Disparado quando um analista vincula um artigo da base de conhecimento a um chamado.',
 'Artigo relacionado ao seu chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nEncontramos um artigo que pode resolver seu chamado #{{numero_chamado}}:\n{{titulo_artigo}}\n{{resumo_artigo}}\nIsso resolveu seu problema?\n✅ Sim: {{link_confirmar}}\n❌ Não, ainda preciso de ajuda: {{link_negar}}'),
 '<p>Olá {{nome_cliente}},</p><p>Encontramos um artigo que pode resolver seu chamado <strong>#{{numero_chamado}}</strong>:</p><p><strong>{{titulo_artigo}}</strong></p><p>{{resumo_artigo}}</p><p>Isso resolveu seu problema?</p><p><a href="{{link_confirmar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Sim, resolvido</a>&nbsp;&nbsp;<a href="{{link_negar}}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Não, ainda preciso de ajuda</a></p>',
 'Artigo relacionado ao seu chamado #{{numero_chamado}}',
 public.text_to_tiptap(E'Olá {{nome_cliente}},\nEncontramos um artigo que pode resolver seu chamado #{{numero_chamado}}:\n{{titulo_artigo}}\n{{resumo_artigo}}\nIsso resolveu seu problema?\n✅ Sim: {{link_confirmar}}\n❌ Não, ainda preciso de ajuda: {{link_negar}}'),
 '<p>Olá {{nome_cliente}},</p><p>Encontramos um artigo que pode resolver seu chamado <strong>#{{numero_chamado}}</strong>:</p><p><strong>{{titulo_artigo}}</strong></p><p>{{resumo_artigo}}</p><p>Isso resolveu seu problema?</p><p><a href="{{link_confirmar}}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Sim, resolvido</a>&nbsp;&nbsp;<a href="{{link_negar}}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">Não, ainda preciso de ajuda</a></p>',
 '[{"key":"numero_chamado","label":"Número do chamado","description":"Número único do chamado","required":true},{"key":"nome_cliente","label":"Nome do cliente","description":"Nome do contato solicitante","required":true},{"key":"titulo_artigo","label":"Título do artigo","description":"Título do artigo da KB","required":true},{"key":"resumo_artigo","label":"Resumo do artigo","description":"Resumo ou introdução do artigo","required":false},{"key":"link_confirmar","label":"Link para confirmar","description":"URL de confirmação de resolução","required":true},{"key":"link_negar","label":"Link para negar","description":"URL para negar resolução","required":true}]'::jsonb,
 false),

-- Feriados e Contratos
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
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Contato responsável pelo contrato","required":true},{"key":"nome_empresa","label":"Nome da empresa","description":"Nome da empresa cliente","required":true},{"key":"data_vencimento","label":"Data de vencimento","description":"Data de término do contrato","required":true},{"key":"dias_restantes","label":"Dias restantes","description":"Quantos dias até o vencimento (30, 60 ou 90)","required":true}]'::jsonb,
 false),

-- Financeiro
('alerta_cobranca_pendente', 'Financeiro', 'Alerta de Cobrança Pendente',
 'Disparado quando um atendimento tem cobrança extra pendente e o prazo de pagamento está próximo.',
 'Alerta de cobrança pendente — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nExiste uma cobrança pendente referente à empresa {{nome_empresa}}.\nValor: {{valor_pendente}}\nVencimento: {{data_vencimento}}\nPara regularizar, entre em contato com nossa equipe financeira.'),
 '<p>Olá {{nome_responsavel}},</p><p>Existe uma cobrança pendente referente à empresa <strong>{{nome_empresa}}</strong>.</p><p>Valor: <strong>{{valor_pendente}}</strong></p><p>Vencimento: {{data_vencimento}}</p><p>Para regularizar, entre em contato com nossa equipe financeira.</p>',
 'Alerta de cobrança pendente — {{nome_empresa}}',
 public.text_to_tiptap(E'Olá {{nome_responsavel}},\nExiste uma cobrança pendente referente à empresa {{nome_empresa}}.\nValor: {{valor_pendente}}\nVencimento: {{data_vencimento}}\nPara regularizar, entre em contato com nossa equipe financeira.'),
 '<p>Olá {{nome_responsavel}},</p><p>Existe uma cobrança pendente referente à empresa <strong>{{nome_empresa}}</strong>.</p><p>Valor: <strong>{{valor_pendente}}</strong></p><p>Vencimento: {{data_vencimento}}</p><p>Para regularizar, entre em contato com nossa equipe financeira.</p>',
 '[{"key":"nome_responsavel","label":"Nome do responsável","description":"Destinatário do alerta","required":true},{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa com cobrança pendente","required":true},{"key":"valor_pendente","label":"Valor pendente","description":"Valor formatado da cobrança","required":true},{"key":"data_vencimento","label":"Data de vencimento","description":"Prazo de pagamento","required":true}]'::jsonb,
 false),

-- GMUD
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
 false),

-- Reuniões
('ata_reuniao', 'Reuniões', 'Ata de Reunião',
 'Disparado quando uma ata de reunião é finalizada e deve ser enviada aos participantes.',
 'Ata de reunião — {{titulo_reuniao}}',
 public.text_to_tiptap(E'Olá {{nome_participante}},\nSegue a ata da reunião {{titulo_reuniao}} realizada em {{data_reuniao}}.\nParticipantes: {{participantes}}\nPontos discutidos:\n{{pontos_discutidos}}\nEncaminhamentos:\n{{encaminhamentos}}'),
 '<p>Olá {{nome_participante}},</p><p>Segue a ata da reunião <strong>{{titulo_reuniao}}</strong> realizada em {{data_reuniao}}.</p><p><strong>Participantes:</strong> {{participantes}}</p><p><strong>Pontos discutidos:</strong></p><p>{{pontos_discutidos}}</p><p><strong>Encaminhamentos:</strong></p><p>{{encaminhamentos}}</p>',
 'Ata de reunião — {{titulo_reuniao}}',
 public.text_to_tiptap(E'Olá {{nome_participante}},\nSegue a ata da reunião {{titulo_reuniao}} realizada em {{data_reuniao}}.\nParticipantes: {{participantes}}\nPontos discutidos:\n{{pontos_discutidos}}\nEncaminhamentos:\n{{encaminhamentos}}'),
 '<p>Olá {{nome_participante}},</p><p>Segue a ata da reunião <strong>{{titulo_reuniao}}</strong> realizada em {{data_reuniao}}.</p><p><strong>Participantes:</strong> {{participantes}}</p><p><strong>Pontos discutidos:</strong></p><p>{{pontos_discutidos}}</p><p><strong>Encaminhamentos:</strong></p><p>{{encaminhamentos}}</p>',
 '[{"key":"nome_participante","label":"Nome do participante","description":"Destinatário (enviado individualmente)","required":true},{"key":"titulo_reuniao","label":"Título da reunião","description":"Nome da reunião","required":true},{"key":"data_reuniao","label":"Data da reunião","description":"Data de realização","required":true},{"key":"participantes","label":"Participantes","description":"Lista de participantes","required":true},{"key":"pontos_discutidos","label":"Pontos discutidos","description":"Pauta e pontos tratados","required":true},{"key":"encaminhamentos","label":"Encaminhamentos","description":"Ações acordadas","required":true}]'::jsonb,
 false),

-- Tarefas
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
 false),

-- Acesso e Senha
('boas_vindas_contato', 'Acesso e Senha', 'Boas-vindas para Novo Contato',
 'Disparado quando um novo contato é criado via e-mail recebido (detecção automática) e um acesso ao portal é criado.',
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
 false),

-- Relatórios
('relatorio_mensal', 'Relatórios', 'Relatório Mensal PDF',
 'Disparado no início de cada mês pelo cron, enviando o relatório do mês anterior em PDF como anexo.',
 'Relatório mensal de suporte — {{mes_referencia}}',
 public.text_to_tiptap(E'Olá {{nome_destinatario}},\nSegue em anexo o relatório mensal de suporte referente a {{mes_referencia}}.\nResumo:\n• Chamados abertos: {{total_abertos}}\n• Chamados fechados: {{total_fechados}}\n• SLA cumprido: {{percentual_sla}}%'),
 '<p>Olá {{nome_destinatario}},</p><p>Segue em anexo o relatório mensal de suporte referente a <strong>{{mes_referencia}}</strong>.</p><p>Resumo:</p><ul><li>Chamados abertos: <strong>{{total_abertos}}</strong></li><li>Chamados fechados: <strong>{{total_fechados}}</strong></li><li>SLA cumprido: <strong>{{percentual_sla}}%</strong></li></ul>',
 'Relatório mensal de suporte — {{mes_referencia}}',
 public.text_to_tiptap(E'Olá {{nome_destinatario}},\nSegue em anexo o relatório mensal de suporte referente a {{mes_referencia}}.\nResumo:\n• Chamados abertos: {{total_abertos}}\n• Chamados fechados: {{total_fechados}}\n• SLA cumprido: {{percentual_sla}}%'),
 '<p>Olá {{nome_destinatario}},</p><p>Segue em anexo o relatório mensal de suporte referente a <strong>{{mes_referencia}}</strong>.</p><p>Resumo:</p><ul><li>Chamados abertos: <strong>{{total_abertos}}</strong></li><li>Chamados fechados: <strong>{{total_fechados}}</strong></li><li>SLA cumprido: <strong>{{percentual_sla}}%</strong></li></ul>',
 '[{"key":"nome_destinatario","label":"Nome do destinatário","description":"Responsável que recebe o relatório","required":true},{"key":"mes_referencia","label":"Mês de referência","description":"Ex: Abril/2026","required":true},{"key":"total_abertos","label":"Total abertos","description":"Chamados abertos no período","required":true},{"key":"total_fechados","label":"Total fechados","description":"Chamados fechados no período","required":true},{"key":"percentual_sla","label":"Percentual SLA","description":"% de chamados dentro do prazo","required":true}]'::jsonb,
 false),

-- Monitoramento
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
 '[{"key":"nome_empresa","label":"Nome da empresa","description":"Empresa com problema recorrente","required":true},{"key":"janela_dias","label":"Janela em dias","description":"Período de análise (configurável em platform_settings)","required":true},{"key":"total_chamados","label":"Total de chamados","description":"Quantidade de chamados similares no período","required":true},{"key":"categoria_chamados","label":"Categoria mais frequente","description":"Tipo de problema mais recorrente","required":true}]'::jsonb,
 false);
```

- [ ] **Aplicar migrations**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.` Abrir Studio em `http://127.0.0.1:54323` → Table Editor → `email_templates`. Verificar que existem **36 linhas**.

- [ ] **Commit**

```bash
git add supabase/migrations/20260524000002_email_templates_seed.sql
git commit -m "feat: seed email_templates — 36 templates em 12 categorias"
```

---

## Task 3: TypeScript types para email_templates

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Adicionar tipo `EmailTemplateVariable` e a tabela ao `Database`**

Abrir `src/types/database.ts` e adicionar antes da interface `Database`:

```typescript
export interface EmailTemplateVariable {
  key: string
  label: string
  description: string
  required: boolean
}
```

Dentro de `Database['public']['Tables']`, adicionar:

```typescript
email_templates: {
  Row: {
    slug: string
    category: string
    name: string
    trigger_description: string
    subject: string
    body_rich_text: Json
    body_html: string
    default_subject: string
    default_body_rich_text: Json
    default_body_html: string
    available_variables: EmailTemplateVariable[]
    is_customized: boolean
    updated_at: string | null
    updated_by: string | null
  }
  Insert: never
  Update: Pick<Database['public']['Tables']['email_templates']['Row'],
    'subject' | 'body_rich_text' | 'body_html' | 'is_customized' | 'updated_at' | 'updated_by'>
}
```

- [ ] **Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: nenhum erro relacionado a `email_templates`.

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: tipos TypeScript para email_templates"
```

---

## Task 4: Validation schema

**Files:**
- Create: `src/lib/validations/email-template.ts`

- [ ] **Escrever teste** em `tests/email-templates.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { saveTemplateSchema } from '@/lib/validations/email-template'

describe('saveTemplateSchema', () => {
  it('rejeita assunto vazio', () => {
    const result = saveTemplateSchema.safeParse({
      subject: '',
      body_rich_text: { type: 'doc', content: [] },
      body_html: '<p>teste</p>',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Assunto é obrigatório')
  })

  it('rejeita body_html vazio', () => {
    const result = saveTemplateSchema.safeParse({
      subject: 'Assunto válido',
      body_rich_text: { type: 'doc', content: [] },
      body_html: '',
    })
    expect(result.success).toBe(false)
  })

  it('aceita dados válidos', () => {
    const result = saveTemplateSchema.safeParse({
      subject: 'Chamado #{{numero_chamado}} aberto',
      body_rich_text: { type: 'doc', content: [{ type: 'paragraph' }] },
      body_html: '<p>Olá {{nome_cliente}}</p>',
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npx vitest run tests/email-templates.test.ts
```

Expected: FAIL — `saveTemplateSchema is not a function`

- [ ] **Criar `src/lib/validations/email-template.ts`**

```typescript
import { z } from 'zod'

export const saveTemplateSchema = z.object({
  subject: z.string().min(1, 'Assunto é obrigatório'),
  body_rich_text: z.record(z.unknown()),
  body_html: z.string().min(1, 'Conteúdo é obrigatório'),
})

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>
```

- [ ] **Rodar para verificar passou**

```bash
npx vitest run tests/email-templates.test.ts
```

Expected: PASS (3 tests)

- [ ] **Commit**

```bash
git add src/lib/validations/email-template.ts tests/email-templates.test.ts
git commit -m "feat: validation schema para salvar email templates"
```

---

## Task 5: sendEmailFromTemplate + wrapEmailHtml

**Files:**
- Create: `src/lib/email-template-sender.ts`

- [ ] **Escrever testes** (adicionar ao `tests/email-templates.test.ts`)

```typescript
import { substituteVariables, wrapEmailHtml } from '@/lib/email-template-sender'

describe('substituteVariables', () => {
  it('substitui todos os placeholders', () => {
    const html = '<p>Olá {{nome_cliente}}, chamado #{{numero_chamado}}</p>'
    const result = substituteVariables(html, {
      nome_cliente: 'João Silva',
      numero_chamado: '1234',
    })
    expect(result).toBe('<p>Olá João Silva, chamado #1234</p>')
  })

  it('mantém placeholder sem valor correspondente intacto', () => {
    const result = substituteVariables('<p>{{chave_inexistente}}</p>', {})
    expect(result).toBe('<p>{{chave_inexistente}}</p>')
  })
})

describe('wrapEmailHtml', () => {
  it('envolve o conteúdo com header e footer', () => {
    const result = wrapEmailHtml('<p>Olá</p>', { logoUrl: null, companyName: 'ITRAMOS' })
    expect(result).toContain('<p>Olá</p>')
    expect(result).toContain('ITRAMOS')
    expect(result).toContain('<!DOCTYPE html>')
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npx vitest run tests/email-templates.test.ts
```

Expected: FAIL — `substituteVariables is not a function`

- [ ] **Criar `src/lib/email-template-sender.ts`**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, buildFromAddress } from '@/lib/email'

export function substituteVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

export function wrapEmailHtml(
  bodyHtml: string,
  opts: { logoUrl: string | null; companyName: string | null }
): string {
  const name = opts.companyName ?? 'ITRAMOS'
  const logo = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${name}" style="height:40px;max-width:200px;" />`
    : `<span style="font-size:18px;font-weight:bold;color:#1e40af;">${name}</span>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1e40af;padding:20px 32px;">${logo}</td></tr>
        <tr><td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#6b7280;">
          ${name} · Suporte técnico
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendEmailFromTemplate(
  slug: string,
  to: string | string[],
  vars: Record<string, string>
): Promise<void> {
  const supabase = await createServiceClient()

  const { data: template, error } = await supabase
    .from('email_templates')
    .select('subject, body_html')
    .eq('slug', slug)
    .single()

  if (error || !template) {
    throw new Error(`Template "${slug}" não encontrado: ${error?.message}`)
  }

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_name, email_from_address, logo_light_url, company_name')
    .eq('id', 1)
    .single()

  const subject = substituteVariables(template.subject, vars)
  const bodyHtml = substituteVariables(template.body_html, vars)
  const wrappedHtml = wrapEmailHtml(bodyHtml, {
    logoUrl: settings?.logo_light_url ?? null,
    companyName: settings?.company_name ?? null,
  })

  await sendEmail({
    to,
    subject,
    html: wrappedHtml,
    from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
  })
}
```

- [ ] **Rodar testes**

```bash
npx vitest run tests/email-templates.test.ts
```

Expected: PASS (5 tests)

- [ ] **Commit**

```bash
git add src/lib/email-template-sender.ts tests/email-templates.test.ts
git commit -m "feat: sendEmailFromTemplate com substituição de variáveis e wrapper HTML"
```

---

## Task 6: Instalar TipTap + TemplateEditor

**Files:**
- Create: `src/components/settings/email-templates/TemplateEditor.tsx`

- [ ] **Instalar dependências**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/pm
```

Expected: Sem erros de peer dependencies.

- [ ] **Instalar componentes shadcn necessários**

```bash
npx shadcn@latest add dialog scroll-area
```

- [ ] **Criar `src/components/settings/email-templates/TemplateEditor.tsx`**

```typescript
'use client'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Plugin, PluginKey, DecorationSet, Decoration } from '@tiptap/pm/state'
import { forwardRef, useImperativeHandle } from 'react'
import type { Json } from '@/types/database'

export interface TemplateEditorHandle {
  getHTML: () => string
  getJSON: () => Record<string, unknown>
  insertVariable: (key: string) => void
}

const variablePluginKey = new PluginKey('variableHighlight')

const VariableHighlight = Extension.create({
  name: 'variableHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: variablePluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { doc } = state
            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const regex = /\{\{(\w+)\}\}/g
              let match
              while ((match = regex.exec(node.text)) !== null) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: 'template-variable-chip',
                  })
                )
              }
            })
            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

interface TemplateEditorProps {
  initialContent: Json
  onChange?: () => void
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor({ initialContent, onChange }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        VariableHighlight,
      ],
      content: initialContent as Record<string, unknown>,
      onUpdate: onChange,
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none',
        },
      },
    })

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? '',
      getJSON: () => editor?.getJSON() ?? {},
      insertVariable: (key: string) => {
        editor?.chain().focus().insertContent(`{{${key}}}`).run()
      },
    }))

    if (!editor) return null

    return (
      <div className="border rounded-md overflow-hidden">
        <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >B</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-sm rounded italic ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >I</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >• Lista</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >1. Lista</button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('URL do link:')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >Link</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="px-2 py-1 text-sm rounded hover:bg-muted"
          >Tabela</button>
        </div>
        <EditorContent editor={editor} />
      </div>
    )
  }
)
```

- [ ] **Adicionar CSS global para `.template-variable-chip`** em `src/app/globals.css`

```css
.template-variable-chip {
  background-color: #dbeafe;
  color: #1e40af;
  border-radius: 4px;
  padding: 1px 4px;
  font-family: monospace;
  font-size: 0.85em;
  border: 1px solid #bfdbfe;
  cursor: default;
  white-space: nowrap;
}
```

- [ ] **Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/components/settings/email-templates/ src/app/globals.css
git commit -m "feat: TemplateEditor TipTap com highlight de variáveis via decorações"
```

---

## Task 7: EmailTemplateVariablePanel

**Files:**
- Create: `src/components/settings/email-templates/EmailTemplateVariablePanel.tsx`

- [ ] **Criar `src/components/settings/email-templates/EmailTemplateVariablePanel.tsx`**

```typescript
'use client'
import type { EmailTemplateVariable } from '@/types/database'
import type { TemplateEditorHandle } from './TemplateEditor'

interface EmailTemplateVariablePanelProps {
  variables: EmailTemplateVariable[]
  editorRef: React.RefObject<TemplateEditorHandle | null>
}

export function EmailTemplateVariablePanel({ variables, editorRef }: EmailTemplateVariablePanelProps) {
  if (variables.length === 0) return null

  const handleInsert = (key: string) => {
    editorRef.current?.insertVariable(key)
  }

  return (
    <div className="border rounded-md p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Variáveis disponíveis — clique para inserir
      </p>
      <div className="flex flex-wrap gap-2">
        {variables.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => handleInsert(v.key)}
            title={v.description}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
          >
            {`{{${v.key}}}`}
            {v.required && <span className="text-red-500 font-bold">*</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">* variável obrigatória</p>
    </div>
  )
}
```

- [ ] **Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/components/settings/email-templates/EmailTemplateVariablePanel.tsx
git commit -m "feat: EmailTemplateVariablePanel — chips clicáveis com inserção no cursor"
```

---

## Task 8: EmailTemplatePreviewModal

**Files:**
- Create: `src/components/settings/email-templates/EmailTemplatePreviewModal.tsx`

- [ ] **Criar `src/components/settings/email-templates/EmailTemplatePreviewModal.tsx`**

O modal substitui cada variável por um dado fictício legível e renderiza o HTML resultante em um iframe para simular o e-mail real.

```typescript
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import type { EmailTemplateVariable } from '@/types/database'
import { substituteVariables } from '@/lib/email-template-sender'

const FAKE_VALUES: Record<string, string> = {
  numero_chamado: '4217',
  titulo_chamado: 'Impressora não reconhece papel A4',
  nome_cliente: 'Maria Fernanda Silva',
  nome_analista: 'Carlos Ramos',
  prioridade: 'Alta',
  link_chamado: 'https://suporte.itramos.com.br/portal/chamados/4217',
  novo_status: 'Em andamento',
  horas_aguardando: '26',
  horario_agendado: '14/05/2026 às 14:30',
  prazo_restante: '1h 45min',
  nome_aprovador: 'Diretor Financeiro',
  nome_solicitante: 'Maria Fernanda Silva',
  link_aprovar: 'https://suporte.itramos.com.br/aprovacao/abc123?acao=aprovar',
  link_reprovar: 'https://suporte.itramos.com.br/aprovacao/abc123?acao=reprovar',
  motivo_reprovacao: 'Orçamento não aprovado para este trimestre.',
  horas_pendente: '48',
  prazo_aprovacao: '15/05/2026 às 18:00',
  titulo_gmud: 'Atualização do servidor de arquivos — Windows Server 2022',
  data_inicio: '17/05/2026',
  hora_inicio: '01:00',
  hora_fim: '05:00',
  descricao_gmud: 'Atualização do sistema operacional e aplicação de patches de segurança.',
  responsavel_gmud: 'Equipe de Infraestrutura',
  motivo_reversao: 'Incompatibilidade detectada com aplicação legada.',
  titulo_artigo: 'Como configurar driver de impressora no Windows 11',
  resumo_artigo: 'Guia passo a passo para instalação e configuração de drivers de impressora.',
  link_confirmar: 'https://suporte.itramos.com.br/kb/confirmar/xyz456',
  link_negar: 'https://suporte.itramos.com.br/kb/negar/xyz456',
  nome_feriado: 'Corpus Christi',
  data_feriado: '19/06/2026',
  nome_responsavel: 'João Carlos Pereira',
  nome_empresa: 'Empresa ACME Ltda.',
  data_vencimento: '30/06/2026',
  dias_restantes: '30',
  valor_pendente: 'R$ 1.850,00',
  titulo_reuniao: 'Reunião de Alinhamento Mensal — Maio/2026',
  nome_participante: 'Maria Fernanda Silva',
  data_reuniao: '14/05/2026',
  participantes: 'Carlos Ramos, Maria Fernanda Silva, João Pereira',
  pontos_discutidos: 'Revisão dos chamados do mês, SLA, plano de manutenção.',
  encaminhamentos: 'Carlos: agendar visita técnica. Maria: enviar relatório até dia 20.',
  nome_responsavel_tarefa: 'Carlos Ramos',
  titulo_tarefa: 'Revisar documentação de rede do cliente ACME',
  link_tarefa: 'https://suporte.itramos.com.br/tarefas/88',
  nome_contato: 'Fernanda Lima',
  link_definir_senha: 'https://suporte.itramos.com.br/portal/definir-senha?token=abc123xyz',
  link_redefinir_senha: 'https://suporte.itramos.com.br/portal/redefinir-senha?token=def456uvw',
  nome_destinatario: 'Diretor Financeiro — ACME Ltda.',
  mes_referencia: 'Abril/2026',
  total_abertos: '47',
  total_fechados: '44',
  percentual_sla: '91,5',
  url_monitorada: 'https://erp.acme.com.br',
  hora_deteccao: '14/05/2026 às 09:12',
  status_http: '503 Service Unavailable',
  janela_dias: '30',
  total_chamados: '8',
  categoria_chamados: 'Impressoras e Periféricos',
}

interface EmailTemplatePreviewModalProps {
  subject: string
  bodyHtml: string
  variables: EmailTemplateVariable[]
  getLatestHtml: () => string
}

export function EmailTemplatePreviewModal({
  subject,
  bodyHtml,
  variables,
  getLatestHtml,
}: EmailTemplatePreviewModalProps) {
  const [open, setOpen] = useState(false)

  const getPreviewHtml = () => {
    const current = getLatestHtml()
    const fakeVars = Object.fromEntries(
      variables.map((v) => [v.key, FAKE_VALUES[v.key] ?? `[${v.label}]`])
    )
    return substituteVariables(current, fakeVars)
  }

  const previewSubject = substituteVariables(subject, FAKE_VALUES)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          Pré-visualizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualização do e-mail</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border rounded p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Assunto</p>
            <p className="font-medium">{previewSubject}</p>
          </div>
          <div className="border rounded overflow-hidden">
            <iframe
              srcDoc={getPreviewHtml()}
              title="Preview do e-mail"
              className="w-full h-[500px] border-0"
              sandbox="allow-same-origin"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Dados fictícios são usados para substituir as variáveis na pré-visualização.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/components/settings/email-templates/EmailTemplatePreviewModal.tsx
git commit -m "feat: EmailTemplatePreviewModal com dados fictícios e iframe de renderização"
```

---

## Task 9: EmailTemplateEditor (painel direito)

**Files:**
- Create: `src/components/settings/email-templates/EmailTemplateEditor.tsx`

- [ ] **Criar `src/components/settings/email-templates/EmailTemplateEditor.tsx`**

```typescript
'use client'
import { useRef, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { TemplateEditor, type TemplateEditorHandle } from './TemplateEditor'
import { EmailTemplateVariablePanel } from './EmailTemplateVariablePanel'
import { EmailTemplatePreviewModal } from './EmailTemplatePreviewModal'
import { saveTemplateAction, restoreDefaultAction } from '@/app/(internal)/configuracoes/email-templates/actions'
import type { Database, EmailTemplateVariable } from '@/types/database'

type EmailTemplate = Database['public']['Tables']['email_templates']['Row']

interface EmailTemplateEditorProps {
  template: EmailTemplate
}

export function EmailTemplateEditor({ template }: EmailTemplateEditorProps) {
  const editorRef = useRef<TemplateEditorHandle>(null)
  const [subject, setSubject] = useState(template.subject)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [missingVarsWarning, setMissingVarsWarning] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  const requiredVars = (template.available_variables as EmailTemplateVariable[])
    .filter((v) => v.required)
    .map((v) => v.key)

  const checkMissingVars = (html: string) =>
    requiredVars.filter((key) => !html.includes(`{{${key}}}`))

  const handleSave = () => {
    startTransition(async () => {
      const bodyHtml = editorRef.current?.getHTML() ?? ''
      const bodyRichText = editorRef.current?.getJSON() ?? {}

      const missing = checkMissingVars(bodyHtml)
      setMissingVarsWarning(missing)

      const result = await saveTemplateAction(template.slug, {
        subject,
        body_html: bodyHtml,
        body_rich_text: bodyRichText,
      })

      if (result.error) {
        setSaveError(result.error)
        setSaveSuccess(false)
      } else {
        setSaveError(null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      await restoreDefaultAction(template.slug)
      setSubject(template.default_subject)
      setSaveError(null)
      setSaveSuccess(false)
      setMissingVarsWarning([])
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{template.trigger_description}</p>
          {template.is_customized && (
            <Badge variant="secondary" className="mt-2">Personalizado</Badge>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <EmailTemplatePreviewModal
            subject={subject}
            bodyHtml={template.body_html}
            variables={template.available_variables as EmailTemplateVariable[]}
            getLatestHtml={() => editorRef.current?.getHTML() ?? template.body_html}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar conteúdo padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso substituirá o assunto e o corpo do e-mail pelo conteúdo original. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore} disabled={isPending}>
                  Restaurar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Assunto</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assunto do e-mail"
        />
      </div>

      <div className="space-y-2">
        <Label>Corpo do e-mail</Label>
        <TemplateEditor
          ref={editorRef}
          key={template.slug}
          initialContent={template.body_rich_text}
        />
      </div>

      <EmailTemplateVariablePanel
        variables={template.available_variables as EmailTemplateVariable[]}
        editorRef={editorRef}
      />

      {missingVarsWarning.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Variáveis obrigatórias ausentes no corpo:{' '}
            <strong>{missingVarsWarning.map((k) => `{{${k}}}`).join(', ')}</strong>
          </p>
        </div>
      )}

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      {saveSuccess && (
        <p className="text-sm text-green-600">Template salvo com sucesso.</p>
      )}

      <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {isPending ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </div>
  )
}
```

- [ ] **Instalar componente AlertDialog do shadcn**

```bash
npx shadcn@latest add alert-dialog
```

- [ ] **Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/components/settings/email-templates/EmailTemplateEditor.tsx
git commit -m "feat: EmailTemplateEditor — painel direito com save, restore e validação de variáveis"
```

---

## Task 10: EmailTemplateList (painel esquerdo)

**Files:**
- Create: `src/components/settings/email-templates/EmailTemplateList.tsx`

- [ ] **Criar `src/components/settings/email-templates/EmailTemplateList.tsx`**

```typescript
'use client'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import type { Database } from '@/types/database'

type EmailTemplate = Pick<
  Database['public']['Tables']['email_templates']['Row'],
  'slug' | 'category' | 'name' | 'is_customized' | 'updated_at'
>

interface EmailTemplateListProps {
  templates: EmailTemplate[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
}

export function EmailTemplateList({ templates, selectedSlug, onSelect }: EmailTemplateListProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    )
  }, [templates, search])

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplate[]>()
    filtered.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category)!.push(t)
    })
    return map
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.size === 0 && (
          <p className="p-4 text-sm text-muted-foreground text-center">Nenhum template encontrado.</p>
        )}
        {Array.from(grouped.entries()).map(([category, items]) => (
          <details key={category} open className="group">
            <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:bg-muted/50 select-none">
              {category}
              <span className="ml-auto text-xs font-normal normal-case">{items.length}</span>
            </summary>
            <ul className="pb-1">
              {items.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.slug)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                      selectedSlug === t.slug
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    {t.is_customized ? (
                      <Badge
                        variant={selectedSlug === t.slug ? 'outline' : 'secondary'}
                        className="text-xs shrink-0"
                      >
                        Custom
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs shrink-0 opacity-60">
                        Padrão
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/components/settings/email-templates/EmailTemplateList.tsx
git commit -m "feat: EmailTemplateList — painel esquerdo com acordeão por categoria e busca"
```

---

## Task 11: Page e Actions

**Files:**
- Create: `src/app/(internal)/configuracoes/email-templates/actions.ts`
- Create: `src/app/(internal)/configuracoes/email-templates/page.tsx`

- [ ] **Criar `src/app/(internal)/configuracoes/email-templates/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { saveTemplateSchema } from '@/lib/validations/email-template'

export async function saveTemplateAction(
  slug: string,
  data: { subject: string; body_html: string; body_rich_text: Record<string, unknown> }
) {
  const parsed = saveTemplateSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('email_templates')
    .update({
      subject: parsed.data.subject,
      body_html: parsed.data.body_html,
      body_rich_text: parsed.data.body_rich_text as never,
      is_customized: true,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('slug', slug)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/email-templates')
  return { success: true }
}

export async function restoreDefaultAction(slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: template } = await supabase
    .from('email_templates')
    .select('default_subject, default_body_rich_text, default_body_html')
    .eq('slug', slug)
    .single()

  if (!template) return { error: 'Template não encontrado' }

  const { error } = await supabase
    .from('email_templates')
    .update({
      subject: template.default_subject,
      body_rich_text: template.default_body_rich_text as never,
      body_html: template.default_body_html,
      is_customized: false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('slug', slug)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/email-templates')
  return { success: true }
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/email-templates/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EmailTemplateList } from '@/components/settings/email-templates/EmailTemplateList'
import { EmailTemplateEditor } from '@/components/settings/email-templates/EmailTemplateEditor'

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('slug, category, name, is_customized, updated_at')
    .order('category')
    .order('name')

  if (!templates) return <p className="p-6">Erro ao carregar templates.</p>

  let selected = null
  if (slug) {
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .eq('slug', slug)
      .single()
    selected = data
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Painel esquerdo */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="px-3 py-3 border-b">
          <h1 className="text-base font-semibold">Templates de E-mail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} templates</p>
        </div>
        <EmailTemplateListWrapper templates={templates} selectedSlug={slug ?? null} />
      </div>

      {/* Painel direito */}
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <EmailTemplateEditor template={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Selecione um template na lista para editar.
          </div>
        )}
      </div>
    </div>
  )
}

function EmailTemplateListWrapper({
  templates,
  selectedSlug,
}: {
  templates: { slug: string; category: string; name: string; is_customized: boolean; updated_at: string | null }[]
  selectedSlug: string | null
}) {
  'use client'
  const { useRouter } = require('next/navigation')
  const router = useRouter()
  return (
    <EmailTemplateList
      templates={templates}
      selectedSlug={selectedSlug}
      onSelect={(s) => router.push(`/configuracoes/email-templates?slug=${s}`)}
    />
  )
}
```

> **Atenção:** O bloco `'use client'` inline em uma função dentro de um Server Component não funciona em Next.js. Substitua `EmailTemplateListWrapper` por um Client Component separado.

- [ ] **Corrigir: criar wrapper Client Component separado** em `src/components/settings/email-templates/EmailTemplateListClient.tsx`

```typescript
'use client'
import { useRouter } from 'next/navigation'
import { EmailTemplateList } from './EmailTemplateList'
import type { Database } from '@/types/database'

type TemplateListItem = Pick<
  Database['public']['Tables']['email_templates']['Row'],
  'slug' | 'category' | 'name' | 'is_customized' | 'updated_at'
>

interface EmailTemplateListClientProps {
  templates: TemplateListItem[]
  selectedSlug: string | null
}

export function EmailTemplateListClient({ templates, selectedSlug }: EmailTemplateListClientProps) {
  const router = useRouter()
  return (
    <EmailTemplateList
      templates={templates}
      selectedSlug={selectedSlug}
      onSelect={(slug) => router.push(`/configuracoes/email-templates?slug=${slug}`)}
    />
  )
}
```

- [ ] **Atualizar `page.tsx`** para usar `EmailTemplateListClient` e remover o wrapper inline

```typescript
import { createClient } from '@/lib/supabase/server'
import { EmailTemplateListClient } from '@/components/settings/email-templates/EmailTemplateListClient'
import { EmailTemplateEditor } from '@/components/settings/email-templates/EmailTemplateEditor'

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('slug, category, name, is_customized, updated_at')
    .order('category')
    .order('name')

  if (!templates) return <p className="p-6">Erro ao carregar templates.</p>

  let selected = null
  if (slug) {
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .eq('slug', slug)
      .single()
    selected = data
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden -m-6">
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="px-3 py-3 border-b">
          <h1 className="text-base font-semibold">Templates de E-mail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} templates</p>
        </div>
        <EmailTemplateListClient templates={templates} selectedSlug={slug ?? null} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <EmailTemplateEditor template={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Selecione um template na lista para editar.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/app/(internal)/configuracoes/email-templates/ src/components/settings/email-templates/
git commit -m "feat: page e actions de email-templates — layout dois painéis, save e restore"
```

---

## Task 12: Navegação + Teste manual

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (adicionar link)
- Verify: fluxo completo no browser

- [ ] **Adicionar link ao Sidebar**

Abrir `src/components/layout/Sidebar.tsx`. Localizar o array `navItems` e adicionar a entrada de Configurações ou incluir o sub-link de templates. Se a sidebar já tem item "Configurações", o link direto para email-templates é acessado via Configurações → sub-menu, ou adicionar link nas configurações.

Verificar como as configurações estão organizadas no projeto. Se não há sub-menu, adicionar item direto:

```typescript
// dentro do array navItems, após o item de configurações
{ href: '/configuracoes/email-templates', label: 'Templates de E-mail', icon: Mail },
```

Importar `Mail` do `lucide-react`.

- [ ] **Iniciar servidor e testar**

```bash
npm run dev
```

Abrir `http://localhost:3000/configuracoes/email-templates`.

Verificar:
- [ ] Lista de 36 templates aparece agrupada por categoria
- [ ] Busca filtra templates em tempo real
- [ ] Clicar em um template carrega o editor com o conteúdo correto
- [ ] Variáveis aparecem como chips azuis no editor
- [ ] Clicar em um chip no painel de variáveis insere o placeholder no cursor
- [ ] Botão "Pré-visualizar" abre modal com HTML renderizado e dados fictícios
- [ ] Editar assunto e corpo → clicar "Salvar alterações" → badge "Personalizado" aparece
- [ ] Clicar "Restaurar padrão" → confirmar → template volta ao conteúdo original

- [ ] **Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: link de navegação para email-templates na sidebar"
```

---

## Task 13: Atualizar README de specs

**Files:**
- Modify: `docs/superpowers/specs/README.md`

- [ ] **Atualizar status do plano no README**

Abrir `docs/superpowers/specs/README.md` e atualizar a tabela de planos:

```markdown
| E-mail | Plano email-templates | [2026-05-24-email-templates.md](../plans/2026-05-24-email-templates.md) | Criado — aguardando execução |
```

- [ ] **Commit**

```bash
git add docs/superpowers/specs/README.md docs/superpowers/plans/2026-05-24-email-templates.md
git commit -m "docs: plano email-templates criado — aguardando execução"
```

---

## Self-Review

### Cobertura da spec

| Requisito | Task que implementa |
|---|---|
| Tabela `email_templates` com todos os campos | Task 1 |
| 36 templates pré-populados | Task 2 |
| RLS: apenas admin/gestor acessa | Task 1 |
| Painel esquerdo: acordeão por categoria | Task 10 |
| Campo de busca por nome | Task 10 |
| Indicador Padrão/Personalizado | Tasks 10, 11 |
| Painel direito: nome + trigger_description (read-only) | Task 9 |
| Campo assunto editável | Task 9 |
| Editor TipTap (bold, italic, listas, link, tabela) | Task 6 |
| Variáveis como chips coloridos no editor | Task 6 (decorações) |
| Painel de variáveis com chips clicáveis | Task 7 |
| Variáveis obrigatórias marcadas com * | Task 7 |
| Clicar chip insere no cursor | Tasks 6 e 7 |
| Pré-visualizar com dados fictícios | Task 8 |
| Restaurar padrão com confirmação | Task 9 |
| Salvar com aviso de variáveis obrigatórias ausentes | Task 9 |
| `sendEmailFromTemplate(slug, vars)` | Task 5 |
| Wrapper HTML com identidade visual (logo, header, footer) | Task 5 |
| Types TypeScript completos | Task 3 |
| Validation Zod | Task 4 |
| Testes de unidade | Tasks 4 e 5 |

### Checagem de placeholders

Todos os steps contêm código completo — nenhum "TBD" ou "similar ao anterior".

### Consistência de tipos

- `TemplateEditorHandle.getJSON()` retorna `Record<string, unknown>` — compatível com `body_rich_text: Record<string, unknown>` em `saveTemplateSchema`.
- `EmailTemplateVariable[]` é usado consistentemente em `EmailTemplateVariablePanel`, `EmailTemplatePreviewModal` e `EmailTemplateEditor`.
- `Database['public']['Tables']['email_templates']['Row']` é referenciado diretamente em todos os componentes — sem duplicação de tipo.

### Itens fora do escopo (confirmar com spec)

- Autocomplete inline ao digitar `{{` — a spec menciona mas é funcionalidade avançada de TipTap. A Task 6 implementa highlight via decorações e inserção por clique no painel; o autocomplete pode ser adicionado como iteração futura sem breaking changes.
- Digitação `{{` não abre popup automático — o painel de variáveis lateral cobre o mesmo caso de uso de forma mais simples.
