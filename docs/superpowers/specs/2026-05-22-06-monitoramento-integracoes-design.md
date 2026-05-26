# Sub-spec 6: Monitoramento e Integrações Microsoft 365

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** [02-chamados-sla-design.md](2026-05-22-02-chamados-sla-design.md)  
**Bloqueia:** sub-spec 7

---

## Objetivo

Definir o módulo unificado de monitoramento — integrações externas (Zabbix e Azure Monitor via webhook) e verificação ativa de URLs — e as integrações com Microsoft 365: SSO via Azure AD e notificações no Microsoft Teams via Adaptive Cards.

---

## Módulos

### 1. Monitoramento — Integrações Externas (Zabbix e Azure Monitor)

Módulo extensível: suporta atualmente Zabbix e Azure Monitor. Novos conectores (Grafana, Datadog, Nagios) podem ser adicionados sem alteração de arquitetura.

#### Configuração por cliente

- Acessível pelo Admin e Gestor na tela do cliente
- Para cada ferramenta: tipo de conector, token de autenticação único gerado pelo sistema, status (ativo/inativo), janela de monitoramento e comportamento fora da janela
- Um cliente pode ter múltiplas integrações ativas simultaneamente (ex: Zabbix + Azure Monitor)

#### Janelas de monitoramento

| Tipo | Descrição |
|---|---|
| `24x7` | Qualquer alerta abre chamado a qualquer hora |
| `horario_comercial` | Reutiliza a janela de `platform_settings` (seg–sex, 9h–18h), respeitando feriados |
| `personalizado` | Dias e horários específicos definidos pelo Admin/Gestor |

#### Comportamento fora da janela

| Comportamento | Descrição |
|---|---|
| `descartar` | Alertas fora da janela ignorados silenciosamente |
| `aguardar_e_abrir` | Chamado criado assim que a janela iniciar, com registro do horário real do evento |

#### Feriados

- Respeita automaticamente o calendário de feriados (tabela `holidays`)
- Em feriados, aplica o comportamento "fora da janela" configurado

#### Endpoints de webhook

- Zabbix: `POST /api/webhooks/zabbix/{token}`
- Azure Monitor: `POST /api/webhooks/azure/{token}`
- Cada chamada valida o token contra `monitoring_integrations.webhook_token`

#### Fluxo de abertura automática

1. Valida o token → identifica a integração e o cliente
2. Verifica se cliente está bloqueado → descarta silenciosamente se bloqueado
3. Verifica a janela de monitoramento → aplica comportamento fora da janela se necessário
4. Mapeia severidade do alerta para prioridade do sistema (ver tabela abaixo)
5. Cria chamado com: título e descrição do alerta, prioridade mapeada, categoria `Incidente`, canal de entrada correspondente, `external_alert_id` com o ID do alerta da ferramenta
6. Registra entrada em `system_logs` categoria `webhook_received`

#### Fluxo de fechamento automático (recovery)

- Webhook de recovery no mesmo endpoint
- Sistema localiza chamado pelo `external_alert_id`
- Fecha o chamado com nota "Resolvido automaticamente via {Zabbix|Azure Monitor}"
- Se chamado já fechado manualmente: recovery ignorado silenciosamente
- Se chamado não encontrado: descartado silenciosamente

#### Mapeamento de severidade

| Severidade Zabbix | Severidade Azure Monitor | Prioridade no sistema |
|---|---|---|
| Disaster / High | Sev 0 / Critical | `critica` |
| Average | Sev 1 / Error | `alta` |
| Warning | Sev 2 / Warning | `media` |
| Information / Not classified | Sev 3 / Informational | `baixa` |

> Chamados originados por integrações de monitoramento estão **excluídos do fluxo de aprovação**.

---

### 2. Monitoramento de URLs

Verifica periodicamente se URLs de clientes estão respondendo.

#### Configuração por cliente

- Admin e Gestor cadastram URLs vinculadas a um cliente
- Campos: endereço, nome/descrição, intervalo de verificação (`5min` | `10min` | `15min` | `30min`), status (ativo/inativo)

#### Verificação

- Cron job executa requisição `HTTP GET` para cada URL ativa no intervalo configurado
- **UP:** resposta com status HTTP 2xx em até 10 segundos
- **DOWN:** erro 4xx, 5xx, timeout ou conexão recusada

#### Quando URL cair (DOWN)

- Chamado aberto automaticamente: título "Indisponibilidade detectada: {nome da URL}", categoria `Incidente`, prioridade `alta`, canal `url_monitoring`
- Notificação por e-mail: analista responsável + Gestor/Admin com flag `notify_new_tickets`
- Registro em `system_logs` categoria `url_monitoring`

#### Quando URL voltar (UP)

- Chamado correspondente fechado automaticamente com nota "URL voltou a responder normalmente"
- Se chamado já fechado manualmente: retorno ignorado silenciosamente

#### Painel de status

- Tela unificada exibindo: status atual (UP/DOWN) de todas as URLs monitoradas, alertas ativos das integrações externas, data/hora da última verificação, histórico de disponibilidade do dia

---

### 3. Integrações Microsoft 365

#### SSO com Microsoft (Azure AD / Entra ID)

- Usuários internos (Admin, Gestor, Analista) podem fazer login com conta Microsoft 365 via botão "Entrar com Microsoft"
- Implementado via **Supabase Auth com provedor OAuth Microsoft**
- O perfil (papel) do usuário continua gerenciado pelo Admin no sistema; SSO apenas autentica a identidade
- Usuários internos podem usar login tradicional (e-mail + senha) OU SSO com Microsoft — ambos coexistem
- SSO **não se aplica ao portal do cliente** — clientes usam sempre e-mail e senha
- Registro de login SSO em `system_logs` categoria `auth`

