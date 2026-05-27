# GMUD Pré-Aprovada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que admin/gestor criem uma GMUD diretamente no status `aprovada`, sem enviar solicitação de aprovação por e-mail, registrando o responsável pela pré-aprovação em `change_approvals`.

**Architecture:** Flag `is_pre_approved` na tabela `change_requests`. Na criação, se a flag está ativa, a action cria o registro com `status = 'aprovada'` e insere um registro em `change_approvals` com `status = 'aprovado'` (sem disparar e-mail). O formulário exibe o checkbox e o campo de e-mail apenas para admin/gestor (via prop `userRole`). A tela de detalhe mostra um badge "Pré-aprovada" e um bloco informativo com quem autorizou.

**Tech Stack:** Next.js 16 App Router, Supabase, Zod v4, shadcn/ui (Badge, Input, Label, Checkbox via `<input type="checkbox">`), TypeScript

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260527000008_gmud_pre_aprovada.sql` | Criar | Coluna `is_pre_approved` |
| `src/lib/validations/change-request.ts` | Modificar | Campos `is_pre_approved`, `pre_approval_email`, `superRefine` |
| `src/app/(internal)/mudancas/actions.ts` | Modificar | Desvio condicional: `aprovada` + insert `change_approvals` |
| `src/components/mudancas/ChangeRequestForm.tsx` | Modificar | Prop `userRole`, checkbox, campo e-mail, label botão |
| `src/app/(internal)/mudancas/nova/page.tsx` | Modificar | Leitura de `userRole` do perfil + passar para form |
| `src/app/(internal)/mudancas/[id]/page.tsx` | Modificar | Incluir `change_approvals` + `is_pre_approved` na query |
| `src/components/mudancas/ChangeRequestDetail.tsx` | Modificar | Badge "Pré-aprovada" + bloco informativo |

---

### Task 1: Migration — coluna `is_pre_approved`

**Files:**
- Create: `supabase/migrations/20260527000008_gmud_pre_aprovada.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/20260527000008_gmud_pre_aprovada.sql
alter table public.change_requests
  add column if not exists is_pre_approved boolean not null default false;
```

- [ ] **Step 2: Aplicar a migration**

```bash
npx supabase db push --include-all
```

Esperado: saída sem erros, termina com `Remote database is up to date.` ou similar.

- [ ] **Step 3: Verificar coluna no banco**

```bash
npx supabase db diff
```

Esperado: sem diff (migration já aplicada). Se houver diff, a coluna não foi criada — verificar erro no step anterior.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527000008_gmud_pre_aprovada.sql
git commit -m "feat: migration gmud is_pre_approved column"
```

---

### Task 2: Validation schema — campos de pré-aprovação

**Files:**
- Modify: `src/lib/validations/change-request.ts`
- Test: `tests/gmud-pre-aprovada.test.ts`

**Contexto:** O schema atual usa Zod v4 e termina com `.refine()` para validação de datas. Vamos adicionar os dois novos campos no objeto e encadear `.superRefine()` para validar que o e-mail é obrigatório quando `is_pre_approved = true`. Em Zod v4, `.refine()` retorna `ZodEffects` que aceita `.superRefine()` encadeado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/gmud-pre-aprovada.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { changeRequestSchema } from '@/lib/validations/change-request'

const baseValid = {
  title: 'Deploy v2',
  description: 'Atualização de versão',
  impacted_systems: 'Servidor A',
  impacted_users: 'Todos os usuários',
  maintenance_start: '2026-06-01T22:00',
  maintenance_end: '2026-06-01T23:00',
  rollback_plan: 'Reverter para v1',
  risk_level: 'baixo' as const,
  responsible_id: '00000000-0000-0000-0000-000000000001',
}

