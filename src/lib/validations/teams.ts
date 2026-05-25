import { z } from 'zod'

export const teamsWebhookSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  webhook_url: z.string().url('URL de webhook inválida'),
  is_active: z.boolean().default(true),
  notify_new_tickets: z.boolean().default(true),
  notify_sla_warning: z.boolean().default(true),
  notify_sla_breach: z.boolean().default(true),
  notify_url_down: z.boolean().default(true),
  notify_url_up: z.boolean().default(false),
  notify_monitoring_alert: z.boolean().default(true),
  notify_ticket_reopened: z.boolean().default(false),
})

export type TeamsWebhookInput = z.infer<typeof teamsWebhookSchema>
