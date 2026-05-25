'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { meetingSchema } from '@/lib/validations/meeting'

export async function createMeetingAction(data: {
  company_id: string
  title: string
  scheduled_at: string
  notes_html?: string
  notes_rich_text?: object | null
  participants: Array<
    | { type: 'profile'; profile_id: string }
    | { type: 'contact'; contact_id: string }
    | { type: 'external'; external_email: string; external_name: string }
  >
  action_items: Array<{
    description: string
    responsible_profile_id?: string | null
    responsible_contact_id?: string | null
    responsible_external_email?: string | null
    due_date?: string | null
  }>
}) {
  const parsed = meetingSchema.safeParse({ ...data, status: 'agendada' })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      company_id: parsed.data.company_id,
      title: parsed.data.title,
      scheduled_at: parsed.data.scheduled_at,
      notes_html: parsed.data.notes_html,
      notes_rich_text: parsed.data.notes_rich_text as never,
      status: 'agendada',
      created_by: user!.id,
    } as never)
    .select('id')
    .single()

  if (meetingError) return { error: meetingError.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meetingId = (meeting as any).id

  if (parsed.data.participants.length > 0) {
    const participantRows = parsed.data.participants.map(p => {
      if (p.type === 'profile') return { meeting_id: meetingId, profile_id: p.profile_id }
      if (p.type === 'contact') return { meeting_id: meetingId, contact_id: p.contact_id }
      return { meeting_id: meetingId, external_email: p.external_email, external_name: p.external_name }
    })
    await supabase.from('meeting_participants').insert(participantRows as never)
  }

  if (parsed.data.action_items.length > 0) {
    const actionRows = parsed.data.action_items.map(item => ({
      meeting_id: meetingId,
      description: item.description,
      responsible_profile_id: item.responsible_profile_id ?? null,
      responsible_contact_id: item.responsible_contact_id ?? null,
      responsible_external_email: item.responsible_external_email ?? null,
      due_date: item.due_date ?? null,
    }))
    await supabase.from('meeting_action_items').insert(actionRows as never)
  }

  revalidatePath('/reunioes')
  return { success: true, id: meetingId }
}

export async function updateMeetingNotesAction(meetingId: string, notesHtml: string, notesRichText: object | null) {
  const supabase = await createClient()
  await supabase.from('meetings').update({
    notes_html: notesHtml,
    notes_rich_text: notesRichText as never,
  } as never).eq('id', meetingId)
  revalidatePath(`/reunioes/${meetingId}`)
}

export async function updateMeetingStatusAction(meetingId: string, status: 'realizada' | 'cancelada') {
  const supabase = await createClient()
  await supabase.from('meetings').update({ status } as never).eq('id', meetingId)
  revalidatePath(`/reunioes/${meetingId}`)
  revalidatePath('/reunioes')
}

export async function updateActionItemStatusAction(itemId: string, meetingId: string, status: 'pendente' | 'concluido') {
  const supabase = await createClient()
  await supabase.from('meeting_action_items').update({ status } as never).eq('id', itemId)
  revalidatePath(`/reunioes/${meetingId}`)
}
