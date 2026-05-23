'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, approvalResultHtml, buildFromAddress } from '@/lib/email'

export async function processApprovalAction(
  token: string,
  action: 'aprovar' | 'reprovar',
  reason?: string
) {
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('ticket_approvals')
    .select('*, tickets(number, title, assigned_to, contacts(email, full_name))')
    .eq('token', token)
    .single()

  if (!approval) return { error: 'Token inválido ou expirado' }
  if ((approval as any).status !== 'pendente') return { error: 'Esta solicitação já foi respondida' }

  const ticket = (approval as any).tickets
  const approved = action === 'aprovar'
  const newTicketStatus = approved ? 'em_andamento' : (approval as any).previous_status

  await supabase.from('ticket_approvals').update({
    status: approved ? 'aprovado' : 'reprovado',
    response_reason: reason ?? null,
    responded_at: new Date().toISOString(),
  } as never).eq('id', (approval as any).id)

  await supabase.from('tickets').update({ status: newTicketStatus } as never).eq('id', (approval as any).ticket_id)

  await supabase.from('ticket_interactions').insert({
    ticket_id: (approval as any).ticket_id,
    type: 'system',
    content: approved
      ? 'Aprovação concedida. Chamado retomado.'
      : `Reprovado${reason ? `: ${reason}` : ''}. Chamado retornou ao status anterior.`,
    is_system: true,
  } as never)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRaw } = await supabase.from('platform_settings').select('email_from_address, email_from_name').single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const html = approvalResultHtml({
    ticketNumber: ticket.number,
    ticketTitle: ticket.title,
    approved,
    reason,
    appUrl,
  })

  const recipients: string[] = []
  if (ticket.assigned_to) {
    const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
    if (authUser.user?.email) recipients.push(authUser.user.email)
  }
  if (!approved && ticket.contacts?.email) {
    recipients.push(ticket.contacts.email)
  }

  if (recipients.length > 0) {
    await sendEmail({ to: recipients, subject: `Resultado da aprovação — Chamado #${ticket.number}`, from, html })
  }

  return { success: true, approved }
}
