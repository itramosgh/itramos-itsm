# SLA com Início no Horário Comercial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que o SLA de qualquer chamado (criado via portal, webhook ou interface interna) só comece a contar a partir do início do próximo expediente comercial quando aberto fora do horário, armazenando `sla_starts_at` e corrigindo o indicador de progresso.

**Architecture:** Nova função pura `getEffectiveSLAStart` em `sla.ts` encapsula a regra de snap para o horário comercial. Novo helper `ticket-sla.ts` busca o contrato ativo da empresa e calcula `{ sla_deadline, sla_starts_at }` reutilizável por todos os canais. Migration adiciona `sla_starts_at` à tabela `tickets`. `SLAIndicator` passa a usar `slaStartsAt ?? createdAt` como base do progresso.

**Tech Stack:** Next.js 15 App Router, Supabase (postgres + RLS), TypeScript, Vitest

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/sla.ts` | Modificar — adicionar `getEffectiveSLAStart`, renomear parâmetro em `getSLAPercentUsed` |
| `src/lib/ticket-sla.ts` | **Criar** — helper `calculateTicketSLAForCompany` |
| `supabase/migrations/20260528000002_sla_starts_at.sql` | **Criar** — migration |
| `src/types/database.ts` | Modificar — adicionar `sla_starts_at` ao tipo tickets |
| `src/components/tickets/SLAIndicator.tsx` | Modificar — nova prop `slaStartsAt`, usar effective start |
| `src/components/tickets/TicketList.tsx` | Modificar — adicionar `sla_starts_at` à interface `Ticket` e passar para `SLAIndicator` |
| `src/app/(internal)/chamados/page.tsx` | Modificar — adicionar `sla_starts_at` ao select |
| `src/app/(internal)/chamados/[id]/page.tsx` | Modificar — passar `sla_starts_at` para `SLAIndicator` |
| `src/app/(internal)/chamados/actions.ts` | Modificar — gravar `sla_starts_at`, usar `startsAt` no cálculo |
| `src/app/(portal)/portal/chamados/novo/page.tsx` | Modificar — capturar id, calcular e gravar SLA |
| `src/app/api/webhooks/zabbix/[token]/route.ts` | Modificar — calcular e gravar SLA após insert |
| `src/app/api/webhooks/azure/[token]/route.ts` | Modificar — idem |
| `src/app/api/cron/process-pending-alerts/route.ts` | Modificar — calcular e gravar SLA ao promover alerta |
| `tests/sla.test.ts` | Modificar — adicionar testes de `getEffectiveSLAStart` e `getSLAPercentUsed` |

---

## Task 1: `getEffectiveSLAStart` em `src/lib/sla.ts` (TDD)

**Files:**
- Modify: `tests/sla.test.ts`
- Modify: `src/lib/sla.ts`

- [ ] **Step 1.1 — Adicionar testes de `getEffectiveSLAStart` e `getSLAPercentUsed` ao arquivo de testes**

Abrir `tests/sla.test.ts` e adicionar ao final do arquivo (depois do último `describe`):

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateDeadline, addBusinessHours, isBusinessDay, getEffectiveSLAStart, getSLAPercentUsed } from '@/lib/sla'
```

> **Atenção:** a linha de import já existe no topo do arquivo. Substituí-la por esta (adiciona `getEffectiveSLAStart` e `getSLAPercentUsed` à lista de imports).

Depois, no final do arquivo, adicionar os dois novos `describe`:

