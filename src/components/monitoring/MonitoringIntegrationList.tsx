'use client'
import { useState } from 'react'
import { MonitoringIntegrationForm } from './MonitoringIntegrationForm'
import { toggleMonitoringIntegrationAction, deleteMonitoringIntegrationAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const WINDOW_LABELS: Record<string, string> = {
  '24x7': '24x7',
  horario_comercial: 'Horário Comercial',
  personalizado: 'Personalizado',
}

const BEHAVIOR_LABELS: Record<string, string> = {
  descartar: 'Descartar',
  aguardar_e_abrir: 'Aguardar e abrir',
}

export function MonitoringIntegrationList({
  integrations,
  companyId,
}: {
  integrations: any[]
  companyId: string
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  async function copyToken(token: string, connectorType: string, id: string) {
    const path = connectorType === 'zabbix' ? 'zabbix' : 'azure'
    const url = `${appUrl}/api/webhooks/${path}/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-4">
      {integrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Ferramenta</th>
                <th className="text-left p-3">Webhook URL</th>
                <th className="text-left p-3">Janela</th>
                <th className="text-left p-3">Fora da janela</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {integrations.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <Badge variant="secondary">
                      {item.connector_type === 'zabbix' ? 'Zabbix' : 'Azure Monitor'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToken(item.webhook_token, item.connector_type, item.id)}
                      className="font-mono text-xs max-w-[200px] truncate"
                    >
                      {copied === item.id ? 'Copiado!' : `.../${item.webhook_token.slice(0, 8)}...`}
                    </Button>
                  </td>
                  <td className="p-3">{WINDOW_LABELS[item.window_type] ?? item.window_type}</td>
                  <td className="p-3">{BEHAVIOR_LABELS[item.out_of_window_behavior] ?? item.out_of_window_behavior}</td>
                  <td className="p-3">
                    <form action={toggleMonitoringIntegrationAction.bind(null, item.id, companyId, !item.is_active)}>
                      <Button variant="ghost" size="sm" type="submit">
                        {item.is_active ? '✓ Ativo' : '○ Inativo'}
                      </Button>
                    </form>
                  </td>
                  <td className="p-3">
                    <form action={deleteMonitoringIntegrationAction.bind(null, item.id, companyId)}>
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
      <MonitoringIntegrationForm companyId={companyId} />
    </div>
  )
}
