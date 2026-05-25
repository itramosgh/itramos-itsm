'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, Settings, Users, Ticket, Mail, Megaphone, BookOpen, CheckSquare, Calendar, GitMerge } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/usuarios', label: 'Usuários', icon: Users },
  { href: '/chamados', label: 'Chamados', icon: Ticket },
  { href: '/mudancas', label: 'Mudanças (GMUD)', icon: GitMerge },
  { href: '/conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/reunioes', label: 'Reuniões', icon: Calendar },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/configuracoes/email-templates', label: 'Templates de E-mail', icon: Mail },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 border-r bg-background h-screen flex flex-col">
      <div className="p-4 border-b">
        <span className="font-semibold text-lg">ITRAMOS ITSM</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
