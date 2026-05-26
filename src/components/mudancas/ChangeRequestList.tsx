import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { ChangeRequestStatus, RiskLevel } from '@/types/database'
import { fmtDateTime } from '@/lib/format-date'

const statusLabel: Record<ChangeRequestStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada',
  em_execucao: 'Em Execução',
  concluida: 'Concluída',
  revertida: 'Revertida',
  reprovada: 'Reprovada',
}

const statusVariant: Record<ChangeRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline',
  aguardando_aprovacao: 'secondary',
  aprovada: 'default',
  em_execucao: 'default',
  concluida: 'secondary',
  revertida: 'destructive',
  reprovada: 'destructive',
}

const riskLabel: Record<RiskLevel, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }
const riskColor: Record<RiskLevel, string> = {
  baixo: 'text-green-600',
  medio: 'text-yellow-600',
  alto: 'text-red-600',
}

interface Props {
  changeRequests: Array<{
    id: string; title: string; status: string; risk_level: string
    maintenance_start: string; maintenance_end: string
    profiles: { full_name: string } | null
  }>
}

export function ChangeRequestList({ changeRequests }: Props) {
  if (changeRequests.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma GMUD cadastrada.</p>
  }

  return (
    <div className="space-y-2">
      {changeRequests.map((cr) => {
        const status = cr.status as ChangeRequestStatus
        const risk = cr.risk_level as RiskLevel
        return (
          <Link
            key={cr.id}
            href={`/mudancas/${cr.id}`}
            className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cr.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Janela: {fmtDateTime(cr.maintenance_start)} →{' '}
                  {fmtDateTime(cr.maintenance_end)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Responsável: {cr.profiles?.full_name ?? '—'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
                <span className={`text-xs font-medium ${riskColor[risk]}`}>
                  Risco {riskLabel[risk]}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
