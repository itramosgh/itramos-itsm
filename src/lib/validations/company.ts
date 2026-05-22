import { z } from 'zod'

export const companySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().optional(),
  segment: z.string().optional(),
  address: z.string().optional(),
})

export const emailDomainSchema = z.object({
  domain: z
    .string()
    .min(1)
    .refine(d => !d.includes('@') && d.includes('.'), 'Domínio inválido — use apenas o domínio, sem @'),
})

export type CompanyInput = z.infer<typeof companySchema>
