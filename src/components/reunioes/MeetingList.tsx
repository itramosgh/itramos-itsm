'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteMeetingAction } from '@/app/(internal)/reunioes/actions'

type Meeting = {
  id: string
  title: string
  scheduled_at: string
  status: string
  companies: { name: string } | null
}

const statusVariants: Record<string, 'default' | 'outline' | 'secondary'> = {
  agendada: 'secondary',
  realizada: 'default',
  cancelada: 'outline',
}

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  const router = useRouter()

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta reunião?')) return
    await deleteMeetingAction(id)
    router.refresh()
  }

  if (meetings.length === 0) {
    return <p className="p-6 text-center text-muted-foreground text-sm">Nenhuma reunião encontrada.</p>
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {meetings.map(m => (
          <div key={m.id} className="border rounded-md p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/reunioes/${m.id}`} className="font-medium text-sm leading-snug hover:underline">
                {m.title}
              </Link>
              <Badge variant={statusVariants[m.status] ?? 'outline'} className="shrink-0">{m.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {m.companies?.name && <p>{m.companies.name}</p>}
              <p>{new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Link href={`/reunioes/${m.id}/editar`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">Editar</Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={() => handleDelete(m.id)}
              >
                Excluir
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Pauta</th>
              <th className="text-left px-4 py-3 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 font-medium">Data</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {meetings.map(m => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/reunioes/${m.id}`} className="hover:underline font-medium">{m.title}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.companies?.name}</td>
                <td className="px-4 py-3">
                  {new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariants[m.status] ?? 'outline'}>{m.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <Link href={`/reunioes/${m.id}/editar`}>
                      <Button variant="ghost" size="sm">Editar</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(m.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
