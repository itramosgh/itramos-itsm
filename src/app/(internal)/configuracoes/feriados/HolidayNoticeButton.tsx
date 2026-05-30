'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { sendHolidayNoticesAction } from './actions'

interface Props {
  holidayId: string
  holidayName: string
  sentCount: number
}

export function HolidayNoticeButton({ holidayId, holidayName, sentCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)

  async function handleSend(mode: 'pending' | 'all') {
    setLoading(true)
    setFeedback(null)
    const result = await sendHolidayNoticesAction(holidayId, mode)
    setLoading(false)
    setOpen(false)
    if ('error' in result) {
      setFeedback(`Erro: ${result.error}`)
    } else {
      setFeedback(`${result.sent} aviso(s) enviado(s)`)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" title="Enviar avisos" disabled={loading}>
            {loading ? '...' : '✉'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar avisos — {holidayName}</AlertDialogTitle>
            <AlertDialogDescription>
              {sentCount === 0
                ? 'Enviar aviso deste feriado para todos os responsáveis de contratos ativos?'
                : `${sentCount} contato(s) já receberam este aviso. Como deseja prosseguir?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {sentCount > 0 && (
              <AlertDialogAction onClick={() => handleSend('pending')}>
                Apenas os faltantes
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => handleSend(sentCount === 0 ? 'pending' : 'all')}>
              {sentCount === 0 ? 'Enviar' : 'Reenviar para todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
    </div>
  )
}
