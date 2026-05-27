'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function sendPortalReplyAction(
  _prevState: { ok: true } | { error: string } | null,
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const ticketId = formData.get('ticket_id') as string
  const content = formData.get('content') as string
  if (!content?.trim()) return { error: 'Mensagem não pode estar vazia.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single() as { data: any }
  if (!contact) return { error: 'Contato não encontrado.' }

  const serviceSupabase = await createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket } = await serviceSupabase
    .from('tickets')
    .select('status, company_id, number, title, assigned_to')
    .eq('id', ticketId)
    .single() as { data: any }

  if (!ticket || ticket.company_id !== contact.company_id) {
    return { error: 'Chamado não encontrado.' }
  }

  const { error: interactionError } = await serviceSupabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'mensagem',
    content,
    author_contact_id: contact.id,
  } as never)

  if (interactionError) return { error: interactionError.message }

  if (ticket.status === 'aguardando_cliente') {
    await serviceSupabase
      .from('tickets')
      .update({ status: 'em_andamento' } as never)
      .eq('id', ticketId)
  }

  // Notificar analista
  try {
    if (ticket.assigned_to) {
      const { resolveAnalystEmail } = await import('@/lib/email-notifications')
      const analystEmail = await resolveAnalystEmail(serviceSupabase, ticket.assigned_to)
      if (analystEmail) {
        const [{ data: contactData }, { data: settingsRaw }] = await Promise.all([
          serviceSupabase.from('contacts').select('full_name').eq('id', contact.id).single(),
          serviceSupabase.from('platform_settings').select('email_from_name, email_from_address').single(),
        ])
        const settings = settingsRaw as any
        const { sendEmail, buildFromAddress } = await import('@/lib/email')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL!
        await sendEmail({
          to: analystEmail,
          subject: `Retorno do cliente — Chamado #${ticket.number}`,
          from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
          html: `<p>O cliente <strong>${(contactData as any)?.full_name ?? ''}</strong> respondeu ao chamado <strong>#${ticket.number} — ${ticket.title}</strong>.</p><p><a href="${appUrl}/chamados/${ticketId}">Abrir chamado</a></p>`,
        })
      }
    }
  } catch (e) {
    console.error('Erro ao notificar analista:', e)
  }

  revalidatePath(`/portal/chamados/${ticketId}`)
  return { ok: true }
}
