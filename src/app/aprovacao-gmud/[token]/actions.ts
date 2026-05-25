'use server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function processChangeApprovalAction(
  token: string,
  action: 'aprovar' | 'reprovar',
  reason?: string
) {
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('change_approvals')
    .select('*, change_requests(title, maintenance_start, maintenance_end, responsible_id)')
    .eq('token', token)
    .single() as { data: any }

  if (!approval) return { error: 'Token inválido ou expirado' }
  if (approval.status !== 'pendente') return { error: 'Esta solicitação já foi respondida' }

  const cr = approval.change_requests
  const approved = action === 'aprovar'

  await supabase.from('change_approvals').update({
    status: approved ? 'aprovado' : 'reprovado',
    response_reason: reason ?? null,
    responded_at: new Date().toISOString(),
  } as never).eq('id', approval.id)

  await supabase.from('change_requests')
    .update({ status: approved ? 'aprovada' : 'reprovada' } as never)
    .eq('id', approval.change_request_id)

  // Notificar analista responsável
  if (cr.responsible_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(cr.responsible_id)
    if (authUser.user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      const slug = approved ? 'gmud_aprovada_analista' : 'gmud_reprovada_analista'

      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', cr.responsible_id).single() as { data: any }

      try {
        await sendEmailFromTemplate(slug, authUser.user.email, {
          analista_nome: profile?.full_name ?? 'Analista',
          titulo: cr.title,
          aprovador_email: approval.approver_email,
          janela_inicio: new Date(cr.maintenance_start).toLocaleString('pt-BR'),
          janela_fim: new Date(cr.maintenance_end).toLocaleString('pt-BR'),
          motivo: reason ?? '—',
          link_gmud: `${appUrl}/mudancas/${approval.change_request_id}`,
        })
      } catch {
        // email failure is non-blocking — approval is already recorded
      }
    }
  }

  revalidatePath(`/aprovacao-gmud/${token}`)
  return { success: true, approved }
}
