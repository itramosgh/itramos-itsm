import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PortalNav } from './PortalNav'
import type { Database } from '@/types/database'
import type { ReactNode } from 'react'

type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const [{ data: settings }, { data: { user } }] = await Promise.all([
    serviceSupabase.from('platform_settings').select('*').single() as unknown as Promise<{ data: PlatformSettings | null }>,
    supabase.auth.getUser(),
  ])

  let contactName: string | null = null
  let isContractResponsible = false
  if (user) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('full_name, is_contract_responsible')
      .eq('user_id', user.id)
      .single() as { data: { full_name: string; is_contract_responsible: boolean } | null }
    contactName = contact?.full_name ?? null
    isContractResponsible = contact?.is_contract_responsible ?? false
  }

  const isPortalUser = !!user && !!contactName

  const allNavItems = [
    { href: '/portal/chamados', label: 'Chamados', restricted: false },
    { href: '/portal/mudancas', label: 'Mudanças', restricted: true },
    { href: '/portal/conhecimento', label: 'Conhecimento', restricted: false },
    { href: '/portal/relatorios', label: 'Relatórios', restricted: true },
  ]

  const navItems = allNavItems
    .filter(item => !item.restricted || isContractResponsible)
    .map(({ href, label }) => ({ href, label }))

  return (
    <div className="min-h-screen bg-background">
      <PortalNav
        logoUrl={(settings as any)?.logo_light_url ?? null}
        appName={(settings as any)?.company_name ?? null}
        contactName={contactName}
        isPortalUser={isPortalUser}
        navItems={navItems}
        whatsapp={settings?.company_whatsapp ?? null}
      />
      {children}
    </div>
  )
}
