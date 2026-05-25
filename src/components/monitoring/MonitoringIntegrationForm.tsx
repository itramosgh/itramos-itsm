'use client'
import { useActionState, useState } from 'react'
import { createMonitoringIntegrationAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

const DAYS = [
  { value: '1', label: 'Seg' }, { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' }, { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' }, { value: '6', label: 'Sáb' },
  { value: '7', label: 'Dom' },
]

export function MonitoringIntegrationForm({ companyId }: { companyId: string }) {
  const [windowType, setWindowType] = useState<string>('horario_comercial')
  const action = createMonitoringIntegrationAction.bind(null, companyId)
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Nova Integração</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Ferramenta</Label>
          <select name="connector_type" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
            <option value="zabbix">Zabbix</option>
            <option value="azure_monitor">Azure Monitor</option>
          </select>
        </div>

        <div>
          <Label>Janela de Monitoramento</Label>
          <select
            name="window_type"
            className="w-full border rounded-md px-3 py-2 text-sm mt-1"
            value={windowType}
            onChange={(e) => setWindowType(e.target.value)}
          >
            <option value="24x7">24x7</option>
            <option value="horario_comercial">Horário Comercial</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
      </div>

      {windowType === 'personalizado' && (
        <div className="space-y-3 p-3 bg-muted rounded-md">
          <div>
            <Label>Dias da semana</Label>
            <div className="flex gap-3 mt-1 flex-wrap">
              {DAYS.map(d => (
                <label key={d.value} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" name="window_custom_days" value={d.value} defaultChecked={parseInt(d.value) <= 5} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="time" name="window_custom_start" defaultValue="09:00" className="mt-1" />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="time" name="window_custom_end" defaultValue="18:00" className="mt-1" />
            </div>
          </div>
        </div>
      )}

      <div>
        <Label>Fora da janela</Label>
        <select name="out_of_window_behavior" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
          <option value="descartar">Descartar silenciosamente</option>
          <option value="aguardar_e_abrir">Aguardar início da janela e abrir</option>
        </select>
      </div>

      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adicionando...' : 'Adicionar Integração'}
      </Button>
    </form>
  )
}
