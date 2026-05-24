// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any

export async function resolveContactEmails(
  supabase: SupabaseAny,
  contactId: string,
  companyId: string
): Promise<string[]> {
  const emails: string[] = []

  const { data: contact } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', contactId)
    .single()
  if ((contact as any)?.email) emails.push((contact as any).email)

  const { data: extras } = await supabase
    .from('contacts')
    .select('email')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .neq('id', contactId)
    .or('is_contract_responsible.eq.true,receives_ticket_cc.eq.true')

  for (const c of (extras ?? []) as any[]) {
    if (c.email && !emails.includes(c.email)) emails.push(c.email)
  }

  return emails
}

export async function resolveAnalystEmail(
  serviceSupabase: SupabaseAny,
  assignedTo: string | null
): Promise<string | null> {
  if (!assignedTo) return null
  const { data } = await serviceSupabase.auth.admin.getUserById(assignedTo)
  return (data as any).user?.email ?? null
}

export async function resolveNewTicketNotifyEmails(
  serviceSupabase: SupabaseAny
): Promise<string[]> {
  const { data: profiles } = await serviceSupabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'gestor'])
    .eq('notify_new_tickets', true)
    .eq('is_active', true)

  if (!profiles?.length) return []

  const profileIds = new Set((profiles as any[]).map((p: any) => p.id))
  const { data: { users } } = await serviceSupabase.auth.admin.listUsers({ perPage: 1000 })
  return (users ?? [])
    .filter((u: any) => profileIds.has(u.id) && u.email)
    .map((u: any) => u.email as string)
}
