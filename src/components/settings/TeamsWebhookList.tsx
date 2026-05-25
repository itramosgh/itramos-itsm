import { TeamsWebhookForm } from './TeamsWebhookForm'
import { deleteTeamsWebhookAction } from '@/app/(internal)/configuracoes/teams/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function TeamsWebhookList({ webhooks }: { webhooks: any[] }) {
  const activeNotifCount = (w: any) => [
    w.notify_new_tickets, w.notify_sla_warning, w.notify_sla_breach,
    w.notify_url_down, w.notify_url_up, w.notify_monitoring_alert, w.notify_ticket_reopened,
  ].filter(Boolean).length

  return (
    <div className="space-y-4">
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum webhook configurado.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Notificações</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w: any) => (
                <tr key={w.id} className="border-t">
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                    {w.webhook_url.replace('https://', '')}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{activeNotifCount(w)} ativas</Badge>
                  </td>
                  <td className="p-3">
                    {w.is_active
                      ? <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                      : <Badge variant="secondary">Inativo</Badge>}
                  </td>
                  <td className="p-3">
                    <form action={async () => {
                      'use server'
                      await deleteTeamsWebhookAction(w.id)
                    }}>
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Remover
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TeamsWebhookForm />
    </div>
  )
}
