'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ActionResult = { error?: string; success?: boolean; articleId?: string } | null

interface KbArticleFormProps {
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>
  initialData?: {
    title?: string
    problem_description?: string | null
    solution?: string | null
    tags?: string[]
    category_id?: string | null
    is_active?: boolean
  }
  categories: { id: string; name: string }[]
}

async function uploadImage(file: File, type: string): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('type', type)
  const res = await fetch('/api/upload/inline-image', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { window.alert(data?.error ?? 'Erro ao fazer upload da imagem.'); return null }
  return data.url ?? null
}

function EditorToolbar({ editor, uploadType }: { editor: ReturnType<typeof useEditor>; uploadType: string }) {
  const imgInputRef = useRef<HTMLInputElement>(null)

  async function handleImageFile(file: File) {
    const url = await uploadImage(file, uploadType)
    if (url) editor?.chain().focus().setImage({ src: url }).run()
  }

  return (
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
  )
}

export function KbArticleForm({ action, initialData, categories }: KbArticleFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!initialData

  const problemEditor = useEditor({
    extensions: [StarterKit, Image],
    content: initialData?.problem_description ?? '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[120px] p-3 focus:outline-none' },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              uploadImage(file, 'kb-article').then(url => {
                if (url) problemEditor?.chain().focus().setImage({ src: url }).run()
              })
              return true
            }
          }
        }
        return false
      },
    },
  })

  const solutionEditor = useEditor({
    extensions: [StarterKit, Image],
    content: initialData?.solution ?? '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[160px] p-3 focus:outline-none' },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              uploadImage(file, 'kb-article').then(url => {
                if (url) solutionEditor?.chain().focus().setImage({ src: url }).run()
              })
              return true
            }
          }
        }
        return false
      },
    },
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    fd.set('problem_description', problemEditor?.getHTML() ?? '')
    fd.set('solution', solutionEditor?.getHTML() ?? '')

    const result = await action(null, fd)
    setPending(false)

    if (!result || result.error) {
      setError(result?.error ?? 'Erro desconhecido')
      return
    }

    const targetId = (result as any).articleId
    const files = fileInputRef.current?.files
    if (files && files.length > 0 && targetId) {
      setUploading(true)
      for (const file of Array.from(files)) {
        const fd2 = new FormData()
        fd2.append('file', file)
        fd2.append('article_id', targetId)
        const res = await fetch('/api/upload/kb-article', { method: 'POST', body: fd2 })
        if (!res.ok) {
          const data = await res.json()
          window.alert(data?.error ?? 'Erro ao enviar anexo.')
          break
        }
      }
      setUploading(false)
    }

    router.push(`/conhecimento/artigos/${targetId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label>Descrição do problema</Label>
        <div className="border rounded-md overflow-hidden">
          <EditorToolbar editor={problemEditor} uploadType="kb-article" />
          <EditorContent editor={problemEditor} />
        </div>
      </div>
      <div>
        <Label>Solução aplicada</Label>
        <div className="border rounded-md overflow-hidden">
          <EditorToolbar editor={solutionEditor} uploadType="kb-article" />
          <EditorContent editor={solutionEditor} />
        </div>
      </div>
      <div>
        <Label htmlFor="category_id">Categoria</Label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={initialData?.category_id ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem categoria</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
        <Input
          id="tags"
          name="tags"
          defaultValue={initialData?.tags?.join(', ') ?? ''}
          placeholder="impressora, windows, vpn"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          value="true"
          defaultChecked={initialData?.is_active !== false}
        />
        <Label htmlFor="is_active">Artigo ativo (visível na busca)</Label>
      </div>
      {!isEdit && (
        <div>
          <Label htmlFor="attachments">Anexos</Label>
          <Input
            ref={fileInputRef}
            id="attachments"
            type="file"
            multiple
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground mt-1">Máximo 10 MB por arquivo</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || uploading}>
        {uploading ? 'Enviando anexos...' : pending ? 'Salvando...' : 'Salvar artigo'}
      </Button>
    </form>
  )
}
