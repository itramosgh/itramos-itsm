'use client'
import { useState } from 'react'
import { updateUserAction, deactivateUserAction, deleteUserAction } from '@/app/(internal)/usuarios/actions'
import { UserForm } from './UserForm'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface Props {
  users: Profile[]
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  analista: 'Analista',
}

export function UserList({ users }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleDelete(id: string) {
    const result = await deleteUserAction(id)
    if (result?.error) {
      setErrors(prev => ({ ...prev, [id]: result.error! }))
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="space-y-2">
      {users.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
      )}
      {users.map((user) => (
        <div key={user.id} className="rounded-md border p-4">
          {editingId === user.id ? (
            <div className="space-y-4">
              <UserForm
                onSubmit={(fd) => updateUserAction(user.id, fd)}
                defaultValues={{ full_name: user.full_name ?? '', role: user.role as 'admin' | 'gestor' | 'analista', notify_new_tickets: user.notify_new_tickets ?? false }}
                submitLabel="Salvar"
                hideEmail
              />
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{user.full_name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {ROLE_LABELS[user.role ?? ''] ?? user.role}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(user.id)}
                  className="text-sm hover:underline"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deactivateUserAction(user.id)}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Desativar
                </button>
                {confirmDeleteId === user.id ? (
                  <span className="flex items-center gap-1 text-sm">
                    <span className="text-destructive font-medium">Remover?</span>
                    <button type="button" onClick={() => handleDelete(user.id)}
                      className="text-destructive hover:underline font-medium">Sim</button>
                    <span className="text-muted-foreground">/</span>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}
                      className="hover:underline">Não</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(user.id)}
                    className="text-sm text-destructive hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          )}
          {errors[user.id] && (
            <p className="text-xs text-destructive mt-2">{errors[user.id]}</p>
          )}
        </div>
      ))}
    </div>
  )
}
