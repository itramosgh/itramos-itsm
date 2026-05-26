# Sub-spec 7: Relatórios, Dashboards e Alertas de Recorrência

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** sub-specs 2, 3, 4, 5 e 6  
**Bloqueia:** nenhum (último sub-spec)

---

## Objetivo

Definir todos os dashboards internos, a tela principal com agendamentos e GMUDs, o relatório mensal em PDF enviado automaticamente aos clientes, e o sistema de alerta de problema recorrente baseado em similaridade de texto via `pg_trgm`.

---

## Módulos

### 1. Tela Principal (todos os perfis internos)

#### Seção de agendamentos

- Chamados com status `agendado` ordenados por data/hora do agendamento
- Exibe: número, título, cliente, analista responsável, data e hora agendada
- Chamados com agendamento nas próximas **2 horas** destacados visualmente
- Analistas veem apenas os chamados agendados atribuídos a si
- Gestor e Admin veem todos

#### Seção de GMUDs próximas

- GMUDs com status `aprovada` ou `em_execucao` organizadas por janela de manutenção
- Exibe: título, cliente, nível de risco, início da janela, responsável
- Analistas veem apenas as GMUDs onde são responsáveis pela execução
- Gestor e Admin veem todas

#### Seção de reuniões próximas

- Reuniões com status `agendada` ordenadas por data/hora
- Analistas veem apenas as reuniões em que estão listados como participantes
- Gestor e Admin veem todas

#### Tarefas vencidas em destaque

- Tarefas com `status = 'vencida'` (ou `due_date < hoje` e `status = 'pendente'`) destacadas para todos os perfis internos

#### Chamados com cobrança pendente (Gestor e Admin)

- Lista de chamados com `billing_status = 'pendente'` em destaque

---

### 2. Dashboard Operacional (Gestor e Admin)

Filtros disponíveis em todos os cards: período de datas (padrão: últimos 30 dias).

#### Chamados

- Contagem por status: abertos, em andamento, aguardando cliente, fechados, reabertos
- Tempo médio de primeira resposta (por período, analista e cliente)
- SLA cumprido vs. violado — quantidade e percentual
- Taxa de reabertura por cliente e categoria
- Distribuição por categoria, prioridade e analista
- Chamados abertos há mais de X dias sem atualização (configurável — ex: 5 dias)

#### Contratos

- Contratos próximos do vencimento: alertas para 30, 60 e 90 dias com nome do cliente e data de vencimento

---

### 3. Dashboard de Mudanças (Gestor e Admin)

- GMUDs por status e por período
- GMUDs revertidas com motivo — identifica padrões de falha
- Próximas janelas de manutenção agendadas

---

### 4. Dashboard de Monitoramento (Gestor e Admin)

Exibido apenas quando há pelo menos uma integração ativa (Zabbix, Azure Monitor ou URL).

- Chamados abertos automaticamente por período, cliente, conector e severidade
- Tempo médio entre abertura e fechamento automático (MTTR — Mean Time To Resolve)
- Chamados de monitoramento ainda abertos (problema não resolvido na fonte)
- Alertas mais frequentes por cliente e por conector

---

### 5. Alerta de Problema Recorrente

Quando um novo chamado é aberto, o sistema verifica automaticamente se existem chamados similares do mesmo cliente no período configurado.

#### Lógica de detecção

- Similaridade detectada via `pg_trgm` (extensão nativa no Supabase) — busca por trigrama no título do chamado
- Parâmetros configuráveis em `platform_settings`:
  - `recurrence_min_tickets`: número mínimo de chamados similares (padrão: 3)
  - `recurrence_window_days`: janela de tempo em dias (padrão: 30)
- A verificação roda na abertura de qualquer chamado, independentemente do canal de entrada

#### Ação ao detectar recorrência

- E-mail de alerta (template `alerta_recorrencia`) para: **Gestor** + **analista responsável pelo chamado atual**
- Conteúdo: padrão detectado, lista dos chamados anteriores similares (número, título, data, link)
- Notificação visual no dashboard interno para Gestor e Admin

---

### 6. Relatório Mensal do Cliente (PDF)

#### Geração automática

- Gerado no **primeiro dia útil de cada mês**, referente aos 30 dias anteriores
- Cron job: verifica se o dia atual é o primeiro dia útil do mês (excluindo feriados do calendário)
- Enviado por e-mail via Resend para o(s) responsável(is) do contrato (`is_contract_responsible = true`)
- Template de e-mail: `relatorio_mensal` (com PDF anexo)

