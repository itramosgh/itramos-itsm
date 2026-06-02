# ITSM ITRAMOS — Setup & Testing Checklist

> Documento vivo. Marcar `[x]` conforme cada item for concluído.
> Atualizar a data de conclusão no rodapé de cada seção.

---

## 1. Infraestrutura

### 1.1 Variáveis de Ambiente
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `RESEND_API_KEY`
- [ ] `NEXT_PUBLIC_APP_URL` — URL pública da aplicação (ex: `https://tickets.itramos.com.br`)
- [ ] `CRON_SECRET` — token usado pelos endpoints de cron

### 1.2 Supabase
- [ ] Projeto criado e migrations aplicadas
- [ ] Buckets de storage criados (`attachments`, `logos`, etc.)
- [ ] RLS policies ativas
- [ ] Usuário admin inicial criado via Supabase Auth

### 1.3 Resend
- [ ] Domínio verificado e DNS configurado
- [ ] API key com permissão de envio
- [ ] Email remetente configurado em `/configuracoes/plataforma`

### 1.4 cron-job.org
- [ ] Conta criada e jobs configurados para os 14 endpoints
- [ ] Todos os jobs passando `Authorization: Bearer CRON_SECRET` no header
- [ ] Jobs ativos e com schedule correto (ver `/configuracoes/crons` após deploy)

> Schedules de referência: SLA alerts (1h), ticket-automations (1h), agendamento (15min),
> announcement-dispatch (1h), process-pending-alerts (5min), url-check (5min),
> meeting-reminders (1h), task-reminders (diário), billing-alerts (diário),
> recurring-tickets (diário), cleanup-logs (diário), holiday-notice (diário),
> holiday-import (anual), monthly-report (mensal).

---

## 2. Configurações da Plataforma (via UI)

> Acessar como `admin`. Ordem importa — alguns itens dependem de outros.

### 2.1 Plataforma (`/configuracoes/plataforma`)
- [ ] Nome e logo da empresa
- [ ] Email remetente (`email_from_name` + `email_from_address`)
- [ ] Horário comercial (dias e horas de atendimento)
- [ ] Flag `is_24x7` nos contratos que não respeitam horário comercial
- [ ] WhatsApp da empresa (usado em comunicações automáticas)

### 2.2 Feriados (`/configuracoes/feriados`)
- [ ] Importar feriados nacionais do ano atual via BrasilAPI
- [ ] Verificar se datas foram importadas corretamente

### 2.3 Categorias (`/configuracoes/categorias`)
- [ ] Criar categorias base (ex: Infraestrutura, Suporte, Acesso, etc.)
- [ ] Definir quais categorias `requires_approval = true`

### 2.4 Tipos de Dispositivo (`/configuracoes/tipos-dispositivo`)
- [ ] Cadastrar tipos usados nos contratos (ex: Servidor, Switch, Workstation)

### 2.5 Templates de E-mail (`/configuracoes/email-templates`)
- [ ] Revisar os 36 templates pré-populados
- [ ] Personalizar subject e corpo dos principais fluxos:
  - [ ] Abertura de chamado (`chamado_aberto`)
  - [ ] Atualização de chamado (`chamado_atualizado`)
  - [ ] Resolução de chamado (`chamado_resolvido`)
  - [ ] Solicitação de aprovação (`aprovacao_solicitada`)
  - [ ] Lembrete de retorno (`aguardando_cliente`)
  - [ ] Relatório mensal (`relatorio_mensal`)

### 2.6 Templates de Resposta (`/configuracoes/templates`)
- [ ] Criar templates de resposta rápida para os analistas

### 2.7 Microsoft Teams (`/configuracoes/teams`) — opcional
- [ ] Configurar webhook URL do canal de alertas
- [ ] Testar notificação de SLA breach

---

## 3. Dados Iniciais

### 3.1 Usuários (`/configuracoes/usuarios`)
- [ ] Criar usuário `admin` (se não criado via Supabase Auth)
- [ ] Criar gestores
- [ ] Criar analistas
- [ ] Definir roles corretamente (`admin | gestor | analista`)

