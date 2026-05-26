import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PlatformSettingsForm } from '@/components/settings/PlatformSettingsForm'
import Link from 'next/link'
import {
  Settings, CalendarDays, Tag, Mail, Monitor, Users, ClipboardList,
} from 'lucide-react'

const sections = [
  { href: '/configuracoes', label: 'Plataforma', description: 'Dados da empresa, SLA, e-mail e horários', icon: Settings, active: true },
  { href: '/configuracoes/feriados', label: 'Feriados', description: 'Importar e gerenciar feriados nacionais', icon: CalendarDays },
  { href: '/configuracoes/categorias', label: 'Categorias', description: 'Categorias de chamados', icon: Tag },
  { href: '/configuracoes/email-templates', label: 'Templates de E-mail', description: 'Editar templates de notificação', icon: Mail },
  { href: '/configuracoes/tipos-dispositivo', label: 'Tipos de Dispositivo', description: 'Dispositivos dos contratos', icon: Monitor },
  { href: '/configuracoes/teams', label: 'Times', description: 'Grupos e equipes de atendimento', icon: Users },
  { href: '/configuracoes/logs', label: 'Logs do Sistema', description: 'Histórico de eventos e e-mails', icon: ClipboardList },
]

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie as configurações da plataforma ITRAMOS</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sections.map(({ href, label, description, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/60 ${active ? 'border-primary bg-primary/5' : ''}`}
          >
            <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <p className={`text-sm font-medium ${active ? 'text-primary' : ''}`}>{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-medium mb-4">Configurações da Plataforma</h2>
        <PlatformSettingsForm initialData={settings} />
      </div>
    </div>
  )
}
