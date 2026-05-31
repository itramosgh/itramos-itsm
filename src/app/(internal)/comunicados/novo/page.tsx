import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NovoComunicadoForm } from '@/components/comunicados/NovoComunicadoForm'

export default async function NovoComunicadoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const [{ data: companies }, { data: contacts }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
    supabase.from('contacts').select('id, full_name, email').eq('is_active', true).order('full_name') as unknown as Promise<{ data: { id: string; full_name: string; email: string }[] | null }>,
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Novo Comunicado</h1>
      <NovoComunicadoForm
        companies={companies ?? []}
        contacts={contacts ?? []}
      />
    </div>
  )
}
