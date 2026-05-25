import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KbArticleForm } from '@/components/conhecimento/KbArticleForm'
import { updateArticleAction } from '@/app/(internal)/conhecimento/actions'

export default async function EditarArtigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: article }, { data: categories }] = await Promise.all([
    supabase.from('kb_articles').select('*').eq('id', id).single() as unknown as Promise<{ data: any }>,
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
  ])

  if (!article) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar Artigo</h1>
      <KbArticleForm
        action={updateArticleAction.bind(null, id) as any}
        initialData={article}
        categories={categories ?? []}
      />
    </div>
  )
}
