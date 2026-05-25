import { createServiceClient } from '@/lib/supabase/server'
import { processChangeApprovalAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default async function ChangeApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: approval } = await supabase
    .from('change_approvals')
    .select('status, change_request_id, change_requests(title, description, impacted_systems, maintenance_start, maintenance_end, rollback_plan, risk_level)')
    .eq('token', token)
    .single() as { data: any }

  if (!approval) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-muted-foreground">Este link de aprovação não é válido ou expirou.</p>
        </div>
      </div>
    )
  }

  if (approval.status !== 'pendente') {
    const statusMsg: Record<string, string> = {
      aprovado: 'Esta mudança já foi aprovada.',
      reprovado: 'Esta mudança já foi reprovada.',
      expirado: 'Este link de aprovação expirou.',
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Solicitação já respondida</h1>
          <p className="text-muted-foreground">{statusMsg[approval.status] ?? 'Solicitação já processada.'}</p>
        </div>
      </div>
    )
  }

  const cr = approval.change_requests
  const riskLabels: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-md p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Solicitação de Aprovação de Mudança</h1>
          <h2 className="text-lg mt-1">{cr.title}</h2>
        </div>

        <div className="space-y-3 text-sm">
          <div><span className="font-medium">Descrição:</span> {cr.description}</div>
          <div><span className="font-medium">Sistemas impactados:</span> {cr.impacted_systems}</div>
          <div>
            <span className="font-medium">Janela de manutenção:</span>{' '}
            {new Date(cr.maintenance_start).toLocaleString('pt-BR')} até{' '}
            {new Date(cr.maintenance_end).toLocaleString('pt-BR')}
          </div>
          <div>
            <span className="font-medium">Nível de risco:</span>{' '}
            {riskLabels[cr.risk_level] ?? cr.risk_level}
          </div>
          <div><span className="font-medium">Plano de rollback:</span> {cr.rollback_plan}</div>
        </div>

        <div className="space-y-6">
          {/* Aprovação */}
          <form className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="reason_approve">Motivo (opcional)</Label>
              <Textarea id="reason_approve" name="reason" rows={2} placeholder="Observações sobre a aprovação…" />
            </div>
            <Button
              type="submit"
              className="w-full"
              formAction={async (fd: FormData) => {
                'use server'
                await processChangeApprovalAction(token, 'aprovar', fd.get('reason') as string || undefined)
              }}
            >
              Aprovar Mudança
            </Button>
          </form>

          <div className="border-t pt-4">
            {/* Reprovação */}
            <form className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="reason_reject">Motivo da reprovação <span className="text-destructive">*</span></Label>
                <Textarea id="reason_reject" name="reason" rows={3} required placeholder="Descreva o motivo da reprovação…" />
              </div>
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                formAction={async (fd: FormData) => {
                  'use server'
                  await processChangeApprovalAction(token, 'reprovar', fd.get('reason') as string)
                }}
              >
                Reprovar Mudança
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
