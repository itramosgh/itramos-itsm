import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ContactList } from '@/components/clients/ContactList'
import { CreateContactDialog } from '@/components/clients/CreateContactDialog'
import type { Database } from '@/types/database'

type Company = Pick<Database['public']['Tables']['companies']['Row'], 'id' | 'name'>
type Contact = Database['public']['Tables']['contacts']['Row']

export default async function ContatosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: companyRaw } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!companyRaw) notFound()

  const company = companyRaw as unknown as Company

  const { data: contactsRaw } = await supabase
    .from('contacts')
    .select('*')
    .eq('company_id', id)
    .eq('is_active', true)
    .order('full_name')

  const contacts = (contactsRaw ?? []) as unknown as Contact[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contatos — {company.name}</h1>
        <CreateContactDialog companyId={id} />
      </div>
      <ContactList contacts={contacts} companyId={id} />
    </div>
  )
}
