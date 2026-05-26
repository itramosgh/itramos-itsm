import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PlatformSettingsForm } from '@/components/settings/PlatformSettingsForm'

export default async function PlataformaPage() {
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: settings }, { data: contacts }] = await Promise.all([
    adminClient.from('platform_settings').select('*').single(),
    adminClient
      .from('contacts')
      .select('id, full_name, email, companies(name)')
      .eq('is_active', true)
      .order('full_name'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurações da Plataforma</h1>
      <PlatformSettingsForm initialData={settings} monitoringContacts={(contacts as any) ?? []} />
    </div>
  )
}
