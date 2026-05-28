import { z } from 'zod'

export const changeRequestSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  impacted_systems: z.string().min(1, 'Sistemas impactados são obrigatórios'),
  impacted_users: z.string().min(1, 'Usuários impactados são obrigatórios'),
  maintenance_start: z.string().min(1, 'Início da janela é obrigatório'),
  maintenance_end: z.string().min(1, 'Fim da janela é obrigatório'),
  rollback_plan: z.string().min(1, 'Plano de rollback é obrigatório'),
  risk_level: z.enum(['baixo', 'medio', 'alto'], { message: 'Nível de risco inválido' }),
  responsible_id: z.string().uuid('Responsável inválido'),
  company_id: z.string().uuid().optional(),
  origin_ticket_id: z.string().uuid().optional(),
  is_pre_approved: z.boolean().default(false),
  pre_approval_email: z.string().email('E-mail do aprovador inválido').optional(),
}).refine(
  (data) => new Date(data.maintenance_end) > new Date(data.maintenance_start),
  { message: 'Fim da janela deve ser após o início', path: ['maintenance_end'] }
).superRefine((data, ctx) => {
  if (data.is_pre_approved && !data.pre_approval_email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe o e-mail do responsável pela pré-aprovação',
      path: ['pre_approval_email'],
    })
  }
})

export const approvalRequestSchema = z.object({
  approver_email: z.string().email('E-mail do aprovador inválido'),
  approver_contact_id: z.string().uuid().optional(),
})

export const reversalSchema = z.object({
  reversal_reason: z.string().min(1, 'Motivo da reversão é obrigatório'),
})

export const costSchema = z.object({
  km_traveled: z.coerce.number().min(0).optional(),
  toll_amount: z.coerce.number().min(0).default(0),
  parking_amount: z.coerce.number().min(0).default(0),
  travel_discount_minutes: z.coerce.number().int().min(0).default(0),
})

export type ChangeRequestInput = z.infer<typeof changeRequestSchema>
export type CostInput = z.infer<typeof costSchema>
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>
export type ReversalInput = z.infer<typeof reversalSchema>
