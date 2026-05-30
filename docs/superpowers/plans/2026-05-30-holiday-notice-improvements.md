# Holiday Notice Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar validação de envio por feriado, disparo manual por linha, e BCC configurável para comunicados de feriado.

**Architecture:** Extrai a lógica de envio do cron para `src/lib/holiday-notice.ts` (função compartilhada), adiciona migration com nova coluna `holiday_notice_bcc_emails` em `platform_settings`, e estende a página `/configuracoes/feriados` com coluna de status, Sheet de detalhes e botão de disparo manual por linha.

**Tech Stack:** Next.js 15 App Router, Supabase (service client), Resend (BCC via `sendEmail`), Zod v4, shadcn/ui (Sheet, AlertDialog, Badge), React hooks para estado local.

---

## Mapa de Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260530000001_holiday_notice_bcc.sql` | Criar — migration nova coluna |
| `src/types/database.ts` | Editar — adicionar `holiday_notice_bcc_emails` em `platform_settings` |
| `src/lib/email.ts` | Editar — adicionar `bcc` em `SendEmailParams` |
| `src/lib/email-template-sender.ts` | Editar — adicionar `bcc` em `opts` |
| `src/lib/holiday-notice.ts` | Criar — lógica compartilhada extraída do cron |
| `src/app/api/cron/holiday-notice/route.ts` | Editar — delegar para lib |
| `src/lib/validations/settings.ts` | Editar — novo campo `holiday_notice_bcc_emails` |
| `src/app/(internal)/configuracoes/actions.ts` | Editar — incluir BCC no payload de settings |
| `src/components/settings/PlatformSettingsForm.tsx` | Editar — campo multi-email de BCC |
| `src/app/(internal)/configuracoes/feriados/actions.ts` | Editar — 3 novas actions |
| `src/app/(internal)/configuracoes/feriados/HolidayNoticeButton.tsx` | Criar — botão de disparo + modal |
| `src/app/(internal)/configuracoes/feriados/HolidayNoticeSheet.tsx` | Criar — Sheet de detalhes |
| `src/app/(internal)/configuracoes/feriados/page.tsx` | Editar — coluna Avisos + integrar novos componentes |

---

## Task 1: Migration — `holiday_notice_bcc_emails`

**Files:**
- Create: `supabase/migrations/20260530000001_holiday_notice_bcc.sql`

- [ ] **Criar o arquivo de migration**

```sql
-- supabase/migrations/20260530000001_holiday_notice_bcc.sql
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS holiday_notice_bcc_emails text[] NOT NULL DEFAULT '{}';
```

- [ ] **Aplicar a migration localmente** (requer Docker rodando)

```bash
npm run supabase:start
npx supabase db push
```

Se Docker não estiver disponível, pular para o próximo task — a migration será aplicada em produção depois.

- [ ] **Commit**

```bash
git add supabase/migrations/20260530000001_holiday_notice_bcc.sql
git commit -m "feat: migration adiciona holiday_notice_bcc_emails em platform_settings"
```

---

## Task 2: Atualizar tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Adicionar o campo na Row de `platform_settings`**

Localizar o bloco `platform_settings` e adicionar `holiday_notice_bcc_emails` na `Row`:

```typescript
// Antes (linha ~69, após billing_alert_days):
billing_alert_days: number
updated_at: string | null; updated_by: string | null

// Depois:
billing_alert_days: number
holiday_notice_bcc_emails: string[]
updated_at: string | null; updated_by: string | null
```

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: adiciona holiday_notice_bcc_emails nos tipos database"
```

---

## Task 3: Adicionar suporte a BCC em `sendEmail` e `sendEmailFromTemplate`

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email-template-sender.ts`

- [ ] **Adicionar `bcc` em `SendEmailParams` (`src/lib/email.ts`)**

```typescript
export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from: string
  replyTo?: string
  bcc?: string[]
  attachments?: Array<{ filename: string; content: Buffer | Uint8Array; contentType?: string }>
}

export async function sendEmail(params: SendEmailParams): Promise<string | null> {
  const { data, error } = await resend.emails.send({
    from: params.from,
    to: typeof params.to === 'string' ? [params.to] : params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    ...(params.bcc?.length ? { bcc: params.bcc } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(params.attachments ? { attachments: params.attachments as any } : {}),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
  return data?.id ?? null
}
```

