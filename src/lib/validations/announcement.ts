import { z } from 'zod'

const recipientRefinements = (schema: z.ZodTypeAny) =>
  (schema as any)
    .refine(
      (data: any) => data.recipient_type !== 'company' || !!data.recipient_company_id,
      { message: 'Empresa é obrigatória para tipo "company"', path: ['recipient_company_id'] }
    )
    .refine(
      (data: any) => data.recipient_type !== 'department' || (data.recipient_departments?.length ?? 0) > 0,
      { message: 'Selecione ao menos um departamento', path: ['recipient_departments'] }
    )

const baseFields = {
  subject: z.string().min(1, 'Assunto é obrigatório'),
  recipient_type: z.enum(['all', 'company', 'department', 'manual']),
  recipient_company_id: z.string().uuid().optional(),
  recipient_departments: z.array(z.string()).optional(),
  recipient_extra_emails: z.array(z.string().email()).optional(),
  scheduled_at: z.string().optional(),
}

export const announcementSchema = recipientRefinements(z.object({
  ...baseFields,
  body_html: z.string().min(1, 'Conteúdo é obrigatório'),
  body_rich_text: z.record(z.string(), z.unknown()).optional(),
}))

// Usado para atualizar apenas as configurações (sem body_html)
export const announcementSettingsSchema = recipientRefinements(z.object(baseFields))

export type AnnouncementInput = z.infer<typeof announcementSchema>
export type AnnouncementSettingsInput = z.infer<typeof announcementSettingsSchema>