describe('changeRequestSchema — pré-aprovação', () => {
  it('aceita is_pre_approved false sem email (comportamento padrão)', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejeita is_pre_approved true sem email', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('pre_approval_email')
    }
  })

  it('aceita is_pre_approved true com email válido', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
      pre_approval_email: 'aprovador@empresa.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita is_pre_approved true com email inválido', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
      pre_approval_email: 'nao-e-um-email',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Executar o teste — verificar que falha**

```bash
npx vitest run tests/gmud-pre-aprovada.test.ts
```

Esperado: FAIL — `changeRequestSchema` não tem `is_pre_approved` nem `pre_approval_email` ainda.

- [ ] **Step 3: Atualizar `src/lib/validations/change-request.ts`**

Substituir o conteúdo inteiro do arquivo:

```typescript
import { z } from 'zod'

export const changeRequestSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  impacted_systems: z.string().min(1, 'Sistemas impactados são obrigatórios'),
  impacted_users: z.string().min(1, 'Usuários impactados são obrigatórios'),
  maintenance_start: z.string().min(1, 'Início da janela é obrigatório'),
  maintenance_end: z.string().min(1, 'Fim da janela é obrigatório'),
  rollback_plan: z.string().min(1, 'Plano de rollback é obrigatório'),
  risk_level: z.enum(['baixo', 'medio', 'alto'], { message: 'Nível de risco inválido' }),
  responsible_id: z.string().uuid('Responsável inválido'),
  origin_ticket_id: z.string().uuid().optional(),
  is_pre_approved: z.boolean().default(false),
  pre_approval_email: z.string().email('E-mail do aprovador inválido').optional(),
}).refine(
  (data) => new Date(data.maintenance_end) > new Date(data.maintenance_start),
  { message: 'Fim da janela deve ser após o início', path: ['maintenance_end'] }
).superRefine((data, ctx) => {
  if (data.is_pre_approved && !data.pre_approval_email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe o e-mail do responsável pela pré-aprovação',
      path: ['pre_approval_email'],
    })
  }
})

export const approvalRequestSchema = z.object({
  approver_email: z.string().email('E-mail do aprovador inválido'),
  approver_contact_id: z.string().uuid().optional(),
})

export const reversalSchema = z.object({
  reversal_reason: z.string().min(1, 'Motivo da reversão é obrigatório'),
})

export const costSchema = z.object({
  km_traveled: z.coerce.number().min(0).optional(),
  toll_amount: z.coerce.number().min(0).default(0),
  parking_amount: z.coerce.number().min(0).default(0),
  travel_discount_minutes: z.coerce.number().int().min(0).default(0),
})

export type ChangeRequestInput = z.infer<typeof changeRequestSchema>
export type CostInput = z.infer<typeof costSchema>
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>
export type ReversalInput = z.infer<typeof reversalSchema>
```

- [ ] **Step 4: Executar o teste — verificar que passa**

```bash
npx vitest run tests/gmud-pre-aprovada.test.ts
```

Esperado: 4 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/change-request.ts tests/gmud-pre-aprovada.test.ts
git commit -m "feat: schema gmud pre-aprovada com validacao superRefine"
```

---

### Task 3: Server action — desvio condicional pré-aprovada

**Files:**
- Modify: `src/app/(internal)/mudancas/actions.ts`

**Contexto:** A action atual cria a GMUD com `status = 'rascunho'`. Quando `is_pre_approved = true`, deve criar com `status = 'aprovada'` e inserir um registro em `change_approvals` com `status = 'aprovado'` e `responded_at = now()`. O `token` tem default no banco (`gen_random_uuid()`), não precisa ser fornecido. Usar `createServiceClient()` para o insert em `change_approvals` (mesmo padrão do `submitForApprovalAction`). Nenhum e-mail é enviado.

**Estrutura da tabela `change_approvals`:**
```
id uuid PK
change_request_id uuid NOT NULL FK
approver_contact_id uuid nullable FK
approver_email text NOT NULL
token uuid NOT NULL UNIQUE default gen_random_uuid()
status text NOT NULL default 'pendente' check ('pendente','aprovado','reprovado','expirado')
response_reason text nullable
responded_at timestamptz nullable
created_at timestamptz NOT NULL default now()
```

- [ ] **Step 1: Atualizar `src/app/(internal)/mudancas/actions.ts`**

Substituir o conteúdo inteiro:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { changeRequestSchema } from '@/lib/validations/change-request'

export async function createChangeRequestAction(_prevState: unknown, formData: FormData) {
  const contactsRaw = formData.get('notification_contacts')
  let notificationContacts: Array<{ contact_id?: string; external_email?: string; external_name?: string }> = []
  try {
    notificationContacts = JSON.parse(contactsRaw as string ?? '[]')
  } catch {
    return { error: 'Contatos de notificação inválidos' }
  }

  const isPreApproved = formData.get('is_pre_approved') === 'on'
  const preApprovalEmail = (formData.get('pre_approval_email') as string) || undefined

  const parsed = changeRequestSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    impacted_systems: formData.get('impacted_systems'),
    impacted_users: formData.get('impacted_users'),
    maintenance_start: formData.get('maintenance_start'),
    maintenance_end: formData.get('maintenance_end'),
    rollback_plan: formData.get('rollback_plan'),
    risk_level: formData.get('risk_level'),
    responsible_id: formData.get('responsible_id'),
    origin_ticket_id: formData.get('origin_ticket_id') || undefined,
    is_pre_approved: isPreApproved,
    pre_approval_email: preApprovalEmail,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const insertStatus = parsed.data.is_pre_approved ? 'aprovada' : 'rascunho'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cr, error } = await supabase
    .from('change_requests')
    .insert({
      ...parsed.data as any,
      created_by: user!.id,
      status: insertStatus,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  // Pré-aprovação: registrar em change_approvals sem enviar e-mail
  if (parsed.data.is_pre_approved && parsed.data.pre_approval_email) {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.from('change_approvals').insert({
      change_request_id: cr!.id,
      approver_email: parsed.data.pre_approval_email,
      status: 'aprovado',
      responded_at: new Date().toISOString(),
    } as never)
  }

  if (notificationContacts.length > 0) {
    const contactRows = notificationContacts.map((c) => ({
      change_request_id: cr!.id,
      contact_id: c.contact_id ?? null,
      external_email: c.external_email ?? null,
      external_name: c.external_name ?? null,
    }))
    await supabase.from('change_request_contacts').insert(contactRows as never)
  }

  if (parsed.data.origin_ticket_id) {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.from('tickets').update({ status: 'em_mudanca' } as never)
      .eq('id', parsed.data.origin_ticket_id)
    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: parsed.data.origin_ticket_id,
      type: 'system',
      content: `GMUD criada: "${parsed.data.title}". Chamado aguardando conclusão da mudança.`,
      is_system: true,
    } as never)
    revalidatePath(`/chamados/${parsed.data.origin_ticket_id}`)
  }

  revalidatePath('/mudancas')
  return { success: true, id: cr!.id }
}

export async function deleteChangeRequestAction(id: string) {
  const supabase = await createClient()
  await supabase.from('change_requests').delete().eq('id', id).eq('status', 'rascunho')
  revalidatePath('/mudancas')
}
```

- [ ] **Step 2: Verificar build sem erros de TypeScript**

```bash
npm run build 2>&1 | tail -20
```

Esperado: build concluído sem erros (warnings de `as never` / `as any` são aceitáveis — padrão do projeto).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(internal)/mudancas/actions.ts"
git commit -m "feat: action gmud cria com status aprovada quando pre-aprovada"
```

---

### Task 4: Formulário de criação — checkbox + campo e-mail

**Files:**
- Modify: `src/components/mudancas/ChangeRequestForm.tsx`
- Modify: `src/app/(internal)/mudancas/nova/page.tsx`

**Contexto:** O `ChangeRequestForm` é um Client Component que usa `useActionState` com `createChangeRequestAction`. Vamos adicionar a prop `userRole: string` e, quando for `'admin'` ou `'gestor'`, mostrar o checkbox "GMUD pré-aprovada" e — quando marcado — um campo de e-mail. O botão muda o label para "Criar como aprovada" quando o checkbox está marcado. A page `nova/page.tsx` já lê o perfil do usuário; apenas adicionar a leitura do `role` e passá-lo como prop.

- [ ] **Step 1: Atualizar `src/app/(internal)/mudancas/nova/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestForm } from '@/components/mudancas/ChangeRequestForm'

