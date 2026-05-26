import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/server'
import type { ReactNode } from 'react'

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('app_name, logo_light_url')
    .single() as { data: { app_name: string | null; logo_light_url: string | null } | null }

  return (
    <div className="flex h-screen">
      <Sidebar
        appName={settings?.app_name ?? null}
        logoUrl={settings?.logo_light_url ?? null}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
