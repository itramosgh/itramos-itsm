import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementForm } from '@/components/comunicados/AnnouncementForm'

export default async function ComunicadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: ann } = (await supabase
    .from('announcements').select('*').eq('id', id).single()) as { data: Record<string, unknown> | null }

  if (!ann) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = ['admin', 'gestor'].includes((profile as { role?: string } | null)?.role ?? '')
    && ['rascunho', 'agendado'].includes((ann.status as string) ?? '')

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{String(ann.subject ?? '')}</h1>
        <span className="text-sm text-muted-foreground capitalize">{String(ann.status ?? '')}</span>
      </div>
      {Boolean(ann.sent_at) && (
        <p className="text-sm text-muted-foreground">
          Enviado em {new Date(String(ann.sent_at)).toLocaleString('pt-BR')} para {String(ann.recipient_count ?? '?')} destinatários.
        </p>
      )}
      <AnnouncementForm
        announcementId={id}
        initialBodyHtml={(ann.body_html as string) ?? ''}
        initialBodyRichText={(ann.body_rich_text as object | null) ?? null}
        readOnly={!canEdit}
      />
    </div>
  )
}