#### Notificações no Microsoft Teams

- Admin e Gestor configuram **Incoming Webhooks** do Teams (URLs geradas no canal desejado) nas Configurações da Plataforma
- Múltiplos webhooks configuráveis com canais diferentes por tipo de notificação
- Cada tipo de notificação pode ser ativado ou desativado individualmente

**Eventos que disparam notificação no Teams:**

| Evento | Conteúdo do card |
|---|---|
| Novo chamado aberto | Número, título, cliente, prioridade, link |
| SLA próximo de vencer | Chamado, prazo restante, analista responsável |
| SLA violado | Chamado, tempo de violação (card destacado) |
| URL indisponível | URL, cliente, horário da queda |
| URL voltou a responder | URL, cliente, normalização |
| Alerta Zabbix / Azure Monitor disparado | Origem, host/recurso, severidade, descrição |
| Chamado reaberto | Número, cliente, motivo da reabertura |

- Formato: **Adaptive Cards** do Teams com visual estruturado e link direto para o chamado
- Falha no envio ao Teams é registrada em `system_logs` mas não impede o fluxo principal

---

## Schema do Banco de Dados

### `public.monitoring_integrations`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `connector_type` | `text` NOT NULL | `zabbix` \| `azure_monitor` |
| `webhook_token` | `uuid` NOT NULL DEFAULT `gen_random_uuid()` UNIQUE | Token para autenticação do webhook |
| `window_type` | `text` NOT NULL DEFAULT `'horario_comercial'` | `24x7` \| `horario_comercial` \| `personalizado` |
| `window_custom_days` | `integer[]` | Dias da semana para janela personalizada |
| `window_custom_start` | `time` | Início da janela personalizada |
| `window_custom_end` | `time` | Fim da janela personalizada |
| `out_of_window_behavior` | `text` NOT NULL DEFAULT `'descartar'` | `descartar` \| `aguardar_e_abrir` |
| `is_active` | `boolean` DEFAULT `true` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.monitored_urls`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `url` | `text` NOT NULL | |
| `name` | `text` NOT NULL | Nome/descrição da URL |
| `check_interval_minutes` | `integer` NOT NULL DEFAULT `10` | `5` \| `10` \| `15` \| `30` |
| `last_checked_at` | `timestamptz` | |
| `last_status` | `text` | `up` \| `down` |
| `current_ticket_id` | `uuid` FK → `tickets.id` | Chamado ativo de indisponibilidade (nullable) |
| `is_active` | `boolean` DEFAULT `true` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.url_check_history`

Histórico de verificações de URL para o painel de status.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `monitored_url_id` | `uuid` NOT NULL FK → `monitored_urls.id` | |
| `checked_at` | `timestamptz` NOT NULL | |
| `status` | `text` NOT NULL | `up` \| `down` |
| `http_status_code` | `integer` | Código HTTP retornado (null em timeout) |
| `response_time_ms` | `integer` | Tempo de resposta em ms |
| `error_message` | `text` | Mensagem de erro em caso de DOWN |

---

### `public.teams_webhook_configs`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | Ex: "Canal Chamados", "Canal Monitoramento" |
| `webhook_url` | `text` NOT NULL | URL do Incoming Webhook do Teams |
| `is_active` | `boolean` DEFAULT `true` | |
| `notify_new_tickets` | `boolean` DEFAULT `true` | |
| `notify_sla_warning` | `boolean` DEFAULT `true` | |
| `notify_sla_breach` | `boolean` DEFAULT `true` | |
| `notify_url_down` | `boolean` DEFAULT `true` | |
| `notify_url_up` | `boolean` DEFAULT `false` | |
| `notify_monitoring_alert` | `boolean` DEFAULT `true` | |
| `notify_ticket_reopened` | `boolean` DEFAULT `false` | |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

## RLS Policies

### `monitoring_integrations`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Admin |

### `monitored_urls`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Admin, Gestor (soft delete via `is_active`) |

### `url_check_history`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT | Service role (cron job) |
| UPDATE / DELETE | Ninguém |

### `teams_webhook_configs`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Admin |

---

## Critérios de Conclusão

- [ ] Configuração de integrações por cliente (Zabbix e Azure Monitor) funcional
- [ ] Webhook Zabbix validando token e criando chamados com mapeamento de severidade correto
- [ ] Webhook Azure Monitor validando token e criando chamados
- [ ] Recovery automático fechando chamado pelo `external_alert_id`
- [ ] Janela de monitoramento aplicada corretamente (24x7, comercial, personalizada)
- [ ] Comportamento fora da janela (`descartar` e `aguardar_e_abrir`) funcional
- [ ] Respeito ao calendário de feriados nas janelas
- [ ] Chamados de monitoramento excluídos do fluxo de aprovação
- [ ] Cron de verificação de URLs rodando nos intervalos configurados
- [ ] Abertura automática de chamado ao detectar URL DOWN
- [ ] Fechamento automático ao detectar URL UP
- [ ] Painel de status unificado com URLs e alertas ativos
- [ ] Botão "Entrar com Microsoft" funcional via Supabase OAuth
- [ ] Login SSO e login tradicional coexistindo para usuários internos
- [ ] Configuração de webhooks Teams na tela de Configurações da Plataforma
- [ ] Adaptive Cards enviados para todos os eventos configurados
- [ ] Falha de envio ao Teams registrada em logs sem quebrar fluxo principal
