'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const holidaySchema = z.object({
  date: z.string().date('Data inválida'),
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['nacional', 'municipal', 'manual']).default('nacional'),
})

export async function createHolidayAction(formData: FormData) {
  const parsed = holidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
    type: formData.get('type') ?? 'nacional',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const year = new Date(parsed.data.date + 'T12:00:00').getFullYear()
  const supabase = await createClient()
  const { error } = await supabase
    .from('holidays')
    .insert({ ...parsed.data, year } as never)
  if (error?.code === '23505') return { error: 'Feriado já cadastrado nesta data e tipo.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/feriados')
  return { success: true }
}

export async function deleteHolidayAction(id: string) {
  const supabase = await createClient()
  await supabase.from('holidays').delete().eq('id', id)
  revalidatePath('/configuracoes/feriados')
}

export async function importHolidaysAction(year?: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'gestor'].includes((profile as any)?.role)) return { error: 'Sem permissão' }

  const targetYear = year ?? new Date().getFullYear()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const response = await fetch(
    `${appUrl}/api/cron/holiday-import?year=${targetYear}`,
    { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
  )

  if (!response.ok) return { error: 'Falha ao importar feriados. Tente novamente.' }

  const result = await response.json()
  revalidatePath('/configuracoes/feriados')
  return { success: true, imported: result.imported as number, skipped: result.skipped as number }
}
