import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cancelAnnouncementAction } from '@/app/(internal)/comunicados/actions'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  rascunho: { label: 'Rascunho', variant: 'secondary' },
  agendado: { label: 'Agendado', variant: 'default' },
  enviado: { label: 'Enviado', variant: 'outline' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

const recipientLabels: Record<string, string> = {
  all: 'Todos os contatos',
  company: 'Por empresa',
  department: 'Por departamento',
  manual: 'Seleção manual',
}

export function AnnouncementList({ announcements, canManage }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  announcements: any[]
  canManage: boolean
}) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left">Assunto</th>
            <th className="p-3 text-left">Destinatários</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Agendado</th>
            <th className="p-3 text-left">Enviados</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(announcements ?? []).map((a: any) => {
            const st = statusConfig[a.status] ?? { label: a.status, variant: 'secondary' as const }
            return (
              <tr key={a.id} className="border-b">
                <td className="p-3 font-medium">
                  <Link href={`/comunicados/${a.id}`} className="hover:underline">{a.subject}</Link>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{recipientLabels[a.recipient_type]}</td>
                <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">
                  {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {a.status === 'enviado' ? (a.recipient_count ?? '—') : '—'}
                </td>
                <td className="p-3 text-right">
                  {canManage && ['rascunho', 'agendado'].includes(a.status) && (
                    <div className="flex gap-1 justify-end">
                      <Link href={`/comunicados/${a.id}`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>
                      <form action={cancelAnnouncementAction.bind(null, a.id)}>
                        <Button variant="ghost" size="sm" type="submit">Cancelar</Button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {announcements.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum comunicado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
