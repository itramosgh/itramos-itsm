import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

type Document = {
  id: string
  title: string
  category: string | null
  published_at: string | null
  is_active: boolean
  companies: { name: string } | null
}

export function KbDocumentList({ documents }: { documents: Document[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Cliente</th>
            <th className="text-left px-4 py-3 font-medium">Categoria</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {documents.map(d => (
            <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/conhecimento/documentos/${d.id}`} className="hover:underline font-medium">
                  {d.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{d.companies?.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{d.category ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge variant={d.is_active ? 'default' : 'outline'}>
                  {d.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/conhecimento/documentos/${d.id}/editar`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