export default async function NovaMudancaPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket_id?: string; ticket_title?: string }>
}) {
  const { ticket_id, ticket_title } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: analysts }, { data: contacts }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single() as Promise<{ data: any }>,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name, email').eq('is_active', true).order('full_name'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova GMUD</h1>
      <ChangeRequestForm
        analysts={(analysts as any[]) ?? []}
        allContacts={(contacts as any[]) ?? []}
        originTicketId={ticket_id}
        originTicketTitle={ticket_title ? decodeURIComponent(ticket_title) : undefined}
        userRole={(profile as any)?.role ?? ''}
      />
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `src/components/mudancas/ChangeRequestForm.tsx`**

Substituir o conteúdo inteiro:

```typescript
'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NotificationContactsSelector } from './NotificationContactsSelector'
import { createChangeRequestAction } from '@/app/(internal)/mudancas/actions'

interface Props {
  analysts: Array<{ id: string; full_name: string }>
  allContacts: Array<{ id: string; full_name: string; email: string }>
  originTicketId?: string
  originTicketTitle?: string
  userRole: string
}

export function ChangeRequestForm({ analysts, allContacts, originTicketId, originTicketTitle, userRole }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, action, pending] = useActionState(createChangeRequestAction, null) as any
  const router = useRouter()
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const [isPreApproved, setIsPreApproved] = useState(false)

  const canPreApprove = userRole === 'admin' || userRole === 'gestor'

  useEffect(() => {
    if (!state?.success || !state.id || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('change_request_id', state!.id!)
          const res = await fetch('/api/upload/gmud', { method: 'POST', body: fd })
          if (!res.ok) {
            const errData = await res.json()
            window.alert(errData?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push(`/mudancas/${state!.id}`)
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {originTicketId && (
        <>
          <input type="hidden" name="origin_ticket_id" value={originTicketId} />
          <p className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-blue-700">
            Vinculada ao chamado: <strong>{originTicketTitle}</strong>
          </p>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição detalhada *</Label>
        <Textarea id="description" name="description" rows={4} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_systems">Sistemas/servidores/aplicações impactados *</Label>
        <Textarea id="impacted_systems" name="impacted_systems" rows={2} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_users">Usuários e clientes impactados *</Label>
        <Textarea id="impacted_users" name="impacted_users" rows={2} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maintenance_start">Início da janela *</Label>
          <Input id="maintenance_start" name="maintenance_start" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance_end">Fim previsto *</Label>
          <Input id="maintenance_end" name="maintenance_end" type="datetime-local" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rollback_plan">Plano de rollback *</Label>
        <Textarea id="rollback_plan" name="rollback_plan" rows={3} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="risk_level">Nível de risco *</Label>
          <select
            id="risk_level"
            name="risk_level"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            <option value="baixo">Baixo</option>
            <option value="medio">Médio</option>
            <option value="alto">Alto</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="responsible_id">Analista responsável *</Label>
          <select
            id="responsible_id"
            name="responsible_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            {analysts.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Contatos a comunicar (início e conclusão) *</Label>
        <NotificationContactsSelector dbContacts={allContacts} />
      </div>

      {/* Pré-aprovação — visível apenas para admin/gestor */}
      {canPreApprove && (
        <div className="space-y-3 rounded-md border p-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_pre_approved"
              name="is_pre_approved"
              checked={isPreApproved}
              onChange={(e) => setIsPreApproved(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="is_pre_approved" className="cursor-pointer font-medium">
              GMUD pré-aprovada (pular envio de aprovação)
            </Label>
          </div>
          {isPreApproved && (
            <div className="space-y-2">
              <Label htmlFor="pre_approval_email">
                E-mail do responsável pela pré-aprovação *
              </Label>
              <Input
                id="pre_approval_email"
                name="pre_approval_email"
                type="email"
                placeholder="aprovador@empresa.com"
                required
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="attachments">Anexos</Label>
        <Input
          id="attachments"
          type="file"
          multiple
          onChange={e => setFiles(e.target.files)}
          className="cursor-pointer"
        />
        <p className="text-xs text-muted-foreground mt-1">Máximo 10 MB por arquivo</p>
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || uploading}>
          {uploading
            ? 'Enviando anexos…'
            : pending
            ? 'Salvando…'
            : isPreApproved
            ? 'Criar como aprovada'
            : 'Criar GMUD'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | tail -20
```

