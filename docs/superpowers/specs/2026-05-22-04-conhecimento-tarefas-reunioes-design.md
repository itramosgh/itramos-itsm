# Sub-spec 4: Base de Conhecimento, Tarefas e Lembretes, Reuniões

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** [02-chamados-sla-design.md](2026-05-22-02-chamados-sla-design.md)  
**Bloqueia:** sub-spec 7

---

## Objetivo

Definir a base de conhecimento (artigos de resolução e documentos por cliente), o módulo de tarefas e lembretes com recorrência, e o registro de reuniões com geração de atas e conversão de itens de ação em tarefas.

---

## Módulos

### 1. Base de Conhecimento

#### Artigos de resolução

- Criados a partir de chamados fechados ou diretamente por Admin e Gestor
- Campos: título, descrição do problema, solução aplicada, categoria (herdada do chamado de origem), tags, link ao chamado de origem (opcional)
- Analistas só criam artigos via encerramento de chamado (tela de fechamento com opção "Salvar na base de conhecimento")
- Admin e Gestor podem criar, editar e ativar/desativar artigos diretamente
- Analistas têm acesso de leitura
- Desativação sem exclusão permanente (`is_active = false`)

**Sugestão automática durante abertura no portal:**
- Conforme o solicitante digita título/descrição, busca artigos similares via `pg_trgm`
- Artigos relevantes exibidos ao lado do formulário com a pergunta "Isso resolve seu problema?"
- Se confirmar resolução: chamado não é aberto; evento registrado como "resolvido por base de conhecimento" nas estatísticas
- Se ignorar: formulário continua normalmente

**Sugestão automática para o analista:**
- Ao abrir um chamado para atendimento, o sistema exibe os artigos com maior similaridade ao título e descrição
- Analista pode aplicar a solução com um clique, preenchendo o campo de resolução (editável antes de confirmar)

**Vincular artigo ao chamado (a qualquer momento):**
- Ver detalhamento em sub-spec 2 (seção "Vincular artigo da base de conhecimento")
- E-mail com pergunta "Isso resolveu?" enviado ao solicitante com botões de resposta

#### Documentos e procedimentos por cliente

- Admin e Gestor criam documentos vinculados a um cliente específico
- Campos: título, conteúdo (TipTap), categoria, data de publicação, cliente vinculado
- Upload de arquivos anexos (PDF, imagens) por documento — Supabase Storage, bucket `kb-documents`
- No portal do cliente: seção dedicada exibe apenas os documentos da empresa do cliente autenticado, organizados por categoria e pesquisáveis
- Analistas têm acesso de leitura a todos os documentos pelo painel interno

#### Gestão da base

- Tela no painel interno: listar, buscar, editar e ativar/desativar artigos e documentos
- Acesso de leitura para Analistas; criação, edição e desativação para Gestor e Admin

---

### 2. Tarefas e Lembretes

Módulo leve para registrar compromissos e pendências vinculados a clientes.

#### Criação de tarefa

| Campo | Descrição |
|---|---|
| Título | Texto obrigatório |
| Descrição | Texto livre opcional |
| Cliente vinculado | FK → `companies.id` |
| Responsável | FK → `profiles.id` (Analista, Gestor ou Admin) |
| Data de vencimento | Date obrigatório |
| Prioridade | `alta` \| `media` \| `baixa` (opcional) |
| Antecedência do lembrete | Número de dias antes do vencimento (padrão: 3) |

**Permissões de criação:**
- Gestor e Admin: criam tarefas para qualquer responsável
- Analista: cria tarefas atribuídas apenas a si mesmo

#### Recorrência

| Tipo | Comportamento |
|---|---|
| `diaria` | Repete todo dia |
| `semanal` | Repete no mesmo dia da semana |
| `mensal` | Repete no mesmo dia do mês |
| `anual` | Repete na mesma data todo ano |