#### Geração sob demanda

- Gestor ou Admin pode gerar o relatório para qualquer cliente e período pelo painel
- Opção de baixar o PDF ou enviar por e-mail ao cliente com um clique

#### Conteúdo do relatório PDF

Gerado com `@react-pdf/renderer` no servidor.

**Cabeçalho:**
- Logo da ITRAMOS (versão para tema claro, de `platform_settings.logo_light_url`)
- Nome do cliente e período de referência

**Resumo executivo:**
- Total de chamados abertos no período
- Total de chamados fechados no período
- Taxa de SLA cumprido (percentual)
- Taxa de reabertura

**Gráficos** (gerados como SVG no servidor, embutidos no PDF):
- Chamados por categoria
- Chamados por prioridade
- Chamados por status

**Tabela detalhada de chamados:**
- Colunas: número, título, categoria, prioridade, data de abertura, data de fechamento, analista responsável, status final
- Chamados reabertos destacados na tabela

**Seção de reuniões** (exibida apenas se houver reuniões no período):
- Lista com data, pauta e itens de ação gerados

**Seção de mudanças — GMUD** (exibida apenas se houver GMUDs no período):
- Mudanças realizadas, status final (concluída/revertida) e janela de manutenção

**Seção de monitoramento** (exibida apenas para clientes com integração ativa):
- Total de alertas disparados por conector
- Total resolvidos automaticamente
- MTTR médio
- Tabela dos principais eventos do período

---

## Schema do Banco de Dados

Não há novas tabelas para este sub-spec. O dashboard e o relatório leem os dados das tabelas já definidas nos sub-specs 1 a 6.

### View auxiliar sugerida: `v_ticket_sla_summary`

View materializada ou função para otimizar consultas de SLA no dashboard, agrupando por período, analista e cliente.

```sql
-- Exemplo de estrutura (não-normativo)
-- Criada via migration como view ou computed via query no servidor
SELECT
  date_trunc('day', created_at) AS day,
  assigned_to,
  company_id,
  count(*) AS total,
  count(*) FILTER (WHERE sla_met = true) AS sla_met_count,
  count(*) FILTER (WHERE sla_met = false) AS sla_breach_count,
  avg(sla_breach_minutes) FILTER (WHERE sla_met = false) AS avg_breach_minutes
FROM tickets
GROUP BY 1, 2, 3;
```

### Índices adicionais recomendados

Para suportar as queries de dashboard e `pg_trgm` de recorrência:

```sql
-- Index GIN para busca por similaridade de chamados recorrentes
CREATE INDEX idx_tickets_title_trgm ON tickets USING gin(title gin_trgm_ops);

-- Index para consultas de dashboard por período
CREATE INDEX idx_tickets_created_at ON tickets (created_at, company_id, assigned_to, status);

-- Index para relatório mensal
CREATE INDEX idx_tickets_closed_at ON tickets (closed_at, company_id) WHERE closed_at IS NOT NULL;
```

---

## RLS Policies

Os dashboards e relatórios leem das tabelas já definidas nos sub-specs anteriores com as policies existentes. Não há novas tabelas com RLS a definir.

A geração do PDF ocorre via Server Action ou API Route com `SUPABASE_SERVICE_ROLE_KEY` — sem exposição ao cliente.

---

## Critérios de Conclusão

- [ ] Tela principal exibindo agendamentos, GMUDs, reuniões e tarefas vencidas com regras de visibilidade corretas por papel
- [ ] Dashboard operacional com todos os cards de chamados e contratos
- [ ] Alertas de contratos próximos do vencimento (30, 60 e 90 dias)
- [ ] Dashboard de mudanças com GMUDs por status e janelas futuras
- [ ] Dashboard de monitoramento exibindo métricas de integrações ativas
- [ ] Detecção de recorrência via `pg_trgm` na abertura de chamados
- [ ] Alerta de recorrência enviado ao Gestor e analista responsável
- [ ] Relatório mensal gerado no primeiro dia útil do mês via cron job
- [ ] Relatório enviado por e-mail aos responsáveis de contratos ativos
- [ ] Todas as seções condicionais do PDF (reuniões, GMUDs, monitoramento) exibidas apenas quando houver dados
- [ ] Geração sob demanda de relatório para qualquer cliente e período
- [ ] PDF com identidade visual da ITRAMOS (logo, gráficos SVG, layout)
- [ ] Índices `pg_trgm` e de dashboard criados via migration
