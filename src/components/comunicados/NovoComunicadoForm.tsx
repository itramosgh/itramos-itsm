'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { ResizableImage } from '@/components/conhecimento/ResizableImage'
import { RecipientSelector } from './RecipientSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAnnouncementAction, saveBodyAction, sendAnnouncementAction } from '@/app/(internal)/comunicados/actions'

interface Company { id: string; name: string }
interface Contact { id: string; full_name: string; email: string }

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('type', 'announcement')
  const res = await fetch('/api/upload/inline-image', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { window.alert(data?.error ?? 'Erro ao fazer upload da imagem.'); return null }
  return data.url ?? null
}

export function NovoComunicadoForm({
  companies,
  contacts,
}: {
  companies: Company[]
  contacts: Contact[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, ResizableImage],
    content: '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none' },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              uploadImage(file).then(url => {
                if (url) editor?.chain().focus().setImage({ src: url }).run()
              })
              return true
            }
          }
        }
        return false
      },
    },
  })

  async function handleImageFile(file: File) {
    const url = await uploadImage(file)
    if (url) editor?.chain().focus().setImage({ src: url }).run()
  }

  async function submit(send: boolean) {
    if (!formRef.current) return
    setPending(true)
    setError(null)

    const fd = new FormData(formRef.current)

    // Create announcement
    const createResult = await createAnnouncementAction(fd)
    if (!createResult.success || !createResult.id) {
      setError((createResult as any).error ?? 'Erro ao criar comunicado.')
      setPending(false)
      return
    }

    const id = createResult.id

    // Save body
    await saveBodyAction(id, editor?.getHTML() ?? '', editor?.getJSON() ?? {})

    // Send if requested
    if (send) {
      const sendResult = await sendAnnouncementAction(id)
      if ('error' in sendResult) {
        setError(sendResult.error)
        setPending(false)
        router.push(`/comunicados/${id}`)
        return
      }
    }

    router.push(`/comunicados/${id}`)
  }

  return (
    <form ref={formRef} onSubmit={e => e.preventDefault()} className="space-y-5 max-w-2xl">
      <div>
        <Label>Assunto *</Label>
        <Input name="subject" placeholder="Assunto do e-mail" required className="mt-1" />
      </div>

      <RecipientSelector companies={companies} contacts={contacts} />

      <div>
        <Label>Agendamento (opcional)</Label>
        <Input name="scheduled_at" type="datetime-local" className="mt-1" />
      </div>

      <div>
        <Label>Conteúdo</Label>
        <div className="border rounded-md overflow-hidden mt-1">
          <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              B
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`px-2 py-1 text-sm rounded italic ${editor?.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              I
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              • Lista
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              1. Lista
            </button>
            <button type="button" onClick={() => imgInputRef.current?.click()}
              className="px-2 py-1 text-sm rounded hover:bg-muted" title="Inserir imagem">
              🖼 Imagem
            </button>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }}
            />
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => submit(false)}>
          {pending ? 'Salvando...' : 'Salvar rascunho'}
        </Button>
        <Button type="button" disabled={pending} onClick={() => submit(true)}>
          {pending ? 'Enviando...' : 'Enviar agora'}
        </Button>
      </div>
    </form>
  )
}
