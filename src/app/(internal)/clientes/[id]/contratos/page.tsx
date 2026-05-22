import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ContractList } from '@/components/clients/ContractList'
import { CreateContractDialog } from '@/components/clients/CreateContractDialog'

export default async function ContratosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: companyData } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!companyData) notFound()
  const company = companyData as { id: string; name: string }

  const { data: contracts } = await supabase
    .from('contracts')
    .select('*, contract_sla_rules(*), contract_devices(*, device_types(name))')
    .eq('company_id', id)
    .order('start_date', { ascending: false })

  const { data: deviceTypes } = await supabase
    .from('device_types')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contratos &mdash; {company.name}</h1>
        <CreateContractDialog companyId={id} deviceTypes={deviceTypes ?? []} />
      </div>
      <ContractList contracts={contracts as unknown as Parameters<typeof ContractList>[0]['contracts']} companyId={id} />
    </div>
  )
}
