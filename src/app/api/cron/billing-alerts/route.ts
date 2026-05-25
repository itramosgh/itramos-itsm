import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('billing_alert_days')
    .single() as { data: any }

  const alertDays = settings?.billing_alert_days ?? 7
  const cutoff = new Date(Date.now() - alertDays * 24 * 3600 * 1000).toISOString()

  const { data: pendingTickets } = await supabase
    .from('tickets')
    .select('id, number, title, companies(name), closed_at')
    .eq('billing_status', 'pendente')
    .eq('status', 'fechado')
    .lt('closed_at', cutoff)
    .order('closed_at') as { data: any[] | null }

  if (!pendingTickets || pendingTickets.length === 0) {
    await insertLog(supabase, 'cron_job', 'success', 'billing-alerts: sem cobranças pendentes')
    return NextResponse.json({ sent: 0 })
  }

  const { data: gestores } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'gestor'])
    .eq('is_active', true) as { data: any[] | null }

  const gestorEmails: string[] = []
  for (const g of gestores ?? []) {
    const { data: au } = await supabase.auth.admin.getUserById(g.id)
    if (au.user?.email) gestorEmails.push(au.user.email)
  }

  if (gestorEmails.length === 0) {
    await insertLog(supabase, 'cron_job', 'success', 'billing-alerts: nenhum gestor com e-mail')
    return NextResponse.json({ sent: 0 })
  }

  const lista = pendingTickets
    .map((t: any) => `<li>#${t.number} — ${t.title} (${(t.companies as any)?.name ?? ''})</li>`)
    .join('')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  try {
    await sendEmailFromTemplate('cobranca_pendente_alerta', gestorEmails, {
      total_chamados: String(pendingTickets.length),
      dias_pendente: String(alertDays),
      lista_chamados: lista,
      link_relatorio: `${appUrl}/relatorios/custos`,
    })

    await insertLog(supabase, 'cron_job', 'success',
      `billing-alerts: alerta enviado para ${gestorEmails.length} gestor(es), ${pendingTickets.length} chamados`)
  } catch (err: any) {
    await insertLog(supabase, 'cron_job', 'failure', 'billing-alerts: erro ao enviar', { error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ sent: gestorEmails.length, tickets: pendingTickets.length })
}