```typescript
describe('getEffectiveSLAStart', () => {
  const settings = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

  it('dentro do expediente → retorna createdAt inalterado', () => {
    const dt = new Date('2026-06-01T10:00:00') // seg 10h
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(dt.getTime())
  })

  it('antes do expediente → snapa para 09h do mesmo dia', () => {
    const dt = new Date('2026-06-01T07:00:00') // seg 07h
    const expected = new Date('2026-06-01T09:00:00')
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('após o expediente → próximo dia útil às 09h', () => {
    const dt = new Date('2026-06-01T20:00:00') // seg 20h
    const expected = new Date('2026-06-02T09:00:00') // ter 09h
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('sábado → segunda-feira às 09h', () => {
    const dt = new Date('2026-06-06T10:00:00') // sáb
    const expected = new Date('2026-06-08T09:00:00') // seg
    expect(getEffectiveSLAStart(dt, false, settings, []).getTime()).toBe(expected.getTime())
  })

  it('feriado → próximo dia útil às 09h', () => {
    const dt = new Date('2026-06-01T10:00:00') // seg, mas é feriado
    const expected = new Date('2026-06-02T09:00:00') // ter
    expect(getEffectiveSLAStart(dt, false, settings, ['2026-06-01']).getTime()).toBe(expected.getTime())
  })

  it('is24x7 → sempre retorna createdAt', () => {
    const dt = new Date('2026-06-06T23:00:00') // sáb 23h
    expect(getEffectiveSLAStart(dt, true, settings, []).getTime()).toBe(dt.getTime())
  })
})

describe('getSLAPercentUsed — com slaStartsAt', () => {
  afterEach(() => { vi.useRealTimers() })

  it('antes do início do SLA → 0%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T08:00:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00')
    const deadline = new Date('2026-06-01T17:00:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(0)
  })

  it('exatamente no início → 0%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T09:00:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00')
    const deadline = new Date('2026-06-01T17:00:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(0)
  })

  it('na metade → 50%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T13:00:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00')
    const deadline = new Date('2026-06-01T17:00:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(50)
  })

  it('após o deadline → 100%', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T18:00:00'))
    const slaStartsAt = new Date('2026-06-01T09:00:00')
    const deadline = new Date('2026-06-01T17:00:00')
    expect(getSLAPercentUsed(slaStartsAt, deadline, null)).toBe(100)
  })
})
```

- [ ] **Step 1.2 — Rodar os testes para confirmar falha (funções não existem ainda)**

```
npx vitest run tests/sla.test.ts
```

Esperado: falha com `getEffectiveSLAStart is not a function` (ou similar).

- [ ] **Step 1.3 — Implementar `getEffectiveSLAStart` e ajustar imports em `src/lib/sla.ts`**

No topo do arquivo, a linha de import não precisa mudar. Adicionar a nova função **antes** de `calculateDeadline` (após `nextBusinessDayStart`):

```typescript
export function getEffectiveSLAStart(
  createdAt: Date,
  is24x7: boolean,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  if (is24x7) return createdAt

  const startTime = parseTime(settings.start)
  const endTime = parseTime(settings.end)
  const startMins = startTime.hours * 60 + startTime.minutes
  const endMins = endTime.hours * 60 + endTime.minutes

  if (!isBusinessDay(createdAt, settings, holidays)) {
    return nextBusinessDayStart(createdAt, settings, holidays)
  }

  const currentMins = createdAt.getHours() * 60 + createdAt.getMinutes()

  if (currentMins < startMins) {
    const snapped = new Date(createdAt)
    snapped.setHours(startTime.hours, startTime.minutes, 0, 0)
    return snapped
  }

  if (currentMins >= endMins) {
    return nextBusinessDayStart(createdAt, settings, holidays)
  }

  return createdAt
}
```

Em seguida, renomear o parâmetro `createdAt` → `slaStartsAt` em `getSLAPercentUsed` (sem alterar a lógica):

```typescript
export function getSLAPercentUsed(
  slaStartsAt: Date,
  deadline: Date,
  pausedAt: Date | null
): number {
  const totalMs = deadline.getTime() - slaStartsAt.getTime()
  const remainingMs = getSLARemainingMinutes(deadline, pausedAt) * 60_000
  if (totalMs <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)))
}
```

- [ ] **Step 1.4 — Rodar os testes para confirmar que passam**

```
npx vitest run tests/sla.test.ts
```

Esperado: todos os testes passando (incluindo os já existentes).

- [ ] **Step 1.5 — Commit**

```
git add src/lib/sla.ts tests/sla.test.ts
git commit -m "feat: adicionar getEffectiveSLAStart e corrigir parâmetro getSLAPercentUsed"
```

---

## Task 2: Migration e atualização de tipos

