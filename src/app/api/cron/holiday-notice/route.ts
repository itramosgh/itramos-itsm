import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings').select('holiday_notice_days').single()
  const noticeDays = (settings as any)?.holiday_notice_days ?? 7

  const windowStart = now.toISOString().slice(0, 10)
  const windowEnd = new Date(now.getTime() + noticeDays * 24 * 3_600_000)
    .toISOString().slice(0, 10)

  const { data: upcomingHolidays } = await supabase
    .from('holidays')
    .select('id, name, date')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  if (!upcomingHolidays?.length) {
    return NextResponse.json({ ok: true, noticesSent: 0 })
  }

  // Responsáveis de contratos ativos
  const { data: responsibles } = await supabase
    .from('contacts')
    .select('id, full_name, email, company_id, companies!inner(contracts(status))')
    .eq('is_contract_responsible', true)
    .eq('is_active', true)

  let noticesSent = 0

  for (const holiday of upcomingHolidays as any[]) {
    for (const contact of (responsibles ?? []) as any[]) {
      const hasActiveContract = (contact.companies?.contracts ?? [])
        .some((c: any) => c.status === 'ativo')
      if (!hasActiveContract) continue

      // Verificar se já enviado para este par (holiday, contact)
      const { data: alreadySent } = await supabase
        .from('holiday_notice_sent')
        .select('id')
        .eq('holiday_id', holiday.id)
        .eq('contact_id', contact.id)
        .single()
      if (alreadySent) continue

      const formattedDate = new Date(holiday.date + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })

      try {
        await sendEmailFromTemplate('aviso_feriado', contact.email, {
          nome_cliente: contact.full_name,
          data_feriado: formattedDate,
          nome_feriado: holiday.name,
        })

        await supabase.from('holiday_notice_sent').insert({
          holiday_id: holiday.id,
          contact_id: contact.id,
        } as never)

        noticesSent++
      } catch (e) {
        console.error(`Erro ao enviar aviso feriado ${holiday.name} para ${contact.email}:`, e)
      }
    }
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Avisos de feriado enviados`,
    details: { noticesSent, holidaysChecked: upcomingHolidays.length },
  } as never)

  return NextResponse.json({ ok: true, noticesSent })
}
