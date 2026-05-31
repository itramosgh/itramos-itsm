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
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000) // now + 23h
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000)   // now + 26h

  const { data: meetings, error: meetingsError } = await supabase
    .from('meetings')
    .select(`
      id, title, scheduled_at,
      meeting_participants (
        profile_id,
        contact_id,
        external_email,
        external_name,
        contacts ( full_name, email ),
        profiles ( full_name )
      )
    `)
    .eq('status', 'agendada')
    .is('reminder_24h_sent_at', null)
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString()) as { data: any[] | null; error: any }

  const remindersSent: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  if (meetingsError) errors.push(`query_error: ${meetingsError.message}`)

  for (const meeting of meetings ?? []) {
    const scheduledAt = new Date(meeting.scheduled_at)
    const dataReuniaoFormatted = scheduledAt.toLocaleString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const linkReuniao = `${process.env.NEXT_PUBLIC_APP_URL}/reunioes/${meeting.id}`

    const participants: Array<{ name: string; email: string }> = []

    for (const p of meeting.meeting_participants ?? []) {
      if (p.profile_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(p.profile_id)
        const email = authUser?.user?.email
        const name = p.profiles?.full_name ?? email ?? ''
        if (email) participants.push({ name, email })
        else skipped.push(`${meeting.id}: profile ${p.profile_id} sem email`)
      } else if (p.contact_id && p.contacts?.email) {
        participants.push({ name: p.contacts.full_name ?? p.contacts.email, email: p.contacts.email })
      } else if (p.external_email) {
        participants.push({ name: p.external_name ?? p.external_email, email: p.external_email })
      } else {
        skipped.push(`${meeting.id}: participante sem email resolvido`)
      }
    }

    for (const participant of participants) {
      try {
        await sendEmailFromTemplate('reuniao_lembrete', participant.email, {
          nome_participante: participant.name,
          titulo_reuniao: meeting.title,
          data_reuniao: dataReuniaoFormatted,
          link_reuniao: linkReuniao,
        })
        remindersSent.push(`${meeting.id} → ${participant.email}`)
      } catch (e: any) {
        errors.push(`${meeting.id} → ${participant.email}: ${e?.message ?? String(e)}`)
      }
    }

    await supabase
      .from('meetings')
      .update({ reminder_24h_sent_at: new Date().toISOString() } as never)
      .eq('id', meeting.id)
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: errors.length > 0 ? 'failure' : 'success',
    description: 'Lembretes de reunião enviados',
    details: {
      meetings_found: meetings?.length ?? 0,
      remindersSent,
      skipped,
      errors,
      window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
    },
  } as never)

  return NextResponse.json({
    ok: true,
    meetings_found: meetings?.length ?? 0,
    remindersSent,
    skipped,
    errors,
  })
}
