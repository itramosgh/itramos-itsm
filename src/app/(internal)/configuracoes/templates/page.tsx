import { createClient } from '@/lib/supabase/server'
import { ResponseTemplateForm } from '@/components/settings/ResponseTemplateForm'
import { createTemplateAction, deactivateTemplateAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = (await supabase
    .from('response_templates')
    .select('id, name, category, body, is_active, variables')
    .order('name')
    .limit(500)) as { data: any }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Templates de Resposta</h1>
      <div className="border rounded-md p-4">
        <h2 className="font-medium mb-3">Novo template</h2>
        <ResponseTemplateForm action={createTemplateAction} />
      </div>
      <div className="space-y-2">
        {templates?.map((t: any) => (
          <div key={t.id} className="border rounded-md p-3 flex items-start justify-between">
            <div>
              <p className="font-medium">{t.name}</p>
              {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
            </div>
            {t.is_active && (
              <form action={deactivateTemplateAction.bind(null, t.id)}>
                <Button variant="ghost" size="sm" type="submit">Desativar</Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
