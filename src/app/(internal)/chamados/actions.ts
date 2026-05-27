'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ticketSchema, interactionSchema, scheduleSchema, approvalRequestSchema } from '@/lib/validations/ticket'
import { isValidTransition } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'
import { sendEmail, approvalRequestHtml, buildFromAddress } from '@/lib/email'
import { getEffectiveSLAStart, calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'
import { notifyTeams } from '@/lib/teams'
import { checkAndAlertRecurrence } from '@/lib/recurrence-check'

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

  // Verificar recorrência em background (não bloqueia a resposta)
  void checkAndAlertRecurrence(ticket!.id).catch(() => {/* silencioso */})

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticket!.id,
    type: 'system',
    content: 'Chamado aberto.',
    is_system: true,
  } as never)

  // Calcular SLA se o chamado tiver contrato com regra de SLA
  if (parsed.data.contract_id) {
    const [{ data: slaRule }, { data: contract }, { data: settings }, { data: holidays }] = await Promise.all([
      supabase.from('contract_sla_rules')
        .select('response_hours')
        .eq('contract_id', parsed.data.contract_id)
        .eq('priority', parsed.data.priority)
        .single(),
      supabase.from('contracts').select('is_24x7').eq('id', parsed.data.contract_id).single(),
      supabase.from('platform_settings').select('business_hours_start, business_hours_end, business_hours_days').single(),
      supabase.from('holidays').select('date').gte('date', new Date().toISOString().slice(0, 10)),
    ])

    if (slaRule && contract && settings) {
      const businessSettings: BusinessHoursSettings = {
        start: (settings as any).business_hours_start,
        end: (settings as any).business_hours_end,
        days: (settings as any).business_hours_days,
      }
      const holidayDates = (holidays ?? []).map((h: any) => h.date)
      const now = new Date()
      const startsAt = getEffectiveSLAStart(
        now,
        (contract as any).is_24x7,
        businessSettings,
        holidayDates
      )
      const deadline = calculateDeadline({
        createdAt: startsAt,
        responseHours: (slaRule as any).response_hours,
        is24x7: (contract as any).is_24x7,
        settings: businessSettings,
        holidays: holidayDates,
      })

      await supabase.from('tickets').update({
        sla_deadline: deadline.toISOString(),
        sla_starts_at: startsAt.toISOString(),
      } as never).eq('id', ticket!.id)
    }
  }

  // Notificar solicitante + responsáveis + gestores com notify_new_tickets
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, priority, contact_id, company_id, contacts(full_name)')
      .eq('id', ticket!.id)
      .single()
    const tf = ticketFull as any
    const { resolveContactEmails, resolveNewTicketNotifyEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const [contactEmails, gestorEmails] = await Promise.all([
      resolveContactEmails(supabase, parsed.data.contact_id, parsed.data.company_id),
      resolveNewTicketNotifyEmails(serviceSupabase),
    ])
    const allEmails = [...new Set([...contactEmails, ...gestorEmails])]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (allEmails.length > 0) {
      await sendEmailFromTemplate(
        'chamado_aberto',
        allEmails,
        {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/portal/chamados/${ticket!.id}`,
          prioridade: tf.priority,
        },
        { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
      )
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_aberto:', e)
  }

  // Teams notification
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketForTeams } = await supabase
      .from('tickets')
      .select('id, number, title, priority, companies(name)')
      .eq('id', ticket!.id)
      .single()
    const ttf = ticketForTeams as any
    await notifyTeams(serviceSupabase, 'new_ticket', {
      ticketNumber: String(ttf.number),
      ticketId: ttf.id,
      title: ttf.title,
      priority: ttf.priority,
      companyName: ttf.companies?.name ?? '',
    })
  } catch {
    // Teams failure doesn't stop ticket creation
  }

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

  // Notificar solicitante + responsáveis quando analista posta mensagem
  if (parsed.data.type === 'mensagem') {
    try {
      const serviceSupabase = await createServiceClient()
      const { data: ticketFull } = await supabase
        .from('tickets')
        .select('number, title, contact_id, company_id, contacts(full_name)')
        .eq('id', parsed.data.ticket_id)
        .single()
      const tf = ticketFull as any
      const { data: analystProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user!.id)
        .single()
      const { resolveContactEmails } = await import('@/lib/email-notifications')
      const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate(
          'analista_respondeu',
          contactEmails,
          {
            numero_chamado: String(tf.number),
            titulo_chamado: tf.title,
            nome_cliente: (tf.contacts as any)?.full_name ?? '',
            nome_analista: (analystProfile as any)?.full_name ?? '',
            link_chamado: `${appUrl}/portal/chamados/${parsed.data.ticket_id}`,
          },
          { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
        )
      }
    } catch (e) {
      console.error('Erro ao enviar notificação analista_respondeu:', e)
    }
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

  // Notificações por e-mail na mudança de status
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, contact_id, company_id, assigned_to, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    const { resolveContactEmails, resolveAnalystEmail } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')

    if (newStatus === 'fechado') {
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate('chamado_fechado', contactEmails, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
        }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
      }
    } else if (newStatus === 'reaberto') {
      const analystEmail = await resolveAnalystEmail(serviceSupabase, tf.assigned_to)
      if (analystEmail) {
        await sendEmailFromTemplate('chamado_reaberto', analystEmail, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          link_chamado: `${appUrl}/chamados/${ticketId}`,
        })
      }
    } else {
      const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
      if (contactEmails.length > 0) {
        await sendEmailFromTemplate('status_alterado', contactEmails, {
          numero_chamado: String(tf.number),
          titulo_chamado: tf.title,
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          novo_status: newStatus,
          link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
        }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
      }
    }
  } catch (e) {
    console.error('Erro ao enviar notificação de status:', e)
  }

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

export async function requestApprovalAction(ticketId: string, formData: FormData) {
  const parsed = approvalRequestSchema.safeParse({
    approver_email: formData.get('approver_email'),
    approver_contact_id: formData.get('approver_contact_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: ticketRaw } = await supabase
    .from('tickets')
    .select('number, title, status, contact_id, channel, contacts(email, full_name)')
    .eq('id', ticketId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketRaw as any

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (['zabbix', 'azure_monitor', 'url_monitoring'].includes(ticket.channel)) {
    return { error: 'Chamados de monitoramento não passam por aprovação' }
  }
  if (!isValidTransition(ticket.status as TicketStatus, 'aguardando_aprovacao')) {
    return { error: `Não é possível solicitar aprovação a partir do status "${ticket.status}"` }
  }

  const contactEmail = ticket.contacts?.email
  const contactName = ticket.contacts?.full_name

  // Auto-aprovação quando aprovador = solicitante
  if (parsed.data.approver_email === contactEmail) {
    await serviceSupabase.from('ticket_approvals').insert({
      ticket_id: ticketId,
      approver_email: parsed.data.approver_email,
      approver_contact_id: parsed.data.approver_contact_id ?? null,
      previous_status: ticket.status,
      status: 'automatico',
      responded_at: new Date().toISOString(),
    } as never)
    await supabase.from('tickets').update({ status: 'em_andamento' } as never).eq('id', ticketId)
    await supabase.from('ticket_interactions').insert({
      ticket_id: ticketId,
      type: 'system',
      content: 'Aprovado automaticamente — solicitante e aprovador são a mesma pessoa.',
      is_system: true,
    } as never)
    revalidatePath(`/chamados/${ticketId}`)
    return { success: true, autoApproved: true }
  }

  const { data: approval } = await serviceSupabase.from('ticket_approvals').insert({
    ticket_id: ticketId,
    approver_email: parsed.data.approver_email,
    approver_contact_id: parsed.data.approver_contact_id ?? null,
    previous_status: ticket.status,
    status: 'pendente',
  } as never).select('token').single<{ token: string }>()

  if (!approval) return { error: 'Erro ao criar solicitação de aprovação' }

  await supabase.from('tickets').update({ status: 'aguardando_aprovacao' } as never).eq('id', ticketId)
  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Aprovação solicitada para: ${parsed.data.approver_email}`,
    is_system: true,
  } as never)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRaw } = await supabase.from('platform_settings').select('email_from_address, email_from_name').single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  await sendEmail({
    to: parsed.data.approver_email,
    subject: `Aprovação necessária — Chamado #${ticket.number}`,
    from,
    html: approvalRequestHtml({
      ticketNumber: ticket.number,
      ticketTitle: ticket.title,
      requesterName: contactName ?? 'Solicitante',
      approvePath: `/aprovacao/${approval.token}?action=aprovar`,
      rejectPath: `/aprovacao/${approval.token}?action=reprovar`,
      appUrl,
    }),
  })

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function reopenTicketAction(ticketId: string, reason: string, reopenedByContactId?: string) {
  const supabase = await createClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, closed_at, number')
    .eq('id', ticketId)
    .single<{ status: string; closed_at: string | null; number: number }>()

  if (!ticket) return { error: 'Chamado não encontrado' }
  if (ticket.status !== 'fechado') return { error: 'Apenas chamados fechados podem ser reabertos' }

  if (!ticket.closed_at) return { error: 'Data de fechamento não registrada' }
  const closedAt = new Date(ticket.closed_at)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000)
  if (closedAt < sevenDaysAgo) {
    return { error: 'Prazo de reabertura expirado. O chamado foi fechado há mais de 7 dias. Abra um novo chamado.' }
  }

  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('ticket_reopens').insert({
    ticket_id: ticketId,
    reopened_by_profile_id: reopenedByContactId ? null : user!.id,
    reopened_by_contact_id: reopenedByContactId ?? null,
    reason,
  } as never)

  await supabase.from('tickets').update({
    status: 'reaberto',
    closed_at: null,
  } as never).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'system',
    content: `Chamado reaberto. Motivo: ${reason}`,
    is_system: true,
  } as never)

  // Notificar analista sobre reabertura
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, title, assigned_to, contact_id, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const { resolveAnalystEmail } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const analystEmail = await resolveAnalystEmail(serviceSupabase, tf.assigned_to)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (analystEmail) {
      await sendEmailFromTemplate('chamado_reaberto', analystEmail, {
        numero_chamado: String(tf.number),
        titulo_chamado: tf.title,
        nome_cliente: (tf.contacts as any)?.full_name ?? '',
        link_chamado: `${appUrl}/chamados/${ticketId}`,
      })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_reaberto:', e)
  }

  // Teams notification
  try {
    const serviceSupabase = await createServiceClient()
    const { data: ticketForTeams } = await serviceSupabase
      .from('tickets')
      .select('id, number, title, company_id, companies(name)')
      .eq('id', ticketId)
      .single()
    const rtf = ticketForTeams as any
    await notifyTeams(serviceSupabase, 'ticket_reopened', {
      ticketNumber: String(rtf.number),
      ticketId: ticketId,
      title: rtf.title,
      companyName: rtf.companies?.name ?? '',
      reason,
    })
  } catch {
    // Teams failure doesn't stop reopen
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function searchKbArticlesAction(query: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kb_articles')
    .select('id, title, summary, slug')
    .eq('is_active', true)
    .ilike('title', `%${query}%`)
    .limit(10)
  return { articles: data ?? [] }
}

export async function linkKbArticleAction(ticketId: string, articleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: article }, { data: ticket }] = await Promise.all([
    supabase.from('kb_articles').select('id, title, summary, slug').eq('id', articleId).single(),
    supabase.from('tickets').select('number, title, contact_id, company_id, contacts(full_name)').eq('id', ticketId).single(),
  ])

  if (!article || !ticket) return { error: 'Chamado ou artigo não encontrado' }

  const { data: link } = await supabase.from('ticket_kb_links').insert({
    ticket_id: ticketId,
    kb_article_id: articleId,
    linked_by: user!.id,
  } as never).select('confirmation_token').single<{ confirmation_token: string }>()

  if (!link) return { error: 'Erro ao vincular artigo' }

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'system',
    content: `Artigo vinculado: "${(article as any).title}"`,
    author_profile_id: user!.id,
    is_system: false,
  } as never)

  // Enviar kb_artigo_vinculado para solicitante + responsáveis via sendEmailFromTemplate
  try {
    const tf = ticket as any
    const art = article as any
    const { resolveContactEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (contactEmails.length > 0) {
      await sendEmailFromTemplate(
        'kb_artigo_vinculado',
        contactEmails,
        {
          numero_chamado: String(tf.number),
          nome_cliente: (tf.contacts as any)?.full_name ?? '',
          titulo_artigo: art.title,
          resumo_artigo: art.summary ?? '',
          link_confirmar: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=true`,
          link_negar: `${appUrl}/api/tickets/kb-confirm?token=${link.confirmation_token}&resolved=false`,
        },
        { replyTo: `chamado-${tf.number}@reply.itramos.com.br` }
      )
    }
  } catch (e) {
    console.error('Erro ao enviar kb_artigo_vinculado:', e)
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function closeWithResolutionAction(ticketId: string, resolution: string, createArticle?: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('title, description, category_id, status')
    .eq('id', ticketId)
    .single<{ title: string; description: string | null; category_id: string | null; status: string }>()

  if (!ticket) return { error: 'Chamado não encontrado' }
  const wasAlreadyClosed = ticket.status === 'fechado'

  await supabase.from('tickets').update({
    status: 'fechado',
    closed_at: wasAlreadyClosed ? undefined : new Date().toISOString(),
    resolution,
  } as never).eq('id', ticketId)

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'status_change',
    content: `Chamado fechado. Resolução: ${resolution}`,
    author_profile_id: user!.id,
  } as never)

  if (createArticle) {
    const { createArticleFromTicketAction } = await import('@/app/(internal)/conhecimento/actions')
    await createArticleFromTicketAction(
      ticketId,
      ticket.title,
      ticket.description ?? null,
      resolution,
      ticket.category_id ?? null,
      user!.id
    )
  }

  // Notificar contatos sobre fechamento com resolução (apenas se não estava fechado antes — evita email duplo)
  if (!wasAlreadyClosed) try {
    const { data: ticketFull } = await supabase
      .from('tickets')
      .select('number, contact_id, company_id, contacts(full_name)')
      .eq('id', ticketId)
      .single()
    const tf = ticketFull as any
    const { resolveContactEmails } = await import('@/lib/email-notifications')
    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    const contactEmails = await resolveContactEmails(supabase, tf.contact_id, tf.company_id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!
    if (contactEmails.length > 0) {
      await sendEmailFromTemplate('chamado_fechado', contactEmails, {
        numero_chamado: String(tf.number),
        titulo_chamado: ticket!.title,
        nome_cliente: (tf.contacts as any)?.full_name ?? '',
        link_chamado: `${appUrl}/portal/chamados/${ticketId}`,
      }, { replyTo: `chamado-${tf.number}@reply.itramos.com.br` })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação chamado_fechado em closeWithResolution:', e)
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function closeTicketFormAction(ticketId: string, formData: FormData) {
  const resolution = formData.get('resolution') as string
  const createArticle = formData.get('create_article') === 'on'
  if (!resolution?.trim()) return { error: 'Resolução é obrigatória' }

  // Se tem custo calculado, setar billing_status como pendente
  const supabase = await createClient()
  const { data: tc } = await supabase
    .from('ticket_costs').select('total_amount').eq('ticket_id', ticketId).maybeSingle() as { data: any }
  const extraBillingFields: Record<string, unknown> = {}
  if (tc?.total_amount > 0) {
    extraBillingFields.billing_status = 'pendente'
  }
  if (Object.keys(extraBillingFields).length > 0) {
    await supabase.from('tickets').update(extraBillingFields as never).eq('id', ticketId)
  }

  return closeWithResolutionAction(ticketId, resolution, createArticle)
}

export async function markPresentialAction(
  ticketId: string,
  step: 'departure' | 'arrival' | 'completion'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('ticket_costs')
    .select('id, departure_at, arrival_at')
    .eq('ticket_id', ticketId)
    .single() as { data: any }

  if (step === 'departure') {
    if (existing) {
      await supabase.from('ticket_costs')
        .update({ departure_at: now, arrival_at: null, completion_at: null,
          travel_time_minutes: null, service_time_minutes: null } as never)
        .eq('ticket_id', ticketId)
    } else {
      await supabase.from('ticket_costs')
        .insert({ ticket_id: ticketId, departure_at: now } as never)
    }
    await supabase.from('tickets').update({ status: 'em_deslocamento' } as never).eq('id', ticketId)
    await supabase.from('ticket_interactions').insert({
      ticket_id: ticketId, type: 'system',
      content: 'Analista a caminho para atendimento presencial.', is_system: true,
    } as never)

  } else if (step === 'arrival') {
    if (!existing?.departure_at) return { error: 'Marque a saída primeiro' }
    const travelMinutes = Math.round(
      (new Date(now).getTime() - new Date(existing.departure_at).getTime()) / 60000
    )
    await supabase.from('ticket_costs')
      .update({ arrival_at: now, travel_time_minutes: travelMinutes } as never)
      .eq('ticket_id', ticketId)

  } else if (step === 'completion') {
    if (!existing?.arrival_at) return { error: 'Marque a chegada primeiro' }
    const serviceMinutes = Math.round(
      (new Date(now).getTime() - new Date(existing.arrival_at).getTime()) / 60000
    )
    await supabase.from('ticket_costs')
      .update({ completion_at: now, service_time_minutes: serviceMinutes } as never)
      .eq('ticket_id', ticketId)
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function updateTicketCostAction(ticketId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { costSchema } = await import('@/lib/validations/change-request')
  const parsed = costSchema.safeParse({
    km_traveled: formData.get('km_traveled'),
    toll_amount: formData.get('toll_amount'),
    parking_amount: formData.get('parking_amount'),
    travel_discount_minutes: formData.get('travel_discount_minutes'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: settings } = await supabase
    .from('platform_settings').select('hourly_rate, km_rate').single() as { data: any }

  const { data: cost } = await supabase
    .from('ticket_costs').select('service_time_minutes, travel_discount_minutes')
    .eq('ticket_id', ticketId).single() as { data: any }

  const hourlyRate = settings?.hourly_rate ?? 0
  const kmRate = settings?.km_rate ?? 0
  const serviceMin = cost?.service_time_minutes ?? 0
  const discount = parsed.data.travel_discount_minutes ?? 0
  const billableMin = Math.max(0, serviceMin - discount)

  const technicalFee = (billableMin / 60) * hourlyRate
  const kmFee = (parsed.data.km_traveled ?? 0) * kmRate
  const total = technicalFee + kmFee + (parsed.data.toll_amount ?? 0) + (parsed.data.parking_amount ?? 0)

  await supabase.from('ticket_costs').update({
    ...parsed.data,
    hourly_rate_applied: hourlyRate,
    km_rate_applied: kmRate,
    total_amount: Number(total.toFixed(2)),
  } as never).eq('ticket_id', ticketId)

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function updateTicketMetaAction(
  ticketId: string,
  data: { priority?: string; category_id?: string | null; assigned_to?: string | null }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor', 'analista'].includes(profile?.role)) return { error: 'Sem permissão' }

  await supabase.from('tickets').update(data as never).eq('id', ticketId)

  const changes: string[] = []
  if (data.priority) changes.push(`prioridade: ${data.priority}`)
  if ('category_id' in data) changes.push('categoria atualizada')
  if ('assigned_to' in data) changes.push(data.assigned_to ? 'analista atribuído' : 'analista removido')

  if (changes.length > 0) {
    await supabase.from('ticket_interactions').insert({
      ticket_id: ticketId,
      type: 'system',
      content: `Chamado atualizado: ${changes.join(', ')}`,
      is_system: true,
      author_profile_id: user.id,
    } as never)
  }

  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}

export async function markBilledAction(ticketId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  if (!['admin', 'gestor'].includes(profile?.role)) return { error: 'Sem permissão' }

  await supabase.from('tickets').update({ billing_status: 'cobrado' } as never).eq('id', ticketId)
  revalidatePath(`/chamados/${ticketId}`)
  return { success: true }
}
