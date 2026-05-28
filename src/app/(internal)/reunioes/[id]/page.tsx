import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ActionItemsPanel } from '@/components/reunioes/ActionItemsPanel'
import { MeetingAttachments } from '@/components/reunioes/MeetingAttachments'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { updateMeetingStatusAction, sendMinutesAction } from '../actions'

export default async function ReuniaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: meeting }, { data: items }, { data: profiles }] = await Promise.all([
    supabase.from('meetings')
      .select('*, companies(name), meeting_participants(id, profile_id, contact_id, external_email, external_name, profiles(full_name), contacts(full_name))')
      .eq('id', id)
      .single(),
    supabase.from('meeting_action_items')
      .select('*, profiles!responsible_profile_id(full_name)')
      .eq('meeting_id', id)
      .order('status'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as [{ data: any }, { data: any[] | null }, { data: any[] | null }]

  if (!meeting) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants: any[] = meeting.meeting_participants ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          <p className="text-muted-foreground text-sm">
            {meeting.companies?.name} &middot;{' '}
            {new Date(meeting.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{meeting.status}</Badge>
          <Link href={`/reunioes/${id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Editar
          </Link>
        </div>
      </div>

      {participants.length > 0 && (
        <div>
          <h2 className="font-medium mb-2">Participantes</h2>
          <ul className="flex flex-wrap gap-2">
            {participants.map((p: any) => {
              const name = p.profiles?.full_name ?? p.contacts?.full_name ?? p.external_name ?? p.external_email
              return (
                <li key={p.id} className="text-xs border rounded-full px-3 py-1 bg-muted/50">
                  {name}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {meeting.notes_html && (
        <div>
          <h2 className="font-medium mb-2">Anotações</h2>
          <div
            className="prose prose-sm max-w-none border rounded-md p-4"
            dangerouslySetInnerHTML={{ __html: meeting.notes_html }}
          />
        </div>
      )}

      <ActionItemsPanel
        items={items ?? []}
        meetingId={id}
        meetingStatus={meeting.status}
        profiles={profiles ?? []}
      />

      <MeetingAttachments meetingId={id} />

      {meeting.status === 'agendada' && (
        <div className="flex gap-2">
          <form action={updateMeetingStatusAction.bind(null, id, 'realizada')}>
            <Button type="submit" variant="default">Marcar como realizada</Button>
          </form>
          <form action={updateMeetingStatusAction.bind(null, id, 'cancelada')}>
            <Button type="submit" variant="ghost">Cancelar reunião</Button>
          </form>
        </div>
      )}

      {meeting.status === 'realizada' && !meeting.minutes_sent_at && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <form action={sendMinutesAction.bind(null, id) as any}>
          <Button type="submit">Enviar ata por e-mail</Button>
        </form>
      )}
      {meeting.minutes_sent_at && (
        <p className="text-sm text-muted-foreground">
          Ata enviada em {new Date(meeting.minutes_sent_at).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}
