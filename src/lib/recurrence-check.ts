import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export interface SimilarTicket {
  id: string
  number: number
  title: string
  created_at: string
}

export function shouldAlert(similarCount: number, minTickets: number): boolean {
  return similarCount >= minTickets
}

export async function checkAndAlertRecurrence(ticketId: string): Promise<void> {
  const supabase = await createServiceClient()

  const [ticketRes, settingsRes] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, number, title, company_id, assigned_to, companies(name)')
      .eq('id', ticketId)
      .single(),
    supabase
      .from('platform_settings')
      .select('recurrence_min_tickets, recurrence_window_days')
      .single(),
  ])

  const ticket = ticketRes.data as any
  const settings = settingsRes.data as any
  if (!ticket || !settings) return

  const windowDays: number = settings.recurrence_window_days ?? 30
  const minTickets: number = settings.recurrence_min_tickets ?? 3
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const { data: similar } = await (supabase.rpc as any)('find_similar_tickets', {
    p_title: ticket.title,
    p_company_id: ticket.company_id,
    p_exclude_id: ticketId,
    p_since: since,
    p_threshold: 0.3,
  }) as { data: SimilarTicket[] | null }

  if (!similar || !shouldAlert(similar.length, minTickets)) return

  await (supabase as any)
    .from('tickets')
    .update({ recurrence_detected: true })
    .eq('id', ticketId)

  const { data: gestores } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'gestor')
    .eq('is_active', true)

  const recipientIds = [...((gestores ?? []) as any[]).map((g: any) => g.id)]
  if (ticket.assigned_to && !recipientIds.includes(ticket.assigned_to)) {
    recipientIds.push(ticket.assigned_to)
  }

  const companyName: string = (ticket.companies as any)?.name ?? ''
  const vars = {
    nome_empresa: companyName,
    janela_dias: String(windowDays),
    total_chamados: String(similar.length),
    categoria_chamados: '—',
  }

  for (const profileId of recipientIds) {
    const { data: authData } = await supabase.auth.admin.getUserById(profileId)
    if (authData.user?.email) {
      await sendEmailFromTemplate('problema_recorrente', authData.user.email, vars)
    }
  }
}
