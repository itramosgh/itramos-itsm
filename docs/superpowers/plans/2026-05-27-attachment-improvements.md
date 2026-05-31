# Attachment Improvements: Size Limit + Creation-Time Uploads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Enforce 10 MB file size limit in all upload routes; (2) Allow attaching files during creation of chamados (internal), reuniões, tarefas, and GMUD.

**Architecture:** Upload routes receive a size check before processing. Forms that need creation-time uploads follow the established pattern: action returns `{ id }` instead of calling `redirect()`, client detects the ID in state via `useEffect`, uploads files, then navigates. `createMeetingAction` and `createChangeRequestAction` already return `{ id }` — those forms just need a file input added. `createTicketAction` and `createTaskAction` need the redirect replaced with an ID return.

**Tech Stack:** Next.js 16 App Router, Server Actions, `useActionState`, `useEffect` + `useRouter`, Supabase Storage

---

## Mapa de Arquivos

**Modificar:**
- `src/app/api/upload/attachment/route.ts` — add 10 MB size guard
- `src/app/api/upload/comunicado/route.ts` — add 10 MB size guard
- `src/app/api/upload/gmud/route.ts` — add 10 MB size guard
- `src/app/api/upload/meeting/route.ts` — add 10 MB size guard
- `src/app/api/upload/task/route.ts` — add 10 MB size guard
- `src/app/api/upload/kb-document/route.ts` — add 10 MB size guard
- `src/app/(internal)/chamados/actions.ts` — `createTicketAction`: replace `redirect()` with `return { ticketId }`
- `src/components/tickets/TicketForm.tsx` — update action return type + add file input + `useEffect` upload + `router.push`
- `src/app/(internal)/tarefas/actions.ts` — `createTaskAction`: replace `redirect('/tarefas')` with `return { taskId }`
- `src/components/tarefas/TaskForm.tsx` — update action return type + add file input + `useEffect` upload + `router.push`
- `src/components/reunioes/MeetingForm.tsx` — add file input + upload files before `router.push` (action already returns `{ id }`)
- `src/components/mudancas/ChangeRequestForm.tsx` — add file input + upload files before `router.push` (action already returns `{ id }`)

---

## Task 1: Limite de 10 MB em todos os routes de upload

**Files:**
- Modify: `src/app/api/upload/attachment/route.ts`
- Modify: `src/app/api/upload/comunicado/route.ts`
- Modify: `src/app/api/upload/gmud/route.ts`
- Modify: `src/app/api/upload/meeting/route.ts`
- Modify: `src/app/api/upload/task/route.ts`
- Modify: `src/app/api/upload/kb-document/route.ts`

- [ ] **Step 1: Adicionar verificação de tamanho em `attachment/route.ts`**

Logo após extrair `file` do formData e verificar se ele existe, adicionar:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'Arquivo muito grande. Limite máximo: 10 MB.' }, { status: 400 })
}
```

Adicionar `MAX_FILE_SIZE` no topo do handler, logo antes do `if (!file || !ticketId)`.

Resultado esperado — arquivo completo:

```typescript
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const ticketId = formData.get('ticket_id') as string
  const interactionId = formData.get('interaction_id') as string | null

  if (!file || !ticketId) {
    return NextResponse.json({ error: 'Arquivo e ticket_id são obrigatórios' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. Limite máximo: 10 MB.' }, { status: 400 })
  }

  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = interactionId
    ? `${ticketId}/${interactionId}/${Date.now()}_${safeFilename}`
    : `${ticketId}/sem_interacao/${Date.now()}_${safeFilename}`

  const buffer = await file.arrayBuffer()

  const serviceSupabase = await createServiceClient()
  const { error: uploadError } = await serviceSupabase.storage
    .from('ticket-attachments')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await serviceSupabase.from('ticket_attachments').insert({
    ticket_id: ticketId,
    interaction_id: interactionId || null,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  } as never)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, path })
}
```

- [ ] **Step 2: Adicionar verificação de tamanho nos outros 5 routes**

Para cada um dos outros routes (`comunicado`, `gmud`, `meeting`, `task`, `kb-document`), ler o arquivo e adicionar logo após a extração do `file` e validação de parâmetros obrigatórios:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
// ... (manter código existente de extração de file e parâmetros)
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'Arquivo muito grande. Limite máximo: 10 MB.' }, { status: 400 })
}
```

A constante deve ser declarada fora do handler (nível de módulo), logo após os imports.

- [ ] **Step 3: Verificar que todos os routes têm o guard**

Buscar todos os arquivos de upload e confirmar que nenhum está sem o guard:

```
files: attachment, comunicado, gmud, meeting, task, kb-document
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/upload/
git commit -m "feat: limite de 10 MB em todos os routes de upload"
```

---

## Task 2: Anexos na criação de Chamados (interno)

**Files:**
- Modify: `src/app/(internal)/chamados/actions.ts`
- Modify: `src/components/tickets/TicketForm.tsx`

O `createTicketAction` atual termina com `redirect('/chamados/${ticket!.id}')`. Precisamos mudar para retornar `{ ticketId }`. O `TicketForm` precisa detectar o `ticketId` no estado, fazer upload dos arquivos selecionados para `/api/upload/attachment`, e depois navegar para `/chamados/{ticketId}`.

- [ ] **Step 1: Modificar `createTicketAction` para retornar `{ ticketId }` em vez de redirect**

Em `src/app/(internal)/chamados/actions.ts`, substituir a última linha:

```typescript
redirect(`/chamados/${ticket!.id}`)
```

por:

```typescript
revalidatePath('/chamados')
return { ticketId: ticket!.id }
```

O import de `redirect` pode ser removido se não for mais usado por nenhuma outra função no arquivo. Verificar se outras funções o usam antes de remover (não usam — somente `createTicketAction` chamava `redirect` neste arquivo). Remover o import de `redirect`.

- [ ] **Step 2: Atualizar `TicketForm.tsx` — prop type, file input, upload, navegação**

Substituir o arquivo completo por:

```typescript
'use client'
import { useActionState, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string; ticketId?: string } | undefined>
  companies: { id: string; name: string }[]
  contacts: { id: string; full_name: string; company_id: string }[]
  contracts: { id: string; company_id: string; status: string }[]
  analysts: { id: string; full_name: string }[]
  categories: { id: string; name: string }[]
}

export function TicketForm({ action, companies, contacts, contracts, analysts, categories }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const router = useRouter()

  const filteredContacts = selectedCompanyId
    ? contacts.filter(c => c.company_id === selectedCompanyId)
    : []

  const filteredContracts = selectedCompanyId
    ? contracts.filter(c => c.company_id === selectedCompanyId && c.status === 'ativo')
    : contracts.filter(c => c.status === 'ativo')

  useEffect(() => {
    if (!state?.ticketId || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('ticket_id', state!.ticketId!)
          const res = await fetch('/api/upload/attachment', { method: 'POST', body: fd })
          if (!res.ok) {
            const data = await res.json()
            window.alert(data?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push(`/chamados/${state!.ticketId}`)
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="channel" value="portal" />
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="priority">Prioridade *</Label>
          <select id="priority" name="priority" required className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="company_id">Empresa *</Label>
          <select
            id="company_id"
            name="company_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={selectedCompanyId}
            onChange={e => setSelectedCompanyId(e.target.value)}
          >
            <option value="">Selecionar empresa</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="contact_id">Solicitante *</Label>
          <select
            id="contact_id"
            name="contact_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            disabled={!selectedCompanyId}
          >
            <option value="">
              {selectedCompanyId ? 'Selecionar contato' : 'Selecione a empresa primeiro'}
            </option>
            {filteredContacts.map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contract_id">Contrato</Label>
          <select id="contract_id" name="contract_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem contrato</option>
            {filteredContracts.map(c => (
              <option key={c.id} value={c.id}>Contrato {c.id.slice(0, 8)}...</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="assigned_to">Analista responsável</Label>
          <select id="assigned_to" name="assigned_to" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Não atribuído</option>
            {analysts.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      </div>
      <div>
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
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || uploading}>
        {uploading ? 'Enviando anexos...' : pending ? 'Criando...' : 'Criar chamado'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Verificar visualmente**

Acessar `/chamados/novo` (rota interna), criar um chamado com e sem arquivo. Confirmar que após a criação o sistema navega para `/chamados/{id}` e os anexos aparecem na seção de anexos do chamado.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/chamados/actions.ts src/components/tickets/TicketForm.tsx
git commit -m "feat: anexos na criação de chamados internos"
```

---

## Task 3: Anexos na criação de Tarefas

**Files:**
- Modify: `src/app/(internal)/tarefas/actions.ts`
- Modify: `src/components/tarefas/TaskForm.tsx`

O `createTaskAction` atual termina com `redirect('/tarefas')`. Precisamos retornar `{ taskId }`. O `TaskForm` usa `useActionState` com `formAction`; precisa detectar o `taskId`, fazer upload e navegar para `/tarefas` (a lista, pois tarefas não têm página de detalhe de criação diferenciada — mas podemos navegar para `/tarefas` após o upload).

