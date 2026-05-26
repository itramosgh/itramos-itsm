import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtTime, fmtDateTime } from '@/lib/format-date'

function AvailabilityBar({ urlId, history }: { urlId: string; history: any[] }) {
  const urlHistory = history.filter(h => h.monitored_url_id === urlId).slice(-10)
  if (urlHistory.length === 0) return <span className="text-xs text-muted-foreground">Sem dados hoje</span>

  return (
    <div className="flex gap-0.5 items-center h-4">
      {urlHistory.map((h, i) => (
        <div
          key={i}
          className={`h-full w-2 rounded-sm ${h.status === 'up' ? 'bg-green-500' : 'bg-red-500'}`}
          title={`${fmtTime(h.checked_at)}: ${h.status.toUpperCase()}`}
        />
      ))}
    </div>
  )
}

export function MonitoringStatusPanel({
  urls,
  activeAlerts,
  todayHistory,
}: {
  urls: any[]
  activeAlerts: any[]
  todayHistory: any[]
}) {
  const downUrls = urls.filter(u => u.last_status === 'down')
  const upUrls = urls.filter(u => u.last_status === 'up')

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">URLs Online</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{upUrls.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">URLs com Problema</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{downUrls.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-600">{activeAlerts.length}</p></CardContent>
        </Card>
      </div>

      {/* URLs Monitoradas */}
      <Card>
        <CardHeader><CardTitle>URLs Monitoradas</CardTitle></CardHeader>
        <CardContent>
          {urls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma URL monitorada configurada.</p>
          ) : (
            <div className="space-y-3">
              {urls.map(url => (
                <div key={url.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{url.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{url.url}</p>
                    <p className="text-xs text-muted-foreground">{(url.companies as any)?.name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <AvailabilityBar urlId={url.id} history={todayHistory} />
                    <div className="text-right">
                      {url.last_status === 'up' && <Badge className="bg-green-100 text-green-800">UP</Badge>}
                      {url.last_status === 'down' && <Badge className="bg-red-100 text-red-800">DOWN</Badge>}
                      {!url.last_status && <Badge variant="outline">Pendente</Badge>}
                      {url.last_checked_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtTime(url.last_checked_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader><CardTitle>Alertas Ativos (Zabbix / Azure Monitor)</CardTitle></CardHeader>
        <CardContent>
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem alertas ativos.</p>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{(alert.companies as any)?.name} · #{alert.number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      alert.priority === 'critica' ? 'destructive' :
                      alert.priority === 'alta' ? 'secondary' : 'outline'
                    }>
                      {alert.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(alert.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
