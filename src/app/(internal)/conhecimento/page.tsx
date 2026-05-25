import { createClient } from '@/lib/supabase/server'
import { KbArticleList } from '@/components/conhecimento/KbArticleList'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default async function ConhecimentoPage() {
  const supabase = await createClient()
  const { data: articles } = await supabase
    .from('kb_articles')
    .select('id, title, category_id, tags, is_active, created_at')
    .order('created_at', { ascending: false }) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
        <Link href="/conhecimento/artigos/novo" className={buttonVariants()}>Novo Artigo</Link>
      </div>
      <KbArticleList articles={articles ?? []} />
    </div>
  )
}
