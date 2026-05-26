# Sub-spec 5: Gestão de Mudanças (GMUD) e Custos e Atendimento Presencial

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** [02-chamados-sla-design.md](2026-05-22-02-chamados-sla-design.md)  
**Bloqueia:** sub-spec 7

---

## Objetivo

Definir o módulo de Gestão de Mudanças (GMUD) com fluxo de aprovação, comunicados automáticos e integração com chamados de origem, e o módulo de Custos e Atendimento Presencial com registro de tempo, deslocamento e cobrança.

---

## Módulos

### 1. Gestão de Mudanças (GMUD)

#### Criação

- Pode ser criada **a partir de um chamado existente** (vinculada ao chamado de origem) ou **diretamente**, sem chamado vinculado
- Acesso para criação: Admin, Gestor, Analista

| Campo | Tipo | Obrigatório |
|---|---|---|
| Título | Texto | Sim |
| Descrição detalhada | Texto livre | Sim |
| Sistemas/servidores/aplicações impactados | Texto livre | Sim |
| Usuários e clientes impactados | Texto livre | Sim |
| Janela de manutenção — início | Datetime | Sim |
| Janela de manutenção — fim previsto | Datetime | Sim |
| Plano de rollback | Texto livre | Sim |
| Nível de risco | `baixo` \| `medio` \| `alto` | Sim |
| Analista responsável pela execução | FK → `profiles.id` | Sim |
| Contatos a comunicar no início e no fim | Lista de contatos + e-mails externos | Sim |
| Chamado de origem | FK → `tickets.id` | Não |

#### Fluxo de status

```
Rascunho → Aguardando Aprovação → Aprovada → Em Execução → Concluída
                                           ↘              ↘ Revertida
                                  Reprovada
```

Status enum: `rascunho` | `aguardando_aprovacao` | `aprovada` | `em_execucao` | `concluida` | `revertida` | `reprovada`

#### Fluxo de aprovação

- Reutiliza o mesmo mecanismo do fluxo de aprovação de chamados (tabela `change_approvals`, análoga a `ticket_approvals`)
- Analista seleciona aprovador: contato cadastrado do cliente OU e-mail manual
- Aprovador responde pelo link no e-mail (sem necessidade de acesso ao sistema)
- Aprovação → status muda para `aprovada`; analista notificado
- Reprovação → status muda para `reprovada`; motivo registrado; analista notificado
- Timeout sem resposta → alerta de escalonamento ao Gestor (conforme configuração de aprovação)

#### Comunicados automáticos

**No início da janela (ação manual "Iniciar execução"):**
- E-mail automático para todos os contatos de "a comunicar" com: o que será feito, início, tempo previsto
- Status muda para `em_execucao`

**Na conclusão (ação manual "Concluir"):**
- E-mail com resultado: mudança realizada conforme planejado
- Status muda para `concluida`

**Na reversão (ação manual "Reverter"):**
- E-mail com resultado: mudança não aplicada, rollback executado, motivo da reversão
- Status muda para `revertida`

#### Integração com chamado de origem

- Ao criar GMUD a partir de um chamado: chamado de origem muda automaticamente para status `em_mudanca`
- GMUD aparece no histórico do chamado vinculado com link direto
- **Ao concluir a GMUD:** sistema pergunta se o chamado de origem deve ser fechado
  - Se sim: chamado fechado
  - Se não: status do chamado volta para `em_andamento`
- **Ao reverter a GMUD:** chamado volta automaticamente para `em_andamento`

#### Visibilidade

- GMUDs aparecem na tela principal junto com agendamentos, organizadas por janela de manutenção
- Analistas veem apenas suas GMUDs (como responsável pela execução)
- Gestor e Admin veem todas

---

### 2. Custos e Atendimento Presencial

#### Clientes avulsos

- Empresa pode ser cadastrada como tipo `avulso` (sem contrato fixo, sem SLA pré-definido)
- Chamados avulsos seguem o mesmo fluxo dos demais, com campos adicionais de custo

#### Registro de custos no chamado

O analista registra o atendimento presencial via três marcações de tempo acionadas por botões no chamado:

| Marcação | Ação | Efeito |
|---|---|---|
| "Saindo para atendimento" | Registra hora de saída | Status do chamado → `em_deslocamento`; entrada automática no histórico "Analista a caminho" |
| "Cheguei no cliente" | Registra hora de chegada | Sistema exibe tempo de deslocamento (saída → chegada) |
| "Atendimento concluído" | Registra hora de término | Sistema exibe tempo de atendimento (chegada → término) e tempo total (saída → término) |

Com os três tempos registrados, o sistema exibe separadamente:
- **Tempo de deslocamento** (saída → chegada)
- **Tempo de atendimento** (chegada → término)
- **Tempo total** (saída → término)

Gestor ou Admin pode aplicar **desconto no tempo de deslocamento** antes de gerar o custo final.

Demais campos de custo (preenchidos manualmente pelo analista):
- Quilômetros percorridos
- Pedágio (valor em R$)
- Estacionamento (valor em R$)

**Cálculo do custo total:**
- Horas técnicas = `tempo_atendimento_horas × hourly_rate` (de `platform_settings`)
- Deslocamento = `km_percorridos × km_rate` (de `platform_settings`)
- Total = horas técnicas + deslocamento + pedágio + estacionamento

#### Status de cobrança

- Ao fechar chamado com custos registrados: `billing_status` = `pendente` (automático)
- Somente Gestor ou Admin altera para `cobrado` após efetivar a cobrança
- Resumo de custos visível na tela do chamado; botão para enviar por e-mail ao cliente com um clique

