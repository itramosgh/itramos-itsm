import { createServiceClient } from '@/lib/supabase/server'
import { PortalLoginForm } from './PortalLoginForm'

export default async function PortalLoginPage() {
  const supabase = await createServiceClient()
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('logo_light_url, company_name')
    .single() as { data: any }

  return (
    <PortalLoginForm
      logoUrl={settings?.logo_light_url ?? null}
      companyName={settings?.company_name ?? null}
    />
  )
}
