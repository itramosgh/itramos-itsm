'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteArticleAction } from '@/app/(internal)/conhecimento/actions'

export function DeleteArticleButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Excluir este artigo? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteArticleAction(id)
      router.push('/conhecimento')
    })
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
      {isPending ? 'Excluindo...' : 'Excluir'}
    </Button>
  )
}
