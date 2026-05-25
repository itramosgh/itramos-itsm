import { createClient } from '@/lib/supabase/server'
import { KbArticleForm } from '@/components/conhecimento/KbArticleForm'
import { createArticleAction } from '@/app/(internal)/conhecimento/actions'

export default async function NovoArtigoPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ticket_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Artigo</h1>
      <KbArticleForm action={createArticleAction} categories={categories ?? []} />
    </div>
  )
}
