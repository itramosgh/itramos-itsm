# Sub-spec 3: Notificações por E-mail, Calendário de Feriados e Comunicados

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** [02-chamados-sla-design.md](2026-05-22-02-chamados-sla-design.md)  
**Bloqueia:** sub-spec 7

---

## Objetivo

Definir o sistema de notificações automáticas por e-mail para eventos de chamados, o calendário de feriados (com importação via BrasilAPI e e-mail de aviso), e o módulo de comunicados para disparo manual ou agendado para contatos de clientes.

> Os templates de conteúdo de cada e-mail são gerenciados pelo módulo de Templates (spec de referência: [email-templates-design.md](2026-05-21-email-templates-design.md)). Este sub-spec define os **gatilhos, destinatários e lógica de envio** — não o conteúdo dos templates.

---

## Módulos

### 1. Notificações por E-mail

#### Destinatários

| Papel | Quando recebe |
|---|---|
| **Solicitante** | Sempre — todas as notificações do chamado |
| **Responsável pelo contrato** (flag `is_contract_responsible`) | Recebe cópia de todos os e-mails que o solicitante recebe |
| **Contato com flag `receives_ticket_cc`** | Recebe cópia de todos os e-mails de notificação dos chamados da empresa |
| **Analista responsável** | Quando solicitante ou responsável atualiza o chamado |
| **Gestor/Admin com flag `notify_new_tickets`** | Quando qualquer novo chamado é aberto |

#### Gatilhos de notificação

| Evento | Destinatários |
|---|---|
| Chamado aberto | Solicitante + Responsáveis (flags) + Gestor/Admin com flag `notify_new_tickets` |
| Analista adiciona mensagem ou resposta | Solicitante + Responsáveis (flags) |
| Solicitante ou responsável atualiza o chamado | Analista responsável |
| Status do chamado alterado | Solicitante + Responsáveis (flags) |
| Chamado fechado | Solicitante + Responsáveis (flags) |
| Chamado reaberto | Analista responsável |
| Lembrete "Aguardando Cliente" (24h) | Solicitante + Responsáveis (flags) |
| Fechamento automático por falta de retorno | Solicitante + Responsáveis (flags) + Analista + Gestor |
| Lembrete de agendamento (15 min antes) | Analista + Solicitante + Responsáveis (flags) |
| SLA próximo de vencer | Analista + Gestor |
| SLA violado | Analista + Gestor |
| Aprovação solicitada | Aprovador definido pelo analista |
| Chamado aprovado | Analista |
| Chamado reprovado | Analista + Solicitante + Responsáveis (flags) |
| Encerramento por ausência de aprovação (2 dias) | Solicitante + Analista + Gestor |
| Artigo vinculado — "Resolveu seu problema?" | Solicitante + Responsáveis (flags) |
| Alerta de problema recorrente | Gestor + Analista responsável |

#### Conteúdo dos e-mails

- Cada e-mail usa o template correspondente da tabela `email_templates` (slug definido por evento)
- O wrapper HTML externo (logo ITRAMOS, cabeçalho, rodapé) é aplicado em tempo de envio sobre o `body_html` do template
- Identificação do chamado (número e título) sempre incluída
- **Apenas o último trâmite** — somente a mensagem ou atualização mais recente, sem repetir histórico anterior
- **Link direto para o chamado** no portal incluído em todos os e-mails de chamado

#### Anexos nos e-mails

- Arquivos anexados pelo analista ou sistema em uma interação → incluídos como anexos reais no e-mail
- Arquivos anexados pelo solicitante via e-mail → capturados e salvos no Supabase Storage, vinculados à interação
- **Conteúdo inline ignorado:** imagens embutidas no corpo, assinaturas com logo e elementos inline não são processados nem salvos como anexo

#### Resposta por e-mail (bidirecional)

- Solicitante pode responder ao e-mail recebido → resposta adicionada ao histórico do chamado
- Responsável pelo contrato (flag) também pode responder → entra no histórico identificado com seu nome
- Implementado via Resend Inbound: cada chamado tem endereço de resposta único ex: `chamado-1234@reply.itramos.com.br`
- Respostas fora do prazo de reabertura (após 7 dias do fechamento) → descartadas com e-mail informativo
- Webhook Resend Inbound chama API route `POST /api/email/inbound` com o payload do e-mail

#### Envio via Resend

- Todos os e-mails enviados via SDK Resend com `RESEND_API_KEY`
- `from`: `{email_from_name} <{email_from_address}>` conforme `platform_settings`
- `reply-to`: endereço único do chamado (para comunicação bidirecional)
- Cada envio gera entrada em `system_logs` categoria `email_sent`

---

### 2. Calendário de Feriados

#### Importação automática

- Feriados nacionais e municipais de São Paulo importados via BrasilAPI: `GET /feriados/v1/{ano}`
- Importação automática a cada virada de ano (cron job `1 de janeiro`)
- Importação sob demanda pelo Administrador ou Gestor via botão na tela

#### Feriados manuais

- Administrador e Gestor podem cadastrar feriados não cobertos pela API (ex: feriados locais específicos)
- Campos: nome, data, tipo (`nacional` | `municipal` | `manual`)

