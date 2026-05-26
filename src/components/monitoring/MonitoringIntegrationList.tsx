'use client'
import { useState } from 'react'
import { MonitoringIntegrationForm } from './MonitoringIntegrationForm'
import { updateMonitoringIntegrationAction, toggleMonitoringIntegrationAction, deleteMonitoringIntegrationAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const WINDOW_LABELS: Record<string, string> = {
  '24x7': '24x7',
  horario_comercial: 'Horário Comercial',
  personalizado: 'Personalizado',
}

const BEHAVIOR_LABELS: Record<string, string> = {
  descartar: 'Descartar',
  aguardar_e_abrir: 'Aguardar e abrir',
}

const DAYS = [
  { value: '1', label: 'Seg' }, { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' }, { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' }, { value: '6', label: 'Sáb' },
  { value: '7', label: 'Dom' },
]

interface EditState {
  id: string
  connector_type: string
  window_type: string
  window_custom_days: number[]
  window_custom_start: string
  window_custom_end: string
  out_of_window_behavior: string
}

export function MonitoringIntegrationList({ integrations, companyId }: { integrations: any[]; companyId: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editError, setEditError] = useState('')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  async function copyToken(token: string, connectorType: string, id: string) {
    const path = connectorType === 'zabbix' ? 'zabbix' : 'azure'
    const url = `${appUrl}/api/webhooks/${path}/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function startEdit(item: any) {
    setEditing({
      id: item.id,
      connector_type: item.connector_type,
      window_type: item.window_type,
      window_custom_days: item.window_custom_days ?? [],
      window_custom_start: item.window_custom_start ?? '09:00',
      window_custom_end: item.window_custom_end ?? '18:00',
      out_of_window_behavior: item.out_of_window_behavior,
    })
    setEditError('')
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setEditError('')
    const fd = new FormData(e.currentTarget)
    const result = await updateMonitoringIntegrationAction(editing.id, companyId, fd)
    if (result?.error) setEditError(result.error)
    else setEditing(null)
  }

  return (
    <div className="space-y-4">
      {integrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Ferramenta</th>
                <th className="text-left p-3">Webhook URL</th>
                <th className="text-left p-3">Janela</th>
                <th className="text-left p-3">Fora da janela</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {integrations.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <Badge variant="secondary">
                      {item.connector_type === 'zabbix' ? 'Zabbix' : 'Azure Monitor'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Button variant="ghost" size="sm"
                      onClick={() => copyToken(item.webhook_token, item.connector_type, item.id)}
                      className="font-mono text-xs max-w-[200px] truncate">
                      {copied === item.id ? 'Copiado!' : `.../${item.webhook_token.slice(0, 8)}...`}
                    </Button>
                  </td>
                  <td className="p-3">{WINDOW_LABELS[item.window_type] ?? item.window_type}</td>
                  <td className="p-3">{BEHAVIOR_LABELS[item.out_of_window_behavior] ?? item.out_of_window_behavior}</td>
                  <td className="p-3">
                    <form action={toggleMonitoringIntegrationAction.bind(null, item.id, companyId, !item.is_active)}>
                      <Button variant="ghost" size="sm" type="submit">
                        {item.is_active ? '✓ Ativo' : '○ Inativo'}
                      </Button>
                    </form>
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>Editar</Button>
                    <form className="inline" action={deleteMonitoringIntegrationAction.bind(null, item.id, companyId)}>
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">Remover</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MonitoringIntegrationForm companyId={companyId} />

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Editar Integração</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ferramenta</Label>
                  <select name="connector_type" defaultValue={editing.connector_type}
                    className="w-full border rounded-md px-3 py-2 text-sm mt-1">
                    <option value="zabbix">Zabbix</option>
                    <option value="azure_monitor">Azure Monitor</option>
                  </select>
                </div>
                <div>
                  <Label>Janela de Monitoramento</Label>
                  <select name="window_type"
                    defaultValue={editing.window_type}
                    onChange={e => setEditing(v => v ? { ...v, window_type: e.target.value } : v)}
                    className="w-full border rounded-md px-3 py-2 text-sm mt-1">
                    <option value="24x7">24x7</option>
                    <option value="horario_comercial">Horário Comercial</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </div>
              </div>

              {editing.window_type === 'personalizado' && (
                <div className="space-y-3 p-3 bg-muted rounded-md">
                  <div>
                    <Label>Dias da semana</Label>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {DAYS.map(d => (
                        <label key={d.value} className="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" name="window_custom_days" value={d.value}
                            defaultChecked={editing.window_custom_days.includes(parseInt(d.value))} />
                          {d.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Início</Label>
                      <Input type="time" name="window_custom_start" defaultValue={editing.window_custom_start} className="mt-1" />
                    </div>
                    <div>
                      <Label>Fim</Label>
                      <Input type="time" name="window_custom_end" defaultValue={editing.window_custom_end} className="mt-1" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label>Fora da janela</Label>
                <select name="out_of_window_behavior" defaultValue={editing.out_of_window_behavior}
                  className="w-full border rounded-md px-3 py-2 text-sm mt-1">
                  <option value="descartar">Descartar silenciosamente</option>
                  <option value="aguardar_e_abrir">Aguardar início da janela e abrir</option>
                </select>
              </div>

              {editError && <p className="text-sm text-destructive">{editError}</p>}

              <div className="flex gap-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
