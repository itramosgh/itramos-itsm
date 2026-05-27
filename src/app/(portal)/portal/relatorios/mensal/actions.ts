'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function portalDownloadReportAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string } | null }

  if (!contact?.company_id) redirect('/portal/chamados')

  const from = formData.get('from') as string
  const to = formData.get('to') as string
  if (!from || !to) return

  redirect(`/api/reports/monthly?companyId=${contact.company_id}&from=${from}&to=${to}`)
}