**Files:**
- Create: `supabase/migrations/20260528000002_sla_starts_at.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 2.1 — Criar arquivo de migration**

Criar `supabase/migrations/20260528000002_sla_starts_at.sql` com o conteúdo:

```sql
-- Adiciona sla_starts_at para registrar quando o SLA efetivamente começa a contar.
-- NULL em chamados antigos → fallback para created_at no display.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS sla_starts_at TIMESTAMPTZ NULL;
```

- [ ] **Step 2.2 — Aplicar a migration localmente**

```
npm run supabase:start
npx supabase db push --local
```

Esperado: migration aplicada sem erros.

- [ ] **Step 2.3 — Adicionar `sla_starts_at` ao tipo `tickets` em `src/types/database.ts`**

Localizar o bloco `Row` da tabela `tickets` (buscar por `sla_deadline: string | null`). Adicionar logo abaixo de `sla_paused_at`:

```typescript
sla_starts_at: string | null
```

O trecho ficará assim (contexto parcial):

```typescript
sla_deadline: string | null
sla_first_response_at: string | null
sla_met: boolean | null
sla_paused_at: string | null
sla_paused_minutes: number | null
sla_starts_at: string | null   // ← novo
```

- [ ] **Step 2.4 — Verificar que o build de tipos não tem erros**

```
npm run build 2>&1 | head -30
```

Esperado: sem novos erros de tipo.

- [ ] **Step 2.5 — Commit**

```
git add supabase/migrations/20260528000002_sla_starts_at.sql src/types/database.ts
git commit -m "feat: adicionar coluna sla_starts_at na tabela tickets"
```

---

## Task 3: Novo `src/lib/ticket-sla.ts`

**Files:**
- Create: `src/lib/ticket-sla.ts`

- [ ] **Step 3.1 — Criar o arquivo `src/lib/ticket-sla.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveSLAStart, calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'

/**
 * Busca o contrato ativo mais recente da empresa, a regra de SLA para a prioridade
 * e calcula sla_starts_at (início efetivo do SLA) + sla_deadline.
 *
 * Retorna null se a empresa não tiver contrato ativo ou não houver regra
 * de SLA configurada para a prioridade informada.
 */
export async function calculateTicketSLAForCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    companyId: string
    priority: string
    createdAt: Date
  }
): Promise<{ sla_deadline: string; sla_starts_at: string } | null> {
  const { companyId, priority, createdAt } = params

  // 1. Contrato ativo mais recente da empresa
  const { data: contractRaw } = await supabase
    .from('contracts')
    .select('id, is_24x7')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!contractRaw) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = contractRaw as any

  // 2. Regra de SLA para a prioridade
  const { data: slaRuleRaw } = await supabase
    .from('contract_sla_rules')
    .select('response_hours')
    .eq('contract_id', contract.id)
    .eq('priority', priority)
    .maybeSingle()

  if (!slaRuleRaw) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slaRule = slaRuleRaw as any

  // 3. Configurações de horário comercial
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any

  const businessSettings: BusinessHoursSettings = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  // 4. Feriados a partir da data de criação
  const todayStr = createdAt.toISOString().slice(0, 10)
  const { data: holidayRows } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', todayStr)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  // 5. Início efetivo do SLA (snap para expediente se fora do horário)
  const startsAt = getEffectiveSLAStart(
    createdAt,
    contract.is_24x7,
    businessSettings,
    holidays
  )

  // 6. Prazo calculado a partir do início efetivo
  const deadline = calculateDeadline({
    createdAt: startsAt,
    responseHours: slaRule.response_hours,
    is24x7: contract.is_24x7,
    settings: businessSettings,
    holidays,
  })

  return {
    sla_deadline: deadline.toISOString(),
    sla_starts_at: startsAt.toISOString(),
  }
}
```

- [ ] **Step 3.2 — Verificar que não há erros de TypeScript**

```
npm run build 2>&1 | head -30
```

Esperado: sem novos erros de tipo.

- [ ] **Step 3.3 — Commit**

```
git add src/lib/ticket-sla.ts
git commit -m "feat: novo helper calculateTicketSLAForCompany"
```

---

## Task 4: Atualizar `SLAIndicator` e páginas que o usam

**Files:**
- Modify: `src/components/tickets/SLAIndicator.tsx`
- Modify: `src/components/tickets/TicketList.tsx`
- Modify: `src/app/(internal)/chamados/page.tsx`
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`

- [ ] **Step 4.1 — Atualizar `src/components/tickets/SLAIndicator.tsx`**

Substituir o conteúdo completo do arquivo por:

