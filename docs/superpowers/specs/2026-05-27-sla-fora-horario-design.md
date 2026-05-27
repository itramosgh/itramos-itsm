# SLA com Início no Horário Comercial — Design Spec

**Data:** 2026-05-27  
**Status:** Aprovado  
**Autor:** Carlos Ramos (via brainstorming com Claude)

---

## Problema

Chamados abertos fora do horário de atendimento (madrugada, fim de semana, feriado) têm o SLA calculado incorretamente em dois aspectos:

1. **Prazo (`sla_deadline`):** já calculado corretamente por `calculateDeadline()` — `addBusinessHours()` já snapa para o início do próximo expediente. Nenhuma mudança necessária.
2. **Barra de progresso (`getSLAPercentUsed`):** usa `created_at` como base do período total, o que faz a porcentagem parecer muito baixa (ex: chamado criado às 22h, deadline às 17h do dia seguinte — a barra mostra ~73% consumido quando deveria mostrar 0%).
3. **Canais portal e webhooks:** criam chamados sem calcular SLA nenhum — `sla_deadline` e `sla_starts_at` ficam `null`.

---

## Objetivo

- Qualquer canal pode abrir chamados a qualquer hora.
- Se aberto fora do horário comercial, o SLA só começa a contar a partir do início do próximo expediente.
- A barra de progresso reflete o tempo real de expediente consumido.
- Todos os canais (interno, portal, Zabbix, Azure, cron de alertas pendentes) calculam SLA automaticamente.

---

## Arquitetura

### Regra de negócio central

```
Se is24x7:
  sla_starts_at = created_at

Senão:
  Se created_at está dentro do expediente → sla_starts_at = created_at
  Se created_at está antes do expediente (mesmo dia) → sla_starts_at = inicio_expediente_hoje
  Se created_at está após o expediente → sla_starts_at = inicio_expediente_próximo_dia_útil
  Se created_at é feriado ou fim de semana → sla_starts_at = inicio_expediente_próximo_dia_útil
```

### Contrato a usar

Quando o canal não informa `contract_id` explicitamente (portal, webhooks), o sistema busca:

```sql
SELECT id, is_24x7
FROM contracts
WHERE company_id = $companyId
  AND is_active = true
ORDER BY created_at DESC
LIMIT 1
```

Se não houver contrato ativo ou não houver regra de SLA para a prioridade, nenhum SLA é calculado (campos ficam `null`).

---

## Componentes

### 1. `src/lib/sla.ts` — nova função `getEffectiveSLAStart()`

```typescript
export function getEffectiveSLAStart(
  createdAt: Date,
  is24x7: boolean,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date
```

- `is24x7 = true` → retorna `createdAt`
- Dia não útil (feriado ou dia fora de `settings.days`) → retorna `nextBusinessDayStart()`
- `createdAt` antes do início do expediente → retorna snap para `settings.start` no mesmo dia
- `createdAt` após o fim do expediente → retorna `nextBusinessDayStart()`
- `createdAt` dentro do expediente → retorna `createdAt`

### 2. `src/lib/sla.ts` — `getSLAPercentUsed()` atualizado

```typescript
// Antes
getSLAPercentUsed(createdAt: Date, deadline: Date, pausedAt: Date | null): number

// Depois — renomeia o primeiro parâmetro semanticamente
getSLAPercentUsed(slaStartsAt: Date, deadline: Date, pausedAt: Date | null): number
```

Sem mudança na lógica interna. `totalMs = deadline - slaStartsAt`.

### 3. `src/lib/ticket-sla.ts` — novo arquivo

Função utilitária reutilizável por todos os canais:

```typescript
export async function calculateTicketSLAForCompany(
  supabase: SupabaseClient,
  params: {
    companyId: string
    priority: string
    createdAt: Date
  }
): Promise<{ sla_deadline: string; sla_starts_at: string } | null>
```

Internamente:
1. Busca contrato ativo mais recente da empresa
2. Busca `contract_sla_rules` para `(contract_id, priority)`
3. Busca `platform_settings` (horário comercial)
4. Busca feriados a partir de hoje
5. Chama `getEffectiveSLAStart()` → obtém `startsAt`
6. Chama `calculateDeadline({ createdAt: startsAt, ... })` — usa `startsAt` como base, não `createdAt`
7. Retorna `{ sla_deadline, sla_starts_at }` em ISO string

> **Nota:** `calculateDeadline` recebe `startsAt` (não `createdAt`) para que o cálculo do prazo seja consistente com o início real do SLA.

### 4. Migration Supabase

```sql
ALTER TABLE tickets
  ADD COLUMN sla_starts_at TIMESTAMPTZ NULL;
```

Nenhum backfill. Chamados existentes com `sla_starts_at = null` fazem fallback para `created_at` no display.

### 5. `src/types/database.ts`

Adicionado manualmente ao tipo `tickets`:

```typescript
sla_starts_at: string | null
```

### 6. Canais de abertura

#### Canal interno — `src/app/(internal)/chamados/actions.ts`

`createTicketAction` já calcula SLA via `contract_id` explícito. Ajuste: passar `sla_starts_at` no update e usar `getEffectiveSLAStart()` + `calculateDeadline(startsAt)` em vez de `calculateDeadline(new Date())` direto.

#### Portal — `src/app/(portal)/portal/chamados/novo/page.tsx`