#### E-mail de aviso de feriado

- Para cada feriado, e-mail automático para todos os **responsáveis de contratos ativos** (`is_contract_responsible = true`)
- Conteúdo (template `aviso_feriado`): nome do feriado, data, aviso de não atendimento, sugestão de antecipar solicitações
- Antecedência configurável em `platform_settings.holiday_notice_days` (padrão: 7 dias)
- Disparo via cron job diário que verifica feriados nos próximos N dias

---

### 3. Comunicados

Módulo para criar e disparar comunicados por e-mail para contatos de clientes.

#### Criação

- Editor de texto rico TipTap com: formatação (negrito, itálico, listas, títulos), inserção de imagens (coladas ou carregadas), links e tabelas
- Upload de arquivos anexos (Supabase Storage, bucket `announcements`)
- Campo de assunto do e-mail
- Pré-visualização antes do envio

#### Segmentação de destinatários

| Opção | Descrição |
|---|---|
| Todos os contatos | Todos os contatos ativos de todas as empresas |
| Por empresa | Todos os contatos ativos de uma empresa específica |
| Por departamento | Contatos de um ou mais departamentos, com filtro opcional por empresa |
| Seleção manual | Seleção individual de contatos por nome ou empresa |

#### Envio e agendamento

- Disparo imediato ou agendamento para data e hora específica
- Comunicados agendados: status `agendado`, editáveis ou canceláveis antes do disparo
- Após envio: status `enviado`, registra data/hora e quantidade de destinatários

#### Permissões

| Ação | Admin | Gestor | Analista |
|---|---|---|---|
| Criar e enviar | Sim | Sim | Não |
| Consultar histórico | Sim | Sim | Sim |

---

## Schema do Banco de Dados

### `public.holidays`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `date` | `date` NOT NULL | |
| `name` | `text` NOT NULL | |
| `type` | `text` NOT NULL | `nacional` \| `municipal` \| `manual` |
| `year` | `integer` NOT NULL | Para controle de importação por ano |
| `created_at` | `timestamptz` DEFAULT `now()` | |

Constraint: `UNIQUE (date, type)` para evitar duplicatas na reimportação.

---

### `public.holiday_notice_sent`

Controla quais avisos de feriado já foram enviados para evitar reenvios.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `holiday_id` | `uuid` NOT NULL FK → `holidays.id` | |
| `contact_id` | `uuid` NOT NULL FK → `contacts.id` | |
| `sent_at` | `timestamptz` DEFAULT `now()` | |

Constraint: `UNIQUE (holiday_id, contact_id)`

---

### `public.announcements`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `subject` | `text` NOT NULL | Assunto do e-mail |
| `body_rich_text` | `jsonb` | Conteúdo TipTap |
| `body_html` | `text` | HTML gerado para envio |
| `recipient_type` | `text` NOT NULL | `all` \| `company` \| `department` \| `manual` |
| `recipient_company_id` | `uuid` FK → `companies.id` | Para tipo `company` ou `department` |
| `recipient_departments` | `text[]` | Para tipo `department` |
| `status` | `text` NOT NULL DEFAULT `'rascunho'` | `rascunho` \| `agendado` \| `enviado` \| `cancelado` |
| `scheduled_at` | `timestamptz` | Para disparo agendado |
| `sent_at` | `timestamptz` | |
| `recipient_count` | `integer` | Total de destinatários no envio |
| `created_by` | `uuid` NOT NULL FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.announcement_recipients`

Destinatários manuais (quando `recipient_type = 'manual'`).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `announcement_id` | `uuid` NOT NULL FK → `announcements.id` | |
| `contact_id` | `uuid` NOT NULL FK → `contacts.id` | |

---

### `public.announcement_attachments`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `announcement_id` | `uuid` NOT NULL FK → `announcements.id` | |
| `filename` | `text` NOT NULL | |
| `storage_path` | `text` NOT NULL | |
| `size_bytes` | `integer` | |
| `mime_type` | `text` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

## RLS Policies

### `holidays`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE | Admin, Gestor, Service role (importação API) |
| DELETE | Admin |

### `announcements`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista (somente leitura para analista) |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Admin, Gestor (apenas rascunhos e agendados) |

---

## Critérios de Conclusão

- [ ] E-mails disparados para todos os eventos de chamado listados
- [ ] Destinatários corretos por evento (solicitante, responsáveis, analista, gestor)
- [ ] Conteúdo inline de e-mail ignorado no processamento Resend Inbound
- [ ] Resposta por e-mail adicionada ao histórico do chamado
- [ ] Endereço de reply único por chamado configurado no Resend
- [ ] Importação de feriados via BrasilAPI funcional (manual e automática)
- [ ] Cadastro manual de feriados funcionando
- [ ] Cron job de aviso de feriado enviando com N dias de antecedência
- [ ] Sem reenvio duplicado de aviso para o mesmo feriado e contato
- [ ] CRUD de comunicados com editor TipTap
- [ ] Todos os tipos de segmentação de destinatários funcionando
- [ ] Agendamento de comunicados com status correto
- [ ] Registro de envio com data e quantidade de destinatários
