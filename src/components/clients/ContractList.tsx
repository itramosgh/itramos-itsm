'use client'
import { useState } from 'react'
import type { Database } from '@/types/database'

type Contract = Database['public']['Tables']['contracts']['Row'] & {
  contract_sla_rules: Database['public']['Tables']['contract_sla_rules']['Row'][]
  contract_devices: (Database['public']['Tables']['contract_devices']['Row'] & {
    device_types: { name: string } | null
  })[]
}

interface Props {
  contracts: Contract[]
  companyId: string
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

export function ContractList({ contracts, companyId: _companyId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

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
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