- [ ] **Adicionar `bcc` nos opts de `sendEmailFromTemplate` (`src/lib/email-template-sender.ts`)**

```typescript
export async function sendEmailFromTemplate(
  slug: string,
  to: string | string[],
  vars: Record<string, string>,
  opts?: { replyTo?: string; bcc?: string[] }
): Promise<void> {
  // ... código existente sem alteração ...

  await sendEmail({
    to,
    subject,
    html: wrappedHtml,
    from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
    ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts?.bcc?.length ? { bcc: opts.bcc } : {}),
  })
}
```

- [ ] **Commit**

```bash
git add src/lib/email.ts src/lib/email-template-sender.ts
git commit -m "feat: adiciona suporte a BCC em sendEmail e sendEmailFromTemplate"
```

---

## Task 4: Criar `src/lib/holiday-notice.ts`

**Files:**
- Create: `src/lib/holiday-notice.ts`

- [ ] **Criar o arquivo com a função compartilhada**

```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function sendHolidayNoticesForHoliday(
  holidayId: string,
  mode: 'pending' | 'all',
  serviceClient: SupabaseClient,
  triggeredBy: 'cron' | 'manual' = 'cron'
): Promise<{ sent: number; skipped: number }> {
  const { data: holiday } = await serviceClient
    .from('holidays')
    .select('id, name, date')
    .eq('id', holidayId)
    .single()

  if (!holiday) return { sent: 0, skipped: 0 }

  const { data: responsibles } = await serviceClient
    .from('contacts')
    .select('id, full_name, email, companies!inner(contracts(status))')
    .eq('is_contract_responsible', true)
    .eq('is_active', true)

  const activeContacts = ((responsibles ?? []) as any[]).filter(c =>
    (c.companies?.contracts ?? []).some((ct: any) => ct.status === 'ativo')
  )

  let targets = activeContacts

  if (mode === 'pending') {
    const { data: alreadySentRows } = await serviceClient
      .from('holiday_notice_sent')
      .select('contact_id')
      .eq('holiday_id', holidayId)
    const sentSet = new Set((alreadySentRows ?? []).map((r: any) => r.contact_id))
    targets = activeContacts.filter(c => !sentSet.has(c.id))
  } else {
    // mode = 'all': remove registros anteriores para evitar violação de constraint unique
    await serviceClient
      .from('holiday_notice_sent')
      .delete()
      .eq('holiday_id', holidayId)
  }

  const { data: settingsRaw } = await serviceClient
    .from('platform_settings')
    .select('holiday_notice_bcc_emails')
    .eq('id', 1)
    .single()
  const bccEmails: string[] = (settingsRaw as any)?.holiday_notice_bcc_emails ?? []

  const formattedDate = new Date((holiday as any).date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  let sent = 0
  let skipped = 0

  for (const contact of targets as any[]) {
    try {
      await sendEmailFromTemplate(
        'aviso_feriado',
        contact.email,
        {
          nome_cliente: contact.full_name,
          data_feriado: formattedDate,
          nome_feriado: (holiday as any).name,
        },
        { bcc: bccEmails }
      )

      await serviceClient
        .from('holiday_notice_sent')
        .insert({ holiday_id: holidayId, contact_id: contact.id } as never)

      sent++
    } catch (e) {
      console.error(`Erro ao enviar aviso feriado ${(holiday as any).name} para ${contact.email}:`, e)
      skipped++
    }
  }

  await serviceClient.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Aviso de feriado '${(holiday as any).name}' disparado ${triggeredBy === 'manual' ? 'manualmente' : 'pelo cron'} — ${sent} enviados, ${skipped} com erro`,
    details: { holidayId, sent, skipped, mode, triggeredBy },
  } as never)

  return { sent, skipped }
}
```

- [ ] **Commit**

```bash
git add src/lib/holiday-notice.ts
git commit -m "feat: extrair lógica de envio de avisos de feriado para lib compartilhada"
```

---

## Task 5: Refatorar o cron `holiday-notice`

**Files:**
- Modify: `src/app/api/cron/holiday-notice/route.ts`

- [ ] **Substituir a lógica inline pela chamada à lib**

Conteúdo completo do arquivo após refatoração:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendHolidayNoticesForHoliday } from '@/lib/holiday-notice'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings').select('holiday_notice_days').single()
  const noticeDays = (settings as any)?.holiday_notice_days ?? 7

  const windowStart = now.toISOString().slice(0, 10)
  const windowEnd = new Date(now.getTime() + noticeDays * 24 * 3_600_000)
    .toISOString().slice(0, 10)

  const { data: upcomingHolidays } = await supabase
    .from('holidays')
    .select('id')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  if (!upcomingHolidays?.length) {
    return NextResponse.json({ ok: true, noticesSent: 0 })
  }

  let noticesSent = 0
  for (const holiday of upcomingHolidays as any[]) {
    const result = await sendHolidayNoticesForHoliday(holiday.id, 'pending', supabase, 'cron')
    noticesSent += result.sent
  }

  return NextResponse.json({ ok: true, noticesSent })
}
```

