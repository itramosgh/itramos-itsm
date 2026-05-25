import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateActionItemStatusAction } from '@/app/(internal)/reunioes/actions'

type ActionItem = {
  id: string
  description: string
  due_date: string | null
  status: string
  converted_to_task_id: string | null
  responsible_profile_id: string | null
  profiles: { full_name: string } | null
}

interface ActionItemsPanelProps {
  items: ActionItem[]
  meetingId: string
}

export function ActionItemsPanel({ items, meetingId }: ActionItemsPanelProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Itens de ação</h3>
      {items.map(item => (
        <div key={item.id} className="flex items-start justify-between border rounded-md p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{item.description}</p>
            {item.profiles && (
              <p className="text-xs text-muted-foreground">Responsável: {item.profiles.full_name}</p>
            )}
            {item.due_date && (
              <p className="text-xs text-muted-foreground">
                Prazo: {new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
              </p>
            )}
            {item.converted_to_task_id && (
              <Badge variant="secondary" className="text-xs">Convertido em tarefa</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {item.status === 'pendente' && (
              <form action={updateActionItemStatusAction.bind(null, item.id, meetingId, 'concluido')}>
                <Button variant="ghost" size="sm" type="submit">Concluir</Button>
              </form>
            )}
            <Badge variant={item.status === 'concluido' ? 'default' : 'outline'}>
              {item.status}
            </Badge>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum item de ação registrado.</p>
      )}
    </div>
  )
}
