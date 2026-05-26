'use client'
import { useState } from 'react'
import { MonitoredUrlForm } from './MonitoredUrlForm'
import { updateMonitoredUrlAction, toggleMonitoredUrlAction, deleteMonitoredUrlAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Badge } from '@/components/ui/badge'

const INTERVALS = [
  { value: '5', label: '5 minutos' },
  { value: '10', label: '10 minutos' },
  { value: '15', label: '15 minutos' },
  { value: '30', label: '30 minutos' },
]

interface EditValues {
  name: string
  url: string
  check_interval_minutes: string
}

export function MonitoredUrlList({ urls, companyId }: { urls: any[]; companyId: string }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({ name: '', url: '', check_interval_minutes: '5' })
  const [error, setError] = useState('')

  function startEdit(item: any) {
    setEditingId(item.id)
    setEditValues({
      name: item.name,
      url: item.url,
      check_interval_minutes: String(item.check_interval_minutes),
    })
    setError('')
  }

  async function handleUpdate(id: string) {
    setError('')
    const fd = new FormData()
    fd.append('name', editValues.name)
    fd.append('url', editValues.url)
    fd.append('check_interval_minutes', editValues.check_interval_minutes)
    const result = await updateMonitoredUrlAction(id, companyId, fd)
    if (result?.error) setError(result.error)
    else setEditingId(null)
  }

  return (
    <div className="space-y-4">
      {urls.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma URL monitorada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Intervalo</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Última verificação</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {urls.map((item: any) => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">
                    {editingId === item.id ? (
                      <input autoFocus value={editValues.name}
                        onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                        className="border rounded-md px-2 py-1 text-sm w-full" />
                    ) : item.name}
                  </td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">
                    {editingId === item.id ? (
                      <input value={editValues.url}
                        onChange={e => setEditValues(v => ({ ...v, url: e.target.value }))}
                        className="border rounded-md px-2 py-1 text-sm w-full font-mono" />
                    ) : item.url}
                  </td>
                  <td className="p-3">
                    {editingId === item.id ? (
                      <select value={editValues.check_interval_minutes}
                        onChange={e => setEditValues(v => ({ ...v, check_interval_minutes: e.target.value }))}
                        className="border rounded-md px-2 py-1 text-sm">
                        {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                      </select>
                    ) : `${item.check_interval_minutes}min`}
                  </td>
                  <td className="p-3">
                    {item.last_status === 'up' && <Badge className="bg-green-100 text-green-800">UP</Badge>}
                    {item.last_status === 'down' && <Badge className="bg-red-100 text-red-800">DOWN</Badge>}
                    {!item.last_status && <Badge variant="outline">Pendente</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {item.last_checked_at ? new Date(item.last_checked_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="p-3 text-right space-x-3 whitespace-nowrap">
                    {editingId === item.id ? (
                      <>
                        <button type="button" onClick={() => handleUpdate(item.id)}
                          disabled={!editValues.name.trim() || !editValues.url.trim()}
                          className="text-sm text-primary hover:underline disabled:opacity-50">
                          Salvar
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="text-sm text-muted-foreground hover:underline">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(item)}
                          className="text-sm hover:underline">
                          Editar
                        </button>
                        <button type="button" onClick={() => toggleMonitoredUrlAction(item.id, companyId, !item.is_active)}
                          className="text-sm text-muted-foreground hover:underline">
                          {item.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" onClick={() => deleteMonitoredUrlAction(item.id, companyId)}
                          className="text-sm text-destructive hover:underline">
                          Remover
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <MonitoredUrlForm companyId={companyId} />
    </div>
  )
}