```typescript
import { getSLARemainingMinutes, getSLAPercentUsed } from '@/lib/sla'

interface Props {
  createdAt: string
  slaStartsAt: string | null
  slaDeadline: string | null
  slaFirstResponseAt: string | null
  slaMet: boolean | null
  slaPausedAt: string | null
}

export function SLAIndicator({ createdAt, slaStartsAt, slaDeadline, slaFirstResponseAt, slaMet, slaPausedAt }: Props) {
  if (!slaDeadline) return <span className="text-xs text-muted-foreground">Sem SLA</span>

  if (slaFirstResponseAt !== null) {
    return (
      <span className={`text-xs font-medium ${slaMet ? 'text-green-600' : 'text-red-600'}`}>
        {slaMet ? '✓ SLA cumprido' : '✗ SLA violado'}
      </span>
    )
  }

  const effectiveStart = slaStartsAt ?? createdAt
  const remaining = getSLARemainingMinutes(new Date(slaDeadline), slaPausedAt ? new Date(slaPausedAt) : null)
  const pct = getSLAPercentUsed(new Date(effectiveStart), new Date(slaDeadline), slaPausedAt ? new Date(slaPausedAt) : null)
  const color = remaining < 0 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
  const label = remaining < 0 ? `Atrasado ${Math.abs(remaining)}min` : remaining < 60 ? `${remaining}min restantes` : `${Math.floor(remaining / 60)}h restantes`

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs ${remaining < 0 ? 'text-red-600' : pct >= 80 ? 'text-yellow-600' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  )
}
```

- [ ] **Step 4.2 — Atualizar `src/app/(internal)/chamados/page.tsx`**

Localizar a linha do `.select(...)` (linha 29). Adicionar `sla_starts_at` à lista de campos:

```typescript
// Antes
.select('id, number, title, status, priority, created_at, sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at, companies(name), contacts(full_name)', { count: 'exact' })

// Depois
.select('id, number, title, status, priority, created_at, sla_starts_at, sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at, companies(name), contacts(full_name)', { count: 'exact' })
```

- [ ] **Step 4.3 — Atualizar `src/components/tickets/TicketList.tsx`**

**Mudança 1:** Adicionar `sla_starts_at` à interface `Ticket` (após `created_at` na linha 13):

```typescript
// Antes
interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; sla_deadline: string | null
  sla_first_response_at: string | null; sla_met: boolean | null
  sla_paused_at: string | null; scheduled_at: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
}

// Depois
interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; sla_starts_at: string | null
  sla_deadline: string | null; sla_first_response_at: string | null
  sla_met: boolean | null; sla_paused_at: string | null; scheduled_at: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
}
```

**Mudança 2:** Atualizar a chamada ao `SLAIndicator` (linha 51):

```typescript
// Antes
<SLAIndicator createdAt={t.created_at} slaDeadline={t.sla_deadline} slaFirstResponseAt={t.sla_first_response_at} slaMet={t.sla_met} slaPausedAt={t.sla_paused_at} />

// Depois
<SLAIndicator createdAt={t.created_at} slaStartsAt={t.sla_starts_at ?? null} slaDeadline={t.sla_deadline} slaFirstResponseAt={t.sla_first_response_at} slaMet={t.sla_met} slaPausedAt={t.sla_paused_at} />
```

- [ ] **Step 4.4 — Atualizar `src/app/(internal)/chamados/[id]/page.tsx`**

O select da página de detalhe usa `*` (wildcard) para tickets (linha 37-40):

```typescript
supabase.from('tickets').select(`
  *, companies(name), contacts(full_name),
  profiles!assigned_to(full_name), ticket_categories(name, requires_approval)
`).eq('id', id).single(),
```

Como usa `*`, `sla_starts_at` já virá automaticamente após a migration. Apenas atualizar a chamada ao `SLAIndicator` (linha ~117):

```typescript
// Antes
<SLAIndicator
  createdAt={ticket.created_at}
  slaDeadline={ticket.sla_deadline}
  slaFirstResponseAt={ticket.sla_first_response_at}
  slaMet={ticket.sla_met}
  slaPausedAt={ticket.sla_paused_at}
/>

// Depois
<SLAIndicator
  createdAt={ticket.created_at}
  slaStartsAt={ticket.sla_starts_at ?? null}
  slaDeadline={ticket.sla_deadline}
  slaFirstResponseAt={ticket.sla_first_response_at}
  slaMet={ticket.sla_met}
  slaPausedAt={ticket.sla_paused_at}
/>
```

- [ ] **Step 4.5 — Verificar build sem erros**

```
npm run build 2>&1 | head -40
```

Esperado: sem erros de tipo relacionados a `slaStartsAt`.

- [ ] **Step 4.6 — Commit**

```
git add src/components/tickets/SLAIndicator.tsx src/components/tickets/TicketList.tsx \
  src/app/(internal)/chamados/page.tsx src/app/(internal)/chamados/[id]/page.tsx
git commit -m "feat: SLAIndicator usa sla_starts_at como base do progresso"
```

---

