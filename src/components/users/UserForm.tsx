'use client'
import { useState } from 'react'
import type { UserInput } from '@/lib/validations/user'

interface Props {
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>
  defaultValues?: Partial<UserInput>
  submitLabel?: string
}

export function UserForm({ onSubmit, defaultValues, submitLabel = 'Criar usuário' }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await onSubmit(formData)
    if (result?.error) setError(result.error)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Nome completo</label>
        <input
          name="full_name"
          defaultValue={defaultValues?.full_name}
          required
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">E-mail</label>
        <input
          name="email"
          type="email"
          defaultValue={defaultValues?.email}
          required
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Papel</label>
        <select
          name="role"
          defaultValue={defaultValues?.role}
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="gestor">Gestor</option>
          <option value="analista">Analista</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="notify_new_tickets"
          id="notify_new_tickets"
          defaultChecked={defaultValues?.notify_new_tickets}
        />
        <label htmlFor="notify_new_tickets" className="text-sm">
          Notificar sobre novos chamados
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50"
      >
        {loading ? 'Salvando...' : submitLabel}
      </button>
    </form>
  )
}
