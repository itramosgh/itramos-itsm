'use client'
import { useState } from 'react'

interface DeviceEntry {
  device_type_id: string
  quantity: number
}

interface SLAEntry {
  priority: 'critica' | 'alta' | 'media' | 'baixa'
  response_hours: number
}

interface DeviceType {
  id: string
  name: string
}

interface Props {
  companyId: string
  deviceTypes: DeviceType[]
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean; contractId?: string } | void>
}

const SLA_PRIORITIES: { value: SLAEntry['priority']; label: string }[] = [
  { value: 'critica', label: 'Crítica' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
]

export function ContractForm({ companyId, deviceTypes, onSubmit }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<DeviceEntry[]>([{ device_type_id: '', quantity: 1 }])
  const [slaRules, setSlaRules] = useState<SLAEntry[]>(
    SLA_PRIORITIES.map(p => ({ priority: p.value, response_hours: 8 }))
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    // Attach devices and SLA rules as JSON
    formData.set('devices_json', JSON.stringify(devices.filter(d => d.device_type_id)))
    formData.set('sla_json', JSON.stringify(slaRules))
    const result = await onSubmit(formData)
    if (result?.error) setError(result.error)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Contract data */}
      <div className="space-y-4">
        <h3 className="font-medium">Dados do Contrato</h3>
        <input type="hidden" name="company_id" value={companyId} />
        <div>
          <label className="text-sm font-medium">Data de início *</label>
          <input name="start_date" type="date" required
            className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Data de término</label>
          <input name="end_date" type="date"
            className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Data de renovação</label>
          <input name="renewal_date" type="date"
            className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <select name="status"
            className="mt-1 block w-full border rounded-md px-3 py-2 text-sm">
            <option value="ativo">Ativo</option>
            <option value="expirado">Expirado</option>
            <option value="renovacao_pendente">Renovação pendente</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_24x7" /> Atendimento 24x7
        </label>
      </div>

      {/* Section 2: Devices */}
      <div className="space-y-3">
        <h3 className="font-medium">Dispositivos</h3>
        {devices.map((device, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={device.device_type_id}
              onChange={(e) => {
                const updated = [...devices]
                updated[i] = { ...updated[i], device_type_id: e.target.value }
                setDevices(updated)
              }}
              className="flex-1 border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Selecione o tipo</option>
              {deviceTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={device.quantity}
              onChange={(e) => {
                const updated = [...devices]
                updated[i] = { ...updated[i], quantity: Number(e.target.value) }
                setDevices(updated)
              }}
              className="w-20 border rounded-md px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => setDevices(devices.filter((_, j) => j !== i))}
              className="text-destructive hover:underline text-sm">
              &#x2715;
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => setDevices([...devices, { device_type_id: '', quantity: 1 }])}
          className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted">
          + Adicionar dispositivo
        </button>
      </div>

      {/* Section 3: SLA rules */}
      <div className="space-y-3">
        <h3 className="font-medium">Regras de SLA</h3>
        {SLA_PRIORITIES.map(({ value, label }, i) => (
          <div key={value} className="flex items-center gap-3">
            <span className="w-20 text-sm font-medium">{label}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={slaRules[i]?.response_hours ?? 8}
                onChange={(e) => {
                  const updated = [...slaRules]
                  updated[i] = { priority: value, response_hours: Number(e.target.value) }
                  setSlaRules(updated)
                }}
                className="w-20 border rounded-md px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">horas</span>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50">
        {loading ? 'Salvando...' : 'Criar contrato'}
      </button>
    </form>
  )
}
