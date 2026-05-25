import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KbDocumentForm } from '@/components/conhecimento/KbDocumentForm'
import { updateDocumentAction } from '@/app/(internal)/conhecimento/actions'

export default async function EditarDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: doc }, { data: attachments }, { data: companies }] = await Promise.all([
    supabase.from('kb_documents').select('*').eq('id', id).single() as unknown as Promise<{ data: any }>,
    supabase.from('kb_document_attachments').select('id, filename, storage_path').eq('document_id', id) as unknown as Promise<{ data: any[] | null }>,
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
  ])

  if (!doc) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar Documento</h1>
      <KbDocumentForm
        action={updateDocumentAction.bind(null, id) as any}
        documentId={id}
        initialData={doc}
        companies={companies ?? []}
        attachments={attachments ?? []}
      />
    </div>
  )
}
