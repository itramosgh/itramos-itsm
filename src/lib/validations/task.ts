import { z } from 'zod'

export const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  company_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid('Responsável inválido'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  priority: z.enum(['alta', 'media', 'baixa']).optional().nullable(),
  reminder_days_before: z.coerce.number().int().min(0).default(3),
  is_recurring: z.boolean().default(false),
  recurrence_type: z.enum(['diaria', 'semanal', 'mensal', 'anual']).optional().nullable(),
})

export const taskUpdateSchema = taskSchema.partial().extend({
  status: z.enum(['pendente', 'concluida', 'vencida']).optional(),
})

export type TaskInput = z.infer<typeof taskSchema>
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>
