import { createClient } from '@/lib/supabase/server'
import { createHolidayAction, deleteHolidayAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function FeriadosPage() {
  const supabase = await createClient()
  const { data: holidays } = (await supabase
    .from('holidays')
    .select('id, date, name, is_national, municipality')
    .order('date')) as { data: any }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Feriados</h1>

      <form action={createHolidayAction as any} className="space-y-3 border rounded-md p-4">
        <h2 className="font-medium">Novo feriado</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="date">Data</Label>
            <Input id="date" name="date" type="date" required />
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Ex: Tiradentes" required />
          </div>
        </div>
        <div>
          <Label htmlFor="municipality">Município (opcional)</Label>
          <Input id="municipality" name="municipality" placeholder="Ex: São Paulo" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_national" name="is_national" defaultChecked />
          <Label htmlFor="is_national">Feriado nacional</Label>
        </div>
        <Button type="submit">Adicionar</Button>
      </form>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {holidays?.map((h: any) => (
              <tr key={h.id} className="border-b">
                <td className="p-3">{new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-3">{h.name}</td>
                <td className="p-3 text-muted-foreground text-xs">
                  {h.is_national ? 'Nacional' : `Municipal — ${h.municipality}`}
                </td>
                <td className="p-3">
                  <form action={deleteHolidayAction.bind(null, h.id)}>
                    <Button variant="ghost" size="sm" type="submit">Remover</Button>
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
