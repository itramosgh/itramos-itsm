'use client'
import { useState } from 'react'
import { createContractAction, upsertSLARulesAction, upsertContractDevicesAction } from '@/app/(internal)/clientes/[id]/contratos/actions'
import { ContractForm } from './ContractForm'

interface DeviceType {
  id: string
  name: string
}

export function CreateContractDialog({ companyId, deviceTypes }: { companyId: string; deviceTypes: DeviceType[] }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(formData: FormData) {
    setError('')
    const devicesJson = formData.get('devices_json') as string
    const slaJson = formData.get('sla_json') as string

    const result = await createContractAction(companyId, formData)
    if (!result?.success || !result.contractId) return result

    const contractId = result.contractId

    // Upsert SLA rules and devices in parallel
    await Promise.all([
      slaJson ? upsertSLARulesAction(contractId, companyId, slaJson) : Promise.resolve(),
      devicesJson ? upsertContractDevicesAction(contractId, companyId, devicesJson) : Promise.resolve(),
    ])

    setOpen(false)
    return result
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm">
        Novo Contrato
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Novo Contrato</h2>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <ContractForm companyId={companyId} deviceTypes={deviceTypes} onSubmit={handleCreate} />
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
