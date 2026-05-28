import { getSLARemainingMinutes, getSLAPercentUsed } from '@/lib/sla'

const FINAL_STATUSES = ['resolvido', 'fechado', 'reaberto']

interface Props {
  createdAt: string
  updatedAt?: string
  slaStartsAt: string | null
  slaDeadline: string | null
  slaFirstResponseAt: string | null
  slaMet: boolean | null
  slaPausedAt: string | null
  status?: string
}

export function SLAIndicator({ createdAt, updatedAt, slaStartsAt, slaDeadline, slaFirstResponseAt, slaMet, slaPausedAt, status }: Props) {
  if (!slaDeadline) return <span className="text-xs text-muted-foreground">Sem SLA</span>

  if (slaFirstResponseAt !== null) {
    return (
      <span className={`text-xs font-medium ${slaMet ? 'text-green-600' : 'text-red-600'}`}>
        {slaMet ? '✓ SLA cumprido' : '✗ SLA violado'}
      </span>
    )
  }

  // Ticket em estado final sem first response registrado → compara updatedAt (proxy de resolução) com o prazo
  if (status && FINAL_STATUSES.includes(status)) {
    const resolvedTs = updatedAt ?? createdAt
    const metByDeadline = new Date(resolvedTs) <= new Date(slaDeadline)
    return (
      <span className={`text-xs font-medium ${metByDeadline ? 'text-green-600' : 'text-red-600'}`}>
        {metByDeadline ? '✓ SLA cumprido' : '✗ SLA violado'}
      </span>
    )
  }

  const effectiveStart = slaStartsAt ?? createdAt
  const remaining = getSLARemainingMinutes(new Date(slaDeadline), slaPausedAt ? new Date(slaPausedAt) : null)
  const pct = getSLAPercentUsed(new Date(effectiveStart), new Date(slaDeadline), slaPausedAt ? new Date(slaPausedAt) : null)
  const color = remaining < 0 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
  const label = remaining < 0 ? `Atrasado ${Math.abs(remaining)}min` : remaining < 60 ? `${remaining}min restantes` : `${Math.floor(remaining / 60)}h restantes`

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs ${remaining < 0 ? 'text-red-600' : pct >= 80 ? 'text-yellow-600' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  )
}
