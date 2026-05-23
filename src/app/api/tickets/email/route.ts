import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, passwordSetupHtml, buildFromAddress } from '@/lib/email'

interface ResendInboundPayload {
  from: string
  subject: string
  text?: string
  html?: string
  messageId?: string
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export async function POST(request: Request) {
  // Verificar signature Resend Inbound (simplificado — em produção usar svix)
  const secret = process.env.RESEND_INBOUND_SECRET
  if (secret) {
    const signature = request.headers.get('svix-signature')
    if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    // Verificação completa via svix recomendada em produção:
    // import { Webhook } from 'svix'; new Webhook(secret).verify(rawBody, headers)
  }

  let payload: ResendInboundPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fromEmail = extractEmail(payload.from).toLowerCase()
  const domain = extractDomain(fromEmail)
  const subject = payload.subject ?? '(sem assunto)'
  const body = payload.text ?? payload.html ?? ''

  const supabase = await createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name')
    .single()
  const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)

  // 1. Verificar se remetente é contato cadastrado
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, contracts:companies!inner(id, contracts(id, status, is_24x7))')
    .eq('email', fromEmail)
    .eq('is_active', true)
    .single()

  if (contact) {
    // Remetente conhecido — criar chamado
    const activeContract = (contact as any).contracts?.contracts?.find((c: any) => c.status === 'ativo')

    await supabase.from('tickets').insert({
      title: subject,
      description: body,
      priority: 'media',
      channel: 'email',
      company_id: (contact as any).company_id,
      contact_id: (contact as any).id,
      contract_id: activeContract?.id ?? null,
    } as never)

    return NextResponse.json({ ok: true, action: 'ticket_created' })
  }

  // 2. Remetente desconhecido — verificar domínio
  const { data: domainRecord } = await supabase
    .from('company_email_domains')
    .select('company_id, companies!inner(is_active, is_blocked)')
    .eq('domain', domain)
    .single()

  if (!domainRecord) {
    // Domínio desconhecido — descartar com resposta
    await sendEmail({
      to: fromEmail,
      subject: `Re: ${subject}`,
      from,
      html: `<p>Olá, o endereço <strong>${fromEmail}</strong> não está associado a nenhuma empresa cadastrada em nosso sistema. Entre em contato diretamente com nossa equipe.</p>`,
    })
    return NextResponse.json({ ok: true, action: 'discarded_unknown_domain' })
  }

  const company = (domainRecord as any).companies
  const domainRecordTyped = domainRecord as any
  if (!company.is_active) {
    return NextResponse.json({ ok: true, action: 'discarded_inactive_company' })
  }

  // Verificar se já há solicitação pendente para este e-mail
  const { data: existing } = await supabase
    .from('pending_email_tickets')
    .select('id, reminder_count')
    .eq('from_email', fromEmail)
    .is('completed_at', null)
    .single()

  if (existing) {
    // Segunda mensagem — tentar extrair dados da resposta
    const lines = body.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const fullName = lines[0] ?? ''
    const phone = lines[1] ?? ''
    const dept = lines[2] ?? ''
    const isWhatsApp = /sim/i.test(lines[3] ?? '')

    if (fullName) {
      // Criar contato e chamado original
      const { data: newContact } = await supabase.from('contacts').insert({
        company_id: domainRecordTyped.company_id,
        full_name: fullName,
        email: fromEmail,
        phone: phone || null,
        is_whatsapp: isWhatsApp,
        department: dept || null,
      } as never).select('id').single<{ id: string }>()

      if (newContact) {
        // Criar usuário Supabase Auth para o contato
        const { data: authData } = await supabase.auth.admin.createUser({
          email: fromEmail,
          email_confirm: false,
          app_metadata: { role: 'cliente' },
        })

        if (authData.user) {
          await supabase.from('contacts').update({ user_id: authData.user.id } as never).eq('id', newContact.id)

          // Enviar link de definição de senha (via resetPasswordForEmail)
          const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: fromEmail,
          })

          if (linkData.properties?.action_link) {
            await sendEmail({
              to: fromEmail,
              subject: 'Bem-vindo(a) ao portal ITRAMOS — defina sua senha',
              from,
              html: passwordSetupHtml({ fullName, setupUrl: linkData.properties.action_link }),
            })
          }
        }

        // Criar o chamado original
        const { data: pendingTicket } = await supabase
          .from('pending_email_tickets')
          .select('original_subject, original_body')
          .eq('id', (existing as any).id)
          .single()

        if (pendingTicket) {
          await supabase.from('tickets').insert({
            title: (pendingTicket as any).original_subject,
            description: (pendingTicket as any).original_body,
            priority: 'media',
            channel: 'email',
            company_id: domainRecordTyped.company_id,
            contact_id: newContact.id,
          } as never)
          await supabase.from('pending_email_tickets').update({ completed_at: new Date().toISOString() } as never).eq('id', (existing as any).id)
        }
      }
    }
    return NextResponse.json({ ok: true, action: 'contact_created_from_reply' })
  }

  // Primeira mensagem de remetente desconhecido com domínio válido — solicitar dados
  await supabase.from('pending_email_tickets').insert({
    from_email: fromEmail,
    company_id: domainRecordTyped.company_id,
    original_subject: subject,
    original_body: body,
  } as never)

  await sendEmail({
    to: fromEmail,
    subject: `Re: ${subject}`,
    from,
    html: `
      <p>Olá, recebemos sua mensagem. Para abrir seu chamado, precisamos de algumas informações.</p>
      <p>Por favor, responda este e-mail com os dados abaixo, um por linha:</p>
      <ol>
        <li>Seu nome completo</li>
        <li>Telefone</li>
        <li>Departamento</li>
        <li>O telefone é WhatsApp? (Sim/Não)</li>
      </ol>
    `,
  })

  return NextResponse.json({ ok: true, action: 'info_requested' })
}