#### Alertas de cobrança pendente

- Cron job verifica chamados com `billing_status = 'pendente'` sem atualização há mais de `billing_alert_days` dias (conforme `platform_settings`)
- Envia e-mail de alerta ao Gestor
- Alerta repetido a cada 7 dias até que `billing_status = 'cobrado'`
- Chamados com cobrança pendente aparecem em destaque na tela principal para Gestor e Admin

#### Relatório de custos

- Visão consolidada de chamados com custos por período, analista e cliente
- Totais: horas técnicas, km, pedágios, estacionamentos e valor total por cliente
- Filtro separado para chamados avulsos vs. clientes com contrato

---

## Schema do Banco de Dados

### `public.change_requests` (GMUDs)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` NOT NULL | |
| `description` | `text` NOT NULL | |
| `impacted_systems` | `text` NOT NULL | |
| `impacted_users` | `text` NOT NULL | |
| `maintenance_start` | `timestamptz` NOT NULL | |
| `maintenance_end` | `timestamptz` NOT NULL | |
| `rollback_plan` | `text` NOT NULL | |
| `risk_level` | `text` NOT NULL | `baixo` \| `medio` \| `alto` |
| `responsible_id` | `uuid` NOT NULL FK → `profiles.id` | Analista responsável |
| `origin_ticket_id` | `uuid` FK → `tickets.id` | Chamado de origem (nullable) |
| `status` | `text` NOT NULL DEFAULT `'rascunho'` | Ver enum acima |
| `execution_started_at` | `timestamptz` | |
| `execution_completed_at` | `timestamptz` | |
| `reversal_reason` | `text` | Motivo da reversão (nullable) |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.change_request_contacts`

Contatos a comunicar no início e fim da GMUD.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `change_request_id` | `uuid` NOT NULL FK → `change_requests.id` | |
| `contact_id` | `uuid` FK → `contacts.id` | Contato cadastrado (nullable) |
| `external_email` | `text` | E-mail externo (nullable) |
| `external_name` | `text` | |

---

### `public.change_approvals`

Análoga a `ticket_approvals` (ver sub-spec 2).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `change_request_id` | `uuid` NOT NULL FK → `change_requests.id` | |
| `approver_contact_id` | `uuid` FK → `contacts.id` | |
| `approver_email` | `text` NOT NULL | |
| `token` | `uuid` NOT NULL DEFAULT `gen_random_uuid()` | |
| `status` | `text` NOT NULL DEFAULT `'pendente'` | `pendente` \| `aprovado` \| `reprovado` \| `expirado` |
| `response_reason` | `text` | |
| `responded_at` | `timestamptz` | |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

### `public.ticket_costs`

Custos vinculados a um chamado.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | |
| `ticket_id` | `uuid` NOT NULL UNIQUE FK → `tickets.id` | Um registro de custo por chamado |
| `departure_at` | `timestamptz` | Hora de saída ("Saindo para atendimento") |
| `arrival_at` | `timestamptz` | Hora de chegada ("Cheguei no cliente") |
| `completion_at` | `timestamptz` | Hora de término ("Atendimento concluído") |
| `travel_time_minutes` | `integer` | Calculado: chegada - saída |
| `service_time_minutes` | `integer` | Calculado: término - chegada |
| `travel_discount_minutes` | `integer` DEFAULT `0` | Desconto aplicado pelo Gestor/Admin |
| `km_traveled` | `numeric(8,2)` | |
| `toll_amount` | `numeric(10,2)` DEFAULT `0` | Pedágio |
| `parking_amount` | `numeric(10,2)` DEFAULT `0` | Estacionamento |
| `hourly_rate_applied` | `numeric(10,2)` | Rate no momento do registro (cópia de `platform_settings`) |
| `km_rate_applied` | `numeric(10,2)` | Rate no momento do registro |
| `total_amount` | `numeric(10,2)` | Calculado: horas + km + pedágio + estacionamento |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

## RLS Policies

### `change_requests`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor veem todas; Analista vê apenas as suas (`responsible_id`) |
| INSERT | Admin, Gestor, Analista |
| UPDATE | Admin, Gestor atualizam qualquer; Analista atualiza apenas as suas em `rascunho` |
| DELETE | Admin, Gestor (apenas `rascunho`) |

### `ticket_costs`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor; Analista vê apenas dos chamados atribuídos a si |
| INSERT / UPDATE | Admin, Gestor, Analista (do chamado atribuído) |
| DELETE | Ninguém |

---

## Critérios de Conclusão

- [ ] CRUD de GMUDs com todos os campos obrigatórios
- [ ] Fluxo de aprovação de GMUD (e-mail com links, aprovação/reprovação)
- [ ] Mudança automática de status do chamado de origem para `em_mudanca`
- [ ] Comunicados automáticos de início e conclusão/reversão
- [ ] Opção de fechar ou manter chamado de origem ao concluir GMUD
- [ ] Reversão retorna chamado de origem para `em_andamento`
- [ ] GMUDs na tela principal organizadas por janela de manutenção
- [ ] Três marcações de tempo presencial com cálculo automático
- [ ] Campo de desconto no tempo de deslocamento para Gestor/Admin
- [ ] Cálculo de custo total aplicando rates de `platform_settings`
- [ ] Status de cobrança `pendente` → `cobrado` com controle de acesso correto
- [ ] Cron de alerta de cobrança pendente após N dias
- [ ] Chamados com cobrança pendente em destaque para Gestor e Admin
- [ ] Relatório de custos consolidado com filtros por período, analista e cliente
