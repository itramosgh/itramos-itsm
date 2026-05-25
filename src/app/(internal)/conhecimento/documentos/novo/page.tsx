import { createClient } from '@/lib/supabase/server'
import { KbDocumentForm } from '@/components/conhecimento/KbDocumentForm'
import { createDocumentAction } from '@/app/(internal)/conhecimento/actions'

export default async function NovoDocumentoPage() {
  const supabase = await createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Documento</h1>
      <KbDocumentForm action={createDocumentAction} companies={companies ?? []} />
    </div>
  )
}
