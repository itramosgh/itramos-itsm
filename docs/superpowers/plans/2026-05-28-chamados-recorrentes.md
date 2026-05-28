# Chamados Recorrentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que admins e gestores configurem templates de chamados criados automaticamente em intervalos definidos por cliente.

**Architecture:** Nova tabela `recurring_ticket_templates` armazena os templates. Um cron job diário (`/api/cron/recurring-tickets`) cria os chamados e avança `next_run_at`. Interface de gestão em `/configuracoes/chamados-recorrentes`. Chamados gerados usam `channel = 'recorrente'` para identificação visual.

**Tech Stack:** Next.js 15 App Router, Supabase (service client), Vitest, Tailwind/shadcn

---

### Task 1: Migration + tipos TypeScript

**Files:**
- Modify: `src/types/database.ts:17` (TicketChannel)
- Modify: `src/types/database.ts` (adicionar tipo recurring_ticket_templates)

- [ ] **Step 1: Aplicar migration via Supabase MCP**

```sql
CREATE TABLE recurring_ticket_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'media',
  category_id uuid REFERENCES ticket_categories(id) ON DELETE SET NULL,
  frequency text NOT NULL,
  interval_days integer,
  next_run_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Adicionar `'recorrente'` ao TicketChannel em `src/types/database.ts`**

Linha 17, alterar:
```typescript
export type TicketChannel = 'portal' | 'email' | 'zabbix' | 'azure_monitor' | 'url_monitoring'
```
para:
```typescript
export type TicketChannel = 'portal' | 'email' | 'zabbix' | 'azure_monitor' | 'url_monitoring' | 'recorrente'
```

- [ ] **Step 3: Adicionar tipo `recurring_ticket_templates` em `src/types/database.ts`**

Inserir após a entrada `change_requests` (linha ~414):
```typescript
      recurring_ticket_templates: {
        Row: {
          id: string; company_id: string; contact_id: string
          title: string; description: string | null
          priority: string; category_id: string | null
          frequency: string; interval_days: number | null
          next_run_at: string; is_active: boolean
          created_by: string | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['recurring_ticket_templates']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['recurring_ticket_templates']['Insert']>
      }
```

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: adicionar tipo recurring_ticket_templates e channel recorrente"
```

---

### Task 2: Estender task-recurrence.ts (com testes)

**Files:**
- Modify: `src/lib/task-recurrence.ts`
- Test: `tests/task-recurrence.test.ts`

- [ ] **Step 1: Escrever testes para os novos casos**

Criar `tests/task-recurrence.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { nextOccurrenceDate } from '../src/lib/task-recurrence'

describe('nextOccurrenceDate — casos existentes', () => {
  it('diaria adiciona 1 dia', () => {
    expect(nextOccurrenceDate('2026-06-01', 'diaria')).toBe('2026-06-02')
  })
  it('semanal adiciona 7 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'semanal')).toBe('2026-06-08')
  })
  it('mensal adiciona 1 mês', () => {
    expect(nextOccurrenceDate('2026-01-31', 'mensal')).toBe('2026-02-28')
  })
  it('anual adiciona 1 ano', () => {
    expect(nextOccurrenceDate('2026-06-01', 'anual')).toBe('2027-06-01')
  })
})

describe('nextOccurrenceDate — casos novos', () => {
  it('quinzenal adiciona 14 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'quinzenal')).toBe('2026-06-15')
  })
  it('personalizado adiciona interval_days', () => {
    expect(nextOccurrenceDate('2026-06-01', 'personalizado', 10)).toBe('2026-06-11')
  })
  it('personalizado usa 1 dia quando intervalDays não informado', () => {
    expect(nextOccurrenceDate('2026-06-01', 'personalizado')).toBe('2026-06-02')
  })
})
```

- [ ] **Step 2: Rodar testes para verificar falha nos novos casos**

```bash
npx vitest run tests/task-recurrence.test.ts
```
Esperado: FAIL em `quinzenal` e nos dois `personalizado`

- [ ] **Step 3: Atualizar `src/lib/task-recurrence.ts`**

```typescript
export function nextOccurrenceDate(
  currentDate: string,
  recurrenceType: string,
  intervalDays?: number | null
): string {
  const date = new Date(`${currentDate}T12:00:00`)

  switch (recurrenceType) {
    case 'diaria':
      date.setDate(date.getDate() + 1)
      break
    case 'semanal':
      date.setDate(date.getDate() + 7)
      break
    case 'quinzenal':
      date.setDate(date.getDate() + 14)
      break
    case 'mensal':
      date.setMonth(date.getMonth() + 1)
      break
    case 'anual':
      date.setFullYear(date.getFullYear() + 1)
      break
    case 'personalizado':
      date.setDate(date.getDate() + (intervalDays ?? 1))
      break
  }

  return date.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Rodar testes para verificar que passam**

```bash
npx vitest run tests/task-recurrence.test.ts
```
Esperado: PASS em todos os 7 casos

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-recurrence.ts tests/task-recurrence.test.ts
git commit -m "feat: adicionar quinzenal e personalizado ao nextOccurrenceDate"
```

---

### Task 3: Cron job de criação de chamados recorrentes

**Files:**
- Create: `src/app/api/cron/recurring-tickets/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  const { data: templates } = await supabase
    .from('recurring_ticket_templates')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', today) as { data: any[] | null }

  if (!templates?.length) {
    return NextResponse.json({ ok: true, created: 0 })
  }

  let created = 0

  for (const template of templates) {
    try {
      // 1. Criar chamado
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          title: template.title,
          description: template.description ?? null,
          company_id: template.company_id,
          contact_id: template.contact_id,
          category_id: template.category_id ?? null,
          priority: template.priority,
          channel: 'recorrente',
          status: 'aberto',
        } as never)
        .select('id, number')
        .single()

      if (ticketError || !ticket) {
        await insertLog(supabase, 'cron_job', 'failure',
          `Erro ao criar chamado recorrente (template ${template.id})`,
          { error: ticketError?.message })
        continue
      }

      const ticketId = (ticket as any).id
      const ticketNumber = (ticket as any).number

      // 2. Calcular SLA
      try {
        const sla = await calculateTicketSLAForCompany(supabase, {
          companyId: template.company_id,
          priority: template.priority,
          createdAt: new Date(),
        })
        if (sla) {
          await (supabase.from('tickets') as any)
            .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at })
            .eq('id', ticketId)
        }
      } catch {
        // SLA failure não bloqueia
      }

      // 3. Interação de sistema
      await supabase.from('ticket_interactions').insert({
        ticket_id: ticketId,
        type: 'system',
        content: 'Chamado criado automaticamente por agendamento recorrente.',
        is_system: true,
      } as never)

      // 4. Notificações por e-mail
      try {
        const { resolveContactEmails, resolveNewTicketNotifyEmails } = await import('@/lib/email-notifications')
        const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL!

        const { data: companyData } = await supabase
          .from('companies').select('name').eq('id', template.company_id).single() as { data: any }

        const [contactEmails, notifyEmails] = await Promise.all([
          resolveContactEmails(supabase, template.contact_id, template.company_id),
          resolveNewTicketNotifyEmails(supabase),
        ])
        const allEmails = [...new Set([...contactEmails, ...notifyEmails])]
        if (allEmails.length > 0) {
          await sendEmailFromTemplate('chamado_aberto', allEmails, {
            numero_chamado: String(ticketNumber),
            titulo_chamado: template.title,
            nome_cliente: companyData?.name ?? '',
            link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
            prioridade: template.priority,
          }, { replyTo: `chamado-${ticketNumber}@reply.itramos.com.br` })
        }
      } catch (e) {
        await insertLog(supabase, 'cron_job', 'failure',
          `Erro ao enviar e-mail chamado recorrente #${ticketNumber}`,
          { error: String(e) })
      }

      // 5. Avançar next_run_at
      const nextDate = nextOccurrenceDate(template.next_run_at, template.frequency, template.interval_days)
      await (supabase.from('recurring_ticket_templates') as any)
        .update({ next_run_at: nextDate })
        .eq('id', template.id)

      await insertLog(supabase, 'cron_job', 'success',
        `Chamado recorrente #${ticketNumber} criado (template ${template.id})`,
        { ticket_id: ticketId })
      created++

    } catch (e) {
      await insertLog(supabase, 'cron_job', 'failure',
        `Erro inesperado no template recorrente ${template.id}`,
        { error: String(e) })
    }
  }

  return NextResponse.json({ ok: true, created })
}
```

- [ ] **Step 2: Verificar build sem erros**

```bash
npx tsc --noEmit
```
Esperado: sem erros

- [ ] **Step 3: Registrar endpoint no cron-job.org**

No painel do cron-job.org, criar job com:
- URL: `https://tickets.itramos.com.br/api/cron/recurring-tickets`
- Schedule: `0 11 * * *` (diariamente às 08h Brasília = 11h UTC)
- Header: `Authorization: Bearer <valor de CRON_SECRET>`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/recurring-tickets/route.ts
git commit -m "feat: cron job de criação de chamados recorrentes"
```

---

### Task 4: Server actions CRUD

**Files:**
- Create: `src/app/(internal)/configuracoes/chamados-recorrentes/actions.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['admin', 'gestor']

