import { createClient } from '@/lib/supabase/server'
import { PlatformSettingsForm } from '@/components/settings/PlatformSettingsForm'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase
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
