'use client'
import { useActionState } from 'react'
import { createTeamsWebhookAction } from '@/app/(internal)/configuracoes/teams/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const NOTIFICATION_OPTIONS = [
  { name: 'notify_new_tickets', label: 'Novo chamado aberto', defaultChecked: true },
  { name: 'notify_sla_warning', label: 'SLA próximo de vencer', defaultChecked: true },
  { name: 'notify_sla_breach', label: 'SLA violado', defaultChecked: true },
  { name: 'notify_url_down', label: 'URL indisponível', defaultChecked: true },
  { name: 'notify_url_up', label: 'URL voltou a responder', defaultChecked: false },
  { name: 'notify_monitoring_alert', label: 'Alerta Zabbix / Azure Monitor', defaultChecked: true },
  { name: 'notify_ticket_reopened', label: 'Chamado reaberto', defaultChecked: false },
]

export function TeamsWebhookForm() {
  const [state, formAction, pending] = useActionState(
    (_prevState: unknown, formData: FormData) => createTeamsWebhookAction(formData),
    null,
  )

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Novo Webhook</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Nome do canal</Label>
          <Input name="name" placeholder="Ex: Canal Chamados" className="mt-1" required />
        </div>
        <div>
          <Label>URL do Webhook</Label>
          <Input name="webhook_url" placeholder="https://prod-xx.westus.logic.azure.com/..." className="mt-1" required />
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Notificações</Label>
        <div className="grid grid-cols-2 gap-2">
          {NOTIFICATION_OPTIONS.map(opt => (
            <label key={opt.name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name={opt.name}
                defaultChecked={opt.defaultChecked}
                className="rounded"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adicionando...' : 'Adicionar Webhook'}
      </Button>
    </form>
  )
}
