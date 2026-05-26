# Sub-spec 2: Chamados, Engine de SLA e Canais de Entrada

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** [01-fundacao-design.md](2026-05-22-01-fundacao-design.md)  
**Bloqueia:** sub-specs 3, 4, 5, 6 e 7

---

## Objetivo

Definir o ciclo de vida completo dos chamados (tickets), a engine de SLA com cálculo em horário comercial e 24x7, e todos os canais de entrada — portal web, e-mail, Zabbix, Azure Monitor e monitoramento de URL.

---

## Módulos

### 1. Chamados (Tickets)

#### Dados do chamado

| Campo | Descrição |
|---|---|
| Número | Gerado automaticamente, sequencial, único (ex: `#1001`) |
| Título | Texto livre obrigatório |
| Descrição | Texto rico (TipTap) com suporte a formatação básica |
| Categoria | `Suporte Técnico` \| `Incidente` \| `Solicitação de Serviço` \| `Mudança de Infraestrutura` \| `Criação de Site Institucional` \| `Landing Page` \| `Agente de IA` |
| Prioridade | `Crítica` \| `Alta` \| `Média` \| `Baixa` |
| Status | Ver fluxo de status abaixo |
| Canal de entrada | `portal` \| `email` \| `zabbix` \| `azure_monitor` \| `url_monitoring` |
| Empresa | FK → `companies.id` |
| Contato solicitante | FK → `contacts.id` |
| Contrato | FK → `contracts.id` (determina regras de SLA) |
| Analista responsável | FK → `profiles.id` (nullable — pode ser não atribuído) |
| Datas | Abertura, última atualização, fechamento |
| Agendamento | Data e hora do atendimento agendado (nullable) |
| External alert ID | ID do alerta externo para Zabbix / Azure Monitor (nullable) |

#### Fluxo de status

```
Aberto → Em Andamento → Aguardando Cliente → Fechado
         ↓                                   ↑
         Agendado → Em Andamento             Reaberto (até 7 dias)
         ↓
         Aguardando Fornecedor
         ↓
         Aguardando Aprovação → Em Andamento (aprovado)
                             → Fechado (reprovado ou timeout 2 dias)
         ↓
         Em Mudança → Em Andamento (GMUD revertida)
                    → Fechado (GMUD concluída, se confirmado)
         ↓
         Resolvido → Fechado
```

Todos os 10 status possíveis: `aberto` | `agendado` | `em_andamento` | `aguardando_cliente` | `aguardando_fornecedor` | `aguardando_aprovacao` | `em_mudanca` | `resolvido` | `fechado` | `reaberto`

#### Histórico de interações

Cada interação registra: tipo (`mensagem` | `status_change` | `assignment` | `system`), conteúdo, autor (profile ou contact ou sistema), data/hora.

Interações de sistema são geradas automaticamente para eventos como: fechamento automático, reabertura, mudança de status via cron.

#### Anexos

- Podem ser adicionados na abertura e em qualquer interação posterior
- Armazenados no Supabase Storage no bucket `ticket-attachments`
- Path: `{ticket_id}/{interaction_id}/{filename}`
- Referência marcada como removida (soft delete) na limpeza de storage

#### Agendamento

- Status `agendado` exige data e hora obrigatórias (o status só é salvo após preenchimento)
- 15 minutos antes do horário: cron envia e-mail de lembrete ao analista e ao solicitante
- No horário agendado: cron muda status automaticamente para `em_andamento`
- A data e hora agendada ficam visíveis na lista de chamados com destaque visual

#### Fluxo de aprovação

- O Administrador marca categorias como `requer_aprovacao` na tabela `ticket_categories`
- O fluxo é acionado quando o analista **categoriza** o chamado com uma categoria que exige aprovação
- **Excluídos do fluxo:** chamados originados por `zabbix`, `azure_monitor` e `url_monitoring`
- Ao acionar: modal para o analista definir o aprovador (contato cadastrado OU e-mail manual)
- O chamado muda para `aguardando_aprovacao` e o analista fica bloqueado de enviar respostas
- **Exceção:** se e-mail do aprovador = e-mail do solicitante → aprovação automática, sem envio de e-mail; histórico registra "Aprovado automaticamente — solicitante e aprovador são a mesma pessoa"
- Se aprovado → analista notificado, chamado liberado para `em_andamento`
- Se reprovado → analista e cliente notificados com motivo; chamado volta ao status anterior
- Se `aguardando_aprovacao` por mais de 2 dias → encerramento automático; nota "Chamado encerrado por ausência de aprovação após 2 dias"; solicitante, analista e Gestor notificados por e-mail
- **Reforço para chamados por e-mail:** palavras-chave `liberar`, `acesso`, `instalar`, `autorização` no título/corpo → destaque visual no chamado sem acionar o fluxo automaticamente

