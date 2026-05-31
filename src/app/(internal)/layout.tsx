import { InternalShell } from '@/components/layout/InternalShell'
import { createClient } from '@/lib/supabase/server'
import type { ReactNode } from 'react'

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const [{ data: settings }, { data: { user } }] = await Promise.all([
    supabase.from('platform_settings').select('app_name, logo_light_url').single() as any,
    supabase.auth.getUser(),
  ])

  let profileName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single() as any
    profileName = profile?.full_name ?? null
  }

  return (
    <InternalShell
      appName={settings?.app_name ?? null}
      logoUrl={settings?.logo_light_url ?? null}
      profileName={profileName}
    >
      {children}
    </InternalShell>
  )
}
