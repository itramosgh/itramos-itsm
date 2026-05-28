import { z } from 'zod'

export const announcementSchema = z.object({
  subject: z.string().min(1, 'Assunto é obrigatório'),
  body_html: z.string().min(1, 'Conteúdo é obrigatório'),
  body_rich_text: z.record(z.string(), z.unknown()).optional(),
  recipient_type: z.enum(['all', 'company', 'department', 'manual']),
  recipient_company_id: z.string().uuid().optional(),
  recipient_departments: z.array(z.string()).optional(),
  scheduled_at: z.string().optional(),
}).refine(
  data => data.recipient_type !== 'company' || !!data.recipient_company_id,
  { message: 'Empresa é obrigatória para tipo "company"', path: ['recipient_company_id'] }
).refine(
  data => data.recipient_type !== 'department' || (data.recipient_departments?.length ?? 0) > 0,
  { message: 'Selecione ao menos um departamento', path: ['recipient_departments'] }
)

export type AnnouncementInput = z.infer<typeof announcementSchema>