#### Templates de resposta

- Admin e Gestor criam templates com variáveis `{{nome_da_variavel}}`
- Templates organizados por categoria (ex: Acesso, Instalação, Informativo, Senha Temporária)
- Ao usar um template, o analista vê formulário apenas com os campos variáveis (sem texto completo para edição livre)
- Variáveis preenchidas automaticamente pelo sistema: `{{nome_cliente}}`, `{{numero_chamado}}`, `{{nome_analista}}`, `{{data_hoje}}`
- Analistas apenas utilizam; Admin e Gestor criam, editam e desativam

#### Vincular artigo da base de conhecimento

- O analista busca e vincula artigos em qualquer momento do atendimento
- Ao vincular: e-mail automático ao solicitante com título, resumo e link do artigo + pergunta "Isso resolveu seu problema?" com botões **Sim, resolvido** / **Não, ainda preciso de ajuda**
- "Sim" → chamado fechado automaticamente com nota "Resolvido via artigo da base de conhecimento"
- "Não" → chamado continua; analista notificado
- Artigos vinculados ficam visíveis no histórico

#### Encerramento e criação de artigo

- Ao fechar, o analista preenche o campo de resolução
- Opção **"Salvar na base de conhecimento"**: analista revisa título e descrição antes de confirmar
- Artigo criado já vinculado ao chamado de origem, com categoria herdada

#### Reabertura

- Chamado fechado pode ser reaberto pelo cliente ou analista em até **7 dias** após o fechamento
- Após 7 dias: sem reabertura — novo chamado deve ser aberto
- Cada reabertura gera evento no histórico: data, quem reabriu, motivo
- Chamados reabertos voltam ao status `reaberto` e contam separadamente nas estatísticas

#### Busca e filtros

- Busca por número, título, descrição e nome do solicitante via `pg_trgm` / full-text search
- Filtros combinativos: categoria, prioridade, status, analista, empresa e período de abertura
- Resultados em tempo real
- Disponível na visão interna e no portal (restrito aos chamados da própria empresa)

#### Regras automáticas — Aguardando Cliente

- A cada **24 horas** no status `aguardando_cliente`: e-mail ao solicitante (e responsável com flag ativa) pedindo retorno com link direto
- Se sem resposta por **2 dias**: fechamento automático com nota "Chamado encerrado por falta de retorno do cliente após 2 dias de espera"; analista e Gestor notificados
- Se o cliente responder (e-mail ou portal) antes dos 2 dias: ciclo interrompido, status volta para `em_andamento`

---

### 2. Engine de SLA

- SLA mede exclusivamente o **prazo de primeira resposta** (primeiro contato do analista com o cliente após abertura)
- Prazo configurado por contrato e por prioridade, em horas (tabela `contract_sla_rules`)
- Cada cliente tem seus próprios valores — sem abstração de tiers

#### Modos de contagem

**Contratos sem flag 24x7:**
- Cronômetro corre apenas dentro do horário comercial definido em `platform_settings`
- Pausa automaticamente em feriados nacionais e municipais do calendário cadastrado
- Pausa em finais de semana se não incluídos em `business_hours_days`

**Contratos com flag 24x7:**
- Cronômetro corre continuamente, sem pausas por horário, feriados ou fim de semana

**Pausa por status:**
- Cronômetro pausa enquanto status = `aguardando_fornecedor`
- Retoma automaticamente ao sair deste status

#### Eventos registrados por chamado

| Campo | Descrição |
|---|---|
| `sla_deadline` | Timestamp do prazo de vencimento calculado |
| `sla_first_response_at` | Timestamp da primeira resposta do analista |
| `sla_met` | `true` se respondido dentro do prazo |
| `sla_breach_minutes` | Minutos de atraso (null se cumprido) |

#### Alertas de SLA

- **Próximo de vencer:** alerta para analista e Gestor quando restam menos de 20% do prazo
- **Violado:** alerta para analista e Gestor quando o prazo vence sem primeira resposta

---

### 3. Canais de Entrada

#### Portal Web — auto-cadastro

- Tela de login do portal tem botão "Criar conta"
- Solicita nome e e-mail
- Se domínio cadastrado em empresa ativa → cadastro permitido; usuário define senha e é criado como contato da empresa (sem flags especiais)
- Se domínio não encontrado ou empresa inativa → cadastro negado; exibe WhatsApp da ITRAMOS com botão para WhatsApp Web
- Após auto-cadastro, Admin pode ajustar flags do contato

#### Portal Web — área autenticada

