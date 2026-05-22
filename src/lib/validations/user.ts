import { z } from 'zod'

export const userSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  role: z.enum(['admin', 'gestor', 'analista'], { message: 'Papel inválido' }),
  notify_new_tickets: z.boolean().default(false),
})

export type UserInput = z.infer<typeof userSchema>