- [ ] **Step 1: Modificar `createTaskAction` para retornar `{ taskId }` em vez de redirect**

Em `src/app/(internal)/tarefas/actions.ts`, a função atual insere a tarefa e termina com:

```typescript
if (error) return { error: error.message }
revalidatePath('/tarefas')
redirect('/tarefas')
```

A query de insert não retorna o ID. Precisamos adicionar `.select('id').single()`:

```typescript
const { data: task, error } = await supabase.from('tasks').insert({
  ...parsed.data,
  created_by: user!.id,
} as never).select('id').single<{ id: string }>()

if (error) return { error: error.message }
revalidatePath('/tarefas')
return { taskId: task!.id }
```

Remover o import de `redirect` se não for mais usado (verificar: `redirect` é importado no topo — após essa mudança não é mais usado).

- [ ] **Step 2: Atualizar `TaskForm.tsx` — prop type, file input, upload, navegação**

Substituir o arquivo completo por:

```typescript
'use client'
import { useActionState, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ActionResult = { error?: string; success?: boolean; taskId?: string } | null

interface TaskFormProps {
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>
  initialData?: {
    title?: string
    description?: string | null
    company_id?: string | null
    assigned_to?: string
    due_date?: string
    priority?: string | null
    reminder_days_before?: number
    is_recurring?: boolean
    recurrence_type?: string | null
  }
  companies: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
  currentUserId?: string
  isAnalista?: boolean
}

export function TaskForm({ action, initialData, companies, profiles, currentUserId, isAnalista }: TaskFormProps) {
  const [state, formAction, pending] = useActionState(action, null)
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring ?? false)
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const router = useRouter()

  const isEdit = !!initialData

  useEffect(() => {
    if (!state?.taskId || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('task_id', state!.taskId!)
          const res = await fetch('/api/upload/task', { method: 'POST', body: fd })
          if (!res.ok) {
            const data = await res.json()
            window.alert(data?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push('/tarefas')
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={initialData?.description ?? ''} rows={3} />
      </div>
      <div>
        <Label htmlFor="company_id">Cliente</Label>
        <select
          id="company_id"
          name="company_id"
          defaultValue={initialData?.company_id ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem cliente vinculado</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="assigned_to">Responsável *</Label>
        {isAnalista ? (
          <input type="hidden" name="assigned_to" value={currentUserId} />
        ) : (
          <select
            id="assigned_to"
            name="assigned_to"
            defaultValue={initialData?.assigned_to ?? currentUserId ?? ''}
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Selecione...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      <div>
        <Label htmlFor="due_date">Data de vencimento *</Label>
        <Input id="due_date" name="due_date" type="date" defaultValue={initialData?.due_date} required />
      </div>
      <div>
        <Label htmlFor="priority">Prioridade</Label>
        <select
          id="priority"
          name="priority"
          defaultValue={initialData?.priority ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </div>
      <div>
        <Label htmlFor="reminder_days_before">Lembrete antecipado (dias antes)</Label>
        <Input
          id="reminder_days_before"
          name="reminder_days_before"
          type="number"
          min="0"
          defaultValue={initialData?.reminder_days_before ?? 3}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_recurring"
          name="is_recurring"
          checked={isRecurring}
          onChange={e => setIsRecurring(e.target.checked)}
        />
        <Label htmlFor="is_recurring">Tarefa recorrente</Label>
      </div>
      {isRecurring && (
        <div>
          <Label htmlFor="recurrence_type">Tipo de recorrência</Label>
          <select
            id="recurrence_type"
            name="recurrence_type"
            defaultValue={initialData?.recurrence_type ?? 'mensal'}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      )}
      {!isEdit && (
        <div>
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
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || uploading}>
        {uploading ? 'Enviando anexos...' : pending ? 'Salvando...' : 'Salvar tarefa'}
      </Button>
    </form>
  )
}
```

Note: `isEdit = !!initialData` — o input de arquivo aparece apenas na criação (sem `initialData`), pois na edição os anexos já são gerenciados pela página `/tarefas/[id]/editar` via `TaskAttachments`.

- [ ] **Step 3: Verificar visualmente**

