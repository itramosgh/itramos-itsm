'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResponseTemplateForm } from '@/components/settings/ResponseTemplateForm'
import { updateTemplateAction, deactivateTemplateAction } from '@/app/(internal)/configuracoes/templates/actions'

type Template = {
  id: string
  name: string
  category: string | null
  body: string
  is_active: boolean
  variables: { key: string; label: string; auto_filled: boolean }[]
}

export function ResponseTemplateRow({ t }: { t: Template }) {
  const [editing, setEditing] = useState(false)

  async function handleUpdate(formData: FormData) {
    const result = await updateTemplateAction(t.id, formData)
    if (!result?.error) setEditing(false)
    return result
  }

  return (
    <div className="border rounded-md p-3">
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">Editando: {t.name}</p>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
          <ResponseTemplateForm
            action={handleUpdate}
            initial={{ name: t.name, category: t.category ?? undefined, body: t.body, variables: t.variables ?? [] }}
          />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium">{t.name}</p>
            {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
            {t.is_active && (
              <form action={deactivateTemplateAction.bind(null, t.id)}>
                <Button variant="ghost" size="sm" type="submit">Desativar</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
