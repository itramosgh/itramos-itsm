import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'

async function checkUrl(url: string): Promise<{ status: 'up' | 'down'; httpStatusCode: number | null; responseTimeMs: number | null; errorMessage: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ITRAMOS-Monitor/1.0' },
    })
    clearTimeout(timeout)
    const responseTimeMs = Date.now() - start

    if (res.status >= 200 && res.status < 300) {
      return { status: 'up', httpStatusCode: res.status, responseTimeMs, errorMessage: null }
    }
    return { status: 'down', httpStatusCode: res.status, responseTimeMs, errorMessage: `HTTP ${res.status}` }
  } catch (err: any) {
    clearTimeout(timeout)
    const isTimeout = err.name === 'AbortError'
    return {
      status: 'down',
      httpStatusCode: null,
      responseTimeMs: null,
      errorMessage: isTimeout ? 'Timeout (>10s)' : (err.message ?? 'Conexão recusada'),
    }
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: urls } = await supabase
    .from('monitored_urls')
    .select('*')
    .eq('is_active', true)

  let checked = 0
  let incidents = 0

  for (const urlRow of (urls ?? []) as any[]) {
    // Check if interval has passed since last check
    if (urlRow.last_checked_at) {
      const lastCheck = new Date(urlRow.last_checked_at)
      const diffMinutes = (now.getTime() - lastCheck.getTime()) / 60000
      if (diffMinutes < urlRow.check_interval_minutes) continue
    }

    const result = await checkUrl(urlRow.url)
    checked++

    // Record history
    await supabase.from('url_check_history').insert({
      monitored_url_id: urlRow.id,
      checked_at: now.toISOString(),
      status: result.status,
      http_status_code: result.httpStatusCode,
      response_time_ms: result.responseTimeMs,
      error_message: result.errorMessage,
    } as never)

    // Update URL status
    await supabase.from('monitored_urls').update({
      last_checked_at: now.toISOString(),
      last_status: result.status,
    } as never).eq('id', urlRow.id)

    const previousStatus = urlRow.last_status

    // DOWN → was UP or never checked
    if (result.status === 'down' && previousStatus !== 'down') {
      incidents++

      const { data: company } = await supabase
        .from('companies')
        .select('id, name, is_blocked')
        .eq('id', urlRow.company_id)
        .single()

      if ((company as any)?.is_blocked) continue

      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', urlRow.company_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!contact) {
        await insertLog(supabase, 'url_monitoring', 'failure', `URL DOWN sem contato ativo: ${urlRow.url}`, { url_id: urlRow.id })
        continue
      }

      const { data: category } = await supabase
        .from('ticket_categories')
        .select('id')
        .eq('slug', 'incidente')
        .maybeSingle()

      const { data: ticket } = await supabase
        .from('tickets')
        .insert({
          title: `Indisponibilidade detectada: ${urlRow.name}`,
          description: `A URL ${urlRow.url} está inacessível.\nErro: ${result.errorMessage ?? 'Sem resposta'}`,
          company_id: urlRow.company_id,
          contact_id: (contact as any).id,
          category_id: (category as any)?.id ?? null,
          priority: 'alta',
          channel: 'url_monitoring',
        } as any)
        .select('id, number')
        .single()

      if (ticket) {
        await supabase.from('monitored_urls').update({ current_ticket_id: (ticket as any).id } as never).eq('id', urlRow.id)

        await supabase.from('ticket_interactions').insert({
          ticket_id: (ticket as any).id,
          type: 'system',
          content: `URL indisponível detectada automaticamente.\nURL: ${urlRow.url}\nErro: ${result.errorMessage ?? 'N/A'}`,
          is_system: true,
        } as never)

        await insertLog(supabase, 'url_monitoring', 'success', `URL DOWN: chamado #${(ticket as any).number} criado — ${urlRow.name}`, { url_id: urlRow.id })

        // Email notifications to analysts/managers
        const { data: notifyProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['gestor', 'analista'])
          .eq('is_active', true)
          .eq('notify_new_tickets', true)

        for (const profile of (notifyProfiles ?? []) as any[]) {
          const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
          if (authUser.user?.email) {
            try {
              const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
              await sendEmailFromTemplate('url_down_notification', authUser.user.email, {
                url_name: urlRow.name,
                url_address: urlRow.url,
                company_name: (company as any)?.name ?? 'Cliente',
                ticket_number: String((ticket as any).number),
                app_url: process.env.NEXT_PUBLIC_APP_URL ?? '',
                error_message: result.errorMessage ?? 'Sem resposta',
                detected_at: now.toLocaleString('pt-BR'),
              })
            } catch {
              // email failure doesn't stop the flow
            }
          }
        }

        // Teams notification
        try {
          await notifyTeams(supabase, 'url_down', {
            urlName: urlRow.name,
            urlAddress: urlRow.url,
            companyName: (company as any)?.name ?? 'Cliente',
            detectedAt: now.toLocaleString('pt-BR'),
          })
        } catch {
          await insertLog(supabase, 'url_monitoring', 'failure', 'Falha ao enviar notificação Teams URL DOWN (não crítico)', {})
        }
      }
    }

    // UP → was DOWN
    if (result.status === 'up' && previousStatus === 'down') {
      const ticketId = urlRow.current_ticket_id
      if (ticketId) {
        const { data: openTicket } = await supabase
          .from('tickets')
          .select('id, number, status')
          .eq('id', ticketId)
          .not('status', 'in', '("fechado","resolvido")')
          .maybeSingle()

        if (openTicket) {
          await supabase.from('tickets').update({
            status: 'resolvido',
            resolution: 'URL voltou a responder normalmente',
            closed_at: now.toISOString(),
          } as never).eq('id', ticketId)

          await supabase.from('ticket_interactions').insert({
            ticket_id: ticketId,
            type: 'system',
            content: 'URL voltou a responder normalmente. Chamado encerrado automaticamente.',
            is_system: true,
          } as never)

          await insertLog(supabase, 'url_monitoring', 'success', `URL UP: chamado #${(openTicket as any).number} encerrado — ${urlRow.name}`, { url_id: urlRow.id })
        }
      }

      await supabase.from('monitored_urls').update({ current_ticket_id: null } as never).eq('id', urlRow.id)

      try {
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', urlRow.company_id)
          .single()

        await notifyTeams(supabase, 'url_up', {
          urlName: urlRow.name,
          urlAddress: urlRow.url,
          companyName: (company as any)?.name ?? 'Cliente',
          restoredAt: now.toLocaleString('pt-BR'),
        })
      } catch {
        // Teams failure doesn't stop flow
      }
    }
  }

  return NextResponse.json({ ok: true, checked, incidents })
}
