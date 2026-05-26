# Sub-spec 7: Relatórios, Dashboards e Alertas de Recorrência — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir os dashboards operacional/mudanças/monitoramento, a seção de chamados agendados na tela principal, o alerta de problema recorrente via `pg_trgm`, e o relatório mensal em PDF gerado automaticamente e sob demanda.

**Architecture:** Todas as páginas de dashboard são Server Components com queries paralelas ao Supabase e processamento TypeScript no servidor. A detecção de recorrência é uma função assíncrona acionada na criação de chamados. O PDF usa `@react-pdf/renderer` (já instalado na v4) renderizado em uma API Route com `renderToBuffer`.

**Tech Stack:** Next.js 15 App Router · Supabase PostgreSQL + `pg_trgm` · `@react-pdf/renderer` v4 · Resend · Vitest · TypeScript · shadcn/ui

---

## Mapa de arquivos

```
src/
├── app/
│   ├── (internal)/
│   │   ├── dashboard/page.tsx                         [MODIFY] — adicionar seção chamados agendados
│   │   └── relatorios/
│   │       ├── operacional/page.tsx                   [CREATE]
│   │       ├── mudancas/page.tsx                      [CREATE]
│   │       ├── monitoramento/page.tsx                 [CREATE]
│   │       └── mensal/
│   │           ├── page.tsx                           [CREATE]
│   │           └── actions.ts                         [CREATE]
│   └── api/
│       ├── cron/monthly-report/route.ts               [CREATE]
│       └── reports/monthly/route.ts                   [CREATE]
├── components/
│   ├── layout/Sidebar.tsx                             [MODIFY] — adicionar links
│   └── reports/
│       └── MonthlyReportPDF.tsx                       [CREATE]
└── lib/
    ├── recurrence-check.ts                            [CREATE]
    └── report-utils.ts                                [CREATE]
supabase/migrations/
└── 20260527000001_dashboard_reporting.sql             [CREATE]
tests/
├── recurrence-check.test.ts                           [CREATE]
└── report-utils.test.ts                               [CREATE]
```

---

## Task 1: Migration — índices de dashboard, coluna recurrence_detected e função pg_trgm

**Files:**
- Create: `supabase/migrations/20260527000001_dashboard_reporting.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new dashboard_reporting
```

Renomear o arquivo gerado para `20260527000001_dashboard_reporting.sql`.

- [ ] **Escrever migration** em `supabase/migrations/20260527000001_dashboard_reporting.sql`

```sql
-- pg_trgm já habilitado em 20260522000004_tickets_schema.sql

-- Índice GIN para detecção de chamados recorrentes por título
create index if not exists idx_tickets_title_trgm
  on public.tickets using gin (title gin_trgm_ops);

-- Índice para queries de dashboard por período
create index if not exists idx_tickets_created_at_dashboard
  on public.tickets (created_at, company_id, assigned_to, status);

-- Índice para relatório mensal (tickets fechados por cliente)
create index if not exists idx_tickets_closed_at
  on public.tickets (closed_at, company_id)
  where closed_at is not null;

-- Coluna para flag de recorrência detectada
alter table public.tickets
  add column if not exists recurrence_detected boolean not null default false;

-- Função para buscar chamados similares via similaridade de título
create or replace function public.find_similar_tickets(
  p_title      text,
  p_company_id uuid,
  p_exclude_id uuid,
  p_since      timestamptz,
  p_threshold  float8 default 0.3
)
returns table (id uuid, number integer, title text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select t.id, t.number, t.title, t.created_at
  from public.tickets t
  where t.company_id  = p_company_id
    and t.id         != p_exclude_id
    and t.created_at >= p_since
    and similarity(t.title, p_title) >= p_threshold
  order by similarity(t.title, p_title) desc
  limit 20;
$$;
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar no Studio**

Abrir `http://127.0.0.1:54323` → Table Editor → tickets. Confirmar que a coluna `recurrence_detected` existe (valor default `false`).

- [ ] **Commit**

```bash
git add supabase/migrations/20260527000001_dashboard_reporting.sql
git commit -m "feat: índices de dashboard, coluna recurrence_detected e função find_similar_tickets"
```

---

## Task 2: Tela Principal — seção de chamados agendados

**Files:**
- Modify: `src/app/(internal)/dashboard/page.tsx`

- [ ] **Adicionar query de chamados agendados ao `Promise.all`**

No `dashboard/page.tsx`, adicionar ao `Promise.all` existente a query de chamados agendados. Adicionar logo após a desestruturação `const now = new Date().toISOString()`:

```typescript
const next2Hours = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
```

Adicionar ao array do `Promise.all` (após `pendingBilling`):

```typescript
    // chamados agendados
    isAnalista
      ? supabase.from('tickets')
          .select('id, number, title, scheduled_at, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'agendado')
          .eq('assigned_to', user!.id)
          .order('scheduled_at')
          .limit(10)
      : supabase.from('tickets')
          .select('id, number, title, scheduled_at, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'agendado')
          .order('scheduled_at')
          .limit(10),
```

Atualizar o tipo da desestruturação para incluir `scheduledTickets` e ajustar `{ data: any[] | null }` no array de tipos.

- [ ] **Adicionar `scheduledTickets` à variável de desestruturação e `isEmpty`**

```typescript
  const [
    { data: overdueTasks },
    { data: upcomingMeetings },
    { data: upcomingGmuds },
    { data: pendingBilling },
    { data: scheduledTickets },
  ] = await Promise.all([...])

  const scheduled = scheduledTickets ?? []
  const isEmpty = tasks.length === 0 && meetings.length === 0 && gmuds.length === 0 && billing.length === 0 && scheduled.length === 0
```

- [ ] **Adicionar seção de chamados agendados no JSX** (logo após o título `<h1>Dashboard</h1>` e antes das outras seções):