Esperado: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/components/mudancas/ChangeRequestForm.tsx" "src/app/(internal)/mudancas/nova/page.tsx"
git commit -m "feat: formulario gmud pre-aprovada com checkbox e campo email"
```

---

### Task 5: Tela de detalhe — badge e bloco informativo

**Files:**
- Modify: `src/app/(internal)/mudancas/[id]/page.tsx`
- Modify: `src/components/mudancas/ChangeRequestDetail.tsx`

**Contexto:** A page `[id]/page.tsx` busca os dados da GMUD via Supabase. Precisa incluir `is_pre_approved` (já virá automaticamente via `select('*')`) e adicionar `change_approvals(approver_email, responded_at, status)` ao join para obter os dados de quem pré-aprovou.

O `ChangeRequestDetail` recebe os dados como prop `cr`. Precisa:
1. Adicionar `is_pre_approved: boolean` e `change_approvals` ao tipo da prop `cr`
2. Mostrar badge "Pré-aprovada" ao lado do badge de status quando `is_pre_approved = true`
3. Mostrar bloco informativo "Pré-aprovada por X em Y" abaixo dos badges quando `is_pre_approved = true`
4. Ocultar o botão "Enviar para Aprovação" quando `is_pre_approved = true` (o status já é `aprovada`, então esse bloco `status === 'rascunho'` não seria renderizado de qualquer modo — mas adicionamos a guarda para segurança)

- [ ] **Step 1: Atualizar `src/app/(internal)/mudancas/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestDetail } from '@/components/mudancas/ChangeRequestDetail'

