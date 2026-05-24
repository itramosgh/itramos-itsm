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
