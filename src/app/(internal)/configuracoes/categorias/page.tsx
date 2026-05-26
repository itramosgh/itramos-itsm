import { createClient } from '@/lib/supabase/server'
import { CategoryManager } from '@/components/settings/CategoryManager'

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categories } = (await supabase
    .from('ticket_categories')
    .select('id, name, slug, requires_approval, is_active')
    .order('name')) as { data: any }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Categorias de Chamado</h1>
      <CategoryManager categories={categories ?? []} />
    </div>
  )
}