- Ao concluir uma tarefa recorrente: sistema cria automaticamente a próxima ocorrência com nova data de vencimento calculada
- Recorrência pode ser encerrada a qualquer momento pelo responsável, Gestor ou Admin

#### Alertas

- Cron job diário envia e-mail de lembrete para o responsável X dias antes do vencimento (conforme `reminder_days_before`)
- Segundo lembrete no próprio dia do vencimento
- Tarefas vencidas e não concluídas aparecem em destaque na tela principal para todos os perfis internos

#### Gestão

- Lista filtrável por status (`pendente` | `concluida` | `vencida`), cliente e responsável
- Histórico de tarefas concluídas vinculado ao cliente

---

### 3. Reuniões

Módulo para registrar reuniões com clientes, gerar atas e converter itens de ação em tarefas.

#### Registro de reunião

| Campo | Descrição |
|---|---|
| Título / pauta | Texto obrigatório |
| Data e hora | Datetime obrigatório |
| Cliente vinculado | FK → `companies.id` |
| Participantes internos | Seleção de `profiles` |
| Participantes externos | Contatos cadastrados do cliente ou e-mails livres |
| Anotações e decisões | Editor TipTap |
| Itens de ação | Lista com responsável (interno ou externo) e prazo |

#### Ata de reunião

- Ao finalizar o registro: sistema gera ata formatada com identidade visual da ITRAMOS
- Botão "Enviar ata": dispara e-mail para todos os participantes listados com ata no corpo do e-mail e opção de PDF anexo (gerado via `@react-pdf/renderer`)
- O cliente pode consultar histórico de reuniões e atas no portal

#### Itens de ação

- Cada item pode ser convertido em tarefa no módulo de Tarefas com um clique
- Tarefa criada mantém vínculo com a reunião de origem
- Itens de ação aparecem no histórico da reunião com status (`pendente` | `concluido`)

#### Visibilidade

- Próximas reuniões agendadas aparecem na tela principal junto com chamados agendados e GMUDs
- Gestor e Admin veem todas as reuniões
- Analistas veem apenas reuniões em que estão listados como participantes internos

---

## Schema do Banco de Dados

### `public.kb_articles`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` NOT NULL | |
| `problem_description` | `text` | |
| `solution` | `text` | |
| `category_id` | `uuid` FK → `ticket_categories.id` | |
| `tags` | `text[]` | |
| `origin_ticket_id` | `uuid` FK → `tickets.id` | Chamado de origem (nullable) |
| `is_active` | `boolean` DEFAULT `true` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.kb_documents`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `title` | `text` NOT NULL | |
| `content_rich_text` | `jsonb` | Conteúdo TipTap |
| `content_html` | `text` | HTML gerado |
| `category` | `text` | |
| `published_at` | `date` | |
| `is_active` | `boolean` DEFAULT `true` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.kb_document_attachments`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `document_id` | `uuid` NOT NULL FK → `kb_documents.id` | |
| `filename` | `text` NOT NULL | |
| `storage_path` | `text` NOT NULL | |
| `size_bytes` | `integer` | |
| `mime_type` | `text` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.tasks`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` NOT NULL | |
| `description` | `text` | |
| `company_id` | `uuid` FK → `companies.id` | |
| `assigned_to` | `uuid` NOT NULL FK → `profiles.id` | |
| `due_date` | `date` NOT NULL | |
| `priority` | `text` | `alta` \| `media` \| `baixa` |
| `status` | `text` NOT NULL DEFAULT `'pendente'` | `pendente` \| `concluida` \| `vencida` |
| `reminder_days_before` | `integer` DEFAULT `3` | |
| `is_recurring` | `boolean` DEFAULT `false` | |
| `recurrence_type` | `text` | `diaria` \| `semanal` \| `mensal` \| `anual` |
| `recurrence_active` | `boolean` DEFAULT `true` | |
| `parent_task_id` | `uuid` FK → `tasks.id` | Tarefa pai para recorrências |
| `origin_meeting_id` | `uuid` FK → `meetings.id` | Vínculo com reunião de origem |
| `origin_action_item_id` | `uuid` FK → `meeting_action_items.id` | |
| `completed_at` | `timestamptz` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.meetings`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `title` | `text` NOT NULL | |
| `scheduled_at` | `timestamptz` NOT NULL | |
| `notes_rich_text` | `jsonb` | Conteúdo TipTap |
| `notes_html` | `text` | |
| `status` | `text` NOT NULL DEFAULT `'agendada'` | `agendada` \| `realizada` \| `cancelada` |
| `minutes_sent_at` | `timestamptz` | Data do envio da ata |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.meeting_participants`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `meeting_id` | `uuid` NOT NULL FK → `meetings.id` | |
| `profile_id` | `uuid` FK → `profiles.id` | Participante interno (nullable) |
| `contact_id` | `uuid` FK → `contacts.id` | Contato cadastrado (nullable) |
| `external_email` | `text` | E-mail livre para não cadastrados (nullable) |
| `external_name` | `text` | Nome para não cadastrados (nullable) |

