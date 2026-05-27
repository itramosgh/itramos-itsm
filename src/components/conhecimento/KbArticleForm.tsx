'use client'
import { useActionState, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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

export function KbArticleForm({ action, initialData, categories }: KbArticleFormProps) {
  const [state, formAction, pending] = useActionState(action, null)
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const router = useRouter()

  const isEdit = !!initialData

  useEffect(() => {
    if (!state?.articleId || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('article_id', state!.articleId!)
          const res = await fetch('/api/upload/kb-article', { method: 'POST', body: fd })
          if (!res.ok) {
            const data = await res.json()
            window.alert(data?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push(`/conhecimento/artigos/${state!.articleId}`)
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="problem_description">Descrição do problema</Label>
        <Textarea
          id="problem_description"
          name="problem_description"
          defaultValue={initialData?.problem_description ?? ''}
          rows={4}
          placeholder="Descreva o problema ou sintoma..."
        />
      </div>
      <div>
        <Label htmlFor="solution">Solução aplicada</Label>
        <Textarea
          id="solution"
          name="solution"
          defaultValue={initialData?.solution ?? ''}
          rows={6}
          placeholder="Descreva o passo a passo da solução..."
        />
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
        {uploading ? 'Enviando anexos...' : pending ? 'Salvando...' : 'Salvar artigo'}
      </Button>
    </form>
  )
}
