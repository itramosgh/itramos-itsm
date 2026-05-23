import { z } from 'zod'

export const ticketSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  priority: z.enum(['critica', 'alta', 'media', 'baixa'], { message: 'Prioridade inválida' }),
  channel: z.enum(['portal', 'email', 'zabbix', 'azure_monitor', 'url_monitoring']),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  contract_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
})

export const interactionSchema = z.object({
  ticket_id: z.string().uuid(),
  type: z.enum(['mensagem', 'status_change', 'assignment', 'system']),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
})

export const scheduleSchema = z.object({
  scheduled_at: z
    .string()
    .min(1, 'Data e hora são obrigatórias')
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      'Data deve ser no futuro'
    ),
})

export const approvalRequestSchema = z.object({
  approver_email: z.string().email('E-mail do aprovador inválido'),
  approver_contact_id: z.string().uuid().optional(),
})

export type TicketInput = z.infer<typeof ticketSchema>
export type InteractionInput = z.infer<typeof interactionSchema>
export type ScheduleInput = z.infer<typeof scheduleSchema>
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>