---

### `public.meeting_action_items`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `meeting_id` | `uuid` NOT NULL FK → `meetings.id` | |
| `description` | `text` NOT NULL | |
| `responsible_profile_id` | `uuid` FK → `profiles.id` | |
| `responsible_contact_id` | `uuid` FK → `contacts.id` | |
| `responsible_external_email` | `text` | |
| `due_date` | `date` | |
| `status` | `text` NOT NULL DEFAULT `'pendente'` | `pendente` \| `concluido` |
| `converted_to_task_id` | `uuid` FK → `tasks.id` | Preenchido ao converter em tarefa |

---

## RLS Policies

### `kb_articles`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista; Cliente (apenas artigos ativos — para sugestão no portal) |
| INSERT / UPDATE | Admin, Gestor; Analista via service role no encerramento de chamado |
| DELETE | Ninguém (soft delete via `is_active`) |

### `kb_documents`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista veem todos; Cliente vê apenas documentos da própria empresa (`company_id`) |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Ninguém (soft delete via `is_active`) |

### `tasks`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor veem todas; Analista vê apenas as suas |
| INSERT | Admin, Gestor (qualquer responsável); Analista (apenas `assigned_to = auth.uid()`) |
| UPDATE | Admin, Gestor atualizam qualquer; Analista atualiza apenas as suas |
| DELETE | Admin, Gestor (soft delete via `status = 'cancelada'`) |

### `meetings`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor veem todas; Analista vê apenas as que participa (via `meeting_participants`) |
| INSERT / UPDATE | Admin, Gestor, Analista (nas que participa) |
| DELETE | Admin, Gestor |

---

## Critérios de Conclusão

- [ ] CRUD de artigos da base de conhecimento com busca por `pg_trgm`
- [ ] Sugestão automática de artigos durante abertura no portal
- [ ] Sugestão automática para analista ao abrir chamado
- [ ] Vinculação de artigo ao chamado com e-mail "Isso resolveu?" funcional
- [ ] Fechamento automático via confirmação do solicitante
- [ ] CRUD de documentos por cliente com upload de anexos
- [ ] Documentos visíveis no portal apenas para o cliente vinculado
- [ ] CRUD de tarefas com permissões corretas por papel
- [ ] Recorrência implementada com criação automática da próxima ocorrência
- [ ] Cron de lembrete de tarefas enviando e-mail X dias antes e no dia do vencimento
- [ ] Tarefas vencidas em destaque na tela principal
- [ ] Registro de reuniões com participantes internos e externos
- [ ] Geração de ata em PDF e envio por e-mail aos participantes
- [ ] Conversão de item de ação em tarefa mantendo vínculo com reunião
- [ ] Reuniões próximas na tela principal (analista vê apenas as suas)
