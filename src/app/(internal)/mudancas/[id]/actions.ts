'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { approvalRequestSchema, reversalSchema } from '@/lib/validations/change-request'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function submitForApprovalAction(changeRequestId: string, formData: FormData) {
  const parsed = approvalRequestSchema.safeParse({
    approver_email: formData.get('approver_email'),
    approver_contact_id: formData.get('approver_contact_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, description, impacted_systems, maintenance_start, maintenance_end, rollback_plan, risk_level, status')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'rascunho') return { error: 'GMUD não está em rascunho' }

  const { data: approval } = await serviceSupabase
    .from('change_approvals')
    .insert({
      change_request_id: changeRequestId,
      approver_contact_id: parsed.data.approver_contact_id ?? null,
      approver_email: parsed.data.approver_email,
      status: 'pendente',
    } as never)
    .select('token')
    .single<{ token: string }>()

  if (!approval) return { error: 'Erro ao criar solicitação de aprovação' }

  await supabase
    .from('change_requests')
    .update({ status: 'aguardando_aprovacao' } as never)
    .eq('id', changeRequestId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const riskLabels: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

  await sendEmailFromTemplate('gmud_solicitacao_aprovacao', parsed.data.approver_email, {
    titulo: cr.title,
    descricao: cr.description,
    sistemas_impactados: cr.impacted_systems,
    janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
    janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
    nivel_risco: riskLabels[cr.risk_level] ?? cr.risk_level,
    plano_rollback: cr.rollback_plan,
    link_aprovacao: `${appUrl}/aprovacao-gmud/${approval.token}`,
  })

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function iniciarExecucaoAction(changeRequestId: string) {
  const supabase = await createClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, description, maintenance_start, maintenance_end, impacted_systems, status, change_request_contacts(contact_id, external_email, contacts(email, full_name))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'aprovada') return { error: 'GMUD não está aprovada' }

  await supabase
    .from('change_requests')
    .update({ status: 'em_execucao', execution_started_at: new Date().toISOString() } as never)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_inicio_execucao', contacts, {
      titulo: cr.title,
      descricao: cr.description,
      janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
      janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
      sistemas_impactados: cr.impacted_systems,
    })
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function concluirGmudAction(changeRequestId: string, closeOriginTicket: boolean) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, maintenance_start, status, origin_ticket_id, change_request_contacts(contact_id, external_email, contacts(email))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'em_execucao') return { error: 'GMUD não está em execução' }

  const now = new Date().toISOString()
  await supabase
    .from('change_requests')
    .update({ status: 'concluida', execution_completed_at: now } as never)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_concluida', contacts, {
      titulo: cr.title,
      janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
      concluida_em: new Date(now).toLocaleString('pt-BR'),
    })
  }

  if (cr.origin_ticket_id) {
    const newStatus = closeOriginTicket ? 'fechado' : 'em_andamento'
    await serviceSupabase.from('tickets')
      .update({ status: newStatus, ...(closeOriginTicket ? { closed_at: now } : {}) } as never)
      .eq('id', cr.origin_ticket_id)

    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: cr.origin_ticket_id,
      type: 'system',
      content: closeOriginTicket
        ? 'GMUD concluída. Chamado fechado automaticamente.'
        : 'GMUD concluída. Chamado retornado para em andamento.',
      is_system: true,
    } as never)

    revalidatePath(`/chamados/${cr.origin_ticket_id}`)
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}

export async function reverterGmudAction(changeRequestId: string, formData: FormData) {
  const parsed = reversalSchema.safeParse({ reversal_reason: formData.get('reversal_reason') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const { data: cr } = await supabase
    .from('change_requests')
    .select('title, status, origin_ticket_id, change_request_contacts(contact_id, external_email, contacts(email))')
    .eq('id', changeRequestId)
    .single() as { data: any }

  if (!cr || cr.status !== 'em_execucao') return { error: 'GMUD não está em execução' }

  await supabase
    .from('change_requests')
    .update({ status: 'revertida', reversal_reason: parsed.data.reversal_reason } as never)
    .eq('id', changeRequestId)

  const contacts: string[] = (cr.change_request_contacts ?? []).map((c: any) =>
    c.external_email ?? c.contacts?.email
  ).filter(Boolean)

  if (contacts.length > 0) {
    await sendEmailFromTemplate('gmud_revertida', contacts, {
      titulo: cr.title,
      motivo_reversao: parsed.data.reversal_reason,
    })
  }

  if (cr.origin_ticket_id) {
    await serviceSupabase.from('tickets')
      .update({ status: 'em_andamento' } as never)
      .eq('id', cr.origin_ticket_id)

    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: cr.origin_ticket_id,
      type: 'system',
      content: `GMUD revertida. Motivo: ${parsed.data.reversal_reason}. Chamado retornado para em andamento.`,
      is_system: true,
    } as never)

    revalidatePath(`/chamados/${cr.origin_ticket_id}`)
  }

  revalidatePath(`/mudancas/${changeRequestId}`)
  return { success: true }
}
