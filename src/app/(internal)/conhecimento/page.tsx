import { createClient } from '@/lib/supabase/server'
import { KbArticleList } from '@/components/conhecimento/KbArticleList'
import { KbDocumentList } from '@/components/conhecimento/KbDocumentList'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default async function ConhecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'documentos' ? 'documentos' : 'artigos'
  const supabase = await createClient()

  const [{ data: articles }, { data: documents }] = await Promise.all([
    supabase.from('kb_articles').select('id, title, category_id, tags, is_active, created_at').order('created_at', { ascending: false }),
    supabase.from('kb_documents').select('id, title, category, published_at, is_active, companies(name)').order('created_at', { ascending: false }),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

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
    </div>
  )
}
