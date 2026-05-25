'use client'
import { useState } from 'react'
import type { CompanyInput } from '@/lib/validations/company'

interface Props {
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>
  defaultValues?: Partial<CompanyInput>
  submitLabel?: string
}

export function CompanyForm({ onSubmit, defaultValues, submitLabel = 'Salvar' }: Props) {
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
        <label className="text-sm font-medium">Nome *</label>
        <input name="name" defaultValue={defaultValues?.name} required
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">CNPJ</label>
        <input name="cnpj" defaultValue={defaultValues?.cnpj}
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Segmento</label>
        <input name="segment" defaultValue={defaultValues?.segment}
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Endereço</label>
        <input name="address" defaultValue={defaultValues?.address}
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Tipo de cliente</label>
        <select
          name="company_type"
          defaultValue={(defaultValues as any)?.company_type ?? 'padrao'}
          className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="padrao">Contrato (padrão)</option>
          <option value="avulso">Avulso (sem contrato fixo)</option>
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50">
        {loading ? 'Salvando...' : submitLabel}
      </button>
    </form>
  )
}
