'use client'
import { useState } from 'react'
import { createCategoryAction, updateCategoryAction, toggleCategoryAction, deleteCategoryAction } from '@/app/(internal)/configuracoes/categorias/actions'
import { Badge } from '@/components/ui/badge'

interface Category {
  id: string
  name: string
  slug: string
  requires_approval: boolean | null
  is_active: boolean | null
}

interface Props {
  categories: Category[]
}

const emptyForm = { name: '', slug: '', requires_approval: false }

export function CategoryManager({ categories }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState(emptyForm)
  const [newValues, setNewValues] = useState(emptyForm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditValues({ name: cat.name, slug: cat.slug, requires_approval: cat.requires_approval ?? false })
    setError('')
  }

  async function handleUpdate(id: string) {
    setError('')
    const fd = new FormData()
    fd.append('name', editValues.name)
    fd.append('slug', editValues.slug)
    if (editValues.requires_approval) fd.append('requires_approval', 'on')
    const result = await updateCategoryAction(id, fd)
    if (result?.error) setError(result.error)
    else setEditingId(null)
  }

  async function handleDelete(id: string) {
    setError('')
    const result = await deleteCategoryAction(id)
    if (result?.error) setError(result.error)
    setConfirmDeleteId(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData()
    fd.append('name', newValues.name)
    fd.append('slug', newValues.slug)
    if (newValues.requires_approval) fd.append('requires_approval', 'on')
    const result = await createCategoryAction(fd)
    if (result?.error) setError(result.error)
    else setNewValues(emptyForm)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">Nome</th>
              <th className="p-3 text-left font-medium">Slug</th>
              <th className="p-3 text-left font-medium">Requer aprovação</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Nenhuma categoria cadastrada.
                </td>
              </tr>
            )}
            {categories.map(cat => (
              <tr key={cat.id} className="border-b hover:bg-muted/30">
                <td className="p-3">
                  {editingId === cat.id ? (
                    <input autoFocus value={editValues.name} onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                      className="border rounded-md px-2 py-1 text-sm w-full" />
                  ) : cat.name}
                </td>
                <td className="p-3 font-mono text-xs">
                  {editingId === cat.id ? (
                    <input value={editValues.slug} onChange={e => setEditValues(v => ({ ...v, slug: e.target.value }))}
                      className="border rounded-md px-2 py-1 text-sm w-full font-mono" />
                  ) : cat.slug}
                </td>
                <td className="p-3">
                  {editingId === cat.id ? (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editValues.requires_approval}
                        onChange={e => setEditValues(v => ({ ...v, requires_approval: e.target.checked }))} />
                      Sim
                    </label>
                  ) : (
                    cat.requires_approval ? <Badge>Sim</Badge> : <span className="text-muted-foreground">Não</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                    {cat.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
                <td className="p-3 text-right space-x-3 whitespace-nowrap">
                  {editingId === cat.id ? (
                    <>
                      <button type="button" onClick={() => handleUpdate(cat.id)}
                        disabled={!editValues.name.trim() || !editValues.slug.trim()}
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
                      <button type="button" onClick={() => startEdit(cat)}
                        className="text-sm hover:underline">
                        Editar
                      </button>
                      <form className="inline" action={toggleCategoryAction.bind(null, cat.id, !cat.is_active)}>
                        <button type="submit" className="text-sm text-muted-foreground hover:underline">
                          {cat.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </form>
                      {confirmDeleteId === cat.id ? (
                        <>
                          <span className="text-sm text-destructive">Confirmar?</span>
                          <button type="button" onClick={() => handleDelete(cat.id)}
                            className="text-sm text-destructive font-medium hover:underline">
                            Sim
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)}
                            className="text-sm text-muted-foreground hover:underline">
                            Não
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => { setConfirmDeleteId(cat.id); setError('') }}
                          className="text-sm text-destructive hover:underline">
                          Remover
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new */}
      <form onSubmit={handleCreate} className="rounded-md border p-4 space-y-3">
        <h3 className="text-sm font-medium">Nova categoria</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Nome</label>
            <input value={newValues.name}
              onChange={e => setNewValues(v => ({ ...v, name: e.target.value }))}
              placeholder="ex.: Infraestrutura"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Slug</label>
            <input value={newValues.slug}
              onChange={e => setNewValues(v => ({ ...v, slug: e.target.value }))}
              placeholder="ex.: infraestrutura"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm font-mono" required />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={newValues.requires_approval}
            onChange={e => setNewValues(v => ({ ...v, requires_approval: e.target.checked }))} />
          Requer aprovação
        </label>
        <button type="submit" disabled={loading || !newValues.name.trim() || !newValues.slug.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50">
          {loading ? 'Salvando...' : 'Adicionar'}
        </button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
