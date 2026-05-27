'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

type Participant =
  | { type: 'profile'; profile_id: string; label: string }
  | { type: 'contact'; contact_id: string; label: string }
  | { type: 'external'; external_email: string; external_name: string; label: string }

type ActionItem = {
  description: string
  responsible_profile_id: string | null
  due_date: string | null
}

type MeetingData = {
  company_id: string
  title: string
  scheduled_at: string
  notes_html?: string
  notes_rich_text?: object | null
  participants: Array<
    | { type: 'profile'; profile_id: string }
    | { type: 'contact'; contact_id: string }
    | { type: 'external'; external_email: string; external_name: string }
  >
  action_items: Array<{
    description: string
    responsible_profile_id?: string | null
    due_date?: string | null
  }>
}

interface MeetingFormProps {
  action: (data: MeetingData) => Promise<{ error?: string; success?: boolean; id?: string }>
  initialData?: {
    title?: string
    company_id?: string
    scheduled_at?: string
    notes_rich_text?: any
    notes_html?: string
    participants?: Participant[]
  }
  companies: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
  contacts: { id: string; full_name: string; company_id: string }[]
}

export function MeetingForm({ action, initialData, companies, profiles, contacts }: MeetingFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<FileList | null>(null)
  const [participants, setParticipants] = useState<Participant[]>(initialData?.participants ?? [])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [companyId, setCompanyId] = useState(initialData?.company_id ?? '')
  const [extEmail, setExtEmail] = useState('')
  const [extName, setExtName] = useState('')

  const isEdit = !!initialData

  const scheduledAtValue = initialData?.scheduled_at
    ? new Date(initialData.scheduled_at).toISOString().slice(0, 16)
    : ''

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialData?.notes_rich_text ?? initialData?.notes_html ?? '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none min-h-[150px] p-3 focus:outline-none' } },
  })

  function addParticipantProfile(profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile || participants.some(p => p.type === 'profile' && p.profile_id === profileId)) return
    setParticipants(prev => [...prev, { type: 'profile', profile_id: profileId, label: profile.full_name }])
  }

  function addParticipantContact(contactId: string) {
    const contact = contacts.find(c => c.id === contactId)
    if (!contact || participants.some(p => p.type === 'contact' && p.contact_id === contactId)) return
    setParticipants(prev => [...prev, { type: 'contact', contact_id: contactId, label: contact.full_name }])
  }

  function addExternalParticipant() {
    if (!extEmail || !extName) return
    setParticipants(prev => [...prev, { type: 'external', external_email: extEmail, external_name: extName, label: `${extName} (${extEmail})` }])
    setExtEmail('')
    setExtName('')
  }

  function addActionItem() {
    setActionItems(prev => [...prev, { description: '', responsible_profile_id: null, due_date: null }])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const data: MeetingData = {
      company_id: fd.get('company_id') as string,
      title: fd.get('title') as string,
      scheduled_at: fd.get('scheduled_at') as string,
      notes_html: editor?.getHTML() ?? '',
      notes_rich_text: editor?.getJSON() ?? null,
      participants: participants.map(p => {
        if (p.type === 'profile') return { type: 'profile' as const, profile_id: p.profile_id }
        if (p.type === 'contact') return { type: 'contact' as const, contact_id: p.contact_id }
        return { type: 'external' as const, external_email: p.external_email, external_name: p.external_name }
      }),
      action_items: actionItems,
    }

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
  }

  const filteredContacts = companyId ? contacts.filter(c => c.company_id === companyId) : contacts

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <div>
        <Label htmlFor="company_id">Cliente *</Label>
        <select
          id="company_id"
          name="company_id"
          required
          defaultValue={initialData?.company_id ?? ''}
          onChange={e => setCompanyId(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Selecione...</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="title">Pauta / Título *</Label>
        <Input id="title" name="title" required defaultValue={initialData?.title} />
      </div>
      <div>
        <Label htmlFor="scheduled_at">Data e hora *</Label>
        <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required defaultValue={scheduledAtValue} />
      </div>

      {/* Participantes */}
      <div className="space-y-2">
        <Label>Participantes</Label>
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
            onChange={e => { if (e.target.value) { addParticipantProfile(e.target.value); e.target.value = '' } }}
            defaultValue=""
          >
            <option value="">Adicionar participante interno...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
            onChange={e => { if (e.target.value) { addParticipantContact(e.target.value); e.target.value = '' } }}
            defaultValue=""
          >
            <option value="">Adicionar contato do cliente...</option>
            {filteredContacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="E-mail externo"
            type="email"
            value={extEmail}
            onChange={e => setExtEmail(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Nome"
            value={extName}
            onChange={e => setExtName(e.target.value)}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addExternalParticipant}>
            Adicionar
          </Button>
        </div>
        {participants.length > 0 && (
          <ul className="space-y-1">
            {participants.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm border rounded px-3 py-1">
                <span>{p.label}</span>
                <button type="button" onClick={() => setParticipants(prev => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive">&times;</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notas */}
      <div>
        <Label>Anotações e decisões</Label>
        <div className="border rounded-md overflow-hidden">
          <div className="flex gap-1 p-2 border-b bg-muted/50">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <strong>B</strong>
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <em>I</em>
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              • Lista
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              1. Lista
            </button>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Itens de ação — somente na criação */}
      {!isEdit && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Itens de ação</Label>
            <Button type="button" variant="outline" size="sm" onClick={addActionItem}>+ Adicionar item</Button>
          </div>
          {actionItems.map((item, i) => (
            <div key={i} className="flex gap-2 items-start border rounded p-3">
              <Input
                placeholder="Descrição da ação..."
                value={item.description}
                onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, description: e.target.value } : a))}
                className="flex-1"
              />
              <select
                className="border rounded-md px-2 py-2 text-sm bg-background"
                value={item.responsible_profile_id ?? ''}
                onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, responsible_profile_id: e.target.value || null } : a))}
              >
                <option value="">Responsável...</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <Input
                type="date"
                className="w-36"
                value={item.due_date ?? ''}
                onChange={e => setActionItems(prev => prev.map((a, j) => j === i ? { ...a, due_date: e.target.value || null } : a))}
              />
              <button type="button" onClick={() => setActionItems(prev => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive text-lg">&times;</button>
            </div>
          ))}
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

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar reunião'}
      </Button>
    </form>
  )
}
