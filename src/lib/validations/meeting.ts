import { z } from 'zod'

const participantSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('profile'), profile_id: z.string().uuid() }),
  z.object({ type: z.literal('contact'), contact_id: z.string().uuid() }),
  z.object({
    type: z.literal('external'),
    external_email: z.string().email('E-mail inválido'),
    external_name: z.string().min(1, 'Nome obrigatório'),
  }),
])

const actionItemSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória'),
  responsible_profile_id: z.string().uuid().optional().nullable(),
  responsible_contact_id: z.string().uuid().optional().nullable(),
  responsible_external_email: z.string().email().optional().nullable(),
  due_date: z.string().optional().nullable(),
})

export const meetingSchema = z.object({
  company_id: z.string().uuid('Empresa é obrigatória'),
  title: z.string().min(1, 'Pauta é obrigatória'),
  scheduled_at: z.string().min(1, 'Data/hora é obrigatória'),
  notes_html: z.string().optional(),
  notes_rich_text: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(['agendada', 'realizada', 'cancelada']).default('agendada'),
  participants: z.array(participantSchema).min(1, 'Ao menos um participante é obrigatório'),
  action_items: z.array(actionItemSchema).default([]),
})

export type MeetingInput = z.infer<typeof meetingSchema>
export type ActionItemInput = z.infer<typeof actionItemSchema>
