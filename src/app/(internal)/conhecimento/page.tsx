import { createClient } from '@/lib/supabase/server'
import { KbArticleList } from '@/components/conhecimento/KbArticleList'
import { KbDocumentList } from '@/components/conhecimento/KbDocumentList'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function ConhecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const { tab, page: pageParam } = await searchParams
  const activeTab = tab === 'documentos' ? 'documentos' : 'artigos'
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  const [{ data: articles, count: articlesCount }, { data: documents, count: documentsCount }] = await Promise.all([
    supabase.from('kb_articles')
      .select('id, title, category_id, tags, is_active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase.from('kb_documents')
      .select('id, title, category, published_at, is_active, companies(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
  ]) as [{ data: any[] | null; count: number | null }, { data: any[] | null; count: number | null }]

  const total = activeTab === 'artigos' ? (articlesCount ?? 0) : (documentsCount ?? 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
        <Link
          href={activeTab === 'artigos' ? '/conhecimento/artigos/novo' : '/conhecimento/documentos/novo'}
          className={buttonVariants()}
        >
          {activeTab === 'artigos' ? 'Novo Artigo' : 'Novo Documento'}
        </Link>
      </div>
      <div className="flex gap-4 border-b">
        <Link
          href="/conhecimento?tab=artigos"
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'artigos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Artigos de Resolução
        </Link>
        <Link
          href="/conhecimento?tab=documentos"
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'documentos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Documentos por Cliente
        </Link>
      </div>
      {activeTab === 'artigos'
        ? <KbArticleList articles={articles ?? []} />
        : <KbDocumentList documents={documents ?? []} />
      }
      <Pagination page={page} total={total} perPage={PAGE_SIZE} searchParams={{ tab }} />
    </div>
  )
}