async function guardAdminGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado', supabase: null, userId: null }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!ALLOWED_ROLES.includes(profile?.role)) return { error: 'Sem permissão', supabase: null, userId: null }
  return { error: null, supabase, userId: user.id }
}

export async function createRecurringTemplateAction(formData: FormData) {
  const { error, supabase, userId } = await guardAdminGestor()
  if (error || !supabase) return { error }

  const frequency = formData.get('frequency') as string
  const intervalDaysRaw = formData.get('interval_days')

  const { error: dbError } = await supabase.from('recurring_ticket_templates').insert({
    company_id: formData.get('company_id'),
    contact_id: formData.get('contact_id'),
    title: formData.get('title'),
    description: (formData.get('description') as string) || null,
    priority: formData.get('priority'),
    category_id: (formData.get('category_id') as string) || null,
    frequency,
    interval_days: frequency === 'personalizado' && intervalDaysRaw ? Number(intervalDaysRaw) : null,
    next_run_at: formData.get('next_run_at'),
    created_by: userId,
  } as never)

  if (dbError) return { error: dbError.message }
  revalidatePath('/configuracoes/chamados-recorrentes')
  return { success: true }
}

export async function toggleRecurringTemplateAction(id: string, isActive: boolean) {
  const { error, supabase } = await guardAdminGestor()
  if (error || !supabase) return { error }
  await (supabase.from('recurring_ticket_templates') as any).update({ is_active: isActive }).eq('id', id)
  revalidatePath('/configuracoes/chamados-recorrentes')
}

