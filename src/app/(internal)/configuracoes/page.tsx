import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PlatformSettingsForm } from '@/components/settings/PlatformSettingsForm'

export default async function ConfiguracoesPage() {
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: settings } = await adminClient
    .from('platform_settings')
    .select('*')
    .single()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Configurações da Plataforma</h1>
      <PlatformSettingsForm initialData={settings} />
    </div>
  )
}
