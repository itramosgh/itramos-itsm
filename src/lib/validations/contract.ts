import { z } from 'zod'

export const contractSchema = z.object({
  company_id: z.string().uuid(),
  start_date: z.string().date('Data de início inválida'),
  end_date: z.string().date().optional().or(z.literal('')),
  renewal_date: z.string().date().optional().or(z.literal('')),
  services: z.array(z.string()).default([]),
  status: z.enum(['ativo', 'expirado', 'renovacao_pendente']).default('ativo'),
  is_24x7: z.boolean().default(false),
})

export const slaRulesSchema = z.array(
  z.object({
    priority: z.enum(['critica', 'alta', 'media', 'baixa']),
    response_hours: z.number().positive('Prazo deve ser maior que zero'),
  })
)

export const contractDeviceSchema = z.object({
  device_type_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive('Quantidade deve ser maior que zero'),
})

export type ContractInput = z.infer<typeof contractSchema>
export type SLARulesInput = z.infer<typeof slaRulesSchema>
