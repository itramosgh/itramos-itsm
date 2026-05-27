import { createClient } from '@/lib/supabase/server'
import { TeamsWebhookList } from '@/components/settings/TeamsWebhookList'

export default async function TeamsConfigPage() {
  const supabase = await createClient()
  const { data: webhooks } = await supabase
    .from('teams_webhook_configs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks Microsoft Teams</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Incoming Webhooks para receber notificações em canais do Teams.
          Para criar um webhook: no Teams, abra o canal → ••• → Conectores → Incoming Webhook.
        </p>
      </div>
      <TeamsWebhookList webhooks={(webhooks ?? []) as any[]} />
    </div>
  )
}
