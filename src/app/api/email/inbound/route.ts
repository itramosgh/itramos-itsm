import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, buildFromAddress } from '@/lib/email'

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractTicketNumber(to: string): number | null {
  const match = to.match(/chamado-(\d+)@/)
  return match ? parseInt(match[1], 10) : null
}

function stripQuotedText(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.startsWith('>'))
    .join('\n')
    .trim()
}

function verifySvixSignature(rawBody: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const timestamp = parseInt(svixTimestamp, 10)
  if (isNaN(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Buffer.from(secretKey, 'base64')
  const computed = createHmac('sha256', keyBytes).update(toSign).digest('base64')
  const computedBuf = Buffer.from(computed)

  for (const part of svixSignature.split(' ')) {
    const sigValue = part.startsWith('v1,') ? part.slice(3) : part
    try {
      const sigBuf = Buffer.from(sigValue, 'base64')
      if (sigBuf.length === computedBuf.length && timingSafeEqual(computedBuf, sigBuf)) return true
    } catch { /* length mismatch or invalid base64 */ }
  }
  return false
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  const secret = process.env.RESEND_INBOUND_SECRET
  if (secret) {
    if (!verifySvixSignature(rawBody, request.headers, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: { from: string; to: string; subject?: string; text?: string }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fromEmail = extractEmail(payload.from).toLowerCase()
  const ticketNumber = extractTicketNumber(payload.to)
  if (!ticketNumber) {
    return NextResponse.json({ ok: true, action: 'discarded_no_ticket_number' })
  }

  const supabase = await createServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, number, title, status, closed_at, contact_id, company_id, assigned_to')
    .eq('number', ticketNumber)
    .single()

  if (!ticket) {
    return NextResponse.json({ ok: true, action: 'discarded_ticket_not_found' })
  }
  const tf = ticket as any

  // Verificar se remetente é contato autorizado da empresa
  const { data: senderContact } = await supabase
    .from('contacts')
    .select('id, full_name')
    .eq('email', fromEmail)
    .eq('company_id', tf.company_id)
    .eq('is_active', true)
    .single()

  if (!senderContact) {
    return NextResponse.json({ ok: true, action: 'discarded_unauthorized_sender' })
  }

  // Verificar prazo de reabertura (7 dias após fechamento)
  if (tf.status === 'fechado' && tf.closed_at) {
    const closedAt = new Date(tf.closed_at)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000)
    if (closedAt < sevenDaysAgo) {
      const { data: settings } = await supabase
        .from('platform_settings').select('email_from_name, email_from_address').single()
      const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
      await sendEmail({
        to: fromEmail,
        subject: `Re: Chamado #${tf.number} — prazo expirado`,
        from,
        html: `<p>O chamado <strong>#${tf.number}</strong> foi encerrado há mais de 7 dias. Para nova solicitação, abra um novo chamado no portal.</p>`,
      })
      return NextResponse.json({ ok: true, action: 'discarded_reopen_expired' })
    }
  }

  // Extrair corpo da resposta (ignorar texto citado)
  const rawText = payload.text ?? ''
  const replyText = stripQuotedText(rawText)
  if (!replyText) {
    return NextResponse.json({ ok: true, action: 'discarded_empty_reply' })
  }

  // Adicionar interação ao chamado
  await supabase.from('ticket_interactions').insert({
    ticket_id: tf.id,
    type: 'mensagem',
    content: replyText,
    author_contact_id: (senderContact as any).id,
  } as never)

  // Se aguardando cliente → retomar em_andamento
  if (tf.status === 'aguardando_cliente') {
    await supabase.from('tickets').update({ status: 'em_andamento' } as never).eq('id', tf.id)
  }

  // Notificar analista responsável
  if (tf.assigned_to) {
    const { data: au } = await supabase.auth.admin.getUserById(tf.assigned_to)
    if (au.user?.email) {
      const { data: settings } = await supabase
        .from('platform_settings').select('email_from_name, email_from_address').single()
      const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL!
      await sendEmail({
        to: au.user.email,
        subject: `Retorno por e-mail — Chamado #${tf.number}`,
        from,
        html: `<p>O cliente <strong>${(senderContact as any).full_name}</strong> respondeu ao chamado <strong>#${tf.number} — ${tf.title}</strong> via e-mail.</p><p><a href="${appUrl}/chamados/${tf.id}">Abrir chamado</a></p>`,
      })
    }
  }

  await supabase.from('system_logs').insert({
    category: 'email_received',
    status: 'success',
    description: `Resposta de ${fromEmail} adicionada ao chamado #${tf.number}`,
  } as never)

  return NextResponse.json({ ok: true, action: 'reply_added' })
}
