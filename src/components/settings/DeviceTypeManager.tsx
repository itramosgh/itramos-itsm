'use client'
import { useState } from 'react'
import { createDeviceTypeAction, updateDeviceTypeAction, deactivateDeviceTypeAction } from '@/app/(internal)/configuracoes/tipos-dispositivo/actions'

interface DeviceType {
  id: string
  name: string
  is_active: boolean | null
}

interface Props {
  deviceTypes: DeviceType[]
}

export function DeviceTypeManager({ deviceTypes }: Props) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const active = deviceTypes.filter(dt => dt.is_active !== false)
  const inactive = deviceTypes.filter(dt => dt.is_active === false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData()
    fd.append('name', newName)
    const result = await createDeviceTypeAction(fd)
    if (result?.error) setError(result.error)
    else setNewName('')
    setLoading(false)
  }

  async function handleUpdate(id: string) {
    setError('')
    const fd = new FormData()
    fd.append('name', editName)
    const result = await updateDeviceTypeAction(id, fd)
    if (result?.error) setError(result.error)
    else setEditingId(null)
  }

  async function handleDeactivate(id: string) {
    const result = await deactivateDeviceTypeAction(id)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="space-y-6">
      {/* Active types */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum tipo de dispositivo ativo.
                </td>
              </tr>
            )}
            {active.map(dt => (
              <tr key={dt.id} className="border-t hover:bg-muted/50">
                <td className="px-4 py-2">
                  {editingId === dt.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="border rounded-md px-2 py-1 text-sm w-full"
                    />
                  ) : (
                    dt.name
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                  {editingId === dt.id ? (
                    <>
                      <button type="button" onClick={() => handleUpdate(dt.id)}
                        disabled={!editName.trim()}
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
                      <button type="button" onClick={() => { setEditingId(dt.id); setEditName(dt.name); setError('') }}
                        className="text-sm hover:underline">
                        Editar
                      </button>
                      <button type="button" onClick={() => handleDeactivate(dt.id)}
                        className="text-sm text-destructive hover:underline">
                        Desativar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nome do tipo (ex.: Notebook)"
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          required
        />
        <button type="submit" disabled={loading || !newName.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50">
          {loading ? 'Salvando...' : 'Adicionar'}
        </button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Inactive types (collapsed) */}
      {inactive.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {inactive.length} tipo(s) desativado(s)
          </summary>
          <ul className="mt-2 space-y-1 pl-2">
            {inactive.map(dt => (
              <li key={dt.id} className="text-muted-foreground line-through">{dt.name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
