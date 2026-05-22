'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { contractSchema, slaRulesSchema, contractDeviceSchema } from '@/lib/validations/contract'

async function requireAdminOrGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', supabase: null }
  const role = user.app_metadata?.role as string
  if (!['admin', 'gestor'].includes(role)) return { error: 'Permissão insuficiente.', supabase: null }
  return { error: null, supabase }
}

export async function createContractAction(companyId: string, formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const services = formData.getAll('services') as string[]
  const raw = {
    ...Object.fromEntries(formData.entries()),
    company_id: companyId,
    services,
    is_24x7: formData.get('is_24x7') === 'on',
  }

  const parsed = contractSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk
  const insertResult = await supabase
    .from('contracts')
    .insert(parsed.data as never)
    .select('id')
    .single()

  if (insertResult.error) return { error: insertResult.error.message }

  const contractId = (insertResult.data as { id: string }).id
  revalidatePath(`/clientes/${companyId}/contratos`)
  return { success: true, contractId }
}

export async function upsertSLARulesAction(contractId: string, companyId: string, rulesJson: string) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const parsed = slaRulesSchema.safeParse(JSON.parse(rulesJson))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await supabase.from('contract_sla_rules').delete().eq('contract_id', contractId)
  // as never: supabase-js generic constraint quirk
  const { error } = await supabase.from('contract_sla_rules').insert(
    parsed.data.map(r => ({ ...r, contract_id: contractId })) as never
  )

  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}/contratos`)
  return { success: true }
}

export async function upsertContractDevicesAction(
  contractId: string,
  companyId: string,
  devicesJson: string
) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const devices = JSON.parse(devicesJson) as unknown[]
  const parsed = contractDeviceSchema.array().safeParse(devices)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await supabase.from('contract_devices').delete().eq('contract_id', contractId)

  if (parsed.data.length > 0) {
    // as never: supabase-js generic constraint quirk
    const { error } = await supabase.from('contract_devices').insert(
      parsed.data.map(d => ({ ...d, contract_id: contractId })) as never
    )
    if (error) return { error: error.message }
  }

  revalidatePath(`/clientes/${companyId}/contratos`)
  return { success: true }
}
