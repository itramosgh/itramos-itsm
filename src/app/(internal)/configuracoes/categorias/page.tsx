import { createClient } from '@/lib/supabase/server'
import { toggleCategoryAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categories } = (await supabase
    .from('ticket_categories')
    .select('id, name, slug, requires_approval, is_active')
    .order('name')) as { data: any }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorias de Chamado</h1>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Slug</th>
              <th className="p-3 text-left">Requer aprovação</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {categories?.map((cat: any) => (
              <tr key={cat.id} className="border-b">
                <td className="p-3">{cat.name}</td>
                <td className="p-3 font-mono text-xs">{cat.slug}</td>
                <td className="p-3">
                  {cat.requires_approval ? <Badge>Sim</Badge> : <span className="text-muted-foreground">Não</span>}
                </td>
                <td className="p-3">
                  <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                    {cat.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
                <td className="p-3">
                  <form action={toggleCategoryAction.bind(null, cat.id, !cat.is_active)}>
                    <Button variant="ghost" size="sm" type="submit">
                      {cat.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
