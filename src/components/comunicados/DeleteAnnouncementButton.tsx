'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteAnnouncementAction } from '@/app/(internal)/comunicados/actions'

export function DeleteAnnouncementButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!confirm('Excluir este comunicado? Esta ação não pode ser desfeita.')) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteAnnouncementAction(id)
        router.refresh()
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao excluir')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}
        className="text-destructive hover:text-destructive hover:bg-destructive/10">
        {isPending ? 'Excluindo...' : 'Excluir'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
