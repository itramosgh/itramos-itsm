'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { markBilledAction } from '@/app/(internal)/chamados/actions'

interface Props {
  ticketId: string
  billingStatus: 'pendente' | 'cobrado' | null
  cost: {
    service_time_minutes: number | null
    travel_discount_minutes: number
    km_traveled: number | null
    toll_amount: number
    parking_amount: number
    hourly_rate_applied: number | null
    km_rate_applied: number | null
    total_amount: number | null
  } | null
  canMarkBilled: boolean
}

function fmtBrl(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BillingSummary({ ticketId, billingStatus, cost, canMarkBilled }: Props) {
  const [isPending, startTransition] = useTransition()

  if (!cost?.total_amount) return null

  const billableMin = Math.max(0, (cost.service_time_minutes ?? 0) - cost.travel_discount_minutes)
  const technicalFee = (billableMin / 60) * (cost.hourly_rate_applied ?? 0)
  const kmFee = (cost.km_traveled ?? 0) * (cost.km_rate_applied ?? 0)

  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Resumo de Custos</h3>
        {billingStatus && (
          <Badge variant={billingStatus === 'cobrado' ? 'default' : 'secondary'}>
            {billingStatus === 'cobrado' ? 'Cobrado' : 'Cobrança Pendente'}
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Horas técnicas ({Math.max(0, billableMin)}min)</dt>
        <dd className="text-right">{fmtBrl(technicalFee)}</dd>
        <dt className="text-muted-foreground">Deslocamento ({cost.km_traveled ?? 0}km)</dt>
        <dd className="text-right">{fmtBrl(kmFee)}</dd>
        <dt className="text-muted-foreground">Pedágio</dt>
        <dd className="text-right">{fmtBrl(cost.toll_amount)}</dd>
        <dt className="text-muted-foreground">Estacionamento</dt>
        <dd className="text-right">{fmtBrl(cost.parking_amount)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{fmtBrl(cost.total_amount)}</dd>
      </dl>

      {canMarkBilled && billingStatus === 'pendente' && (
        <Button
          size="sm"
          onClick={() => startTransition(async () => { await markBilledAction(ticketId) })}
          disabled={isPending}
        >
          Marcar como Cobrado
        </Button>
      )}
    </div>
  )
}
