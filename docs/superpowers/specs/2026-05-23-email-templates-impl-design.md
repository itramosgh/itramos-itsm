# Email Templates — Design de Implementação

**Data:** 2026-05-23  
**Status:** Aprovado  
**Spec de referência:** [email-templates-design.md](2026-05-21-email-templates-design.md)  
**Abordagem:** Engine first

---

## Contexto

O sistema já dispara e-mails automáticos com HTML hardcoded em `src/lib/email.ts` (`approvalRequestHtml`, `kbLinkHtml`, `slaAlertHtml`, etc.). Este plano substitui esse modelo por uma tabela `email_templates` editável via interface, mantendo os e-mails existentes funcionando durante a migração.

Existe já uma rota `/configuracoes/templates` para `response_templates` (snippets de resposta para analistas — coisa diferente). Ela é renomeada para `/configuracoes/templates-resposta`.

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Editor | TipTap | Conforme spec — chips de variáveis e autocomplete em `{{` |
| Abordagem | Engine first | Engine é o contrato central; UI depende dele |
| `body_rich_text` no seed | `null` | TipTap converte o `body_html` ao primeiro acesso no editor |
| Escopo | UI + integração completa | Todos os call sites de `sendEmail()` passam pelo engine |
| Rota | `/configuracoes/email-templates` (nova) | Separar de `/configuracoes/templates-resposta` |

---

## Seção 1: Schema & Seed

### Tabela `email_templates`

| Campo | Tipo | Descrição |
|---|---|---|
| `slug` | `text` PK | Identificador do template (ex: `chamado_aberto`) |
| `category` | `text` NOT NULL | Agrupamento na UI |
| `name` | `text` NOT NULL | Nome amigável |
| `trigger_description` | `text` NOT NULL | Quando este e-mail é disparado (somente leitura na UI) |
| `subject` | `text` NOT NULL | Assunto (editável) |
| `body_rich_text` | `jsonb` | JSON TipTap (null no seed; populado ao salvar pela UI) |
| `body_html` | `text` NOT NULL | HTML para envio |
| `default_subject` | `text` NOT NULL | Assunto padrão para restore |
| `default_body_rich_text` | `jsonb` | JSON TipTap padrão (null no seed) |
| `default_body_html` | `text` NOT NULL | HTML padrão para restore |
| `available_variables` | `jsonb` NOT NULL | Array de `{ key, label, description, required }` |
| `is_customized` | `boolean` DEFAULT `false` | Indicador na lista |
| `updated_at` | `timestamptz` | Data da última edição |
| `updated_by` | `uuid` FK → `profiles.id` | Usuário que editou |

### Slugs por categoria (seed)

**Chamados**
- `chamado_aberto`, `analista_respondeu`, `status_alterado`, `chamado_fechado`, `chamado_reaberto`
- `aguardando_cliente_lembrete` (24h), `fechamento_automatico_cliente`
- `lembrete_agendamento` (15min antes)

**SLA**
- `sla_proximo_vencer`, `sla_violado`

**Aprovações** (chamado)
- `aprovacao_solicitada`, `chamado_aprovado`, `chamado_reprovado`
- `aprovacao_escalonamento`, `aprovacao_encerramento_automatico`

**Aprovações** (GMUD)
- `gmud_aprovacao_solicitada`, `gmud_aprovada`, `gmud_reprovada`

**Base de Conhecimento**
- `kb_artigo_vinculado`

**Feriados e Contratos**
- `aviso_feriado`, `contrato_proximo_vencer_30`, `contrato_proximo_vencer_60`, `contrato_proximo_vencer_90`

**Financeiro**
- `alerta_cobranca_pendente`

**GMUD**
- `gmud_inicio_janela`, `gmud_conclusao`, `gmud_reversao`

**Reuniões**
- `ata_reuniao`

**Tarefas**
- `tarefa_lembrete_antecipado`, `tarefa_lembrete_vencimento`

**Acesso e Senha**
- `boas_vindas_novo_contato`, `definicao_senha`, `lembrete_senha_1`, `lembrete_senha_2`, `redefinicao_senha`

**Relatórios**
- `relatorio_mensal`

**Monitoramento**
- `url_indisponivel`, `problema_recorrente`

### Body HTML do seed

Os templates que já existem em `email.ts` (hardcoded) têm o HTML copiado para `body_html` e `default_body_html`. Os demais recebem HTML base simples com placeholders corretos. Todos têm `body_rich_text = null` e `default_body_rich_text = null`.

### RLS

| Operação | Quem |
|---|---|
| SELECT | Admin, Gestor |
| UPDATE | Admin, Gestor |
| INSERT / DELETE | Ninguém (templates definidos pelo sistema) |

---

## Seção 2: Engine de Renderização

**Arquivo:** `src/lib/email-engine.ts`

```ts
// Busca o template pelo slug
getEmailTemplate(slug: string, supabase): Promise<EmailTemplate>

// Substitui variáveis e aplica wrapper HTML
renderEmailTemplate(slug: string, vars: Record<string, string>, supabase): Promise<{ subject: string; html: string }>
```

Comportamento do `renderEmailTemplate`:
1. Chama `getEmailTemplate(slug)` — lança `Error` se slug não encontrado
2. Substitui `{{chave}}` em `subject` e `body_html` pelos valores de `vars`; variável ausente mantém o placeholder (não quebra)
3. Chama `wrapEmailHtml(body)` (nova função em `email.ts`) que aplica logo ITRAMOS, header e footer
4. Retorna `{ subject, html }`

