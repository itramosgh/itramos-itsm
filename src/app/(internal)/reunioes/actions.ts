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

export async function updateMeetingAction(meetingId: string, data: {
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
  action_items: Array<unknown>
}) {
  const supabase = await createClient()

  await supabase.from('meetings').update({
    company_id: data.company_id,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at).toISOString(),
    notes_html: data.notes_html,
    notes_rich_text: data.notes_rich_text as never,
  } as never).eq('id', meetingId)

  await supabase.from('meeting_participants').delete().eq('meeting_id', meetingId)
  if (data.participants.length > 0) {
    const rows = data.participants.map(p => {
      if (p.type === 'profile') return { meeting_id: meetingId, profile_id: p.profile_id }
      if (p.type === 'contact') return { meeting_id: meetingId, contact_id: p.contact_id }
      return { meeting_id: meetingId, external_email: p.external_email, external_name: p.external_name }
    })
    await supabase.from('meeting_participants').insert(rows as never)
  }

  revalidatePath(`/reunioes/${meetingId}`)
  revalidatePath('/reunioes')
  return { success: true, id: meetingId }
}

export async function deleteMeetingAction(meetingId: string) {
  const supabase = await createClient()
  await supabase.from('meeting_participants').delete().eq('meeting_id', meetingId)
  await supabase.from('meeting_action_items').delete().eq('meeting_id', meetingId)
  await supabase.from('meetings').delete().eq('id', meetingId)
  revalidatePath('/reunioes')
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

export async function sendMinutesAction(meetingId: string) {
  const supabase = await createClient()

  const [{ data: meeting }, { data: participants }, { data: actionItems }] = await Promise.all([
    supabase.from('meetings')
      .select('*, companies(name)')
      .eq('id', meetingId)
      .single(),
    supabase.from('meeting_participants')
      .select('profile_id, contact_id, external_email, external_name, profiles(full_name), contacts(full_name, email)')
      .eq('meeting_id', meetingId),
    supabase.from('meeting_action_items')
      .select('*, profiles!responsible_profile_id(full_name)')
      .eq('meeting_id', meetingId),
  ]) as [{ data: any }, { data: any[] | null }, { data: any[] | null }]

  if (!meeting) return { error: 'Reunião não encontrada' }

  const emails: string[] = []
  for (const p of participants ?? []) {
    if (p.external_email) emails.push(p.external_email)
    if (p.contacts?.email) emails.push(p.contacts.email)
    if (p.profile_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(p.profile_id)
      if (authUser?.user?.email) emails.push(authUser.user.email)
    }
  }

  if (emails.length === 0) return { error: 'Nenhum e-mail de participante encontrado' }

  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { MeetingMinutesPDF } = await import('@/components/reunioes/MeetingMinutesPDF')
  const { createElement } = await import('react')

  const pdfBuffer = await renderToBuffer(
    createElement(MeetingMinutesPDF, {
      meeting,
      participants: participants ?? [],
      actionItems: actionItems ?? [],
    }) as any
  )

  const dateFormatted = new Date(meeting.scheduled_at).toLocaleString('pt-BR', {
    dateStyle: 'full', timeStyle: 'short',
  })

  const participantNames = (participants ?? [])
    .map((p: any) => p.profiles?.full_name ?? p.contacts?.full_name ?? p.external_name ?? '')
    .filter(Boolean)
    .join(', ')

  const { sendEmail, buildFromAddress } = await import('@/lib/email')
  const { createServiceClient } = await import('@/lib/supabase/server')
  const serviceClient = await createServiceClient()
  const { data: settings } = await serviceClient
    .from('platform_settings')
    .select('email_from_name, email_from_address')
    .single() as { data: any }

  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  for (const email of [...new Set(emails)]) {
    await sendEmail({
      to: email,
      from,
      subject: `Ata — ${meeting.title}`,
      html: `
        <h2>Ata de Reunião: ${meeting.title}</h2>
        <p><strong>Data:</strong> ${dateFormatted}</p>
        <p><strong>Cliente:</strong> ${meeting.companies?.name}</p>
        <p><strong>Participantes:</strong> ${participantNames}</p>
        <p>A ata completa está em anexo neste e-mail.</p>
      `,
      attachments: [{
        filename: `ata-${meetingId}.pdf`,
        content: Buffer.from(pdfBuffer),
        contentType: 'application/pdf',
      }],
    } as any)
  }

  await supabase.from('meetings').update({
    minutes_sent_at: new Date().toISOString(),
  } as never).eq('id', meetingId)

  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true, sentTo: emails.length }
}

export async function addActionItemAction(meetingId: string, item: {
  description: string
  responsible_profile_id?: string | null
  due_date?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('meeting_action_items').insert({
    meeting_id: meetingId,
    description: item.description,
    responsible_profile_id: item.responsible_profile_id ?? null,
    due_date: item.due_date ?? null,
  } as never)
  if (error) return { error: error.message }
  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true }
}

export async function updateActionItemAction(itemId: string, meetingId: string, fields: {
  description: string
  responsible_profile_id?: string | null
  due_date?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('meeting_action_items').update({
    description: fields.description,
    responsible_profile_id: fields.responsible_profile_id ?? null,
    due_date: fields.due_date ?? null,
  } as never).eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true }
}

export async function deleteActionItemAction(itemId: string, meetingId: string) {
  const supabase = await createClient()
  await supabase.from('meeting_action_items').delete().eq('id', itemId)
  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true }
}

export async function convertActionItemToTaskAction(itemId: string, meetingId: string) {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('meeting_action_items')
    .select('description, responsible_profile_id, due_date, converted_to_task_id')
    .eq('id', itemId)
    .single() as { data: any }

  if (!item) return { error: 'Item não encontrado' }
  if (item.converted_to_task_id) return { error: 'Item já foi convertido em tarefa' }

  const assignedTo = item.responsible_profile_id
  if (!assignedTo) return { error: 'Item precisa de um responsável interno para ser convertido em tarefa' }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      title: item.description,
      assigned_to: assignedTo,
      due_date: item.due_date ?? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      origin_meeting_id: meetingId,
      origin_action_item_id: itemId,
    } as never)
    .select('id')
    .single()

  if (taskError) return { error: taskError.message }

  await supabase
    .from('meeting_action_items')
    .update({ converted_to_task_id: (task as any).id } as never)
    .eq('id', itemId)

  revalidatePath(`/reunioes/${meetingId}`)
  return { success: true }
}
