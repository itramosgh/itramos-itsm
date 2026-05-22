import { z } from 'zod'

export const platformSettingsSchema = z.object({
  company_name: z.string().optional(),
  company_website: z.string().url().optional().or(z.literal('')),
  company_address: z.string().optional(),
  company_phone: z.string().optional(),
  company_whatsapp: z.string().optional(),
  email_from_address: z.string().email('E-mail de remetente inválido'),
  email_from_name: z.string().min(1, 'Nome do remetente é obrigatório'),
  holiday_notice_days: z.coerce.number().int().min(1).max(30),
  recurrence_min_tickets: z.coerce.number().int().min(2),
  recurrence_window_days: z.coerce.number().int().min(1),
  business_hours_start: z.string().regex(/^\d{2}:\d{2}$/),
  business_hours_end: z.string().regex(/^\d{2}:\d{2}$/),
  business_hours_days: z.array(z.coerce.number().int().min(1).max(7)).min(1),
  hourly_rate: z.coerce.number().min(0).optional(),
  km_rate: z.coerce.number().min(0).optional(),
  billing_alert_days: z.coerce.number().int().min(1),
})

export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>
