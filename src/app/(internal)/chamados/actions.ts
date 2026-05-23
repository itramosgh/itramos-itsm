'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ticketSchema, interactionSchema, scheduleSchema } from '@/lib/validations/ticket'
import { isValidTransition } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'

export async function createTicketAction(_prevState: unknown, formData: FormData) {
  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    category_id: formData.get('category_id') || undefined,
    priority: formData.get('priority'),
    channel: formData.get('channel') ?? 'portal',
    company_id: formData.get('company_id'),
    contact_id: formData.get('contact_id'),
    contract_id: formData.get('contract_id') || undefined,
    assigned_to: formData.get('assigned_to') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert(parsed.data as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select('id, number')
    .single<{ id: string; number: number }>()

  if (error) return { error: error.message }

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticket!.id,
    type: 'system',
    content: 'Chamado aberto.',
    is_system: true,
  } as never)

  redirect(`/chamados/${ticket!.id}`)
}

export async function addInteractionAction(_prevState: unknown, formData: FormData) {
  const parsed = interactionSchema.safeParse({
    ticket_id: formData.get('ticket_id'),
    type: formData.get('type') ?? 'mensagem',
    content: formData.get('content'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('sla_first_response_at, contract_id, sla_deadline')
    .eq('id', parsed.data.ticket_id)
    .single<{ sla_first_response_at: string | null; contract_id: string | null; sla_deadline: string | null }>()

  const isFirstResponse = parsed.data.type === 'mensagem' && !ticket?.sla_first_response_at

  await supabase.from('ticket_interactions').insert({
    ticket_id: parsed.data.ticket_id,
    type: parsed.data.type,
    content: parsed.data.content,
    author_profile_id: user!.id,
  } as never)

  if (isFirstResponse) {
    const now = new Date().toISOString()
    const deadline = ticket?.sla_deadline
    const met = deadline ? new Date(now) <= new Date(deadline) : null
    const breachMinutes = (!met && deadline)
      ? Math.floor((new Date(now).getTime() - new Date(deadline).getTime()) / 60_000)
      : null
    await supabase.from('tickets').update({
      sla_first_response_at: now,
      sla_met: met,
      sla_breach_minutes: breachMinutes,
    } as never).eq('id', parsed.data.ticket_id)
  }

  revalidatePath(`/chamados/${parsed.data.ticket_id}`)
  return { success: true }
}

export async function changeStatusAction(ticketId: string, newStatus: TicketStatus, note?: string) {
  const supabase = await createClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, sla_paused_at, sla_paused_minutes, sla_deadline')
    .eq('id', ticketId)
    .single<{ status: string; sla_paused_at: string | null; sla_paused_minutes: number | null; sla_deadline: string | null }>()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (!isValidTransition(ticket.status as TicketStatus, newStatus)) {
    return { error: `Transição de "${ticket.status}" para "${newStatus}" não é permitida` }
  }

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === 'aguardando_fornecedor' && !ticket.sla_paused_at) {
    updates.sla_paused_at = new Date().toISOString()
  }
  if (ticket.status === 'aguardando_fornecedor' && newStatus !== 'aguardando_fornecedor') {
    if (ticket.sla_paused_at && ticket.sla_deadline) {
      const pauseMs = Date.now() - new Date(ticket.sla_paused_at).getTime()
      updates.sla_deadline = new Date(new Date(ticket.sla_deadline).getTime() + pauseMs).toISOString()
      updates.sla_paused_minutes = (ticket.sla_paused_minutes ?? 0) + Math.floor(pauseMs / 60_000)
      updates.sla_paused_at = null
    }
  }
  if (newStatus === 'fechado') updates.closed_at = new Date().toISOString()

  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('tickets').update(updates as never).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: note ?? `Status alterado para: ${newStatus}`,
    author_profile_id: user!.id,
  } as never)

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function assignTicketAction(ticketId: string, analystId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('tickets').update({ assigned_to: analystId } as never).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'assignment',
    content: analystId ? 'Chamado atribuído.' : 'Atribuição removida.',
    author_profile_id: user!.id,
  } as never)
  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function scheduleTicketAction(ticketId: string, scheduledAt: string) {
  const parsed = scheduleSchema.safeParse({ scheduled_at: scheduledAt })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status')
    .eq('id', ticketId)
    .single<{ status: string }>()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (!isValidTransition(ticket.status as TicketStatus, 'agendado')) {
    return { error: `Não é possível agendar a partir do status "${ticket.status}"` }
  }

  await supabase.from('tickets').update({
    status: 'agendado',
    scheduled_at: parsed.data.scheduled_at,
  } as never).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Chamado agendado para ${new Date(parsed.data.scheduled_at).toLocaleString('pt-BR')}.`,
    author_profile_id: user!.id,
  } as never)

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
