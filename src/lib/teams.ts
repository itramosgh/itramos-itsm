import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamsEventType =
  | 'new_ticket'
  | 'sla_warning'
  | 'sla_breach'
  | 'url_down'
  | 'url_up'
  | 'monitoring_alert'
  | 'ticket_reopened'

type EventFlagMap = Record<TeamsEventType, string>

const EVENT_FLAG: EventFlagMap = {
  new_ticket: 'notify_new_tickets',
  sla_warning: 'notify_sla_warning',
  sla_breach: 'notify_sla_breach',
  url_down: 'notify_url_down',
  url_up: 'notify_url_up',
  monitoring_alert: 'notify_monitoring_alert',
  ticket_reopened: 'notify_ticket_reopened',
}

function buildAdaptiveCard(event: TeamsEventType, data: Record<string, string>): object {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const colorMap: Record<TeamsEventType, string> = {
    new_ticket: 'Accent',
    sla_warning: 'Warning',
    sla_breach: 'Attention',
    url_down: 'Attention',
    url_up: 'Good',
    monitoring_alert: 'Warning',
    ticket_reopened: 'Accent',
  }

  const titleMap: Record<TeamsEventType, string> = {
    new_ticket: `🎫 Novo Chamado #${data.ticketNumber ?? ''}`,
    sla_warning: `⚠️ SLA Próximo de Vencer — #${data.ticketNumber ?? ''}`,
    sla_breach: `🚨 SLA Violado — #${data.ticketNumber ?? ''}`,
    url_down: `🔴 URL Indisponível: ${data.urlName ?? ''}`,
    url_up: `✅ URL Normalizada: ${data.urlName ?? ''}`,
    monitoring_alert: `🔔 Alerta ${data.source ?? 'Monitoramento'}: ${data.description ?? ''}`,
    ticket_reopened: `🔄 Chamado Reaberto #${data.ticketNumber ?? ''}`,
  }

  const buildFacts = (pairs: [string, string][]): object[] =>
    pairs.filter(([, v]) => !!v).map(([title, value]) => ({ title, value }))

  let facts: object[] = []
  let actions: object[] = []

  switch (event) {
    case 'new_ticket':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['Prioridade', data.priority ?? ''],
        ['Título', data.title ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'sla_warning':
      facts = buildFacts([
        ['Chamado', data.title ?? ''],
        ['Prazo Restante', data.timeRemaining ?? ''],
        ['Analista', data.assignedTo ?? 'Não atribuído'],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'sla_breach':
      facts = buildFacts([
        ['Chamado', data.title ?? ''],
        ['Violado há', data.breachTime ?? ''],
        ['Analista', data.assignedTo ?? 'Não atribuído'],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'url_down':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['URL', data.urlAddress ?? ''],
        ['Detectado em', data.detectedAt ?? ''],
      ])
      break

    case 'url_up':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['URL', data.urlAddress ?? ''],
        ['Normalizado em', data.restoredAt ?? ''],
      ])
      break

    case 'monitoring_alert':
      facts = buildFacts([
        ['Origem', data.source ?? ''],
        ['Host / Recurso', data.resource ?? ''],
        ['Severidade', data.severity ?? ''],
        ['Cliente', data.companyName ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: `Ver Chamado #${data.ticketNumber}`, url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'ticket_reopened':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['Título', data.title ?? ''],
        ['Motivo', data.reason ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: titleMap[event],
              weight: 'Bolder',
              size: 'Medium',
              color: colorMap[event],
              wrap: true,
            },
            ...(facts.length > 0 ? [{ type: 'FactSet', facts }] : []),
          ],
          ...(actions.length > 0 ? { actions } : {}),
        },
      },
    ],
  }
}

export async function notifyTeams(
  supabase: SupabaseClient,
  event: TeamsEventType,
  data: Record<string, string>
): Promise<void> {
  const flag = EVENT_FLAG[event]

  const { data: webhooks } = await (supabase as any)
    .from('teams_webhook_configs')
    .select('id, webhook_url')
    .eq('is_active', true)
    .eq(flag, true)

  if (!webhooks?.length) return

  const card = buildAdaptiveCard(event, data)

  await Promise.allSettled(
    webhooks.map((w: any) =>
      fetch(w.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      })
    )
  )
}