export default async function MudancaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  const { data: cr } = await supabase
    .from('change_requests')
    .select(`
      *, profiles!responsible_id(full_name),
      origin_ticket:origin_ticket_id(number, title),
      change_request_contacts(id, external_email, external_name, contacts(full_name, email)),
      change_approvals(approver_email, responded_at, status)
    `)
    .eq('id', id)
    .single() as { data: any }

  if (!cr) notFound()

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name')

  return (
    <ChangeRequestDetail
      cr={cr}
      companyContacts={(contacts as any[]) ?? []}
    />
  )
}
```

- [ ] **Step 2: Atualizar `src/components/mudancas/ChangeRequestDetail.tsx`**

Substituir apenas a interface `Props` e as seções de status/badges. O arquivo completo:

```typescript
'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import type { AttachmentItem } from '@/components/tickets/AttachmentList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  submitForApprovalAction,
  iniciarExecucaoAction,
  concluirGmudAction,
  reverterGmudAction,
} from '@/app/(internal)/mudancas/[id]/actions'
import type { ChangeRequestStatus, RiskLevel } from '@/types/database'

const statusLabel: Record<ChangeRequestStatus, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada', em_execucao: 'Em Execução',
  concluida: 'Concluída', revertida: 'Revertida', reprovada: 'Reprovada',
}

const statusVariant: Record<ChangeRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline', aguardando_aprovacao: 'secondary',
  aprovada: 'default', em_execucao: 'default',
  concluida: 'secondary', revertida: 'destructive', reprovada: 'destructive',
}

interface Props {
  cr: {
    id: string; title: string; description: string; impacted_systems: string
    impacted_users: string; maintenance_start: string; maintenance_end: string
    rollback_plan: string; risk_level: string; status: string
    is_pre_approved: boolean
    execution_started_at: string | null; execution_completed_at: string | null
    reversal_reason: string | null; origin_ticket_id: string | null
    profiles: { full_name: string } | null
    origin_ticket: { number: number; title: string } | null
    change_request_contacts: Array<{
      id: string; external_email: string | null; external_name: string | null
      contacts: { full_name: string; email: string } | null
    }>
    change_approvals: Array<{
      approver_email: string; responded_at: string | null; status: string
    }> | null
  }
  companyContacts: Array<{ id: string; full_name: string; email: string }>
}

