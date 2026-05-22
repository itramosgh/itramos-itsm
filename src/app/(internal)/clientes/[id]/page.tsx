import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CompanyDetails } from '@/components/clients/CompanyDetails'
import type { Database } from '@/types/database'

type CompanyWithDomains = Database['public']['Tables']['companies']['Row'] & {
  company_email_domains: Database['public']['Tables']['company_email_domains']['Row'][]
}

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: companyRaw } = await supabase
    .from('companies')
    .select('*, company_email_domains(*)')
    .eq('id', id)
    .single()

  if (!companyRaw) notFound()

  const company = companyRaw as unknown as CompanyWithDomains

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        {company.is_blocked && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">BLOQUEADO</span>
        )}
      </div>

      <CompanyDetails company={company} />
    </div>
  )
}
