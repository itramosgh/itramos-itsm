import { z } from 'zod'

export const contactSchema = z.object({
  company_id: z.string().uuid().optional().nullable(),
  full_name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  is_whatsapp: z.boolean().default(false),
  department: z.string().optional(),
  is_contract_responsible: z.boolean().default(false),
  receives_ticket_cc: z.boolean().default(false),
})

export type ContactInput = z.infer<typeof contactSchema>