### 3.2 Clientes (`/clientes`)
- [ ] Cadastrar empresas clientes
- [ ] Adicionar contatos por empresa (nome, email, `is_whatsapp`, telefone)
- [ ] Marcar contato responsável (`is_contract_responsible = true`)
- [ ] Marcar contatos que recebem cópia (`receives_ticket_cc = true`)

### 3.3 Contratos (`/clientes/[id]/contratos`)
- [ ] Criar contrato por cliente com:
  - [ ] Status (`ativo`)
  - [ ] SLA por prioridade (crítica, alta, média, baixa — em horas)
  - [ ] Flag `is_24x7` se aplicável
  - [ ] Dispositivos associados (tipos de dispositivo)

### 3.4 Base de Conhecimento (`/conhecimento/artigos`)
- [ ] Criar artigos iniciais para os chamados mais comuns
- [ ] Criar documentos específicos por cliente se necessário

### 3.5 Chamados Recorrentes (`/configuracoes/chamados-recorrentes`) — opcional
- [ ] Configurar templates de chamados que se repetem (manutenção mensal, etc.)

---

## 4. Integrações Externas (opcional)

### 4.1 Zabbix
- [ ] Configurar webhook no Zabbix apontando para `/api/webhooks/zabbix`
- [ ] Testar criação automática de chamado via alerta

### 4.2 Azure Monitor
- [ ] Configurar Action Group apontando para `/api/webhooks/azure-monitor`
- [ ] Testar criação automática de chamado via alerta

### 4.3 Email Inbound
- [ ] Configurar encaminhamento de email para `/api/email/inbound`
- [ ] Testar criação de chamado por email

### 4.4 Monitoramento de URLs
- [ ] Cadastrar URLs por cliente em `/clientes/[id]/monitoramento`
- [ ] Verificar que o cron `url-check` está rodando e gerando logs

---

## 5. Telas para Teste

> Legenda: `[ ]` pendente · `[x]` aprovado · `[!]` problema encontrado

### 5.1 Autenticação
- [ ] Login interno (`/login`)
- [ ] Redirect correto por role: admin/gestor/analista → `/dashboard`, cliente → `/portal/chamados`
- [ ] Login portal (`/portal/login`)
- [ ] Criação de conta portal (`/portal/criar-conta`)
- [ ] Esqueci a senha + redefinição

### 5.2 Dashboard Interno (`/dashboard`)
- [ ] KPIs carregam corretamente (chamados abertos, SLA, etc.)
- [ ] Aprovações pendentes aparecem
- [ ] Logs recentes visíveis

### 5.3 Chamados — Fluxo Interno
- [ ] Listagem com filtros (status, prioridade, analista, cliente)
- [ ] Criação de chamado completo (empresa, contato, categoria, prioridade, descrição)
- [ ] Atribuição de analista
- [ ] Mudança de status (todos os estados da máquina de estados)
- [ ] SLAIndicator refletindo corretamente o prazo
- [ ] Pausa de SLA ao entrar em `aguardando_fornecedor`
- [ ] Retomada de SLA ao sair de `aguardando_fornecedor`
- [ ] Botão WhatsApp visível quando contato tem `is_whatsapp = true`
- [ ] Adicionar interação interna (não visível no portal)
- [ ] Adicionar resposta ao cliente (visível no portal)
- [ ] Upload e download de anexo
- [ ] Sugestão de KB aparece no detalhe
- [ ] Vincular GMUD ao chamado
- [ ] Registrar custo presencial

### 5.4 Aprovações
- [ ] Chamado com categoria `requires_approval` gera solicitação de aprovação
- [ ] Email enviado ao aprovador com link de token (`/aprovacao/[token]`)
- [ ] Aprovação via link externo funciona sem login
- [ ] Aprovação expirada após 48h fecha o chamado automaticamente

