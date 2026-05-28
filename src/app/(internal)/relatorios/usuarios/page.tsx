import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UsuariosReportClient } from '@/components/relatorios/UsuariosReportClient'

export default async function RelatorioUsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const serviceSupabase = await createServiceClient()

  const [{ data: profiles }, { data: { users: authUsers } }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, is_active, last_login_at')
      .order('full_name') as unknown as Promise<{ data: any[] }>,
    serviceSupabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = new Map((authUsers ?? []).map((u: any) => [u.id, u.email ?? '']))

  const rows = (profiles ?? []).map((p: any) => ({
    id: p.id,
    empresa: 'ITRAMOS',
    nome: p.full_name,
    email: emailMap.get(p.id) ?? '',
    perfil: p.role,
    ultimo_acesso: p.last_login_at ?? null,
    ativo: p.is_active,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatório de Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">Equipe interna ITRAMOS</p>
      </div>
      <UsuariosReportClient rows={rows} />
    </div>
  )
}
