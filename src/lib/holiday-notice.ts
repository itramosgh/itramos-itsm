import { SupabaseClient } from '@supabase/supabase-js'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function sendHolidayNoticesForHoliday(
  holidayId: string,
  mode: 'pending' | 'all',
  serviceClient: SupabaseClient,
  triggeredBy: 'cron' | 'manual' = 'cron'
): Promise<{ sent: number; skipped: number }> {
  const { data: holiday } = await serviceClient
    .from('holidays')
    .select('id, name, date')
    .eq('id', holidayId)
    .single()

  if (!holiday) return { sent: 0, skipped: 0 }

  const { data: responsibles } = await serviceClient
    .from('contacts')
    .select('id, full_name, email, companies!inner(contracts(status))')
    .eq('is_contract_responsible', true)
    .eq('is_active', true)

  const activeContacts = ((responsibles ?? []) as any[]).filter(c =>
    (c.companies?.contracts ?? []).some((ct: any) => ct.status === 'ativo')
  )

  let targets = activeContacts

  if (mode === 'pending') {
    const { data: alreadySentRows } = await serviceClient
      .from('holiday_notice_sent')
      .select('contact_id')
      .eq('holiday_id', holidayId)
    const sentSet = new Set((alreadySentRows ?? []).map((r: any) => r.contact_id))
    targets = activeContacts.filter(c => !sentSet.has(c.id))
  } else {
    // mode = 'all': remove registros anteriores para evitar violação de constraint unique
    await serviceClient
      .from('holiday_notice_sent')
      .delete()
      .eq('holiday_id', holidayId)
  }

  const { data: settingsRaw } = await serviceClient
    .from('platform_settings')
    .select('holiday_notice_bcc_emails')
    .eq('id', 1)
    .single()
  const bccEmails: string[] = (settingsRaw as any)?.holiday_notice_bcc_emails ?? []

  const formattedDate = new Date((holiday as any).date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  let sent = 0
  let skipped = 0
  let bccSent = false

  for (const contact of targets as any[]) {
    try {
      await sendEmailFromTemplate(
        'aviso_feriado',
        contact.email,
        {
          nome_cliente: contact.full_name,
          data_feriado: formattedDate,
          nome_feriado: (holiday as any).name,
        },
        { bcc: bccSent ? [] : bccEmails }
      )

      await serviceClient
        .from('holiday_notice_sent')
        .insert({ holiday_id: holidayId, contact_id: contact.id } as never)

      bccSent = true
      sent++
    } catch (e) {
      console.error(`Erro ao enviar aviso feriado ${(holiday as any).name} para ${contact.email}:`, e)
      skipped++
    }
  }

  await serviceClient.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Aviso de feriado '${(holiday as any).name}' disparado ${triggeredBy === 'manual' ? 'manualmente' : 'pelo cron'} — ${sent} enviados, ${skipped} com erro`,
    details: { holidayId, sent, skipped, mode, triggeredBy },
  } as never)

  return { sent, skipped }
}
