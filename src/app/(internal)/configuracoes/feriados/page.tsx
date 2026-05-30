import { createClient } from '@/lib/supabase/server'
import { createHolidayAction, getHolidayNoticeSummaryAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImportHolidaysButton } from './ImportHolidaysButton'
import { HolidayRow } from './HolidayRow'

const typeLabels: Record<string, string> = {
  nacional: 'Nacional',
  municipal: 'Municipal — SP',
  manual: 'Manual',
}

export default async function FeriadosPage() {
  const supabase = await createClient()
  const { data: holidays } = (await supabase
    .from('holidays')
    .select('id, date, name, type')
    .order('date')
    .limit(500)) as { data: any[] | null }

  const noticeCounts = await getHolidayNoticeSummaryAction()

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Feriados</h1>
      <ImportHolidaysButton />

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
          <Label htmlFor="type">Tipo</Label>
          <select
            id="type"
            name="type"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="nacional">Nacional</option>
            <option value="municipal">Municipal — SP</option>
            <option value="manual">Manual</option>
          </select>
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
              <th className="p-3 text-left">Avisos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(holidays ?? []).map((h: any) => (
              <HolidayRow
                key={h.id}
                holiday={h}
                typeLabel={typeLabels[h.type] ?? h.type}
                sentCount={noticeCounts[h.id] ?? 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