- [ ] **Commit**

```bash
git add src/app/api/cron/holiday-notice/route.ts
git commit -m "refactor: cron holiday-notice delega para lib holiday-notice"
```

---

## Task 6: Campo BCC em configurações de plataforma

**Files:**
- Modify: `src/lib/validations/settings.ts`
- Modify: `src/app/(internal)/configuracoes/actions.ts`
- Modify: `src/components/settings/PlatformSettingsForm.tsx`

### 6a — Schema de validação

- [ ] **Adicionar `holiday_notice_bcc_emails` ao schema Zod** (`src/lib/validations/settings.ts`)

Adicionar após `holiday_notice_days`:

```typescript
holiday_notice_days: z.coerce.number().int().min(1).max(30),
holiday_notice_bcc_emails: z.array(z.string().email('E-mail inválido')).default([]),
```

Também atualizar o tipo exportado — ele é inferido automaticamente via `z.infer`, sem mudança manual.

### 6b — Server action

- [ ] **Incluir BCC no payload** (`src/app/(internal)/configuracoes/actions.ts`)

No `updateSettingsAction`, o `FormData` não suporta arrays diretamente. Adicionar lógica de leitura antes do `safeParse`:

```typescript
export async function updateSettingsAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  raw.business_hours_days = formData.getAll('business_hours_days') as unknown as string
  // BCC emails enviados como múltiplos valores
  const bccRaw = formData.getAll('holiday_notice_bcc_emails')
  raw.holiday_notice_bcc_emails = (bccRaw.length ? bccRaw : []) as unknown as string

  const parsed = platformSettingsSchema.safeParse(raw)
  // ... resto sem alteração ...
```

### 6c — Formulário

- [ ] **Adicionar campo multi-email de BCC no `PlatformSettingsForm.tsx`**

Adicionar state no topo do componente (após os states existentes):

```typescript
const [bccEmails, setBccEmails] = React.useState<string[]>(
  (initialData as any)?.holiday_notice_bcc_emails ?? []
)
const [bccInput, setBccInput] = React.useState('')
const [bccError, setBccError] = React.useState('')
```

Adicionar funções de controle após os handlers existentes:

```typescript
function addBccEmail() {
  const email = bccInput.trim().toLowerCase()
  if (!email) return
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    setBccError('E-mail inválido')
    return
  }
  if (bccEmails.includes(email)) {
    setBccError('E-mail já adicionado')
    return
  }
  setBccEmails(prev => [...prev, email])
  setBccInput('')
  setBccError('')
}

function removeBccEmail(email: string) {
  setBccEmails(prev => prev.filter(e => e !== email))
}
```

No `onSubmit`, incluir os emails BCC no FormData (após o loop `Object.entries`):