export function ChangeRequestDetail({ cr, companyContacts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showApprovalForm, setShowApprovalForm] = useState(false)
  const [showReversalForm, setShowReversalForm] = useState(false)
  const [closeTicket, setCloseTicket] = useState(true)
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const status = cr.status as ChangeRequestStatus
  const risk = cr.risk_level as RiskLevel
  const riskColor: Record<RiskLevel, string> = { baixo: 'text-green-600', medio: 'text-yellow-600', alto: 'text-red-600' }

  // Registro de pré-aprovação (primeiro com status 'aprovado')
  const preApprovalRecord = cr.is_pre_approved
    ? (cr.change_approvals ?? []).find(a => a.status === 'aprovado') ?? null
    : null

  useEffect(() => {
    fetch(`/api/gmud/${cr.id}/attachments`)
      .then(r => r.json())
      .then(d => setAttachments(d.attachments ?? []))
      .catch(() => {})
  }, [cr.id])

  async function handleIniciar() {
    startTransition(async () => {
      const result = await iniciarExecucaoAction(cr.id)
      if (result?.error) setError(result.error)
    })
  }

  async function handleConcluir() {
    startTransition(async () => {
      const result = await concluirGmudAction(cr.id, closeTicket)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cr.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Responsável: {cr.profiles?.full_name ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
            {cr.is_pre_approved && (
              <Badge variant="secondary">Pré-aprovada</Badge>
            )}
          </div>
          <span className={`text-xs font-medium ${riskColor[risk]}`}>
            Risco {risk.charAt(0).toUpperCase() + risk.slice(1)}
          </span>
        </div>
      </div>

      {/* Bloco informativo de pré-aprovação */}
      {cr.is_pre_approved && preApprovalRecord && (
        <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-800">
          <span>✓</span>
          <span>
            Pré-aprovada por <strong>{preApprovalRecord.approver_email}</strong>
            {preApprovalRecord.responded_at && (
              <> em {new Date(preApprovalRecord.responded_at).toLocaleString('pt-BR')}</>
            )}
          </span>
        </div>
      )}

      {cr.origin_ticket && (
        <div className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          Chamado de origem:{' '}
          <a href={`/chamados/${cr.origin_ticket_id}`} className="font-medium text-blue-700 hover:underline">
            #{cr.origin_ticket.number} — {cr.origin_ticket.title}
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 text-sm">
        <div><span className="font-medium">Início da janela:</span>{' '}{new Date(cr.maintenance_start).toLocaleString('pt-BR')}</div>
        <div><span className="font-medium">Fim previsto:</span>{' '}{new Date(cr.maintenance_end).toLocaleString('pt-BR')}</div>
      </div>

      <div className="space-y-3 text-sm">
        <div><p className="font-medium">Descrição</p><p className="mt-1 text-muted-foreground">{cr.description}</p></div>
        <div><p className="font-medium">Sistemas impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_systems}</p></div>
        <div><p className="font-medium">Usuários impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_users}</p></div>
        <div><p className="font-medium">Plano de rollback</p><p className="mt-1 text-muted-foreground">{cr.rollback_plan}</p></div>
      </div>

      {/* Anexos */}
      <div className="border rounded-md p-4 space-y-3">
        <h3 className="text-sm font-medium">Anexos</h3>
        <AttachmentList attachments={attachments} bucket="gmud-attachments" />
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = e.target.files
              if (!files) return
              setUploadingFile(true)
              setFileError('')
              for (const file of Array.from(files)) {
                const fd = new FormData()
                fd.append('file', file)
                fd.append('change_request_id', cr.id)
                const res = await fetch('/api/upload/gmud', { method: 'POST', body: fd })
                const data = await res.json()
                if (!res.ok) {
                  setFileError(data.error ?? 'Erro ao enviar arquivo')
                  break
                } else {
                  setAttachments(prev => [...prev, {
                    id: data.path,
                    filename: file.name,
                    storage_path: data.path,
                    mime_type: file.type,
                    size_bytes: file.size,
                  }])
                }
              }
              setUploadingFile(false)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploadingFile}
            onClick={() => fileInputRef.current?.click()}
            className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50"
          >
            {uploadingFile ? 'Enviando...' : '📎 Adicionar arquivo'}
          </button>
          {fileError && <p className="text-xs text-destructive">{fileError}</p>}
        </div>
      </div>

      {cr.change_request_contacts.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Contatos a comunicar</p>
          <ul className="text-sm space-y-1">
            {cr.change_request_contacts.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                {c.contacts ? `${c.contacts.full_name} (${c.contacts.email})` : `${c.external_name} (${c.external_email})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Ações por status */}
      {status === 'rascunho' && !cr.is_pre_approved && (
        <div className="space-y-3">
          {!showApprovalForm ? (
            <Button onClick={() => setShowApprovalForm(true)}>Enviar para Aprovação</Button>
          ) : (
            <form
              action={async (fd) => {
                const result = await submitForApprovalAction(cr.id, fd)
                if (result?.error) startTransition(() => setError(result.error!))
                else startTransition(() => setShowApprovalForm(false))
              }}
              className="space-y-3 border rounded-md p-4"
            >
              <p className="text-sm font-medium">Solicitar aprovação</p>
              <div className="space-y-2">
                <Label htmlFor="approver_email">E-mail do aprovador *</Label>
                <div className="flex gap-2">
                  <select
                    name="approver_contact_id"
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">E-mail manual</option>
                    {companyContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <Input id="approver_email" name="approver_email" type="email" placeholder="ou digitar e-mail" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>Enviar</Button>
                <Button type="button" variant="outline" onClick={() => setShowApprovalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {status === 'aprovada' && (
        <Button onClick={handleIniciar} disabled={isPending}>
          Iniciar Execução
        </Button>
      )}

      {status === 'em_execucao' && (
        <div className="space-y-3">
          {cr.origin_ticket_id && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="close_ticket"
                checked={closeTicket}
                onChange={(e) => setCloseTicket(e.target.checked)}
              />
              <Label htmlFor="close_ticket">Fechar chamado de origem ao concluir</Label>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleConcluir} disabled={isPending}>Concluir GMUD</Button>
            <Button variant="destructive" onClick={() => setShowReversalForm(true)} disabled={isPending}>
              Reverter (Rollback)
            </Button>
          </div>

          {showReversalForm && (
            <form
              action={async (fd) => {
                const result = await reverterGmudAction(cr.id, fd)
                if (result?.error) startTransition(() => setError(result.error!))
                else startTransition(() => setShowReversalForm(false))
              }}
              className="space-y-3 border border-destructive rounded-md p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="reversal_reason">Motivo da reversão *</Label>
                <Textarea id="reversal_reason" name="reversal_reason" rows={3} required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={isPending}>Confirmar Reversão</Button>
                <Button type="button" variant="outline" onClick={() => setShowReversalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar build final**

```bash
npm run build 2>&1 | tail -20
```

Esperado: build sem erros.

- [ ] **Step 4: Executar todos os testes**

```bash
npx vitest run
```

Esperado: todos os testes passam (incluindo `gmud-pre-aprovada.test.ts`).

- [ ] **Step 5: Commit final**

```bash
git add "src/app/(internal)/mudancas/[id]/page.tsx" "src/components/mudancas/ChangeRequestDetail.tsx"
git commit -m "feat: detalhe gmud mostra badge e bloco pre-aprovada"
```

---

## Verificação manual após implementação

1. Logar como **analista** → acessar Nova GMUD → checkbox "GMUD pré-aprovada" **não deve aparecer**
2. Logar como **admin ou gestor** → acessar Nova GMUD → checkbox **deve aparecer**
3. Marcar o checkbox → campo de e-mail deve aparecer; botão deve mudar para "Criar como aprovada"
4. Submeter sem preencher e-mail → erro "Informe o e-mail do responsável pela pré-aprovação"
5. Submeter com e-mail válido → GMUD criada, redireciona para detalhe
6. Na tela de detalhe: badge "Aprovada" + badge "Pré-aprovada" visíveis; bloco verde "✓ Pré-aprovada por X em Y" visível; botão "Iniciar Execução" disponível imediatamente (sem botão "Enviar para Aprovação")
7. Criar GMUD **sem** marcar checkbox → comportamento original inalterado (status `rascunho`, botão "Enviar para Aprovação")
