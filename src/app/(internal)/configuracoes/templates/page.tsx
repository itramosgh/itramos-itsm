import { createClient } from '@/lib/supabase/server'
import { ResponseTemplateForm } from '@/components/settings/ResponseTemplateForm'
import { ResponseTemplateRow } from '@/components/settings/ResponseTemplateRow'
import { createTemplateAction } from './actions'

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
          <ResponseTemplateRow key={t.id} t={t} />
        ))}
      </div>
    </div>
  )
}
