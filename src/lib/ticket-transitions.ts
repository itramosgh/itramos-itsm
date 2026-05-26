import type { TicketStatus } from '@/types/database'

export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  aberto:                ['em_andamento', 'agendado', 'aguardando_cliente', 'resolvido'],
  agendado:              ['em_andamento'],
  em_andamento:          ['aguardando_cliente', 'aguardando_fornecedor', 'aguardando_aprovacao',
                          'em_mudanca', 'em_deslocamento', 'agendado', 'resolvido', 'fechado'],
  em_deslocamento:       ['em_andamento', 'resolvido', 'fechado'],
  aguardando_cliente:    ['em_andamento', 'fechado'],
  aguardando_fornecedor: ['em_andamento', 'fechado'],
  aguardando_aprovacao:  ['em_andamento', 'fechado'],
  em_mudanca:            ['em_andamento', 'fechado'],
  resolvido:             ['fechado'],
  fechado:               ['reaberto'],
  reaberto:              ['em_andamento', 'agendado', 'aguardando_cliente'],
}

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