Acessar `/tarefas/nova`, criar uma tarefa com arquivo. Confirmar navegação para `/tarefas` e que o anexo aparece na tarefa criada.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/tarefas/actions.ts src/components/tarefas/TaskForm.tsx
git commit -m "feat: anexos na criação de tarefas"
```

---

## Task 4: Anexos na criação de Reuniões

**Files:**
- Modify: `src/components/reunioes/MeetingForm.tsx`

O `createMeetingAction` já retorna `{ success: true; id: string }`. O `MeetingForm` já detecta `result.id` e chama `router.push('/reunioes/${result.id}')`. Precisamos apenas adicionar um file input e fazer o upload antes do push.

- [ ] **Step 1: Adicionar estado de files e upload no `MeetingForm.tsx`**

No bloco de `useState` existente, adicionar:

```typescript
const [files, setFiles] = useState<FileList | null>(null)
```

- [ ] **Step 2: Modificar `handleSubmit` para fazer upload após criação**

Substituir o trecho final de `handleSubmit`:

```typescript
// ANTES:
const result = await action(data)
setPending(false)

if (result.error) { setError(result.error); return }
if (result.id) router.push(`/reunioes/${result.id}`)
else router.push('/reunioes')
```

por:

```typescript
// DEPOIS:
const result = await action(data)

if (result.error) { setError(result.error); setPending(false); return }

if (result.id && files && files.length > 0) {
  for (const file of Array.from(files)) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('meeting_id', result.id)
    const res = await fetch('/api/upload/meeting', { method: 'POST', body: fd })
    if (!res.ok) {
      const errData = await res.json()
      window.alert(errData?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
      break
    }
  }
}

setPending(false)
if (result.id) router.push(`/reunioes/${result.id}`)
else router.push('/reunioes')
```

- [ ] **Step 3: Adicionar input de arquivo no JSX**

Antes do `{error && ...}` e do botão de submit, adicionar:

```tsx
{!isEdit && (
  <div>
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
)}
```

- [ ] **Step 4: Verificar visualmente**

Acessar `/reunioes/nova`, criar uma reunião com arquivo. Confirmar que navega para `/reunioes/{id}` e o anexo aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/reunioes/MeetingForm.tsx
git commit -m "feat: anexos na criação de reuniões"
```

---

## Task 5: Anexos na criação de GMUD

**Files:**
- Modify: `src/components/mudancas/ChangeRequestForm.tsx`

O `createChangeRequestAction` já retorna `{ success: true; id: string }`. O `ChangeRequestForm` já tem `useEffect` que detecta `state?.success && state.id` e chama `router.push('/mudancas/${state.id}')`. Precisamos adicionar file input e fazer o upload dentro do `useEffect` antes do push — ou alternativamente, já que é um form com `action={action}` (não `onSubmit`), adaptar para fazer upload no `useEffect`.

A estratégia: manter o `useEffect` existente mas adicionar estado `files` e fazer o upload lá antes do push.

- [ ] **Step 1: Adicionar estado de files no `ChangeRequestForm.tsx`**

Adicionar `useState` para os arquivos. O import `useState` já existe no arquivo (verificar — se não existir, adicionar junto com `useRef`):

```typescript
import { useActionState, useState, useRef } from 'react' // adicionar useState e useRef se não existirem
```

Adicionar dentro do componente:

```typescript
const [files, setFiles] = useState<FileList | null>(null)
const uploadStartedRef = useRef(false)
```

- [ ] **Step 2: Modificar o `useEffect` existente para fazer upload antes do push**

Substituir o `useEffect` existente:

```typescript
// ANTES:
useEffect(() => {
  if (state?.success && state.id) {
    router.push(`/mudancas/${state.id}`)
  }
}, [state, router])
```

por:

```typescript
// DEPOIS:
useEffect(() => {
  if (!state?.success || !state.id || uploadStartedRef.current) return
  uploadStartedRef.current = true

  async function uploadAndNavigate() {
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
    router.push(`/mudancas/${state!.id}`)
  }

  uploadAndNavigate()
}, [state, files, router])
```

- [ ] **Step 3: Adicionar input de arquivo no JSX**

Antes do bloco de `{state?.error && ...}` (ou antes do botão de submit), adicionar o input de arquivo. Ler o arquivo para identificar o local exato. Adicionar:

```tsx
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
```

- [ ] **Step 4: Verificar visualmente**

Acessar `/mudancas/nova`, criar um GMUD com arquivo. Confirmar navegação para `/mudancas/{id}` e que o anexo aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/mudancas/ChangeRequestForm.tsx
git commit -m "feat: anexos na criação de GMUD"
```

---

## Task 6: Build e Deploy

- [ ] **Step 1: Rodar build**

```bash
npm run build
```

Expected: sem erros de TypeScript ou build.

- [ ] **Step 2: Push**

```bash
git push origin main
```
