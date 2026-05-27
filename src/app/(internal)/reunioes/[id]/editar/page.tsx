import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MeetingForm } from '@/components/reunioes/MeetingForm'
import { updateMeetingAction } from '@/app/(internal)/reunioes/actions'

export default async function EditarReuniaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: meeting }, { data: participantsData }, { data: companies }, { data: profiles }, { data: contacts }] = await Promise.all([
    supabase.from('meetings').select('id, title, company_id, scheduled_at, notes_html, notes_rich_text').eq('id', id).single() as unknown as Promise<{ data: any }>,
    supabase.from('meeting_participants').select('id, profile_id, contact_id, external_email, external_name, profiles(full_name), contacts(full_name)').eq('meeting_id', id) as unknown as Promise<{ data: any[] | null }>,
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name') as unknown as Promise<{ data: any[] | null }>,
  ])

  if (!meeting) notFound()

  const participants = (participantsData ?? []).map((p: any) => {
    if (p.profile_id) return { type: 'profile' as const, profile_id: p.profile_id, label: p.profiles?.full_name ?? p.profile_id }
    if (p.contact_id) return { type: 'contact' as const, contact_id: p.contact_id, label: p.contacts?.full_name ?? p.contact_id }
    return { type: 'external' as const, external_email: p.external_email, external_name: p.external_name, label: `${p.external_name} (${p.external_email})` }
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar Reunião</h1>
      <MeetingForm
        action={updateMeetingAction.bind(null, id) as any}
        initialData={{ ...meeting, participants }}
        companies={companies ?? []}
        profiles={profiles ?? []}
        contacts={contacts ?? []}
      />
    </div>
  )
}