### 5.5 Automações (Aguardando Cliente)
- [ ] Status `aguardando_cliente` → email de lembrete enviado após 24h (1 vez/dia)
- [ ] Log registrado em `system_logs` (`email_sent`)
- [ ] Após 48h sem resposta → chamado fechado automaticamente
- [ ] Log registrado (`cron_job`) + analista notificado

### 5.6 Portal do Cliente
- [ ] Login com conta de cliente (role diferente de admin/gestor/analista)
- [ ] Listagem de chamados da empresa
- [ ] Criação de chamado pelo portal
- [ ] Visualização de interações e histórico
- [ ] Resposta do cliente em chamado existente
- [ ] Upload de anexo pelo portal
- [ ] Acesso à base de conhecimento pública
- [ ] Relatório mensal PDF gerado corretamente
- [ ] Relatório personalizado com CSV

### 5.7 Mudanças (GMUD) (`/mudancas`)
- [ ] Criação de mudança
- [ ] Aprovação de mudança via token (`/aprovacao-gmud/[token]`)
- [ ] Vinculação a chamados

### 5.8 Tarefas (`/tarefas`)
- [ ] Criação de tarefa
- [ ] Lembrete enviado no prazo pelo cron `task-reminders`
- [ ] Tarefas em atraso marcadas corretamente

### 5.9 Reuniões (`/reunioes`)
- [ ] Criação de reunião com participantes
- [ ] Lembrete enviado pelo cron `meeting-reminders`

### 5.10 Comunicados (`/comunicados`)
- [ ] Criação de comunicado imediato
- [ ] Criação de comunicado agendado (validar disparo pelo cron)
- [ ] Log registrado após envio

### 5.11 Relatórios Internos (`/relatorios`)
- [ ] Operacional: KPIs e gráficos carregam
- [ ] Mensal: PDF gerado corretamente
- [ ] Personalizado: filtros funcionam, CSV exportado
- [ ] Custos: totais por cliente corretos

### 5.12 Configurações
- [ ] Plataforma: salvar e recarregar sem perda de dados
- [ ] Feriados: importar + verificar cálculo de SLA em feriado
- [ ] Categorias: criar, editar, ativar/desativar
- [ ] Usuários: criar, alterar role, desativar
- [ ] Email templates: editar, salvar, restaurar padrão
- [ ] Templates de resposta: criar e usar em chamado
- [ ] Teams: testar webhook
- [ ] Logs: filtrar por categoria e status
- [ ] Crons: verificar se todos aparecem com execução recente
- [ ] Storage: verificar métricas de uso

### 5.13 Emails Automáticos (validar na caixa)
- [ ] Abertura de chamado (cliente recebe)
- [ ] Atualização de chamado (cliente recebe)
- [ ] Resolução de chamado
- [ ] Solicitação de aprovação (aprovador recebe com link)
- [ ] Lembrete aguardando cliente (24h)
- [ ] Encerramento por ausência de retorno (48h)
- [ ] Alerta de SLA próximo de vencer
- [ ] Alerta de SLA violado
- [ ] Relatório mensal (cliente recebe PDF)
- [ ] Aviso de feriado
- [ ] Lembrete de reunião
- [ ] Lembrete de tarefa

---

## Progresso Geral

| Seção | Status |
|-------|--------|
| 1. Infraestrutura | pendente |
| 2. Configurações da Plataforma | pendente |
| 3. Dados Iniciais | pendente |
| 4. Integrações Externas | pendente |
| 5.1 Auth | pendente |
| 5.2 Dashboard | pendente |
| 5.3 Chamados | pendente |
| 5.4 Aprovações | pendente |
| 5.5 Automações | pendente |
| 5.6 Portal | pendente |
| 5.7 Mudanças | pendente |
| 5.8 Tarefas | pendente |
| 5.9 Reuniões | pendente |
| 5.10 Comunicados | pendente |
| 5.11 Relatórios | pendente |
| 5.12 Configurações | pendente |
| 5.13 Emails automáticos | pendente |

---

*Última atualização: 2026-06-02*
