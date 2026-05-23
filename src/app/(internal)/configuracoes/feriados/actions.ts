'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const holidaySchema = z.object({
  date: z.string().date('Data inválida'),
  name: z.string().min(1, 'Nome é obrigatório'),
  is_national: z.boolean().default(true),
  municipality: z.string().optional(),
})

export async function createHolidayAction(formData: FormData) {
  const parsed = holidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
    is_national: formData.get('is_national') === 'on',
    municipality: formData.get('municipality') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('holidays').insert(parsed.data as never)
  if (error?.code === '23505') return { error: 'Feriado já cadastrado nesta data.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/feriados')
  return { success: true }
}

export async function deleteHolidayAction(id: string) {
  const supabase = await createClient()
  await supabase.from('holidays').delete().eq('id', id)
  revalidatePath('/configuracoes/feriados')
}
