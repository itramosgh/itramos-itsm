import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { toggleArticleActiveAction } from '@/app/(internal)/conhecimento/actions'

type Article = {
  id: string
  title: string
  category_id: string | null
  tags: string[]
  is_active: boolean
  created_at: string
}

export function KbArticleList({ articles }: { articles: Article[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Tags</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {articles.map(a => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/conhecimento/artigos/${a.id}`} className="hover:underline font-medium">
                  {a.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {a.tags.map(t => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={a.is_active ? 'default' : 'outline'}>
                  {a.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex gap-2 justify-end">
                  <Link href={`/conhecimento/artigos/${a.id}/editar`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Editar</Link>
                  <form action={toggleArticleActiveAction.bind(null, a.id, !a.is_active)}>
                    <Button variant="ghost" size="sm" type="submit">
                      {a.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
