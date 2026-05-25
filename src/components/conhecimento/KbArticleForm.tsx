'use client'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ActionResult = { error?: string; success?: boolean } | null

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
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando...' : 'Salvar artigo'}
      </Button>
    </form>
  )
}
