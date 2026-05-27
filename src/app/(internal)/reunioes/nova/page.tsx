import { createClient } from '@/lib/supabase/server'
import { MeetingForm } from '@/components/reunioes/MeetingForm'
import { createMeetingAction } from '../actions'

export default async function NovaReuniaoPage() {
  const supabase = await createClient()
  const [{ data: companies }, { data: profiles }, { data: contacts }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Reunião</h1>
      <MeetingForm action={createMeetingAction} companies={companies ?? []} profiles={profiles ?? []} contacts={contacts ?? []} />
    </div>
  )
}
