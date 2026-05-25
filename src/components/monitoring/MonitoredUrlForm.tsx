'use client'
import { useActionState } from 'react'
import { createMonitoredUrlAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MonitoredUrlForm({ companyId }: { companyId: string }) {
  const action = createMonitoredUrlAction.bind(null, companyId)
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Nova URL</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>URL</Label>
          <Input name="url" placeholder="https://empresa.com.br" className="mt-1" required />
        </div>
        <div>
          <Label>Nome / Descrição</Label>
          <Input name="name" placeholder="Portal do cliente" className="mt-1" required />
        </div>
      </div>
      <div className="w-48">
        <Label>Verificar a cada</Label>
        <select name="check_interval_minutes" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
          <option value="5">5 minutos</option>
          <option value="10">10 minutos</option>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
        </select>
      </div>
      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Adicionando...' : 'Adicionar URL'}</Button>
    </form>
  )
}
