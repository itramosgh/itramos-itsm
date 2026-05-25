'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { markPresentialAction, updateTicketCostAction } from '@/app/(internal)/chamados/actions'

interface CostData {
  departure_at: string | null; arrival_at: string | null; completion_at: string | null
  travel_time_minutes: number | null; service_time_minutes: number | null
  travel_discount_minutes: number; km_traveled: number | null
  toll_amount: number; parking_amount: number; total_amount: number | null
}

interface Props {
  ticketId: string
  cost: CostData | null
  canDiscount: boolean
}

function fmtMin(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export function PresentialCostPanel({ ticketId, cost, canDiscount }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleMark(step: 'departure' | 'arrival' | 'completion') {
    startTransition(async () => {
      await markPresentialAction(ticketId, step)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costFormAction = async (fd: FormData) => { await updateTicketCostAction(ticketId, fd) }

  return (
    <div className="border rounded-md p-4 space-y-4">
      <h3 className="text-sm font-semibold">Atendimento Presencial</h3>

      <div className="flex gap-3 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant={cost?.departure_at ? 'secondary' : 'default'}
          disabled={isPending}
          onClick={() => handleMark('departure')}
        >
          {cost?.departure_at ? `Saiu: ${new Date(cost.departure_at).toLocaleTimeString('pt-BR')}` : 'Saindo para atendimento'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cost?.arrival_at ? 'secondary' : 'outline'}
          disabled={isPending || !cost?.departure_at}
          onClick={() => handleMark('arrival')}
        >
          {cost?.arrival_at ? `Chegou: ${new Date(cost.arrival_at).toLocaleTimeString('pt-BR')}` : 'Cheguei no cliente'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cost?.completion_at ? 'secondary' : 'outline'}
          disabled={isPending || !cost?.arrival_at}
          onClick={() => handleMark('completion')}
        >
          {cost?.completion_at ? `Concluiu: ${new Date(cost.completion_at).toLocaleTimeString('pt-BR')}` : 'Atendimento concluído'}
        </Button>
      </div>

      {cost?.departure_at && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Deslocamento</p>
            <p className="font-medium">{fmtMin(cost.travel_time_minutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Atendimento</p>
            <p className="font-medium">{fmtMin(cost.service_time_minutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="font-medium">
              {fmtMin((cost.travel_time_minutes ?? 0) + (cost.service_time_minutes ?? 0))}
            </p>
          </div>
        </div>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <form
        action={costFormAction as any}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="km_traveled">Quilômetros percorridos</Label>
            <Input id="km_traveled" name="km_traveled" type="number" step="0.1" min="0"
              defaultValue={cost?.km_traveled?.toString() ?? ''} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="toll_amount">Pedágio (R$)</Label>
            <Input id="toll_amount" name="toll_amount" type="number" step="0.01" min="0"
              defaultValue={cost?.toll_amount?.toString() ?? '0'} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="parking_amount">Estacionamento (R$)</Label>
            <Input id="parking_amount" name="parking_amount" type="number" step="0.01" min="0"
              defaultValue={cost?.parking_amount?.toString() ?? '0'} />
          </div>
          {canDiscount && (
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="travel_discount_minutes">Desconto deslocamento (min)</Label>
              <Input id="travel_discount_minutes" name="travel_discount_minutes" type="number" min="0"
                defaultValue={cost?.travel_discount_minutes?.toString() ?? '0'} />
            </div>
          )}
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Salvar custos
        </Button>
      </form>
    </div>
  )
}
