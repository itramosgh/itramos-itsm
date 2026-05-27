import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveSLAStart, calculateDeadline, type BusinessHoursSettings } from '@/lib/sla'

/**
 * Busca o contrato ativo mais recente da empresa, a regra de SLA para a prioridade
 * e calcula sla_starts_at (início efetivo do SLA) + sla_deadline.
 *
 * Retorna null se a empresa não tiver contrato ativo ou não houver regra
 * de SLA configurada para a prioridade informada.
 */
export async function calculateTicketSLAForCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    companyId: string
    priority: string
    createdAt: Date
  }
): Promise<{ sla_deadline: string; sla_starts_at: string } | null> {
  const { companyId, priority, createdAt } = params

  // 1. Contrato ativo mais recente da empresa
  const { data: contractRaw } = await supabase
    .from('contracts')
    .select('id, is_24x7')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!contractRaw) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = contractRaw as any

  // 2. Regra de SLA para a prioridade
  const { data: slaRuleRaw } = await supabase
    .from('contract_sla_rules')
    .select('response_hours')
    .eq('contract_id', contract.id)
    .eq('priority', priority)
    .maybeSingle()

  if (!slaRuleRaw) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slaRule = slaRuleRaw as any

  // 3. Configurações de horário comercial
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any

  const businessSettings: BusinessHoursSettings = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  // 4. Feriados a partir da data de criação
  const todayStr = createdAt.toISOString().slice(0, 10)
  const { data: holidayRows } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', todayStr)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  // 5. Início efetivo do SLA (snap para expediente se fora do horário)
  const startsAt = getEffectiveSLAStart(
    createdAt,
    contract.is_24x7,
    businessSettings,
    holidays
  )

  // 6. Prazo calculado a partir do início efetivo
  const deadline = calculateDeadline({
    createdAt: startsAt,
    responseHours: slaRule.response_hours,
    is24x7: contract.is_24x7,
    settings: businessSettings,
    holidays,
  })

  return {
    sla_deadline: deadline.toISOString(),
    sla_starts_at: startsAt.toISOString(),
  }
}
