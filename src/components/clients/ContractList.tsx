'use client'
import { useState } from 'react'
import type { Database } from '@/types/database'
import { ContractForm } from './ContractForm'
import { updateContractAction, upsertSLARulesAction, upsertContractDevicesAction } from '@/app/(internal)/clientes/[id]/contratos/actions'

type Contract = Database['public']['Tables']['contracts']['Row'] & {
  contract_sla_rules: Database['public']['Tables']['contract_sla_rules']['Row'][]
  contract_devices: (Database['public']['Tables']['contract_devices']['Row'] & {
    device_types: { name: string } | null
  })[]
}

interface DeviceType {
  id: string
  name: string
}

interface Props {
  contracts: Contract[]
  companyId: string
  deviceTypes: DeviceType[]
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-800' },
  expirado: { label: 'Expirado', cls: 'bg-gray-100 text-gray-600' },
  renovacao_pendente: { label: 'Renovação pendente', cls: 'bg-yellow-100 text-yellow-800' },
}

const SLA_PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

export function ContractList({ contracts, companyId, deviceTypes }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState('')

  const editingContract = contracts.find(c => c.id === editingId)

  async function handleEdit(formData: FormData) {
    if (!editingId) return
    setEditError('')
    const devicesJson = formData.get('devices_json') as string
    const slaJson = formData.get('sla_json') as string

    const result = await updateContractAction(editingId, companyId, formData)
    if (!result?.success) return result

    await Promise.all([
      slaJson ? upsertSLARulesAction(editingId, companyId, slaJson) : Promise.resolve(),
      devicesJson ? upsertContractDevicesAction(editingId, companyId, devicesJson) : Promise.resolve(),
    ])

    setEditingId(null)
    return result
  }

  return (
    <div className="space-y-3">
      {contracts.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
      )}
      {contracts.map((contract) => {
        const status = STATUS_LABELS[contract.status ?? 'ativo']
        return (
          <div key={contract.id} className="rounded-md border">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
              onClick={() => setExpanded(expanded === contract.id ? null : contract.id)}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  {contract.is_24x7 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      24&times;7
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Início: {contract.start_date}
                  {contract.end_date ? ` · Término: ${contract.end_date}` : ''}
                </p>
              </div>
              <span className="text-muted-foreground text-sm">{expanded === contract.id ? '▲' : '▼'}</span>
            </div>

            {expanded === contract.id && (
              <div className="border-t px-4 pb-4 pt-3 space-y-4">
                {/* Devices */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Dispositivos</h4>
                  {contract.contract_devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dispositivo.</p>
                  ) : (
                    <ul className="space-y-1">
                      {contract.contract_devices.map((d) => (
                        <li key={d.id} className="text-sm">
                          {d.device_types?.name ?? 'Tipo desconhecido'} &mdash; {d.quantity}x
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* SLA Rules */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Regras de SLA</h4>
                  {contract.contract_sla_rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma regra de SLA.</p>
                  ) : (
                    <ul className="space-y-1">
                      {contract.contract_sla_rules.map((r) => (
                        <li key={r.id} className="text-sm">
                          {SLA_PRIORITY_LABELS[r.priority ?? ''] ?? r.priority}: {r.response_hours}h
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditingId(contract.id) }}
                  className="border rounded-md px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        )
      })}

      {editingId && editingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Editar Contrato</h2>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <ContractForm
              companyId={companyId}
              deviceTypes={deviceTypes}
              submitLabel="Salvar alterações"
              initialData={{
                start_date: editingContract.start_date,
                end_date: editingContract.end_date,
                renewal_date: editingContract.renewal_date,
                status: editingContract.status,
                is_24x7: editingContract.is_24x7,
                sla_rules: editingContract.contract_sla_rules.map(r => ({
                  priority: r.priority as 'critica' | 'alta' | 'media' | 'baixa',
                  response_hours: r.response_hours ?? 8,
                })),
                devices: editingContract.contract_devices.map(d => ({
                  device_type_id: d.device_type_id ?? '',
                  quantity: d.quantity ?? 1,
                })),
              }}
              onSubmit={handleEdit}
            />
            <button type="button" onClick={() => setEditingId(null)}
              className="w-full border rounded-md px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