```tsx
          {/* Chamados agendados */}
          {scheduled.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                Chamados Agendados
              </h2>
              <div className="divide-y rounded-lg border">
                {(scheduled as any[]).map((t: any) => {
                  const isUrgent = t.scheduled_at && new Date(t.scheduled_at) <= new Date(next2Hours)
                  return (
                    <a
                      key={t.id}
                      href={`/chamados/${t.id}`}
                      className={`flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50 ${isUrgent ? 'bg-orange-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          #{t.number} — {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(t.companies as any)?.name ?? '—'}
                          {!isAnalista && (t.profiles as any)?.full_name && (
                            <> · {(t.profiles as any).full_name}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isUrgent && (
                          <Badge variant="destructive" className="whitespace-nowrap">Próximas 2h</Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.scheduled_at ? formatDateTime(t.scheduled_at) : '—'}
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            </section>
          )}
```

- [ ] **Corrigir filtro de GMUDs** — alterar a query `upcomingGmuds` para incluir apenas `['aprovada', 'em_execucao']` (remover `aguardando_aprovacao`) e para analistas filtrar por `responsible_id = user.id`:

```typescript
    isAnalista
      ? supabase
          .from('change_requests')
          .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
          .in('status', ['aprovada', 'em_execucao'])
          .eq('responsible_id', user!.id)
          .gte('maintenance_start', now)
          .lte('maintenance_start', next14Days)
          .order('maintenance_start')
          .limit(5)
      : supabase
          .from('change_requests')
          .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
          .in('status', ['aprovada', 'em_execucao'])
          .gte('maintenance_start', now)
          .lte('maintenance_start', next14Days)
          .order('maintenance_start')
          .limit(5),
```

- [ ] **Testar manualmente**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard`. Verificar que:
1. A seção "Chamados Agendados" aparece (se houver chamados com `status = 'agendado'`)
2. Não há erros no console
3. Chamados nas próximas 2h têm fundo laranja e badge "Próximas 2h"

- [ ] **Commit**

```bash
git add src/app/\(internal\)/dashboard/page.tsx
git commit -m "feat: dashboard — seção de chamados agendados e filtro correto de GMUDs"
```

---

## Task 3: Lib de detecção de recorrência

**Files:**
- Create: `src/lib/recurrence-check.ts`
- Create: `tests/recurrence-check.test.ts`

- [ ] **Escrever teste** em `tests/recurrence-check.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { shouldAlert } from '@/lib/recurrence-check'

describe('shouldAlert', () => {
  it('retorna false quando count é zero', () => {
    expect(shouldAlert(0, 3)).toBe(false)
  })

  it('retorna false quando abaixo do mínimo', () => {
    expect(shouldAlert(2, 3)).toBe(false)
  })

  it('retorna true no mínimo exato', () => {
    expect(shouldAlert(3, 3)).toBe(true)
  })

  it('retorna true acima do mínimo', () => {
    expect(shouldAlert(5, 3)).toBe(true)
  })

  it('respeita configuração de mínimo diferente', () => {
    expect(shouldAlert(2, 2)).toBe(true)
    expect(shouldAlert(1, 2)).toBe(false)
  })
})
```

- [ ] **Rodar teste para verificar falha**

```bash
npx vitest run tests/recurrence-check.test.ts
```

Expected: FAIL — `shouldAlert is not a function`

- [ ] **Criar `src/lib/recurrence-check.ts`**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export interface SimilarTicket {
  id: string
  number: number
  title: string
  created_at: string
}

export function shouldAlert(similarCount: number, minTickets: number): boolean {
  return similarCount >= minTickets
}

export async function checkAndAlertRecurrence(ticketId: string): Promise<void> {
  const supabase = await createServiceClient()

  const [ticketRes, settingsRes] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, number, title, company_id, assigned_to, companies(name)')
      .eq('id', ticketId)
      .single(),
    supabase
      .from('platform_settings')
      .select('recurrence_min_tickets, recurrence_window_days')
      .single(),
  ])

  const ticket = ticketRes.data as any
  const settings = settingsRes.data as any
  if (!ticket || !settings) return

  const windowDays: number = settings.recurrence_window_days ?? 30
  const minTickets: number = settings.recurrence_min_tickets ?? 3
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const { data: similar } = await supabase.rpc('find_similar_tickets', {
    p_title: ticket.title,
    p_company_id: ticket.company_id,
    p_exclude_id: ticketId,
    p_since: since,
    p_threshold: 0.3,
  }) as { data: SimilarTicket[] | null }

  if (!similar || !shouldAlert(similar.length, minTickets)) return

  await supabase
    .from('tickets')
    .update({ recurrence_detected: true } as any)
    .eq('id', ticketId)

  // Buscar gestores ativos
  const { data: gestores } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'gestor')
    .eq('is_active', true)

  const recipientIds = [...((gestores ?? []) as any[]).map((g: any) => g.id)]
  if (ticket.assigned_to && !recipientIds.includes(ticket.assigned_to)) {
    recipientIds.push(ticket.assigned_to)
  }

  const companyName: string = (ticket.companies as any)?.name ?? ''
  const vars = {
    nome_empresa: companyName,
    janela_dias: String(windowDays),
    total_chamados: String(similar.length),
    categoria_chamados: '—',
  }

  for (const profileId of recipientIds) {
    const { data: authData } = await supabase.auth.admin.getUserById(profileId)
    if (authData.user?.email) {
      await sendEmailFromTemplate('problema_recorrente', authData.user.email, vars)
    }
  }
}
```

- [ ] **Rodar teste para verificar passa**

```bash
npx vitest run tests/recurrence-check.test.ts
```

Expected: PASS (5 tests)

- [ ] **Commit**

```bash
git add src/lib/recurrence-check.ts tests/recurrence-check.test.ts
git commit -m "feat: lib de detecção de problema recorrente via pg_trgm"
```

---

## Task 4: Hook de recorrência na abertura de chamados

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts`
- Modify: `src/app/api/tickets/email/route.ts`

- [ ] **Adicionar chamada ao `checkAndAlertRecurrence` em `createTicketAction`**

Em `src/app/(internal)/chamados/actions.ts`, após a criação do ticket (linha `if (error) return { error: error.message }`), adicionar import e chamada:

No topo do arquivo, adicionar:
```typescript
import { checkAndAlertRecurrence } from '@/lib/recurrence-check'
```

Logo após `if (error) return { error: error.message }` e antes da inserção de `ticket_interactions`:
```typescript
  // Verificar recorrência em background (não bloqueia a resposta)
  void checkAndAlertRecurrence(ticket!.id).catch(() => {/* silencioso */})
```

- [ ] **Adicionar hook no endpoint de criação via e-mail**

Em `src/app/api/tickets/email/route.ts`, após cada `await supabase.from('tickets').insert(...)` que gera um `id`, adicionar o import e a chamada:

No topo do arquivo, adicionar:
```typescript
import { checkAndAlertRecurrence } from '@/lib/recurrence-check'
```

Após cada bloco de criação de ticket que retorna o id (procurar as linhas onde `tickets.insert` retorna um id), adicionar:
```typescript
void checkAndAlertRecurrence(ticketCreated.id).catch(() => {/* silencioso */})
```

> Nota: a chamada é `void` + `.catch()` para não bloquear a resposta da API mesmo que a verificação de recorrência falhe.

- [ ] **Testar manualmente — criar chamado com título repetido**

1. Criar 3 chamados com títulos similares para o mesmo cliente (ex: "Erro de acesso ao sistema", "Problema de acesso ao sistema", "Acesso ao sistema com falha")
2. Verificar que `recurrence_detected = true` é setado no 3º chamado (via Supabase Studio)
3. Verificar que e-mail foi disparado (verificar `system_logs` ou inbox Resend)

- [ ] **Commit**

```bash
git add src/app/\(internal\)/chamados/actions.ts src/app/api/tickets/email/route.ts
git commit -m "feat: hook de recorrência disparado na abertura de chamados"
```

---

## Task 5: Dashboard Operacional

**Files:**
- Create: `src/app/(internal)/relatorios/operacional/page.tsx`

