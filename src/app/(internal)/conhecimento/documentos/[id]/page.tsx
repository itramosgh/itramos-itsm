import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: doc }, { data: attachments }] = await Promise.all([
    supabase.from('kb_documents').select('*, companies(name)').eq('id', id).single() as unknown as Promise<{ data: any }>,
    supabase.from('kb_document_attachments').select('id, filename, storage_path').eq('document_id', id) as unknown as Promise<{ data: any[] | null }>,
  ])

  if (!doc) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{doc.title}</h1>
          <p className="text-muted-foreground text-sm">{(doc as any).companies?.name}</p>
        </div>
        <Link href={`/conhecimento/documentos/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Editar
        </Link>
      </div>
      {doc.content_html && (
        <div
          className="prose prose-sm max-w-none border rounded-md p-4"
          dangerouslySetInnerHTML={{ __html: doc.content_html }}
        />
      )}
      {(attachments ?? []).length > 0 && (
        <div>
          <h2 className="font-medium mb-2">Anexos</h2>
          <ul className="space-y-1 text-sm">
            {(attachments ?? []).map((a: any) => (
              <li key={a.id}>{a.filename}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
