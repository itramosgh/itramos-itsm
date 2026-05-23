import { createServiceClient } from '@/lib/supabase/server'
import { processApprovalAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default async function AprovacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ action?: string }>
}) {
  const { token } = await params
  const { action } = await searchParams

  const supabase = await createServiceClient()
  const { data: approval } = await supabase
    .from('ticket_approvals')
    .select('status, tickets(number, title, contacts(full_name))')
    .eq('token', token)
    .single()

  if (!approval) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-muted-foreground">Este link de aprovação não existe ou expirou.</p>
        </div>
      </div>
    )
  }

  if ((approval as any).status !== 'pendente') {
    const label = (approval as any).status === 'aprovado' ? 'aprovado' : (approval as any).status === 'reprovado' ? 'reprovado' : 'processado'
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Solicitação já {label}</h1>
          <p className="text-muted-foreground">Esta solicitação de aprovação já foi respondida anteriormente.</p>
        </div>
      </div>
    )
  }

  const ticket = (approval as any).tickets

  async function handleApprove(_formData: FormData) {
    'use server'
    await processApprovalAction(token, 'aprovar')
  }

  async function handleReject(formData: FormData) {
    'use server'
    const reason = formData.get('reason') as string
    await processApprovalAction(token, 'reprovar', reason)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 border rounded-lg p-6">
        <div>
          <h1 className="text-xl font-semibold">Solicitação de Aprovação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chamado #{ticket.number} — {ticket.title}
          </p>
          <p className="text-sm text-muted-foreground">
            Solicitado por: {ticket.contacts?.full_name}
          </p>
        </div>

        {action !== 'reprovar' ? (
          <div className="space-y-4">
            <form action={handleApprove}>
              <Button type="submit" className="w-full">✅ Aprovar</Button>
            </form>
            <a href={`/aprovacao/${token}?action=reprovar`}>
              <Button type="button" variant="outline" className="w-full">❌ Reprovar</Button>
            </a>
          </div>
        ) : (
          <form action={handleReject} className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo da reprovação (opcional)</Label>
              <Textarea id="reason" name="reason" rows={3} placeholder="Descreva o motivo..." />
            </div>
            <div className="flex gap-2">
              <a href={`/aprovacao/${token}`} className="flex-1">
                <Button type="button" variant="outline" className="w-full">Voltar</Button>
              </a>
              <Button type="submit" variant="destructive" className="flex-1">Confirmar reprovação</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