```typescript
async function onSubmit(data: PlatformSettingsInput) {
  setFeedback(null)
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'business_hours_days' && Array.isArray(value)) {
      value.forEach((v) => formData.append('business_hours_days', String(v)))
    } else if (key === 'holiday_notice_bcc_emails') {
      // Gerenciado via state local bccEmails — ignorar o valor do react-hook-form
    } else if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  })
  // Appender BCC emails do state local
  bccEmails.forEach(email => formData.append('holiday_notice_bcc_emails', email))

  formData.append('logo_light_url', logoLightUrl)
  formData.append('logo_dark_url', logoDarkUrl)
  if (monitoringContactId) formData.append('monitoring_contact_id', monitoringContactId)

  const result = await updateSettingsAction(formData)
  if (result?.error) {
    setFeedback({ type: 'error', message: result.error })
  } else {
    setFeedback({ type: 'success', message: 'Configurações salvas com sucesso.' })
  }
}
```

Adicionar o campo no JSX dentro do Card "Notificações", após o campo `holiday_notice_days` (linha ~298):

```tsx
<div>
  <label className="text-sm font-medium">E-mails BCC para avisos de feriado</label>
  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
    Estes endereços recebem cópia oculta de cada aviso de feriado enviado.
  </p>
  <div className="flex gap-2">
    <input
      type="email"
      value={bccInput}
      onChange={e => { setBccInput(e.target.value); setBccError('') }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBccEmail() } }}
      placeholder="email@empresa.com.br"
      className="flex-1 border rounded-md px-3 py-2 text-sm"
    />
    <button
      type="button"
      onClick={addBccEmail}
      className="text-sm border rounded-md px-3 py-2 hover:bg-muted whitespace-nowrap"
    >
      Adicionar
    </button>
  </div>
  {bccError && <p className="text-xs text-destructive mt-1">{bccError}</p>}
  {bccEmails.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-2">
      {bccEmails.map(email => (
        <span
          key={email}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs"
        >
          {email}
          <button
            type="button"
            onClick={() => removeBccEmail(email)}
            className="ml-1 text-muted-foreground hover:text-destructive"
            aria-label={`Remover ${email}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )}
</div>
```

- [ ] **Commit**

```bash
git add src/lib/validations/settings.ts src/app/(internal)/configuracoes/actions.ts src/components/settings/PlatformSettingsForm.tsx
git commit -m "feat: campo BCC multi-email para avisos de feriado nas configurações"
```

---

## Task 7: Novas Server Actions em feriados

**Files:**
- Modify: `src/app/(internal)/configuracoes/feriados/actions.ts`

- [ ] **Adicionar 3 novas exports no final do arquivo**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { sendHolidayNoticesForHoliday } from '@/lib/holiday-notice'

// ... ações existentes permanecem intactas ...

export async function getHolidayNoticeSummaryAction(): Promise<Record<string, number>> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('holiday_notice_sent')
    .select('holiday_id')

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) {
    counts[row.holiday_id] = (counts[row.holiday_id] ?? 0) + 1
  }
  return counts
}

export async function getHolidayNoticeDetailsAction(holidayId: string): Promise<{
  contact_id: string
  contact_name: string
  company_name: string | null
  email: string
  sent_at: string
}[]> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('holiday_notice_sent')
    .select('contact_id, sent_at, contacts(full_name, email, companies(name))')
    .eq('holiday_id', holidayId)
    .order('sent_at', { ascending: false })

  return ((data ?? []) as any[]).map(r => ({
    contact_id: r.contact_id,
    contact_name: r.contacts?.full_name ?? '—',
    company_name: r.contacts?.companies?.name ?? null,
    email: r.contacts?.email ?? '—',
    sent_at: r.sent_at,
  }))
}

export async function sendHolidayNoticesAction(
  holidayId: string,
  mode: 'pending' | 'all'
): Promise<{ sent: number; skipped: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'gestor'].includes((profile as any)?.role)) {
    return { error: 'Sem permissão' }
  }

  const serviceSupabase = await createServiceClient()
  const result = await sendHolidayNoticesForHoliday(holidayId, mode, serviceSupabase, 'manual')
  revalidatePath('/configuracoes/feriados')
  return result
}
```

> **Atenção:** o arquivo já importa `createClient` e `revalidatePath` no topo. Adicionar `createServiceClient` ao import existente de `@/lib/supabase/server`.

