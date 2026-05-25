import { MonitoredUrlForm } from './MonitoredUrlForm'
import { toggleMonitoredUrlAction, deleteMonitoredUrlAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function MonitoredUrlList({
  urls,
  companyId,
}: {
  urls: any[]
  companyId: string
}) {
  return (
    <div className="space-y-4">
      {urls.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma URL monitorada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Intervalo</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Última verificação</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {urls.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{item.url}</td>
                  <td className="p-3">{item.check_interval_minutes}min</td>
                  <td className="p-3">
                    {item.last_status === 'up' && <Badge className="bg-green-100 text-green-800">UP</Badge>}
                    {item.last_status === 'down' && <Badge className="bg-red-100 text-red-800">DOWN</Badge>}
                    {!item.last_status && <Badge variant="outline">Pendente</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {item.last_checked_at
                      ? new Date(item.last_checked_at).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="p-3 flex gap-2">
                    <form action={async () => {
                      'use server'
                      await toggleMonitoredUrlAction(item.id, companyId, !item.is_active)
                    }}>
                      <Button variant="ghost" size="sm" type="submit">
                        {item.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </form>
                    <form action={async () => {
                      'use server'
                      await deleteMonitoredUrlAction(item.id, companyId)
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
      <MonitoredUrlForm companyId={companyId} />
    </div>
  )
}
