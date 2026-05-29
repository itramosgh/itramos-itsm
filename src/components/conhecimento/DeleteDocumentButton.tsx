'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteDocumentAction } from '@/app/(internal)/conhecimento/actions'

export function DeleteDocumentButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!confirm('Excluir este documento? Esta ação não pode ser desfeita.')) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteDocumentAction(id)
        router.push('/conhecimento')
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao excluir')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
        {isPending ? 'Excluindo...' : 'Excluir'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
