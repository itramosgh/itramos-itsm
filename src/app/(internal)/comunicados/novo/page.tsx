import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAnnouncementAction } from '../actions'
import { RecipientSelector } from '@/components/comunicados/RecipientSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function NovoComunicadoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: companies } = (await supabase
    .from('companies').select('id, name').eq('is_active', true).order('name')) as { data: { id: string; name: string }[] | null }

  async function handleCreate(formData: FormData) {
    'use server'
    if (!formData.get('body_html')) formData.set('body_html', '<p></p>')
    const result = await createAnnouncementAction(formData)
    if (result.success && result.id) redirect(`/comunicados/${result.id}`)
    redirect(`/comunicados/novo?error=${encodeURIComponent((result as any).error ?? 'Erro ao criar comunicado')}`)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Novo Comunicado</h1>
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}
      <form action={handleCreate} className="space-y-4">
        <div>
          <Label>Assunto</Label>
          <Input name="subject" placeholder="Assunto do e-mail" required />
        </div>
        <RecipientSelector companies={companies ?? []} />
        <div>
          <Label>Agendamento (opcional)</Label>
          <Input name="scheduled_at" type="datetime-local" />
        </div>
        <Button type="submit">Criar e editar conteúdo</Button>
      </form>
    </div>
  )
}