## Task 5: Atualizar `createTicketAction` (canal interno)

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts`

- [ ] **Step 5.1 — Adicionar import de `getEffectiveSLAStart` e `calculateTicketSLAForCompany`**

No topo de `src/app/(internal)/chamados/actions.ts`, alterar a linha de import de `sla`:

```typescript
// Antes
import { calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'

// Depois
import { getEffectiveSLAStart, calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'
```

- [ ] **Step 5.2 — Atualizar o bloco de cálculo de SLA em `createTicketAction`**

Localizar o bloco que começa com `if (slaRule && contract && settings)` (linhas 60-76). Substituí-lo por:

```typescript
    if (slaRule && contract && settings) {
      const businessSettings: BusinessHoursSettings = {
        start: (settings as any).business_hours_start,
        end: (settings as any).business_hours_end,
        days: (settings as any).business_hours_days,
      }
      const holidayDates = (holidays ?? []).map((h: any) => h.date)
      const now = new Date()
      const startsAt = getEffectiveSLAStart(
        now,
        (contract as any).is_24x7,
        businessSettings,
        holidayDates
      )
      const deadline = calculateDeadline({
        createdAt: startsAt,
        responseHours: (slaRule as any).response_hours,
        is24x7: (contract as any).is_24x7,
        settings: businessSettings,
        holidays: holidayDates,
      })

      await supabase.from('tickets').update({
        sla_deadline: deadline.toISOString(),
        sla_starts_at: startsAt.toISOString(),
      } as never).eq('id', ticket!.id)
    }
```

- [ ] **Step 5.3 — Verificar build**

```
npm run build 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 5.4 — Commit**

```
git add src/app/(internal)/chamados/actions.ts
git commit -m "feat: gravar sla_starts_at no canal interno"
```

---

## Task 6: Atualizar criação de chamado no portal

**Files:**
- Modify: `src/app/(portal)/portal/chamados/novo/page.tsx`

- [ ] **Step 6.1 — Atualizar `createPortalTicketAction` em `page.tsx`**

O arquivo atualmente faz insert sem capturar o `id` e sem calcular SLA. Substituir `createPortalTicketAction` por:

```typescript
async function createPortalTicketAction(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single() as { data: any }

  if (!contact) return

  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    category_id: formData.get('category_id') || undefined,
    priority: formData.get('priority') ?? 'media',
    channel: 'portal',
    company_id: contact.company_id,
    contact_id: contact.id,
  })
  if (!parsed.success) return

  const { data: ticket } = await supabase
    .from('tickets')
    .insert(parsed.data as never)
    .select('id')
    .single<{ id: string }>()

  if (ticket) {
    const { calculateTicketSLAForCompany } = await import('@/lib/ticket-sla')
    const sla = await calculateTicketSLAForCompany(supabase, {
      companyId: contact.company_id,
      priority: parsed.data.priority,
      createdAt: new Date(),
    })
    if (sla) {
      await supabase
        .from('tickets')
        .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as never)
        .eq('id', ticket.id)
    }
  }

  redirect('/portal/chamados')
}
```

- [ ] **Step 6.2 — Verificar build**

```
npm run build 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 6.3 — Commit**

```
git add src/app/(portal)/portal/chamados/novo/page.tsx
git commit -m "feat: calcular SLA na abertura de chamado pelo portal"
```

---

## Task 7: Atualizar webhook Zabbix

**Files:**
- Modify: `src/app/api/webhooks/zabbix/[token]/route.ts`

- [ ] **Step 7.1 — Adicionar import de `calculateTicketSLAForCompany`**

No topo do arquivo, após os imports existentes, adicionar:

```typescript
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
```

- [ ] **Step 7.2 — Adicionar cálculo de SLA após o insert do ticket**

Localizar o bloco que começa com `// 8. Create ticket` e termina em `return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })`. Logo após esse bloco (antes de `await supabase.from('ticket_interactions').insert(...)`), adicionar:

```typescript
  // 8b. Calcular SLA (contrato ativo da empresa)
  {
    const sla = await calculateTicketSLAForCompany(supabase, {
      companyId: integration.company_id,
      priority,
      createdAt: new Date(),
    })
    if (sla) {
      await supabase
        .from('tickets')
        .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as any)
        .eq('id', (newTicket as any).id)
    }
  }
```

- [ ] **Step 7.3 — Verificar build**

```
npm run build 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 7.4 — Commit**

```
git add src/app/api/webhooks/zabbix/[token]/route.ts
git commit -m "feat: calcular SLA em chamados criados pelo webhook Zabbix"
```

---

## Task 8: Atualizar webhook Azure Monitor

**Files:**
- Modify: `src/app/api/webhooks/azure/[token]/route.ts`

- [ ] **Step 8.1 — Adicionar import de `calculateTicketSLAForCompany`**

No topo do arquivo, após os imports existentes, adicionar:

```typescript
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
```

- [ ] **Step 8.2 — Adicionar cálculo de SLA após o insert do ticket**

Localizar o bloco que começa com `// 8. Create ticket` e termina em `return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })`. Logo após esse bloco (antes de `await supabase.from('ticket_interactions').insert(...)`), adicionar:

```typescript
  // 8b. Calcular SLA (contrato ativo da empresa)
  {
    const sla = await calculateTicketSLAForCompany(supabase, {
      companyId: integrationData.company_id,
      priority,
      createdAt: new Date(),
    })
    if (sla) {
      await supabase
        .from('tickets')
        .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as any)
        .eq('id', (newTicket as any).id)
    }
  }
```

- [ ] **Step 8.3 — Verificar build**

```
npm run build 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 8.4 — Commit**

```
git add src/app/api/webhooks/azure/[token]/route.ts
git commit -m "feat: calcular SLA em chamados criados pelo webhook Azure Monitor"
```

---

## Task 9: Atualizar cron `process-pending-alerts`

**Files:**
- Modify: `src/app/api/cron/process-pending-alerts/route.ts`

- [ ] **Step 9.1 — Adicionar import de `calculateTicketSLAForCompany`**

No topo do arquivo, após os imports existentes, adicionar:

```typescript
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
```

- [ ] **Step 9.2 — Adicionar cálculo de SLA após o insert do ticket no loop**

Localizar o bloco `if (ticket) {` (linha ~111). Dentro dele, após o insert de `ticket_interactions` e antes de `await insertLog(...)`, adicionar:

```typescript
      // Calcular SLA (contrato ativo da empresa — processado dentro do expediente)
      const sla = await calculateTicketSLAForCompany(supabase, {
        companyId: integration.company_id,
        priority: alert.priority,
        createdAt: new Date(),
      })
      if (sla) {
        await supabase
          .from('tickets')
          .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as any)
          .eq('id', (ticket as any).id)
      }
```

O bloco completo `if (ticket)` ficará assim:

```typescript
    if (ticket) {
      await supabase.from('ticket_interactions').insert({
        ticket_id: (ticket as any).id,
        type: 'system',
        content: `Chamado criado automaticamente (aguardava janela de monitoramento). Evento original: ${new Date(alert.event_at).toLocaleString('pt-BR')}`,
        is_system: true,
      } as any)

      // Calcular SLA (contrato ativo da empresa — processado dentro do expediente)
      const sla = await calculateTicketSLAForCompany(supabase, {
        companyId: integration.company_id,
        priority: alert.priority,
        createdAt: new Date(),
      })
      if (sla) {
        await supabase
          .from('tickets')
          .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as any)
          .eq('id', (ticket as any).id)
      }

      await insertLog(supabase, 'cron_job', 'success', `Alerta pendente processado: chamado #${(ticket as any).number}`, { alert_id: alert.id, ticket_id: (ticket as any).id })
      processed++
    }
```

- [ ] **Step 9.3 — Verificar build final completo**

```
npm run build
```

Esperado: build sem erros de tipo ou compilação.

- [ ] **Step 9.4 — Rodar toda a suite de testes**

```
npx vitest run
```

Esperado: todos os testes passando, incluindo os novos de `getEffectiveSLAStart` e `getSLAPercentUsed`.

- [ ] **Step 9.5 — Commit final**

```
git add src/app/api/cron/process-pending-alerts/route.ts
git commit -m "feat: calcular SLA ao promover alertas pendentes de monitoramento"
```

---

## Checklist de verificação manual (pós-implementação)

Após concluir todas as tasks, verificar os seguintes cenários no ambiente local:

1. **Chamado via portal às 22h** → `sla_starts_at` = próximo dia útil 09h, barra mostra 0% ao abrir no dia seguinte de manhã
2. **Chamado via portal às 10h (dentro do expediente)** → `sla_starts_at` = `created_at`, comportamento idêntico ao atual
3. **Chamado via interface interna com contrato** → `sla_starts_at` gravado corretamente
4. **Empresa sem contrato ativo** → `sla_starts_at` e `sla_deadline` = null, exibe "Sem SLA"
5. **Chamado antigo (sla_starts_at = null)** → barra usa `created_at` como fallback (sem regressão)