**Wrapper HTML** (`wrapEmailHtml`): função pura que envolve o `body_html` com identidade visual ITRAMOS (logo, cores, rodapé com nome/endereço). Configurável via `platform_settings` (nome e endereço do `from`).

**Migração dos call sites:** cada `sendEmail()` que atualmente usa uma função hardcoded passa a chamar:
```ts
const { subject, html } = await renderEmailTemplate('slug', { chave: valor }, supabase)
await sendEmail({ to, from, subject, html })
```

Os call sites existentes a migrar:
- `approvalRequestHtml` → `aprovacao_solicitada`
- `approvalResultHtml` → `chamado_aprovado` / `chamado_reprovado`
- `kbLinkHtml` → `kb_artigo_vinculado`
- `slaAlertHtml` → `sla_proximo_vencer` / `sla_violado`
- `schedulingReminderHtml` → `lembrete_agendamento`
- `awaitingClientReminderHtml` → `aguardando_cliente_lembrete`
- `passwordSetupHtml` → `definicao_senha`

Após migração completa, as funções hardcoded em `email.ts` são removidas.

---

## Seção 3: UI

### Rotas

- `/configuracoes/email-templates` — nova tela de gerenciamento de e-mail templates
- `/configuracoes/templates-resposta` — rota renomeada (era `/configuracoes/templates`)
- Sidebar de configurações atualizada com os dois links

### Arquitetura de componentes

```
app/(internal)/configuracoes/email-templates/
  page.tsx                        ← Server Component: busca todos os templates
  actions.ts                      ← updateEmailTemplateAction, restoreDefaultAction

components/settings/
  EmailTemplateManager.tsx        ← Client Component: layout dois painéis
  EmailTemplateList.tsx           ← Painel esquerdo: acordeão + busca
  EmailTemplateEditor.tsx         ← Painel direito: TipTap + variáveis + botões
  EmailTemplatePreview.tsx        ← Modal de preview com dados fictícios
```

### Painel esquerdo

- Templates agrupados por categoria em acordeão (`<details>` nativo ou Radix Accordion)
- Input de busca filtra por nome de template
- Badge por template: "Padrão" (cinza) / "Personalizado" (azul) baseado em `is_customized`
- Clique no template: seta o template selecionado no `EmailTemplateManager`

### Painel direito (editor)

- `name` + `trigger_description` em somente leitura (texto e badge)
- `<input>` para `subject`
- Editor TipTap com extensões:
  - `Bold`, `Italic`, `BulletList`, `OrderedList`, `Link`, `Table`, `TableRow`, `TableCell`, `TableHeader`
  - `VariableNode` (extensão customizada): converte `{{chave}}` em chip colorido, deletado como unidade atômica
  - `Suggestion` para autocomplete ao digitar `{{`: abre dropdown com variáveis disponíveis do template atual
- Painel de variáveis abaixo do editor: chips clicáveis por variável (`key` + `label`). Variáveis com `required: true` exibem asterisco `*`. Clicar insere a variável na posição do cursor.
- Botões:
  - **Salvar** — Server Action `updateEmailTemplateAction(slug, { subject, bodyRichText, bodyHtml })`; `bodyHtml` gerado via `editor.getHTML()` antes de submeter; aviso se variável obrigatória ausente (não bloqueia)
  - **Pré-visualizar** — abre `EmailTemplatePreview` com dados fictícios substituídos e wrapper aplicado
  - **Restaurar padrão** — Dialog de confirmação → `restoreDefaultAction(slug)`

### Server Actions

```ts
// Atualiza template editado
updateEmailTemplateAction(slug, { subject, bodyRichText, bodyHtml })
  → UPDATE email_templates SET subject, body_rich_text, body_html, is_customized=true,
         updated_at=now(), updated_by=auth.uid() WHERE slug = slug

// Restaura para o padrão
restoreDefaultAction(slug)
  → UPDATE email_templates SET
         subject = default_subject,
         body_rich_text = default_body_rich_text,
         body_html = default_body_html,
         is_customized = false,
         updated_at = now(), updated_by = auth.uid()
         WHERE slug = slug
```

---

## Seção 4: Testes e Critérios de Conclusão

### Testes

- `tests/email-engine.test.ts`: unit tests de `renderEmailTemplate`
  - Substituição de variáveis correta
  - Variável ausente mantém placeholder (não quebra)
  - Wrapper HTML aplicado
  - Erro se slug não encontrado

### Critérios de conclusão

- [ ] Migration criada com tabela `email_templates` + seed com todos os ~35 slugs
- [ ] RLS: Admin e Gestor podem SELECT e UPDATE; sem INSERT/DELETE
- [ ] `renderEmailTemplate(slug, vars, supabase)` funciona e aplica wrapper
- [ ] Todos os call sites de `sendEmail()` passam pelo engine (sem HTML hardcoded nos actions)
- [ ] Funções hardcoded em `email.ts` removidas após migração completa
- [ ] Rota `/configuracoes/email-templates` com layout dois painéis funcional
- [ ] TipTap com `VariableNode` e `Suggestion` operacional
- [ ] Save, preview e "Restaurar padrão" funcionando
- [ ] Rota `/configuracoes/templates` renomeada para `/configuracoes/templates-resposta`
- [ ] Sidebar de configurações atualizada
- [ ] Unit tests do engine passando