export async function deleteRecurringTemplateAction(id: string) {
  const { error, supabase } = await guardAdminGestor()
  if (error || !supabase) return { error }
  await supabase.from('recurring_ticket_templates').delete().eq('id', id)
  revalidatePath('/configuracoes/chamados-recorrentes')
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(internal)/configuracoes/chamados-recorrentes/actions.ts"
git commit -m "feat: server actions CRUD de templates recorrentes"
```

---

### Task 5: Componente RecurringTicketForm

**Files:**
- Create: `src/components/settings/RecurringTicketForm.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRecurringTemplateAction } from '@/app/(internal)/configuracoes/chamados-recorrentes/actions'

interface Props {
  companies: { id: string; name: string }[]
  allContacts: { id: string; full_name: string; company_id: string }[]
  categories: { id: string; name: string }[]
  onSuccess?: () => void
}

const FREQUENCY_LABELS = [
  { value: 'semanal',      label: 'Semanal (a cada 7 dias)' },
  { value: 'quinzenal',    label: 'Quinzenal (a cada 14 dias)' },
  { value: 'mensal',       label: 'Mensal' },
  { value: 'personalizado', label: 'Personalizado (N dias)' },
]

const PRIORITY_LABELS = [
  { value: 'baixa',   label: 'Baixa' },
  { value: 'media',   label: 'Média' },
  { value: 'alta',    label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]

export function RecurringTicketForm({ companies, allContacts, categories, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState('')
  const [frequency, setFrequency] = useState('mensal')
  const [error, setError] = useState<string | null>(null)

  const filteredContacts = companyId
    ? allContacts.filter(c => c.company_id === companyId)
    : []

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createRecurringTemplateAction(formData)
      if (result?.error) { setError(result.error); return }
      ;(e.target as HTMLFormElement).reset()
      setCompanyId('')
      setFrequency('mensal')
      onSuccess?.()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="company_id">Cliente *</Label>
          <select
            id="company_id"
            name="company_id"
            required
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Selecionar...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact_id">Contato/Solicitante *</Label>
          <select
            id="contact_id"
            name="contact_id"
            required
            disabled={!companyId}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50"
          >
            <option value="">Selecionar...</option>
            {filteredContacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="priority">Prioridade</Label>
          <select id="priority" name="priority" defaultValue="media"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            {PRIORITY_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="frequency">Frequência *</Label>
          <select id="frequency" name="frequency" required value={frequency}
            onChange={e => setFrequency(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            {FREQUENCY_LABELS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        {frequency === 'personalizado' && (
          <div className="space-y-1">
            <Label htmlFor="interval_days">Intervalo (dias) *</Label>
            <Input id="interval_days" name="interval_days" type="number" min={1} required />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="next_run_at">Primeira execução *</Label>
        <Input id="next_run_at" name="next_run_at" type="date" required />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Salvando...' : 'Criar template'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/RecurringTicketForm.tsx
git commit -m "feat: componente RecurringTicketForm"
```

---

### Task 6: Página de configuração

**Files:**
- Create: `src/app/(internal)/configuracoes/chamados-recorrentes/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecurringTicketForm } from '@/components/settings/RecurringTicketForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleRecurringTemplateAction, deleteRecurringTemplateAction } from './actions'

const FREQUENCY_LABELS: Record<string, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  personalizado: 'Personalizado',
}

export default async function ChamadosRecorrentesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const [
    { data: templates },
    { data: companies },
    { data: allContacts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('recurring_ticket_templates')
      .select('*, companies(name), contacts(full_name), ticket_categories(name)')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: any[] | null }>,
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
  ])

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Chamados Recorrentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Templates criados automaticamente em intervalos definidos por cliente.
        </p>
      </div>

      {/* Lista */}
      {(templates ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-medium">Templates cadastrados</h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Título</th>
                  <th className="text-left px-4 py-2 font-medium">Frequência</th>
                  <th className="text-left px-4 py-2 font-medium">Próxima execução</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(templates ?? []).map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{t.companies?.name ?? '—'}</td>
                    <td className="px-4 py-2 font-medium">{t.title}</td>
                    <td className="px-4 py-2">
                      {t.frequency === 'personalizado'
                        ? `A cada ${t.interval_days} dias`
                        : FREQUENCY_LABELS[t.frequency] ?? t.frequency}
                    </td>
                    <td className="px-4 py-2">
                      {new Date(t.next_run_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={t.is_active ? 'default' : 'outline'}>
                        {t.is_active ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <form action={toggleRecurringTemplateAction.bind(null, t.id, !t.is_active)}>
                          <Button type="submit" variant="outline" size="sm">
                            {t.is_active ? 'Pausar' : 'Reativar'}
                          </Button>
                        </form>
                        <form action={deleteRecurringTemplateAction.bind(null, t.id)}>
                          <Button type="submit" variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive">
                            Excluir
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Formulário */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Novo template</h2>
        <RecurringTicketForm
          companies={companies ?? []}
          allContacts={allContacts ?? []}
          categories={categories ?? []}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```
Esperado: sem erros

- [ ] **Step 3: Commit**

```bash
git add "src/app/(internal)/configuracoes/chamados-recorrentes/"
git commit -m "feat: página de gestão de chamados recorrentes"
```

---

### Task 7: Badge "Recorrente" na lista e detalhe de chamados

**Files:**
- Modify: `src/components/tickets/TicketList.tsx`
- Modify: `src/app/(internal)/chamados/[id]/page.tsx`
- Modify: `src/app/(internal)/chamados/page.tsx`

- [ ] **Step 1: Adicionar `channel` ao tipo `Ticket` em `TicketList.tsx`**

Na linha 11, adicionar `channel` à interface:
```typescript
interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; sla_starts_at: string | null
  sla_deadline: string | null; sla_first_response_at: string | null
  sla_met: boolean | null; sla_paused_at: string | null; scheduled_at: string | null
  channel?: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
  profiles: { full_name: string } | null
}
```

- [ ] **Step 2: Adicionar badge na coluna Título do `TicketList.tsx`**

Na célula do título (linha ~42), adicionar após o link:
```tsx
<Link href={`/chamados/${t.id}`} className="hover:underline font-medium text-sm leading-snug line-clamp-2">{t.title}</Link>
{t.channel === 'recorrente' && (
  <span className="inline-flex items-center text-xs text-blue-600 font-medium mt-0.5">
    🔁 Recorrente
  </span>
)}
{t.scheduled_at && (
  <p className="text-xs text-blue-600 mt-0.5">
    📅 {fmtDateTimeShort(t.scheduled_at)}
  </p>
)}
```

- [ ] **Step 3: Incluir `channel` no select da página de chamados**

Em `src/app/(internal)/chamados/page.tsx`, linha 29, alterar o `.select(...)` para incluir `channel`:
```typescript
.select('id, number, title, status, priority, channel, created_at, sla_starts_at, sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at, companies(name), contacts(full_name), profiles!assigned_to(full_name)', { count: 'exact' })
```

- [ ] **Step 4: Adicionar badge na página de detalhe do chamado**

Em `src/app/(internal)/chamados/[id]/page.tsx`, localizar onde aparece `<TicketStatusBadge status={ticket.status as TicketStatus} />` (~linha 108) e adicionar ao lado:
```tsx
<TicketStatusBadge status={ticket.status as TicketStatus} />
{ticket.channel === 'recorrente' && (
  <span className="text-xs border rounded-full px-2 py-0.5 text-blue-600 border-blue-200">
    🔁 Recorrente
  </span>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/TicketList.tsx "src/app/(internal)/chamados/page.tsx" "src/app/(internal)/chamados/[id]/page.tsx"
git commit -m "feat: badge Recorrente em chamados com channel=recorrente"
```

---

### Task 8: Card no índice de configurações + push final

**Files:**
- Modify: `src/app/(internal)/configuracoes/page.tsx`

- [ ] **Step 1: Adicionar import e card**

Em `src/app/(internal)/configuracoes/page.tsx`:

Alterar o import de ícones para incluir `RefreshCw`:
```typescript
import {
  Settings, CalendarDays, Tag, Mail, Monitor, Users, ClipboardList, HardDrive, MessageSquare, RefreshCw,
} from 'lucide-react'
```

Adicionar ao array `sections` após `'Templates de Resposta'`:
```typescript
{ href: '/configuracoes/chamados-recorrentes', label: 'Chamados Recorrentes', description: 'Templates de chamados criados automaticamente por cliente', icon: RefreshCw },
```

- [ ] **Step 2: Verificar build completo**

```bash
npm run build
```
Esperado: sem erros

- [ ] **Step 3: Commit e push**

```bash
git add "src/app/(internal)/configuracoes/page.tsx"
git commit -m "feat: card Chamados Recorrentes no índice de configurações"
git push origin main
```

- [ ] **Step 4: Registrar cron no cron-job.org** (se ainda não feito na Task 3)

Confirmar no painel do cron-job.org que o job está ativo:
- URL: `https://tickets.itramos.com.br/api/cron/recurring-tickets`
- Horário: `0 11 * * *`
- Header `Authorization: Bearer <CRON_SECRET>`

---

## Resumo de arquivos

| Arquivo | Ação |
|---|---|
| Supabase migration | CREATE TABLE recurring_ticket_templates |
| `src/types/database.ts` | TicketChannel + tipo da tabela |
| `src/lib/task-recurrence.ts` | quinzenal + personalizado |
| `tests/task-recurrence.test.ts` | Novos casos de teste |
| `src/app/api/cron/recurring-tickets/route.ts` | Cron job |
| `src/app/(internal)/configuracoes/chamados-recorrentes/actions.ts` | CRUD |
| `src/app/(internal)/configuracoes/chamados-recorrentes/page.tsx` | Página |
| `src/components/settings/RecurringTicketForm.tsx` | Formulário |
| `src/components/tickets/TicketList.tsx` | Badge canal |
| `src/app/(internal)/chamados/page.tsx` | Campo channel no select |
| `src/app/(internal)/chamados/[id]/page.tsx` | Badge detalhe |
| `src/app/(internal)/configuracoes/page.tsx` | Card índice |
