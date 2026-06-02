import Link from 'next/link'
import {
  Settings, CalendarDays, Tag, Mail, Monitor, Users, ClipboardList, HardDrive, MessageSquare, RefreshCw, Activity,
} from 'lucide-react'

const sections = [
  { href: '/configuracoes/plataforma', label: 'Plataforma', description: 'Dados da empresa, SLA, e-mail e horários', icon: Settings },
  { href: '/configuracoes/feriados', label: 'Feriados', description: 'Importar e gerenciar feriados nacionais', icon: CalendarDays },
  { href: '/configuracoes/categorias', label: 'Categorias', description: 'Categorias de chamados', icon: Tag },
  { href: '/configuracoes/email-templates', label: 'Templates de E-mail', description: 'Editar templates de notificação', icon: Mail },
  { href: '/configuracoes/templates', label: 'Templates de Resposta', description: 'Respostas rápidas para uso nos chamados', icon: MessageSquare },
  { href: '/configuracoes/chamados-recorrentes', label: 'Chamados Recorrentes', description: 'Templates de chamados criados automaticamente por cliente', icon: RefreshCw },
  { href: '/configuracoes/tipos-dispositivo', label: 'Tipos de Dispositivo', description: 'Dispositivos dos contratos', icon: Monitor },
  { href: '/configuracoes/teams', label: 'Microsoft Teams', description: 'Integração com o Microsoft Teams', icon: Users },
  { href: '/configuracoes/logs', label: 'Logs do Sistema', description: 'Histórico de eventos e e-mails', icon: ClipboardList },
  { href: '/configuracoes/storage', label: 'Armazenamento', description: 'Uso de storage por bucket e limpeza de arquivos antigos', icon: HardDrive },
  { href: '/configuracoes/crons', label: 'Monitoramento de Crons', description: 'Status e histórico de execução dos jobs automáticos', icon: Activity },
]

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecione uma seção para configurar</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sections.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/60 hover:border-primary/40"
          >
            <Icon className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