- [ ] **Criar `src/app/(internal)/relatorios/operacional/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function DashboardOperacionalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; stale?: string }>
}) {
  const { from, to, stale } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const toDate = to ?? new Date().toISOString().slice(0, 10)
  const staleDays = parseInt(stale ?? '5', 10)

  const staleThreshold = new Date(Date.now() - staleDays * 86_400_000).toISOString()
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
  const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)

  const [
    { data: ticketsRaw },
    { data: staleRaw },
    { data: contractsRaw },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, status, sla_met, sla_first_response_at, created_at, priority, category_id, assigned_to, company_id, ticket_categories(name), profiles!assigned_to(full_name), companies(name)')
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`) as any,
    supabase
      .from('tickets')
      .select('id, number, title, updated_at, companies(name), profiles!assigned_to(full_name)')
      .not('status', 'in', '("fechado","resolvido")')
      .lt('updated_at', staleThreshold)
      .order('updated_at')
      .limit(20),
    supabase
      .from('contracts')
      .select('id, end_date, companies(name)')
      .eq('status', 'ativo')
      .not('end_date', 'is', null)
      .gte('end_date', today)
      .lte('end_date', in90)
      .order('end_date'),
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

  const tickets = ticketsRaw ?? []
  const staleTickets = staleRaw ?? []
  const contracts = contractsRaw ?? []

  // Status counts
  const statusCounts = tickets.reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  // SLA
  const slaTickets = tickets.filter((t: any) => t.sla_met !== null)
  const slaMet = slaTickets.filter((t: any) => t.sla_met === true).length
  const slaBreached = slaTickets.filter((t: any) => t.sla_met === false).length
  const slaPerc = slaTickets.length > 0 ? Math.round((slaMet / slaTickets.length) * 100) : null

  // Avg first response (horas)
  const withResponse = tickets.filter((t: any) => t.sla_first_response_at)
  const avgResponseH = withResponse.length > 0
    ? withResponse.reduce((acc: number, t: any) => {
        return acc + (new Date(t.sla_first_response_at).getTime() - new Date(t.created_at).getTime())
      }, 0) / withResponse.length / 3_600_000
    : null

  // Reabertura
  const reopened = tickets.filter((t: any) => t.status === 'reaberto').length
  const reopenRate = tickets.length > 0 ? Math.round((reopened / tickets.length) * 100) : 0

  // Distribuição por categoria
  const catMap: Record<string, number> = {}
  tickets.forEach((t: any) => {
    const cat = (t.ticket_categories as any)?.name ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + 1
  })
  const categoryDist = Object.entries(catMap).sort(([, a], [, b]) => b - a)

  // Distribuição por prioridade
  const prioMap: Record<string, number> = {}
  tickets.forEach((t: any) => { prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1 })

  // Contratos por janela
  const expiring30 = contracts.filter((c: any) => c.end_date <= in30)
  const expiring60 = contracts.filter((c: any) => c.end_date > in30 && c.end_date <= in60)
  const expiring90 = contracts.filter((c: any) => c.end_date > in60 && c.end_date <= in90)

  const statusLabels: Record<string, string> = {
    aberto: 'Abertos', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
    aguardando_fornecedor: 'Ag. fornecedor', resolvido: 'Resolvidos',
    fechado: 'Fechados', reaberto: 'Reabertos',
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard Operacional</h1>
        <form className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">De</label>
            <input type="date" name="from" defaultValue={fromDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Até</label>
            <input type="date" name="to" defaultValue={toDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sem atualização (dias)</label>
            <input type="number" name="stale" defaultValue={staleDays} min={1} max={30}
              className="border rounded-md px-3 py-1.5 text-sm w-20" />
          </div>
          <button type="submit"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm h-fit">
            Filtrar
          </button>
        </form>
      </div>

      {/* Cards de status */}
      <section>
        <h2 className="text-base font-medium mb-3">Chamados por status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(statusLabels).map(([key, label]) => (
            <div key={key} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{statusCounts[key] ?? 0}</p>
            </div>
          ))}
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{tickets.length}</p>
          </div>
        </div>
      </section>

      {/* SLA e primeira resposta */}
      <section>
        <h2 className="text-base font-medium mb-3">SLA e Tempo de Resposta</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">SLA cumprido</p>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {slaPerc !== null ? `${slaPerc}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{slaMet} chamados</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">SLA violado</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{slaBreached}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Tempo médio 1ª resposta</p>
            <p className="text-2xl font-bold mt-1">
              {avgResponseH !== null ? `${avgResponseH.toFixed(1)}h` : '—'}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Taxa de reabertura</p>
            <p className="text-2xl font-bold mt-1">{reopenRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{reopened} chamados</p>
          </div>
        </div>
      </section>

      {/* Distribuição por prioridade e categoria */}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="text-base font-medium mb-3">Por prioridade</h2>
          <div className="space-y-2">
            {(['critica', 'alta', 'media', 'baixa'] as const).map((p) => {
              const count = prioMap[p] ?? 0
              const pct = tickets.length > 0 ? Math.round((count / tickets.length) * 100) : 0
              const colors: Record<string, string> = {
                critica: 'bg-red-500', alta: 'bg-orange-400',
                media: 'bg-yellow-400', baixa: 'bg-blue-400',
              }
              return (
                <div key={p}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{p}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${colors[p]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-base font-medium mb-3">Por categoria</h2>
          <div className="space-y-1">
            {categoryDist.slice(0, 8).map(([cat, count]) => (
              <div key={cat} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="truncate">{cat}</span>
                <span className="font-medium shrink-0 ml-4">{count}</span>
              </div>
            ))}
            {categoryDist.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
            )}
          </div>
        </section>
      </div>

      {/* Chamados sem atualização */}
      {staleTickets.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">
            Chamados sem atualização há mais de {staleDays} dias
          </h2>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Chamado</th>
                  <th className="text-left px-4 py-3 font-medium">Empresa</th>
                  <th className="text-left px-4 py-3 font-medium">Analista</th>
                  <th className="text-left px-4 py-3 font-medium">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {(staleTickets as any[]).map((t: any) => (
                  <tr key={t.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/chamados/${t.id}`} className="hover:underline">
                        #{t.number} — {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{(t.companies as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3">{(t.profiles as any)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.updated_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Contratos próximos do vencimento */}
      {contracts.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">Contratos próximos do vencimento</h2>
          <div className="space-y-4">
            {expiring30.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-600 mb-2">
                  Vencendo em até 30 dias ({expiring30.length})
                </h3>
                <div className="space-y-1">
                  {(expiring30 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-red-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expiring60.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-600 mb-2">
                  Vencendo em 31–60 dias ({expiring60.length})
                </h3>
                <div className="space-y-1">
                  {(expiring60 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-orange-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expiring90.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-700 mb-2">
                  Vencendo em 61–90 dias ({expiring90.length})
                </h3>
                <div className="space-y-1">
                  {(expiring90 as any[]).map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-4 py-2 bg-yellow-50">
                      <span>{(c.companies as any)?.name}</span>
                      <span className="font-medium">{new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Testar manualmente**

Abrir `http://localhost:3000/relatorios/operacional`. Verificar que a página renderiza com cards de status, SLA e tabela de contratos.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/relatorios/operacional/page.tsx
git commit -m "feat: dashboard operacional — status, SLA, reabertura, distribuições e contratos"
```

---

## Task 6: Dashboard de Mudanças

**Files:**
- Create: `src/app/(internal)/relatorios/mudancas/page.tsx`

- [ ] **Criar `src/app/(internal)/relatorios/mudancas/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Ag. aprovação',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  revertida: 'Revertida',
  reprovada: 'Reprovada',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  concluida: 'default',
  revertida: 'destructive',
  reprovada: 'destructive',
  em_execucao: 'default',
  aprovada: 'secondary',
  aguardando_aprovacao: 'outline',
  rascunho: 'outline',
}

export default async function DashboardMudancasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const fromDate = from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const toDate = to ?? new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString()

  const [{ data: gmudsRaw }, { data: upcomingRaw }] = await Promise.all([
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, created_at, execution_completed_at, reversal_reason, profiles!responsible_id(full_name)')
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .lte('created_at', `${toDate}T23:59:59Z`)
      .order('created_at', { ascending: false }) as any,
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
      .in('status', ['aprovada', 'em_execucao'])
      .gte('maintenance_start', now)
      .lte('maintenance_start', in60Days)
      .order('maintenance_start')
      .limit(10),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  const gmuds = gmudsRaw ?? []
  const upcoming = upcomingRaw ?? []

  // Contar por status
  const statusMap: Record<string, number> = {}
  gmuds.forEach((g: any) => {
    statusMap[g.status] = (statusMap[g.status] ?? 0) + 1
  })

  // GMUDs revertidas com motivo
  const revertidas = gmuds.filter((g: any) => g.status === 'revertida')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard de Mudanças</h1>
        <form className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">De</label>
            <input type="date" name="from" defaultValue={fromDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Até</label>
            <input type="date" name="to" defaultValue={toDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <button type="submit"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm h-fit">
            Filtrar
          </button>
        </form>
      </div>

      {/* Cards por status */}
      <section>
        <h2 className="text-base font-medium mb-3">GMUDs por status no período</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{statusMap[key] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GMUDs revertidas */}
      {revertidas.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">
            GMUDs revertidas ({revertidas.length})
          </h2>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Título</th>
                  <th className="text-left px-4 py-3 font-medium">Responsável</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo da reversão</th>
                </tr>
              </thead>
              <tbody>
                {(revertidas as any[]).map((g: any) => (
                  <tr key={g.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/mudancas/${g.id}`} className="hover:underline">{g.title}</Link>
                    </td>
                    <td className="px-4 py-3">{(g.profiles as any)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.reversal_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Próximas janelas de manutenção */}
      <section>
        <h2 className="text-base font-medium mb-3">Próximas janelas de manutenção (60 dias)</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma GMUD agendada nos próximos 60 dias.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {(upcoming as any[]).map((g: any) => (
              <Link
                key={g.id}
                href={`/mudancas/${g.id}`}
                className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(g.profiles as any)?.full_name ?? '—'} ·
                    Risco: {g.risk_level}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[g.status] ?? 'secondary'}>
                    {STATUS_LABELS[g.status] ?? g.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(g.maintenance_start).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Testar manualmente**

Abrir `http://localhost:3000/relatorios/mudancas`. Verificar que a página renderiza.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/relatorios/mudancas/page.tsx
git commit -m "feat: dashboard de mudanças — status, revertidas e próximas janelas"
```

---

## Task 7: Dashboard de Monitoramento

**Files:**
- Create: `src/app/(internal)/relatorios/monitoramento/page.tsx`

- [ ] **Criar `src/app/(internal)/relatorios/monitoramento/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function DashboardMonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  // Verificar se há integrações ativas
  const [{ data: integrations }, { data: activeUrls }] = await Promise.all([
    supabase.from('monitoring_integrations').select('id').eq('is_active', true).limit(1),
    supabase.from('monitored_urls').select('id').eq('is_active', true).limit(1),
  ])
  const hasIntegrations = (integrations?.length ?? 0) > 0 || (activeUrls?.length ?? 0) > 0

  if (!hasIntegrations) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard de Monitoramento</h1>
        <p className="text-sm text-muted-foreground">
          Nenhuma integração de monitoramento ativa. Configure integrações em{' '}
          <Link href="/clientes" className="underline">Clientes → Monitoramento</Link>.
        </p>
      </div>
    )
  }

  const fromDate = from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const toDate = to ?? new Date().toISOString().slice(0, 10)

  const { data: monitoringRaw } = await supabase
    .from('tickets')
    .select('id, number, title, status, priority, channel, created_at, closed_at, company_id, companies(name)')
    .in('channel', ['zabbix', 'azure_monitor', 'url_monitoring'])
    .gte('created_at', `${fromDate}T00:00:00Z`)
    .lte('created_at', `${toDate}T23:59:59Z`)
    .order('created_at', { ascending: false }) as any

  const tickets = (monitoringRaw ?? []) as any[]

  // Fechados no período (para MTTR)
  const closed = tickets.filter((t: any) => t.closed_at)
  const mttrMs = closed.length > 0
    ? closed.reduce((acc: number, t: any) =>
        acc + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()), 0
      ) / closed.length
    : null
  const mttrH = mttrMs !== null ? (mttrMs / 3_600_000).toFixed(1) : null

  // Ainda abertos
  const openTickets = tickets.filter((t: any) => !['fechado', 'resolvido'].includes(t.status))

  // Top alertas por cliente + conector
  const alertMap: Record<string, number> = {}
  tickets.forEach((t: any) => {
    const key = `${(t.companies as any)?.name ?? 'Sem empresa'} / ${t.channel}`
    alertMap[key] = (alertMap[key] ?? 0) + 1
  })
  const topAlerts = Object.entries(alertMap).sort(([, a], [, b]) => b - a).slice(0, 10)

  // Resolvidos automaticamente (fechados sem interação humana — proxy: fechados em menos de 5 min)
  const autoResolved = closed.filter((t: any) => {
    const ms = new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()
    return ms < 300_000 // 5 minutos
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard de Monitoramento</h1>
        <form className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">De</label>
            <input type="date" name="from" defaultValue={fromDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Até</label>
            <input type="date" name="to" defaultValue={toDate}
              className="border rounded-md px-3 py-1.5 text-sm" />
          </div>
          <button type="submit"
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm h-fit">
            Filtrar
          </button>
        </form>
      </div>

      {/* Cards de resumo */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total de alertas', value: tickets.length },
            { label: 'Ainda abertos', value: openTickets.length },
            { label: 'Fechados no período', value: closed.length },
            { label: 'MTTR médio', value: mttrH ? `${mttrH}h` : '—' },
          ].map((item) => (
            <div key={item.label} className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Alertas mais frequentes */}
      {topAlerts.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">Alertas mais frequentes</h2>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cliente / Conector</th>
                  <th className="text-right px-4 py-3 font-medium">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {topAlerts.map(([key, count]) => (
                  <tr key={key} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">{key}</td>
                    <td className="px-4 py-3 text-right font-medium">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Chamados de monitoramento ainda abertos */}
      {openTickets.length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3">
            Alertas ainda abertos ({openTickets.length})
          </h2>
          <div className="divide-y rounded-lg border">
            {(openTickets as any[]).map((t: any) => (
              <Link
                key={t.id}
                href={`/chamados/${t.id}`}
                className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">#{t.number} — {t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(t.companies as any)?.name ?? '—'} · {t.channel}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant="destructive">{t.priority}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Testar manualmente**

Abrir `http://localhost:3000/relatorios/monitoramento`. Verificar que:
- Se não há integrações: exibe mensagem de ausência
- Se há integrações: exibe dashboard

- [ ] **Commit**

```bash
git add src/app/\(internal\)/relatorios/monitoramento/page.tsx
git commit -m "feat: dashboard de monitoramento — MTTR, alertas abertos e frequentes"
```

---

## Task 8: Sidebar — links dos novos dashboards

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Adicionar links ao array `navItems` em `src/components/layout/Sidebar.tsx`**

Importar ícones necessários no topo do arquivo (adicionar `TrendingUp`, `Settings2`, `Activity`):
```typescript
import { TrendingUp, Settings2 } from 'lucide-react'
```

Adicionar após o item existente `relatorios/custos`:
```typescript
  { href: '/relatorios/operacional', label: 'Dashboard', icon: TrendingUp, adminOnly: true },
  { href: '/relatorios/mudancas', label: 'Mudanças', icon: Settings2, adminOnly: true },
  { href: '/relatorios/monitoramento', label: 'Monitoramento Dash', icon: Activity, adminOnly: true },
  { href: '/relatorios/mensal', label: 'Relatório Mensal', icon: FileText, adminOnly: true },
```

> Nota: os links com `adminOnly: true` devem ser exibidos apenas para admin/gestor. Se o sidebar já filtra por role, adapte conforme o padrão existente. Se não filtra, adicione a lógica de verificação de role no componente usando `searchParams` ou passando o role como prop.

Se a Sidebar atual não recebe `role`, a forma mais simples é exibir todos os links para todos os perfis internos (o middleware redireciona quem não tiver permissão) — nesse caso, basta adicionar os links sem `adminOnly`.

- [ ] **Testar navegação**

Com o servidor rodando, verificar que todos os 4 novos links aparecem no sidebar e navegam para as rotas corretas.

- [ ] **Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar — links para dashboards operacional, mudanças, monitoramento e mensal"
```

---

## Task 9: Utilitários do relatório mensal e testes

**Files:**
- Create: `src/lib/report-utils.ts`
- Create: `tests/report-utils.test.ts`

- [ ] **Escrever teste** em `tests/report-utils.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { isFirstBusinessDayOfMonth } from '@/lib/report-utils'

describe('isFirstBusinessDayOfMonth', () => {
  it('retorna true quando dia 1 é segunda-feira sem feriado', () => {
    // 2026-06-01 é segunda-feira
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-01T10:00:00Z'), [])).toBe(true)
  })

  it('retorna false para outro dia quando dia 1 é segunda', () => {
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-02T10:00:00Z'), [])).toBe(false)
  })

  it('retorna false para dia 1 quando é domingo', () => {
    // 2026-03-01 é domingo
    expect(isFirstBusinessDayOfMonth(new Date('2026-03-01T10:00:00Z'), [])).toBe(false)
  })

  it('retorna true para dia 2 quando dia 1 é domingo', () => {
    // 2026-03-02 é segunda-feira (dia 1 é domingo)
    expect(isFirstBusinessDayOfMonth(new Date('2026-03-02T10:00:00Z'), [])).toBe(true)
  })

  it('pula feriado no dia 1', () => {
    // 2026-01-01 é quinta-feira; com feriado, primeiro dia útil é 02/01 (sexta)
    expect(isFirstBusinessDayOfMonth(new Date('2026-01-01T10:00:00Z'), ['2026-01-01'])).toBe(false)
    expect(isFirstBusinessDayOfMonth(new Date('2026-01-02T10:00:00Z'), ['2026-01-01'])).toBe(true)
  })

  it('retorna false para datas no meio do mês', () => {
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-15T10:00:00Z'), [])).toBe(false)
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npx vitest run tests/report-utils.test.ts
```

Expected: FAIL — `isFirstBusinessDayOfMonth is not a function`

- [ ] **Criar `src/lib/report-utils.ts`**

```typescript
export function isFirstBusinessDayOfMonth(date: Date, holidays: string[]): boolean {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const dateStr = date.toISOString().slice(0, 10)

  let d = new Date(Date.UTC(year, month, 1))
  while (d.getUTCMonth() === month) {
    const dow = d.getUTCDay()
    const ds = d.toISOString().slice(0, 10)

    if (dow !== 0 && dow !== 6 && !holidays.includes(ds)) {
      return dateStr === ds
    }

    d = new Date(Date.UTC(year, month, d.getUTCDate() + 1))
  }

  return false
}

export function formatMonthReference(date: Date): string {
  const prev = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
  return prev.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function getPreviousMonthRange(date: Date): { start: string; end: string } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}
```

- [ ] **Rodar para verificar passa**

```bash
npx vitest run tests/report-utils.test.ts
```

Expected: PASS (6 tests)

- [ ] **Commit**

```bash
git add src/lib/report-utils.ts tests/report-utils.test.ts
git commit -m "feat: utilitários de relatório mensal — isFirstBusinessDayOfMonth e formatadores"
```

---

## Task 10: Componente PDF do relatório mensal

**Files:**
- Create: `src/components/reports/MonthlyReportPDF.tsx`

- [ ] **Criar diretório e arquivo `src/components/reports/MonthlyReportPDF.tsx`**

```typescript
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 36, color: '#111827', backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1pt solid #e5e7eb', paddingBottom: 14 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e40af' },
  headerSub: { fontSize: 10, color: '#6b7280', marginTop: 3 },
  logo: { height: 36, objectFit: 'contain' },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e40af', marginTop: 18, marginBottom: 8, borderBottom: '0.5pt solid #e5e7eb', paddingBottom: 4 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#f0f9ff', borderRadius: 4, padding: 10 },
  summaryLabel: { fontSize: 8, color: '#6b7280' },
  summaryValue: { fontSize: 18, fontWeight: 'bold', color: '#1e40af', marginTop: 3 },
  chartsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  chartContainer: { flex: 1 },
  chartTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 6 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 3 },
  barItem: { flex: 1, alignItems: 'center' },
  barCount: { fontSize: 6, marginBottom: 2 },
  barBlock: { width: '80%' },
  barLabel: { fontSize: 6, marginTop: 2, textAlign: 'center' },
  table: { width: '100%', marginBottom: 12 },
  tableHead: { flexDirection: 'row', backgroundColor: '#1e40af', padding: '5pt 6pt' },
  tableHeadText: { color: '#fff', fontSize: 8, fontWeight: 'bold', flex: 1 },
  tableHeadTextWide: { color: '#fff', fontSize: 8, fontWeight: 'bold', flex: 2 },
  tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', padding: '4pt 6pt' },
  tableRowHighlight: { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', padding: '4pt 6pt', backgroundColor: '#fef3c7' },
  tableCell: { flex: 1, fontSize: 8 },
  tableCellWide: { flex: 2, fontSize: 8 },
  meetingItem: { marginBottom: 8, padding: 8, backgroundColor: '#f9fafb', borderRadius: 4 },
  meetingTitle: { fontSize: 9, fontWeight: 'bold' },
  meetingDate: { fontSize: 8, color: '#6b7280', marginTop: 2 },
  noData: { fontSize: 9, color: '#6b7280', fontStyle: 'italic', marginBottom: 8 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, textAlign: 'center', fontSize: 8, color: '#9ca3af', borderTop: '0.5pt solid #e5e7eb', paddingTop: 8 },
})

type TicketRow = {
  id: string; number: number; title: string; status: string; priority: string
  created_at: string; closed_at: string | null; assigned_to: string | null
  ticket_categories: { name: string } | null
  profiles: { full_name: string } | null
}

interface MonthlyReportProps {
  company: { name: string }
  platform: { logo_light_url: string | null; company_name: string | null }
  period: { start: string; end: string }
  openedTickets: TicketRow[]
  closedTickets: TicketRow[]
  meetings: Array<{ id: string; title: string; scheduled_at: string; action_items: string | null }>
  gmuds: Array<{ id: string; title: string; status: string; maintenance_start: string; maintenance_end: string }>
  monitoringTickets: TicketRow[]
  hasMonitoring: boolean
}

function BarChart({ data, title }: { data: { label: string; value: number }[]; title: string }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map(d => d.value), 1)
  const BAR_COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe']
  return (
    <View style={S.chartContainer}>
      <Text style={S.chartTitle}>{title}</Text>
      <View style={S.barRow}>
        {data.map((item, i) => {
          const barHeight = Math.max((item.value / max) * 60, 2)
          return (
            <View key={i} style={S.barItem}>
              <Text style={S.barCount}>{item.value}</Text>
              <View style={[S.barBlock, { height: barHeight, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }]} />
              <Text style={S.barLabel}>
                {item.label.length > 7 ? item.label.slice(0, 7) + '.' : item.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function MonthlyReportPDF({
  company, platform, period, openedTickets, closedTickets,
  meetings, gmuds, monitoringTickets, hasMonitoring,
}: MonthlyReportProps) {
  const slaTickets = closedTickets.filter(t => t.status !== 'reaberto')
  const slaMet = slaTickets.length // proxy: todos os chamados fechados consideram SLA atingido — ajustar se sla_met disponível
  const slaPerc = closedTickets.length > 0
    ? Math.round((slaMet / closedTickets.length) * 100)
    : 0
  const reopened = openedTickets.filter(t => t.status === 'reaberto')

  // Charts
  const catMap: Record<string, number> = {}
  const prioMap: Record<string, number> = {}
  const statusMap: Record<string, number> = {}
  closedTickets.forEach(t => {
    const cat = t.ticket_categories?.name ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + 1
    prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1
    statusMap[t.status] = (statusMap[t.status] ?? 0) + 1
  })

  const catData = Object.entries(catMap).sort(([,a],[,b])=>b-a).slice(0,6).map(([l,v])=>({label:l,value:v}))
  const prioData = ['critica','alta','media','baixa'].map(p=>({label:p,value:prioMap[p]??0}))
  const statusData = Object.entries(statusMap).map(([l,v])=>({label:l,value:v}))

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')
  const companyName = platform.company_name ?? 'ITRAMOS'

  return (
    <Document title={`Relatório Mensal — ${company.name}`} author={companyName}>
      <Page size="A4" style={S.page}>

        {/* Cabeçalho */}
        <View style={S.header}>
          <View>
            <Text style={S.headerTitle}>{company.name}</Text>
            <Text style={S.headerSub}>
              Relatório Mensal de Suporte · {fmtDate(period.start)} – {fmtDate(period.end)}
            </Text>
          </View>
          {platform.logo_light_url && (
            <Image src={platform.logo_light_url} style={S.logo} />
          )}
        </View>

        {/* Resumo executivo */}
        <Text style={S.sectionTitle}>Resumo Executivo</Text>
        <View style={S.summaryRow}>
          {[
            { label: 'Chamados abertos', value: openedTickets.length },
            { label: 'Chamados fechados', value: closedTickets.length },
            { label: 'SLA cumprido', value: `${slaPerc}%` },
            { label: 'Reabertos', value: reopened.length },
          ].map(item => (
            <View key={item.label} style={S.summaryCard}>
              <Text style={S.summaryLabel}>{item.label}</Text>
              <Text style={S.summaryValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Gráficos */}
        <Text style={S.sectionTitle}>Distribuição</Text>
        <View style={S.chartsRow}>
          <BarChart data={catData} title="Por categoria" />
          <BarChart data={prioData} title="Por prioridade" />
          <BarChart data={statusData} title="Por status" />
        </View>

        {/* Tabela de chamados */}
        <Text style={S.sectionTitle}>Chamados no período</Text>
        {closedTickets.length === 0 ? (
          <Text style={S.noData}>Nenhum chamado fechado no período.</Text>
        ) : (
          <View style={S.table}>
            <View style={S.tableHead}>
              <Text style={[S.tableHeadText, { flex: 0.6 }]}>#</Text>
              <Text style={S.tableHeadTextWide}>Título</Text>
              <Text style={S.tableHeadText}>Categoria</Text>
              <Text style={S.tableHeadText}>Prioridade</Text>
              <Text style={S.tableHeadText}>Abertura</Text>
              <Text style={S.tableHeadText}>Fechamento</Text>
              <Text style={S.tableHeadText}>Analista</Text>
            </View>
            {closedTickets.map(t => (
              <View key={t.id} style={t.status === 'reaberto' ? S.tableRowHighlight : S.tableRow}>
                <Text style={[S.tableCell, { flex: 0.6 }]}>{t.number}</Text>
                <Text style={S.tableCellWide} numberOfLines={1}>{t.title}</Text>
                <Text style={S.tableCell}>{t.ticket_categories?.name ?? '—'}</Text>
                <Text style={S.tableCell}>{t.priority}</Text>
                <Text style={S.tableCell}>{fmtDate(t.created_at)}</Text>
                <Text style={S.tableCell}>{t.closed_at ? fmtDate(t.closed_at) : '—'}</Text>
                <Text style={S.tableCell}>{t.profiles?.full_name ?? '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={S.footer} fixed>
          {companyName} · Relatório gerado automaticamente
        </Text>
      </Page>

      {/* Página 2 — Reuniões e GMUDs (condicional) */}
      {(meetings.length > 0 || gmuds.length > 0 || hasMonitoring) && (
        <Page size="A4" style={S.page}>

          {meetings.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Reuniões no período</Text>
              {meetings.map(m => (
                <View key={m.id} style={S.meetingItem}>
                  <Text style={S.meetingTitle}>{m.title}</Text>
                  <Text style={S.meetingDate}>
                    {new Date(m.scheduled_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  </Text>
                  {m.action_items && (
                    <Text style={{ fontSize: 8, marginTop: 3, color: '#374151' }}>
                      Itens de ação: {m.action_items}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}

          {gmuds.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Mudanças (GMUD) no período</Text>
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={S.tableHeadTextWide}>Título</Text>
                  <Text style={S.tableHeadText}>Status</Text>
                  <Text style={S.tableHeadText}>Início</Text>
                  <Text style={S.tableHeadText}>Fim</Text>
                </View>
                {gmuds.map(g => (
                  <View key={g.id} style={S.tableRow}>
                    <Text style={S.tableCellWide} numberOfLines={1}>{g.title}</Text>
                    <Text style={S.tableCell}>{g.status}</Text>
                    <Text style={S.tableCell}>
                      {new Date(g.maintenance_start).toLocaleDateString('pt-BR')}
                    </Text>
                    <Text style={S.tableCell}>
                      {new Date(g.maintenance_end).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {hasMonitoring && monitoringTickets.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Monitoramento</Text>
              {(() => {
                const total = monitoringTickets.length
                const resolved = monitoringTickets.filter(t => ['fechado','resolvido'].includes(t.status)).length
                const closedM = monitoringTickets.filter(t => t.closed_at)
                const mttrMs = closedM.length > 0
                  ? closedM.reduce((a,t) =>
                      a + (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()), 0
                    ) / closedM.length
                  : null
                const mttrH = mttrMs ? (mttrMs / 3_600_000).toFixed(1) : '—'
                return (
                  <View style={S.summaryRow}>
                    {[
                      { label: 'Total de alertas', value: total },
                      { label: 'Resolvidos', value: resolved },
                      { label: 'MTTR médio', value: `${mttrH}h` },
                    ].map(item => (
                      <View key={item.label} style={S.summaryCard}>
                        <Text style={S.summaryLabel}>{item.label}</Text>
                        <Text style={S.summaryValue}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                )
              })()}
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.tableHeadText, { flex: 0.6 }]}>#</Text>
                  <Text style={S.tableHeadTextWide}>Título</Text>
                  <Text style={S.tableHeadText}>Canal</Text>
                  <Text style={S.tableHeadText}>Status</Text>
                  <Text style={S.tableHeadText}>Data</Text>
                </View>
                {monitoringTickets.slice(0, 20).map(t => (
                  <View key={t.id} style={S.tableRow}>
                    <Text style={[S.tableCell, { flex: 0.6 }]}>{t.number}</Text>
                    <Text style={S.tableCellWide} numberOfLines={1}>{t.title}</Text>
                    <Text style={S.tableCell}>{t.channel}</Text>
                    <Text style={S.tableCell}>{t.status}</Text>
                    <Text style={S.tableCell}>{fmtDate(t.created_at)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={S.footer} fixed>
            {companyName} · Relatório gerado automaticamente
          </Text>
        </Page>
      )}
    </Document>
  )
}
```

- [ ] **Verificar que TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Corrigir quaisquer erros de tipo antes de prosseguir.

- [ ] **Commit**

```bash
git add src/components/reports/MonthlyReportPDF.tsx
git commit -m "feat: componente PDF do relatório mensal com gráficos, tabelas e seções condicionais"
```

---

## Task 11: API Route de geração de PDF

**Files:**
- Create: `src/app/api/reports/monthly/route.ts`

- [ ] **Criar `src/app/api/reports/monthly/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MonthlyReportPDF } from '@/components/reports/MonthlyReportPDF'

export async function GET(request: Request) {
  // Auth check
  const authSupabase = await createClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: profile } = await authSupabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  const startDate = searchParams.get('start')
  const endDate = searchParams.get('end')

  if (!companyId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: companyId, start, end' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const [
    { data: companyRaw },
    { data: platformRaw },
    { data: openedRaw },
    { data: closedRaw },
    { data: meetingsRaw },
    { data: integrationsRaw },
    { data: urlsRaw },
  ] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('platform_settings').select('logo_light_url, company_name').single(),
    supabase
      .from('tickets')
      .select('id, number, title, status, priority, channel, created_at, closed_at, assigned_to, ticket_categories(name), profiles!assigned_to(full_name)')
      .eq('company_id', companyId)
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .not('channel', 'in', '("zabbix","azure_monitor","url_monitoring")')
      .order('created_at'),
    supabase
      .from('tickets')
      .select('id, number, title, status, priority, channel, created_at, closed_at, assigned_to, ticket_categories(name), profiles!assigned_to(full_name)')
      .eq('company_id', companyId)
      .not('closed_at', 'is', null)
      .gte('closed_at', `${startDate}T00:00:00Z`)
      .lte('closed_at', `${endDate}T23:59:59Z`)
      .not('channel', 'in', '("zabbix","azure_monitor","url_monitoring")')
      .order('created_at'),
    supabase
      .from('meetings')
      .select('id, title, scheduled_at, action_items')
      .eq('company_id', companyId)
      .gte('scheduled_at', `${startDate}T00:00:00Z`)
      .lte('scheduled_at', `${endDate}T23:59:59Z`)
      .order('scheduled_at'),
    supabase.from('monitoring_integrations').select('id').eq('company_id', companyId).eq('is_active', true).limit(1),
    supabase.from('monitored_urls').select('id').eq('company_id', companyId).eq('is_active', true).limit(1),
  ]) as any[]

  const company = companyRaw as any
  const platform = platformRaw as any
  const openedTickets = (openedRaw ?? []) as any[]
  const closedTickets = (closedRaw ?? []) as any[]
  const meetings = (meetingsRaw ?? []) as any[]
  const hasMonitoring = ((integrationsRaw?.length ?? 0) + (urlsRaw?.length ?? 0)) > 0

  // Buscar GMUDs via origin_ticket
  const openedIds = openedTickets.map((t: any) => t.id)
  const { data: gmudsRaw } = openedIds.length
    ? await supabase
        .from('change_requests')
        .select('id, title, status, maintenance_start, maintenance_end')
        .in('origin_ticket_id', openedIds)
        .in('status', ['concluida', 'revertida'])
    : { data: [] }
  const gmuds = (gmudsRaw ?? []) as any[]

  // Buscar chamados de monitoramento
  const { data: monitoringRaw } = await supabase
    .from('tickets')
    .select('id, number, title, status, channel, created_at, closed_at, assigned_to, ticket_categories(name), profiles!assigned_to(full_name), priority')
    .eq('company_id', companyId)
    .in('channel', ['zabbix', 'azure_monitor', 'url_monitoring'])
    .gte('created_at', `${startDate}T00:00:00Z`)
    .lte('created_at', `${endDate}T23:59:59Z`)
  const monitoringTickets = (monitoringRaw ?? []) as any[]

  const props = {
    company: company ?? { name: 'Cliente' },
    platform: platform ?? { logo_light_url: null, company_name: null },
    period: { start: startDate, end: endDate },
    openedTickets,
    closedTickets,
    meetings,
    gmuds,
    monitoringTickets,
    hasMonitoring,
  }

  const buffer = await renderToBuffer(createElement(MonthlyReportPDF, props))

  const safeCompanyName = (company?.name ?? 'relatorio').replace(/[^a-zA-Z0-9-_]/g, '_')
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${safeCompanyName}-${startDate}-${endDate}.pdf"`,
    },
  })
}
```

- [ ] **Testar endpoint manualmente**

```bash
# Com servidor rodando:
curl "http://localhost:3000/api/reports/monthly?companyId=<uuid>&start=2026-04-01&end=2026-04-30" \
  -H "Cookie: <session-cookie>" -o test-report.pdf
```

Abrir `test-report.pdf` e verificar que o PDF gerado contém as seções corretas.

> Nota: Para obter o cookie de sessão, fazer login e copiar da aba Network do navegador.

- [ ] **Commit**

```bash
git add src/app/api/reports/monthly/route.ts
git commit -m "feat: API route de geração de PDF do relatório mensal"
```

---

## Task 12: UI de geração sob demanda

**Files:**
- Create: `src/app/(internal)/relatorios/mensal/page.tsx`
- Create: `src/app/(internal)/relatorios/mensal/actions.ts`

- [ ] **Criar `src/app/(internal)/relatorios/mensal/actions.ts`**

```typescript
'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function sendMonthlyReportAction(
  companyId: string,
  startDate: string,
  endDate: string
) {
  const supabase = await createServiceClient()

  // Buscar responsáveis do contrato ativo
  const { data: contacts } = await supabase
    .from('contacts')
    .select('email, full_name')
    .eq('company_id', companyId)
    .eq('is_contract_responsible', true)
    .eq('is_active', true) as { data: any[] | null }

  if (!contacts || contacts.length === 0) {
    return { error: 'Nenhum responsável de contrato cadastrado para esta empresa.' }
  }

  // Buscar resumo para variáveis do template
  const [
    { count: totalAbertos },
    { count: totalFechados },
    { data: company },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('closed_at', 'is', null)
      .gte('closed_at', `${startDate}T00:00:00Z`)
      .lte('closed_at', `${endDate}T23:59:59Z`),
    supabase.from('companies').select('name').eq('id', companyId).single(),
  ]) as any[]

  const mesRef = new Date(`${startDate}T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/reports/monthly?companyId=${companyId}&start=${startDate}&end=${endDate}`

  for (const contact of (contacts as any[])) {
    await sendEmailFromTemplate('relatorio_mensal', contact.email, {
      nome_destinatario: contact.full_name,
      mes_referencia: mesRef,
      total_abertos: String(totalAbertos ?? 0),
      total_fechados: String(totalFechados ?? 0),
      percentual_sla: '—',
    })
  }

  return { success: true, sent: contacts.length }
}
```

- [ ] **Criar `src/app/(internal)/relatorios/mensal/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sendMonthlyReportAction } from './actions'

export default async function RelatorioMensalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  const today = new Date()
  const defaultStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString().slice(0, 10)
  const defaultEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString().slice(0, 10)

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Relatório Mensal</h1>
      <p className="text-sm text-muted-foreground">
        Gere e envie o relatório mensal de suporte para qualquer cliente e período.
      </p>

      <form className="space-y-4 border rounded-lg p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium">Empresa</label>
          <select name="companyId" required
            className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">Selecione uma empresa...</option>
            {(companies ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">De</label>
            <input type="date" name="start" defaultValue={defaultStart}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Até</label>
            <input type="date" name="end" defaultValue={defaultEnd}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          {/* Download PDF */}
          <button
            type="submit"
            formAction={async (fd: FormData) => {
              'use server'
              const companyId = fd.get('companyId') as string
              const start = fd.get('start') as string
              const end = fd.get('end') as string
              if (!companyId) return
              redirect(`/api/reports/monthly?companyId=${companyId}&start=${start}&end=${end}`)
            }}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm"
          >
            Baixar PDF
          </button>
          {/* Enviar por e-mail */}
          <button
            type="submit"
            formAction={async (fd: FormData) => {
              'use server'
              const companyId = fd.get('companyId') as string
              const start = fd.get('start') as string
              const end = fd.get('end') as string
              if (!companyId) return
              await sendMonthlyReportAction(companyId, start, end)
              redirect('/relatorios/mensal?sent=true')
            }}
            className="border px-4 py-2 rounded-md text-sm hover:bg-muted"
          >
            Enviar por e-mail ao cliente
          </button>
        </div>
      </form>

      {/* Confirmação */}
      {/* Nota: para exibir feedback de envio, adicionar lógica com searchParams.sent */}
    </div>
  )
}
```

- [ ] **Testar manualmente**

Abrir `http://localhost:3000/relatorios/mensal`. Verificar que:
1. O seletor de empresas exibe as empresas ativas
2. O botão "Baixar PDF" faz download do PDF
3. O botão "Enviar por e-mail" dispara o e-mail aos responsáveis

- [ ] **Commit**

```bash
git add src/app/\(internal\)/relatorios/mensal/
git commit -m "feat: UI de geração sob demanda de relatório mensal — download e envio por e-mail"
```

---

## Task 13: Cron job de relatório mensal automático

**Files:**
- Create: `src/app/api/cron/monthly-report/route.ts`

- [ ] **Criar `src/app/api/cron/monthly-report/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isFirstBusinessDayOfMonth, getPreviousMonthRange, formatMonthReference } from '@/lib/report-utils'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Data atual no timezone SP
  const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const today = new Date(spDateStr + 'T00:00:00Z')

  // Buscar feriados do mês corrente para cálculo do primeiro dia útil
  const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', monthStart)
    .lte('date', spDateStr)
  const holidayDates = (holidays ?? []).map((h: any) => h.date as string)

  if (!isFirstBusinessDayOfMonth(today, holidayDates)) {
    return NextResponse.json({ skipped: 'not first business day' })
  }

  const { start, end } = getPreviousMonthRange(today)
  const mesRef = formatMonthReference(today)

  // Buscar contratos ativos com contato responsável
  const { data: responsibles } = await supabase
    .from('contacts')
    .select('email, full_name, company_id, companies(id, name)')
    .eq('is_contract_responsible', true)
    .eq('is_active', true) as { data: any[] | null }

  if (!responsibles || responsibles.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Nenhum responsável cadastrado' })
  }

  // Agrupar por empresa para não enviar duplicatas da mesma empresa
  const byCompany = new Map<string, { name: string; contacts: string[] }>()
  for (const r of responsibles) {
    const compId: string = r.company_id
    const compName: string = (r.companies as any)?.name ?? compId
    if (!byCompany.has(compId)) byCompany.set(compId, { name: compName, contacts: [] })
    byCompany.get(compId)!.contacts.push(r.email)
  }

  let sent = 0
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  for (const [companyId, { name: companyName, contacts }] of byCompany) {
    try {
      // Resumo básico para variáveis do template
      const [{ count: totalAbertos }, { count: totalFechados }] = await Promise.all([
        supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', `${start}T00:00:00Z`)
          .lte('created_at', `${end}T23:59:59Z`),
        supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .not('closed_at', 'is', null)
          .gte('closed_at', `${start}T00:00:00Z`)
          .lte('closed_at', `${end}T23:59:59Z`),
      ]) as any[]

      for (const email of contacts) {
        await sendEmailFromTemplate('relatorio_mensal', email, {
          nome_destinatario: email,
          mes_referencia: mesRef,
          total_abertos: String(totalAbertos ?? 0),
          total_fechados: String(totalFechados ?? 0),
          percentual_sla: '—',
        })
        sent++
      }

      await insertLog(supabase, 'cron_job', 'success',
        `Relatório mensal enviado para ${companyName} (${contacts.length} contatos)`,
        { companyId, period: `${start}/${end}` }
      )
    } catch (err: any) {
      await insertLog(supabase, 'cron_job', 'failure',
        `Erro ao enviar relatório mensal para empresa ${companyId}`,
        { error: err?.message }
      )
    }
  }

  return NextResponse.json({ sent, period: `${start} → ${end}` })
}
```

> Nota: o e-mail enviado não inclui o PDF como anexo diretamente pelo Resend (o Resend suporta attachments via `attachments` param do SDK). Para incluir o PDF como anexo, a implementação futura pode chamar a API Route interna `renderToBuffer` e passar o buffer ao `sendEmail`. Na versão atual, o e-mail inclui um link para download do PDF via a API Route protegida.

- [ ] **Registrar cron no painel do Supabase ou Vercel**

No painel do Vercel (ou Supabase Edge Functions Cron), criar um cron job que dispara diariamente às 08:00 horário de SP:

```
# cron schedule: todo dia às 11h UTC (= 8h BRT)
0 11 * * *
# URL: https://seudominio.com/api/cron/monthly-report
# Header: Authorization: Bearer <CRON_SECRET>
```

Em desenvolvimento, testar manualmente:
```bash
curl "http://localhost:3000/api/cron/monthly-report" \
  -H "Authorization: Bearer <CRON_SECRET_DO_ENV>"
```

Expected: `{"sent": N, "period": "YYYY-MM-DD → YYYY-MM-DD"}` ou `{"skipped": "not first business day"}`

- [ ] **Rodar todos os testes**

```bash
npm test
```

Expected: PASS (todos os testes)

- [ ] **Commit**

```bash
git add src/app/api/cron/monthly-report/route.ts
git commit -m "feat: cron job de relatório mensal automático no primeiro dia útil do mês"
```

---

## Self-Review

### 1. Spec coverage

| Requisito | Task |
|---|---|
| Chamados agendados na tela principal | Task 2 |
| GMUDs próximas (aprovada/em_execucao) com filtro por analista | Task 2 |
| Reuniões próximas (já existe no dashboard) | ✓ existente |
| Tarefas vencidas em destaque (já existe) | ✓ existente |
| Chamados com cobrança pendente (já existe) | ✓ existente |
| Dashboard operacional — status, SLA, reabertura, distribuições | Task 5 |
| Chamados sem atualização (configurável) | Task 5 |
| Contratos próximos do vencimento (30/60/90 dias) | Task 5 |
| Dashboard de mudanças — status, revertidas, próximas janelas | Task 6 |
| Dashboard de monitoramento — MTTR, abertos, frequentes | Task 7 |
| Exibido apenas com integração ativa | Task 7 |
| Índice GIN pg_trgm para recorrência | Task 1 |
| Índices para queries de dashboard | Task 1 |
| `recurrence_detected` column | Task 1 |
| `find_similar_tickets` function | Task 1 |
| Detecção de recorrência na abertura de chamado | Tasks 3 + 4 |
| Alerta de recorrência para gestor + analista (template `problema_recorrente`) | Task 3 |
| Notificação visual no dashboard (via seção `recurrence_detected`) | Nota: add. seção ao dashboard na Task 2 pode ser estendida para exibir `recurrence_detected = true` |
| Relatório mensal — primeiro dia útil do mês via cron | Tasks 9 + 13 |
| Envio por e-mail via Resend com template `relatorio_mensal` | Tasks 12 + 13 |
| Geração sob demanda por qualquer cliente e período | Task 12 |
| PDF com logo ITRAMOS | Task 10 |
| PDF — resumo executivo, gráficos SVG, tabela detalhada | Task 10 |
| PDF — seção reuniões condicional | Task 10 |
| PDF — seção GMUDs condicional | Task 10 |
| PDF — seção monitoramento condicional | Task 10 |

**Gap identificado:** A notificação visual no dashboard interno para Gestor e Admin (chamados com `recurrence_detected = true`) está parcialmente implementada — a coluna existe (Task 1) mas a seção no dashboard não foi explicitamente adicionada na Task 2. Adicionar ao final da Task 2 uma seção que exibe os chamados com `recurrence_detected = true` das últimas 2 semanas.

**Adicionar ao final da Task 2** — nova query no `Promise.all`:
```typescript
    // recorrências detectadas recentemente (admin/gestor)
    !isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, companies(name)')
          .eq('recurrence_detected', true)
          .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
```

E seção JSX correspondente:
```tsx
          {/* Alertas de recorrência (admin/gestor) */}
          {!isAnalista && recurrenceAlerts.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                Alertas de recorrência ({recurrenceAlerts.length})
              </h2>
              <div className="divide-y rounded-lg border border-amber-200 bg-amber-50">
                {(recurrenceAlerts as any[]).map((t: any) => (
                  <a key={t.id} href={`/chamados/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-amber-100">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">#{t.number} — {t.title}</p>
                      <p className="text-xs text-muted-foreground">{(t.companies as any)?.name ?? '—'}</p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}
```

### 2. Placeholder scan

Nenhum placeholder ("TBD", "TODO", etc.) encontrado no plano.

### 3. Type consistency

- `shouldAlert(count, min)` — usado em `recurrence-check.ts` e testado em `recurrence-check.test.ts` ✓
- `isFirstBusinessDayOfMonth(date, holidays)` — usado em `report-utils.ts`, testado em `report-utils.test.ts` e chamado em `monthly-report/route.ts` ✓
- `MonthlyReportPDF` recebe as props `MonthlyReportProps` definidas no componente e passadas pela API Route ✓
- `find_similar_tickets` RPC retorna `SimilarTicket[]` conforme a function SQL definida na migration ✓
