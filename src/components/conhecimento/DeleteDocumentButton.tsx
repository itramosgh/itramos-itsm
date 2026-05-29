'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteDocumentAction } from '@/app/(internal)/conhecimento/actions'

export function DeleteDocumentButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Excluir este documento? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteDocumentAction(id)
      router.push('/conhecimento')
    })
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
      {isPending ? 'Excluindo...' : 'Excluir'}
    </Button>
  )
}
