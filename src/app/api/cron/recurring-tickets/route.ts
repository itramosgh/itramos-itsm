import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  const { data: templates } = await supabase
    .from('recurring_ticket_templates')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', today) as { data: any[] | null }

  if (!templates?.length) {
    return NextResponse.json({ ok: true, created: 0 })
  }

  let created = 0

  for (const template of templates) {
    try {
      // 1. Criar chamado
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          title: template.title,
          description: template.description ?? null,
          company_id: template.company_id,
          contact_id: template.contact_id,
          category_id: template.category_id ?? null,
          priority: template.priority,
          channel: 'recorrente',
          status: 'aberto',
        } as never)
        .select('id, number')
        .single()

      if (ticketError || !ticket) {
        await insertLog(supabase, 'cron_job', 'failure',
          `Erro ao criar chamado recorrente (template ${template.id})`,
          { error: ticketError?.message })
        continue
      }

      const ticketId = (ticket as any).id
      const ticketNumber = (ticket as any).number

      // 2. Calcular SLA
      try {
        const sla = await calculateTicketSLAForCompany(supabase, {
          companyId: template.company_id,
          priority: template.priority,
          createdAt: new Date(),
        })
        if (sla) {
          await (supabase.from('tickets') as any)
            .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at })
            .eq('id', ticketId)
        }
      } catch {
        // SLA failure não bloqueia
      }

      // 3. Interação de sistema
      await supabase.from('ticket_interactions').insert({
        ticket_id: ticketId,
        type: 'system',
        content: 'Chamado criado automaticamente por agendamento recorrente.',
        is_system: true,
      } as never)

      // 4. Notificações por e-mail
      try {
        const { resolveContactEmails, resolveNewTicketNotifyEmails } = await import('@/lib/email-notifications')
        const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL!

        const { data: companyData } = await supabase
          .from('companies').select('name').eq('id', template.company_id).single() as { data: any }

        const [contactEmails, notifyEmails] = await Promise.all([
          resolveContactEmails(supabase, template.contact_id, template.company_id),
          resolveNewTicketNotifyEmails(supabase),
        ])
        const allEmails = [...new Set([...contactEmails, ...notifyEmails])]
        if (allEmails.length > 0) {
          await sendEmailFromTemplate('chamado_aberto', allEmails, {
            numero_chamado: String(ticketNumber),
            titulo_chamado: template.title,
            nome_cliente: companyData?.name ?? '',
            link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
            prioridade: template.priority,
          }, { replyTo: `chamado-${ticketNumber}@reply.itramos.com.br` })
        }
      } catch (e) {
        await insertLog(supabase, 'cron_job', 'failure',
          `Erro ao enviar e-mail chamado recorrente #${ticketNumber}`,
          { error: String(e) })
      }

      // 5. Avançar next_run_at
      const nextDate = nextOccurrenceDate(template.next_run_at, template.frequency, template.interval_days)
      await (supabase.from('recurring_ticket_templates') as any)
        .update({ next_run_at: nextDate })
        .eq('id', template.id)

      await insertLog(supabase, 'cron_job', 'success',
        `Chamado recorrente #${ticketNumber} criado (template ${template.id})`,
        { ticket_id: ticketId })
      created++

    } catch (e) {
      await insertLog(supabase, 'cron_job', 'failure',
        `Erro inesperado no template recorrente ${template.id}`,
        { error: String(e) })
    }
  }

  return NextResponse.json({ ok: true, created })
}