`createPortalTicketAction` passa a:
1. Capturar `id` do ticket inserido (`.select('id').single()`)
2. Chamar `calculateTicketSLAForCompany(supabase, { companyId, priority, createdAt: new Date() })`
3. Fazer `update` com `{ sla_deadline, sla_starts_at }` se resultado não for `null`

#### Zabbix — `src/app/api/webhooks/zabbix/[token]/route.ts`

Após o insert do ticket, adiciona:
```typescript
const sla = await calculateTicketSLAForCompany(supabase, {
  companyId: integration.company_id,
  priority,
  createdAt: new Date(),
})
if (sla) {
  await supabase.from('tickets').update({ ...sla } as never).eq('id', newTicket.id)
}
```

#### Azure Monitor — `src/app/api/webhooks/azure/[token]/route.ts`

Mesmo padrão do Zabbix.

#### Alertas pendentes — `src/app/api/cron/process-pending-alerts/route.ts`

Quando um alerta pendente é promovido a ticket, também chama `calculateTicketSLAForCompany`. O `createdAt` passado é `new Date()` (momento em que o cron o processa, já dentro do expediente).

### 7. `src/components/tickets/SLAIndicator.tsx`

```typescript
interface Props {
  createdAt: string           // mantido para fallback em chamados antigos
  slaStartsAt: string | null  // novo
  slaDeadline: string | null
  slaFirstResponseAt: string | null
  slaMet: boolean | null
  slaPausedAt: string | null
}

// Uso interno
const effectiveStart = slaStartsAt ?? createdAt
const pct = getSLAPercentUsed(new Date(effectiveStart), new Date(slaDeadline), ...)
```

### 8. Páginas que renderizam `SLAIndicator`

- `src/app/(internal)/chamados/page.tsx` — adiciona `sla_starts_at` ao `.select()`
- `src/app/(internal)/chamados/[id]/page.tsx` — idem

---

## Fluxo de dados completo

```
Chamado aberto via portal às ter 22h
  ↓
createPortalTicketAction
  ↓ insert ticket (sem SLA ainda)
  ↓ calculateTicketSLAForCompany(companyId, 'media', ter 22h)
      ↓ busca contrato ativo da empresa → encontra contrato X (is_24x7: false)
      ↓ busca SLA rule → response_hours: 8
      ↓ busca platform_settings → 09:00–18:00, seg–sex
      ↓ getEffectiveSLAStart(ter 22h) → qua 09h00
      ↓ calculateDeadline(startsAt: qua 09h, hours: 8) → qua 17h00
      ↓ retorna { sla_deadline: 'qua 17h', sla_starts_at: 'qua 09h' }
  ↓ update ticket com { sla_deadline, sla_starts_at }

Display às qua 12h:
  SLAIndicator.effectiveStart = qua 09h00
  remaining = 17h - 12h = 5h = 300min
  total = 17h - 09h = 8h = 480min
  pct = (480 - 300) / 480 = 37.5% ✓
```

---

## Arquivos alterados

| Arquivo | Tipo de mudança |
|---|---|
| `src/lib/sla.ts` | Nova função `getEffectiveSLAStart()`, renomear parâmetro em `getSLAPercentUsed()` |
| `src/lib/ticket-sla.ts` | **Novo arquivo** |
| `src/components/tickets/SLAIndicator.tsx` | Nova prop `slaStartsAt`, usar `effectiveStart` |
| `src/app/(internal)/chamados/actions.ts` | Gravar `sla_starts_at`, usar `startsAt` no `calculateDeadline` |
| `src/app/(internal)/chamados/page.tsx` | Adicionar `sla_starts_at` ao select e prop |
| `src/app/(internal)/chamados/[id]/page.tsx` | Idem |
| `src/app/(portal)/portal/chamados/novo/page.tsx` | Capturar id, calcular e gravar SLA |
| `src/app/api/webhooks/zabbix/[token]/route.ts` | Calcular e gravar SLA após insert |
| `src/app/api/webhooks/azure/[token]/route.ts` | Calcular e gravar SLA após insert |
| `src/app/api/cron/process-pending-alerts/route.ts` | Calcular e gravar SLA ao promover alerta |
| `src/types/database.ts` | Adicionar `sla_starts_at: string \| null` |
| Migration Supabase | `ALTER TABLE tickets ADD COLUMN sla_starts_at TIMESTAMPTZ NULL` |

---

## Fora do escopo

- Mudança no comportamento de pausa de SLA (`aguardando_fornecedor`) — já funciona corretamente
- Backfill de `sla_starts_at` em chamados existentes — não necessário, fallback para `created_at`
- Configuração por empresa de "contrato padrão" — usar o contrato ativo mais recente é suficiente
- Canal e-mail inbound — só adiciona interações, não cria chamados novos

---

## Testes relevantes

- Chamado criado às 02h → `sla_starts_at` = mesmo dia às 09h
- Chamado criado às 22h → `sla_starts_at` = próximo dia útil às 09h
- Chamado criado no sábado → `sla_starts_at` = segunda-feira às 09h
- Chamado criado em feriado → `sla_starts_at` = próximo dia útil às 09h
- Chamado criado às 10h (dentro do expediente) → `sla_starts_at` = `created_at`
- Contrato `is_24x7 = true` → `sla_starts_at` = `created_at` sempre
- Empresa sem contrato ativo → `sla_deadline` e `sla_starts_at` = null
