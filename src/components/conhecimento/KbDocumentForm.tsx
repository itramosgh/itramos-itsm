'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface KbDocumentFormProps {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean; id?: string } | null>
  documentId?: string
  initialData?: {
    company_id?: string
    title?: string
    content_rich_text?: object | null
    content_html?: string | null
    category?: string | null
    published_at?: string | null
  }
  companies: { id: string; name: string }[]
  attachments?: { id: string; filename: string; storage_path: string }[]
}

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('type', 'kb-document')
  const res = await fetch('/api/upload/inline-image', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { window.alert(data?.error ?? 'Erro ao fazer upload da imagem.'); return null }
  return data.url ?? null
}

export function KbDocumentForm({
  action,
  documentId,
  initialData,
  companies,
  attachments = [],
}: KbDocumentFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: (initialData?.content_rich_text as any) ?? initialData?.content_html ?? '',
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

  async function handleUpload(file: File, docId: string) {
    setUploadingFile(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_id', docId)
    await fetch('/api/upload/kb-document', { method: 'POST', body: fd })
    setUploadingFile(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    fd.set('content_html', editor?.getHTML() ?? '')
    fd.set('content_rich_text', JSON.stringify(editor?.getJSON() ?? null))

    const result = await action(fd)
    setPending(false)

    if (!result || result.error) {
      setError(result?.error ?? 'Erro desconhecido')
      return
    }

    const targetId = documentId ?? result.id
    const files = fileInputRef.current?.files
    if (files && targetId) {
      for (const file of Array.from(files)) {
        await handleUpload(file, targetId)
      }
    }

    router.push(`/conhecimento/documentos/${targetId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      <div>
        <Label htmlFor="company_id">Cliente *</Label>
        <select
          id="company_id"
          name="company_id"
          defaultValue={initialData?.company_id ?? ''}
          required
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Selecione...</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="category">Categoria</Label>
        <Input id="category" name="category" defaultValue={initialData?.category ?? ''} />
      </div>
      <div>
        <Label htmlFor="published_at">Data de publicação</Label>
        <Input id="published_at" name="published_at" type="date" defaultValue={initialData?.published_at ?? ''} />
      </div>
      <div>
        <Label>Conteúdo</Label>
        <div className="border rounded-md overflow-hidden">
          <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
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
              Lista
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              1. Lista
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('heading', { level: 2 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              H2
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`px-2 py-1 text-sm rounded ${editor?.isActive('heading', { level: 3 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              H3
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
      <div>
        <Label htmlFor="attachments">Anexos (PDF, imagens)</Label>
        <input ref={fileInputRef} id="attachments" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="text-sm" />
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map(a => (
              <li key={a.id} className="flex items-center gap-2">
                <span>{a.filename}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || uploadingFile}>
        {pending || uploadingFile ? 'Salvando...' : 'Salvar documento'}
      </Button>
    </form>
  )
}
