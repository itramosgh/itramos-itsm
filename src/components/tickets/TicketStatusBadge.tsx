import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/types/database'

const STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto', agendado: 'Agendado', em_andamento: 'Em Andamento',
  aguardando_cliente: 'Aguardando Cliente', aguardando_fornecedor: 'Aguardando Fornecedor',
  aguardando_aprovacao: 'Aguardando Aprovação', em_mudanca: 'Em Mudança',
  resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
}

const STATUS_VARIANT: Record<TicketStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberto: 'default', agendado: 'outline', em_andamento: 'default',
  aguardando_cliente: 'secondary', aguardando_fornecedor: 'secondary',
  aguardando_aprovacao: 'secondary', em_mudanca: 'outline',
  resolvido: 'outline', fechado: 'secondary', reaberto: 'destructive',
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
}
