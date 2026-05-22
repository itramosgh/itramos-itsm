'use client'
import { useState } from 'react'
import { createCompanyAction } from '@/app/(internal)/clientes/actions'
import { CompanyForm } from './CompanyForm'

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false)

  async function handleCreate(formData: FormData) {
    const result = await createCompanyAction(formData)
    if (result?.success) setOpen(false)
    return result
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm">
        Nova Empresa
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Nova Empresa</h2>
            <CompanyForm onSubmit={handleCreate} submitLabel="Criar empresa" />
            <button type="button" onClick={() => setOpen(false)}
              className="w-full border rounded-md px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
