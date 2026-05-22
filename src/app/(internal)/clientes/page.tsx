import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CreateCompanyDialog } from '@/components/clients/CreateCompanyDialog'
import type { Database } from '@/types/database'

type CompanyRow = Pick<Database['public']['Tables']['companies']['Row'], 'id' | 'name' | 'segment' | 'is_active' | 'is_blocked'>

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: companiesRaw } = await supabase
    .from('companies')
    .select('id, name, segment, is_active, is_blocked')
    .order('name')

  const companies = (companiesRaw ?? []) as unknown as CompanyRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <CreateCompanyDialog />
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Segmento</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(companies ?? []).map((company) => (
              <tr key={company.id} className="border-t hover:bg-muted/50">
                <td className="px-4 py-2 font-medium">{company.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{company.segment ?? '—'}</td>
                <td className="px-4 py-2">
                  {company.is_blocked ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">BLOQUEADO</span>
                  ) : company.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inativo</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/clientes/${company.id}`} className="text-sm hover:underline">
                    Ver detalhes →
                  </Link>
                </td>
              </tr>
            ))}
            {(companies ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma empresa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
