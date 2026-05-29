import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import { DeleteArticleButton } from '@/components/conhecimento/DeleteArticleButton'

export default async function ArtigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()
  const [{ data: article }, { data: attachments }] = await Promise.all([
    supabase.from('kb_articles').select('*').eq('id', id).single() as unknown as Promise<{ data: any }>,
    serviceSupabase.from('kb_article_attachments')
      .select('id, filename, storage_path, mime_type, size_bytes')
      .eq('article_id', id)
      .order('created_at') as unknown as Promise<{ data: any[] | null }>,
  ])

  if (!article) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold">{article.title}</h1>
        <div className="flex gap-2">
          <Link href={`/conhecimento/artigos/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Editar</Link>
          <DeleteArticleButton id={id} />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(article.tags ?? []).map((t: string) => (
          <Badge key={t} variant="secondary">{t}</Badge>
        ))}
        <Badge variant={article.is_active ? 'default' : 'outline'}>
          {article.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>
      {article.problem_description && (
        <section>
          <h2 className="text-lg font-medium mb-2">Descrição do problema</h2>
          <p className="whitespace-pre-wrap text-muted-foreground">{article.problem_description}</p>
        </section>
      )}
      {article.solution && (
        <section>
          <h2 className="text-lg font-medium mb-2">Solução aplicada</h2>
          <p className="whitespace-pre-wrap">{article.solution}</p>
        </section>
      )}
      {(attachments ?? []).length > 0 && (
        <section>
          <AttachmentList attachments={attachments ?? []} bucket="kb-article-attachments" />
        </section>
      )}
    </div>
  )
}