- Cliente abre chamados, acompanha status, recebe atualizações e reabre chamados dentro do prazo
- Visibilidade restrita aos chamados da própria empresa
- **Botão flutuante WhatsApp** no canto inferior direito de todas as telas do portal (incluindo login)

#### E-mail — solicitante conhecido

- E-mail dedicado para abertura de chamados (ex: `suporte@itramos.com.br`) via Resend Inbound
- E-mails de remetentes cadastrados criam chamado automaticamente
- Assunto → título do chamado; corpo → descrição

#### E-mail — solicitante desconhecido

- Se remetente não cadastrado mas domínio pertence a empresa ativa:
  - Sistema responde solicitando: nome completo, telefone, departamento e se o telefone é WhatsApp
  - Após resposta: contato criado (sem flags especiais), chamado original aberto
  - E-mail de boas-vindas com **link para definir senha** (validade 24h)
  - Até **2 lembretes** com intervalo de 7 dias (novo link, validade 24h); após segundo lembrete sem resposta, envios automáticos cessam
  - Admin e Gestor podem clicar **"Reenviar e-mail de definição de senha"** a qualquer momento no cadastro do contato
- Se remetente mencionar ser responsável pelo contrato: ignorado no auto-cadastro; somente Admin e Gestor atribuem essa flag
- Se domínio não cadastrado: e-mail descartado com resposta informando que o endereço não é reconhecido

#### Zabbix (ver sub-spec 6 para configuração completa)

- Chamados criados via webhook; canal de entrada = `zabbix`
- Excluídos do fluxo de aprovação

#### Azure Monitor (ver sub-spec 6 para configuração completa)

- Chamados criados via webhook; canal de entrada = `azure_monitor`
- Excluídos do fluxo de aprovação

#### Monitoramento de URL (ver sub-spec 6 para configuração completa)

- Chamados criados por cron de verificação; canal de entrada = `url_monitoring`
- Excluídos do fluxo de aprovação

---

## Schema do Banco de Dados

### `public.ticket_categories`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | Ex: `Suporte Técnico` |
| `slug` | `text` NOT NULL UNIQUE | Ex: `suporte_tecnico` |
| `requires_approval` | `boolean` DEFAULT `false` | Aciona fluxo de aprovação |
| `is_active` | `boolean` DEFAULT `true` | |

---

### `public.tickets`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `number` | `integer` NOT NULL UNIQUE GENERATED ALWAYS AS IDENTITY` | Número sequencial |
| `title` | `text` NOT NULL | |
| `description` | `text` | |
| `category_id` | `uuid` FK → `ticket_categories.id` | |
| `priority` | `text` NOT NULL | `critica` \| `alta` \| `media` \| `baixa` |
| `status` | `text` NOT NULL DEFAULT `'aberto'` | Ver enum acima |
| `channel` | `text` NOT NULL | `portal` \| `email` \| `zabbix` \| `azure_monitor` \| `url_monitoring` |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `contact_id` | `uuid` NOT NULL FK → `contacts.id` | Solicitante |
| `contract_id` | `uuid` FK → `contracts.id` | |
| `assigned_to` | `uuid` FK → `profiles.id` | Analista responsável (nullable) |
| `scheduled_at` | `timestamptz` | Data/hora do agendamento (nullable) |
| `external_alert_id` | `text` | ID do alerta Zabbix / Azure Monitor |
| `sla_deadline` | `timestamptz` | Prazo de SLA calculado |
| `sla_first_response_at` | `timestamptz` | Primeira resposta do analista |
| `sla_met` | `boolean` | `true` se SLA cumprido |
| `sla_breach_minutes` | `integer` | Minutos de atraso (null se cumprido) |
| `sla_paused_at` | `timestamptz` | Início da última pausa do cronômetro |
| `sla_paused_minutes` | `integer` DEFAULT `0` | Total de minutos pausados |
| `billing_status` | `text` | `pendente` \| `cobrado` (nullable — apenas chamados com custo) |
| `closed_at` | `timestamptz` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_interactions`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL FK → `tickets.id` | |
| `type` | `text` NOT NULL | `mensagem` \| `status_change` \| `assignment` \| `system` |
| `content` | `text` | Conteúdo da mensagem ou nota de sistema |
| `author_profile_id` | `uuid` FK → `profiles.id` | Preenchido se autor é usuário interno |
| `author_contact_id` | `uuid` FK → `contacts.id` | Preenchido se autor é contato/cliente |
| `is_system` | `boolean` DEFAULT `false` | Gerado automaticamente pelo sistema |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_attachments`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL FK → `tickets.id` | |
| `interaction_id` | `uuid` FK → `ticket_interactions.id` | |
| `filename` | `text` NOT NULL | Nome original do arquivo |
| `storage_path` | `text` NOT NULL | Path no Supabase Storage |
| `size_bytes` | `integer` | |
| `mime_type` | `text` | |
| `is_deleted` | `boolean` DEFAULT `false` | Soft delete (limpeza de storage) |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_reopens`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL FK → `tickets.id` | |
| `reopened_by_profile_id` | `uuid` FK → `profiles.id` | |
| `reopened_by_contact_id` | `uuid` FK → `contacts.id` | |
| `reason` | `text` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_approvals`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL FK → `tickets.id` | |
| `approver_contact_id` | `uuid` FK → `contacts.id` | Contato cadastrado (nullable) |
| `approver_email` | `text` NOT NULL | E-mail do aprovador |
| `token` | `uuid` NOT NULL DEFAULT `gen_random_uuid()` | Token para links de aprovação/reprovação |
| `status` | `text` NOT NULL DEFAULT `'pendente'` | `pendente` \| `aprovado` \| `reprovado` \| `expirado` \| `automatico` |
| `response_reason` | `text` | Motivo da reprovação (nullable) |
| `responded_at` | `timestamptz` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.response_templates`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | |
| `category` | `text` | Ex: `Acesso`, `Instalação`, `Senha Temporária` |
| `body` | `text` NOT NULL | Corpo com `{{variaveis}}` |
| `variables` | `jsonb` | Array de `{ key, label, auto_filled }` |
| `is_active` | `boolean` DEFAULT `true` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_kb_links`