- [ ] **Commit**

```bash
git add src/app/(internal)/configuracoes/feriados/actions.ts
git commit -m "feat: actions getHolidayNoticeSummary, getHolidayNoticeDetails, sendHolidayNotices"
```

---

## Task 8: Componente `HolidayNoticeButton`

**Files:**
- Create: `src/app/(internal)/configuracoes/feriados/HolidayNoticeButton.tsx`

- [ ] **Criar o componente**

```tsx
'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { sendHolidayNoticesAction } from './actions'

interface Props {
  holidayId: string
  holidayName: string
  sentCount: number
}

export function HolidayNoticeButton({ holidayId, holidayName, sentCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)

  async function handleSend(mode: 'pending' | 'all') {
    setLoading(true)
    setFeedback(null)
    const result = await sendHolidayNoticesAction(holidayId, mode)
    setLoading(false)
    setOpen(false)
    if ('error' in result) {
      setFeedback(`Erro: ${result.error}`)
    } else {
      setFeedback(`${result.sent} aviso(s) enviado(s)`)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" title="Enviar avisos" disabled={loading}>
            {loading ? '...' : '✉'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar avisos — {holidayName}</AlertDialogTitle>
            <AlertDialogDescription>
              {sentCount === 0
                ? 'Enviar aviso deste feriado para todos os responsáveis de contratos ativos?'
                : `${sentCount} contato(s) já receberam este aviso. Como deseja prosseguir?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {sentCount > 0 && (
              <AlertDialogAction onClick={() => handleSend('pending')}>
                Apenas os faltantes
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => handleSend(sentCount === 0 ? 'pending' : 'all')}>
              {sentCount === 0 ? 'Enviar' : 'Reenviar para todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/configuracoes/feriados/HolidayNoticeButton.tsx
git commit -m "feat: componente HolidayNoticeButton com modal de confirmação"
```

---

## Task 9: Componente `HolidayNoticeSheet`

**Files:**
- Create: `src/app/(internal)/configuracoes/feriados/HolidayNoticeSheet.tsx`

- [ ] **Criar o componente**

```tsx
'use client'
import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getHolidayNoticeDetailsAction } from './actions'

interface Detail {
  contact_id: string
  contact_name: string
  company_name: string | null
  email: string
  sent_at: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  holidayId: string
  holidayName: string
  holidayDate: string
}

export function HolidayNoticeSheet({ open, onOpenChange, holidayId, holidayName, holidayDate }: Props) {
  const [details, setDetails] = React.useState<Detail[] | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    getHolidayNoticeDetailsAction(holidayId).then(data => {
      setDetails(data)
      setLoading(false)
    })
  }, [open, holidayId])

  const formattedDate = new Date(holidayDate + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="min-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Avisos enviados — {holidayName} ({formattedDate})</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && details?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum aviso enviado ainda para este feriado.</p>
          )}
          {!loading && details && details.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left font-medium">Contato</th>
                  <th className="py-2 text-left font-medium">Empresa</th>
                  <th className="py-2 text-left font-medium">E-mail</th>
                  <th className="py-2 text-left font-medium">Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {details.map(d => (
                  <tr key={d.contact_id} className="border-b">
                    <td className="py-2 pr-3">{d.contact_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{d.company_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{d.email}</td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(d.sent_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Verificar se `Sheet` está disponível no projeto**

```bash
ls src/components/ui/sheet.tsx
```

Se não existir:

```bash
npx shadcn@latest add sheet
# Verificar se o arquivo gerado importa @base-ui/react — se sim, substituir pela versão Radix
# (ver scroll-area.tsx como referência para o padrão Radix usado no projeto)
```

- [ ] **Commit**

```bash
git add src/app/(internal)/configuracoes/feriados/HolidayNoticeSheet.tsx
git commit -m "feat: componente HolidayNoticeSheet com detalhes de envios por feriado"
```

---

## Task 10: Atualizar `page.tsx` de feriados

**Files:**
- Modify: `src/app/(internal)/configuracoes/feriados/page.tsx`

- [ ] **Substituir o conteúdo completo da página**

```tsx
import { createClient } from '@/lib/supabase/server'
import { createHolidayAction, deleteHolidayAction, getHolidayNoticeSummaryAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImportHolidaysButton } from './ImportHolidaysButton'
import { HolidayRow } from './HolidayRow'

const typeLabels: Record<string, string> = {
  nacional: 'Nacional',
  municipal: 'Municipal — SP',
  manual: 'Manual',
}

export default async function FeriadosPage() {
  const supabase = await createClient()
  const { data: holidays } = (await supabase
    .from('holidays')
    .select('id, date, name, type')
    .order('date')
    .limit(500)) as { data: any[] | null }

  const noticeCounts = await getHolidayNoticeSummaryAction()

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Feriados</h1>
      <ImportHolidaysButton />

      <form action={createHolidayAction as any} className="space-y-3 border rounded-md p-4">
        <h2 className="font-medium">Novo feriado</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="date">Data</Label>
            <Input id="date" name="date" type="date" required />
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Ex: Tiradentes" required />
          </div>
        </div>
        <div>
          <Label htmlFor="type">Tipo</Label>
          <select
            id="type"
            name="type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="nacional">Nacional</option>
            <option value="municipal">Municipal — SP</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <Button type="submit">Adicionar</Button>
      </form>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Avisos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(holidays ?? []).map((h: any) => (
              <HolidayRow
                key={h.id}
                holiday={h}
                typeLabel={typeLabels[h.type] ?? h.type}
                sentCount={noticeCounts[h.id] ?? 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Criar o componente client `HolidayRow`**

```tsx
// src/app/(internal)/configuracoes/feriados/HolidayRow.tsx
'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { deleteHolidayAction } from './actions'
import { HolidayNoticeButton } from './HolidayNoticeButton'
import { HolidayNoticeSheet } from './HolidayNoticeSheet'

interface Props {
  holiday: { id: string; date: string; name: string; type: string }
  typeLabel: string
  sentCount: number
}

export function HolidayRow({ holiday, typeLabel, sentCount }: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false)

  return (
    <tr className="border-b">
      <td className="p-3">{new Date(holiday.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
      <td className="p-3">{holiday.name}</td>
      <td className="p-3 text-muted-foreground text-xs">{typeLabel}</td>
      <td className="p-3">
        <button
          onClick={() => setSheetOpen(true)}
          className={`text-xs font-medium rounded-full px-2 py-0.5 ${
            sentCount > 0
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {sentCount > 0 ? `${sentCount} enviados` : 'Não enviado'}
        </button>
        <HolidayNoticeSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          holidayId={holiday.id}
          holidayName={holiday.name}
          holidayDate={holiday.date}
        />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1 justify-end">
          <HolidayNoticeButton
            holidayId={holiday.id}
            holidayName={holiday.name}
            sentCount={sentCount}
          />
          <form action={deleteHolidayAction.bind(null, holiday.id)}>
            <Button variant="ghost" size="sm" type="submit">Remover</Button>
          </form>
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Commit**

```bash
git add src/app/(internal)/configuracoes/feriados/page.tsx src/app/(internal)/configuracoes/feriados/HolidayRow.tsx
git commit -m "feat: página de feriados com coluna de avisos, botão de disparo e sheet de detalhes"
```

---

## Task 11: Smoke test manual

- [ ] **Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Verificar a página de feriados** em `http://localhost:3000/configuracoes/feriados`

Checar:
- Coluna "Avisos" aparece na tabela
- Badge "Não enviado" aparece para feriados sem envios
- Clicar na badge abre o Sheet lateral com mensagem "Nenhum aviso enviado ainda"
- Botão ✉ aparece na coluna de ações

- [ ] **Verificar configurações de plataforma** em `http://localhost:3000/configuracoes`

Checar:
- Campo "E-mails BCC para avisos de feriado" aparece no card "Notificações"
- Digitar um email e pressionar Enter adiciona chip
- Clicar × remove o chip
- Salvar persiste os emails

- [ ] **Verificar lint**

```bash
npm run lint
```

- [ ] **Commit final se houver ajustes**

```bash
git add -p
git commit -m "fix: ajustes pós smoke test"
```
