'use client'
import { useState } from 'react'

interface Props {
  companyId: string
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>
  submitLabel?: string
}

export function ContactForm({ companyId, onSubmit, submitLabel = 'Salvar' }: Props) {
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
      <input type="hidden" name="company_id" value={companyId} />
      <div>
        <label className="text-sm font-medium">Nome completo *</label>
        <input name="full_name" required
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">E-mail *</label>
        <input name="email" type="email" required
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Telefone</label>
        <input name="phone"
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Departamento</label>
        <input name="department"
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_whatsapp" /> WhatsApp
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_contract_responsible" /> Responsável pelo contrato
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="receives_ticket_cc" /> Recebe cópia de chamados
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50">
        {loading ? 'Salvando...' : submitLabel}
      </button>
    </form>
  )
}