Artigos da base de conhecimento vinculados a chamados.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL FK → `tickets.id` | |
| `kb_article_id` | `uuid` NOT NULL FK → `kb_articles.id` | |
| `linked_by` | `uuid` FK → `profiles.id` | Analista que vinculou |
| `resolution_confirmed` | `boolean` | `true` se solicitante confirmou resolução |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

## RLS Policies

### `tickets`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor/Analista veem todos; Cliente vê apenas chamados onde `company_id` = empresa do contato autenticado |
| INSERT | Admin, Gestor, Analista (via painel); Service role (via e-mail e webhooks) |
| UPDATE | Admin, Gestor atualizam qualquer campo; Analista atualiza chamados atribuídos a si ou sem atribuição; Cliente não atualiza diretamente |
| DELETE | Ninguém (soft delete via status `fechado`) |

### `ticket_interactions`

| Operação | Quem pode |
|---|---|
| SELECT | Mesmas regras de `tickets` — visibilidade vinculada ao chamado pai |
| INSERT | Admin, Gestor, Analista, Cliente (interações identificadas pelo `author_*`); Service role para interações de sistema |
| UPDATE / DELETE | Ninguém |

### `ticket_attachments`

| Operação | Quem pode |
|---|---|
| SELECT | Mesmas regras de visibilidade do chamado pai |
| INSERT | Admin, Gestor, Analista, Service role |
| UPDATE | Service role (soft delete) |
| DELETE | Ninguém |

### `ticket_approvals`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor; Analista vê aprovações dos próprios chamados |
| INSERT / UPDATE | Service role |
| DELETE | Ninguém |

### `response_templates`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Ninguém (soft delete via `is_active`) |

---

## Critérios de Conclusão

- [ ] CRUD de chamados com todos os campos obrigatórios
- [ ] Fluxo de status implementado com transições válidas
- [ ] Histórico de interações completo (mensagens, status, sistema)
- [ ] Upload e visualização de anexos funcionando
- [ ] Agendamento com seletor obrigatório de data/hora
- [ ] Cron de lembrete 15min antes do agendamento enviando e-mail
- [ ] Cron de mudança automática de status no horário agendado
- [ ] Fluxo de aprovação completo (modal, e-mail com links, aprovação/reprovação, timeout 2 dias)
- [ ] Exceção de aprovação automática quando solicitante = aprovador
- [ ] Fluxo de "Aguardando Cliente" com lembrete 24h e fechamento automático em 2 dias
- [ ] Reabertura funcional com validação de 7 dias
- [ ] Engine de SLA calculando prazo em horário comercial e 24x7
- [ ] Pausa/retomada de SLA em `aguardando_fornecedor`
- [ ] Alertas de SLA (próximo de vencer + violado)
- [ ] Portal de auto-cadastro com validação de domínio
- [ ] Abertura de chamados via e-mail (Resend Inbound) para remetentes conhecidos
- [ ] Fluxo de cadastro automático para remetentes desconhecidos com domínio válido
- [ ] Busca e filtros funcionando em tempo real
- [ ] Todas as tabelas criadas via migration com constraints e indexes corretos
- [ ] RLS ativo e testado para todos os papéis
