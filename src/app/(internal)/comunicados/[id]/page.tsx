import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementForm } from '@/components/comunicados/AnnouncementForm'
import { AnnouncementSettingsForm } from '@/components/comunicados/AnnouncementSettingsForm'

export default async function ComunicadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: ann },
    { data: { user } },
    { data: companies },
    { data: contacts },
    { data: manualRecipients },
  ] = await Promise.all([
    supabase.from('announcements').select('*').eq('id', id).single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
    supabase.auth.getUser(),
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
    supabase.from('contacts').select('id, full_name, email').eq('is_active', true).order('full_name') as unknown as Promise<{ data: { id: string; full_name: string; email: string }[] | null }>,
    supabase.from('announcement_recipients' as never).select('contact_id').eq('announcement_id' as never, id) as unknown as Promise<{ data: { contact_id: string }[] | null }>,
  ])

  if (!ann) notFound()

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

      {canEdit && (
        <AnnouncementSettingsForm
          id={id}
          subject={String(ann.subject ?? '')}
          recipientType={String(ann.recipient_type ?? 'all')}
          recipientCompanyId={String(ann.recipient_company_id ?? '')}
          recipientDepartments={(ann.recipient_departments as string[]) ?? []}
          recipientContactIds={(manualRecipients ?? []).map(r => r.contact_id)}
          recipientExtraEmails={(ann.recipient_extra_emails as string[]) ?? []}
          scheduledAt={(ann.scheduled_at as string | null) ?? null}
          companies={companies ?? []}
          contacts={contacts ?? []}
        />
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
