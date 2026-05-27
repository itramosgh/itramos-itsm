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

  return (
    <div className="rounded-md border">
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
          {meetings.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                Nenhuma reunião encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
