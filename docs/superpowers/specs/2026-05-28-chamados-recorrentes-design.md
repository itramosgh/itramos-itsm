# Chamados Recorrentes — Design Spec

**Data:** 2026-05-28  
**Status:** Aprovado

---

## Visão Geral

Permite que admins e gestores configurem templates de chamados que são criados automaticamente em intervalos definidos por cliente. Os chamados gerados seguem o mesmo fluxo de um chamado normal (SLA, notificações, lista de chamados).

---

## 1. Banco de Dados

### Nova tabela: `recurring_ticket_templates`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `company_id` | uuid | FK companies, NOT NULL | Cliente do chamado |
| `contact_id` | uuid | FK contacts, NOT NULL | Solicitante padrão |
| `title` | text | NOT NULL | Título do chamado gerado |
| `description` | text | nullable | Descrição (opcional) |
| `priority` | text | NOT NULL, default 'media' | critica / alta / media / baixa |
| `category_id` | uuid | FK ticket_categories, nullable | |
| `frequency` | text | NOT NULL | semanal / quinzenal / mensal / personalizado |
| `interval_days` | integer | nullable | Usado apenas quando frequency = personalizado |
| `next_run_at` | date | NOT NULL | Data da próxima execução |
| `is_active` | boolean | NOT NULL, default true | Pausar sem excluir |
| `created_by` | uuid | FK profiles, nullable | |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | |

### Cálculo de `next_run_at` após execução

Extensão da função `nextOccurrenceDate` em `src/lib/task-recurrence.ts`:

| Frequência | Incremento |
|---|---|
| semanal | +7 dias |
| quinzenal | +14 dias |
| mensal | +1 mês |
| personalizado | +interval_days dias |

---

## 2. Cron Job

**Endpoint:** `GET /api/cron/recurring-tickets`  
**Autenticação:** `Authorization: Bearer CRON_SECRET`  
**Agendamento:** cron-job.org — diariamente às 08h (Brasília) = `0 11 * * *` UTC  

### Fluxo de execução

1. Valida `CRON_SECRET`
2. Busca templates: `is_active = true` AND `next_run_at <= hoje`
3. Para cada template:
   a. Insere ticket em `tickets` com `channel = 'recorrente'`, `assigned_to = null`
   b. Calcula e aplica SLA via `calculateTicketSLAForCompany`
   c. Insere interação de sistema: *"Chamado criado automaticamente (recorrente)."*
   d. Envia notificações: `resolveContactEmails` + `resolveNewTicketNotifyEmails`
   e. Atualiza `next_run_at` do template para a próxima ocorrência
   f. Registra em `system_logs`
4. Retorna `{ ok: true, created: N }`

### Resiliência

- Falha em um template não interrompe os demais (try/catch por template)
- Erro é registrado em `system_logs` com status `failure`

---

## 3. Interface de Gestão

**Rota:** `/configuracoes/chamados-recorrentes`  
**Acesso:** admin e gestor (redirect `/dashboard` para analistas)  
**Card:** adicionado no índice `/configuracoes` com ícone `RefreshCw`

### Tela principal

Tabela com colunas:
- Cliente
- Título
- Frequência (semanal / quinzenal / mensal / a cada N dias)
- Próxima execução (data formatada pt-BR)
- Status — badge Ativo / Pausado
- Ações — Pausar/Reativar · Excluir (com confirmação)

Botão **"+ Novo template"** no topo direito abre o formulário.

### Formulário (criação e edição)

Campos em ordem:
1. **Cliente** *(obrigatório)* — select de companies ativas; ao trocar, limpa o contato
2. **Contato/Solicitante** *(obrigatório)* — select filtrado pelo cliente selecionado
3. **Título** *(obrigatório)*
4. **Descrição** *(opcional)* — textarea
5. **Prioridade** — select: Baixa / Média / Alta / Crítica (default Média)
6. **Categoria** *(opcional)* — select de categorias ativas
7. **Frequência** *(obrigatório)* — Semanal / Quinzenal / Mensal / Personalizado
8. **Intervalo em dias** — aparece apenas se frequência = Personalizado (input numérico ≥ 1)
9. **Primeira execução** *(obrigatório)* — date picker

### Identificação visual nos chamados

Chamados gerados pelo cron exibem badge **"Recorrente"** na lista e no detalhe do chamado, baseado em `channel = 'recorrente'`.

---

## 4. Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| migration: `add_recurring_ticket_templates` | CREATE TABLE |
| `src/lib/task-recurrence.ts` | Adicionar quinzenal e personalizado ao `nextOccurrenceDate` |
| `src/app/api/cron/recurring-tickets/route.ts` | Novo cron |
| `src/app/(internal)/configuracoes/chamados-recorrentes/page.tsx` | Nova página |
| `src/app/(internal)/configuracoes/chamados-recorrentes/actions.ts` | Server actions CRUD |
| `src/components/settings/RecurringTicketForm.tsx` | Formulário de template |
| `src/app/(internal)/configuracoes/page.tsx` | Adicionar card |
| `src/types/database.ts` | Adicionar tipo `recurring_ticket_templates` |

---

## Fora de escopo

- Atribuição automática de analista (chamados criados sem responsável)
- Notificação prévia antes da criação
- Histórico de execuções por template
- Portal do cliente visualizar templates recorrentes
