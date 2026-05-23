import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const resolvedStr = url.searchParams.get('resolved')

  if (!token || !resolvedStr) {
    return new Response('Link inválido', { status: 400 })
  }

  const resolved = resolvedStr === 'true'
  const supabase = await createServiceClient()

  const { data: link } = await supabase
    .from('ticket_kb_links')
    .select('id, ticket_id, tickets(id, number, title, status)')
    .eq('confirmation_token', token)
    .single()

  if (!link) {
    return new Response('<h2>Link inválido ou expirado.</h2>', {
      headers: { 'content-type': 'text/html' }, status: 404,
    })
  }

  await supabase.from('ticket_kb_links').update({ resolution_confirmed: resolved } as never).eq('id', (link as any).id)

  const ticket = (link as any).tickets as any

  if (resolved && ticket.status !== 'fechado') {
    await supabase.from('tickets').update({
      status: 'fechado',
      closed_at: new Date().toISOString(),
    } as never).eq('id', (link as any).ticket_id)

    await supabase.from('ticket_interactions').insert({
      ticket_id: (link as any).ticket_id,
      type: 'system',
      content: 'Resolvido via artigo da base de conhecimento.',
      is_system: true,
    } as never)
  }

  const message = resolved
    ? `Obrigado! Seu chamado #${ticket.number} foi marcado como resolvido.`
    : `Entendido! Seu chamado #${ticket.number} continua em atendimento.`

  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center">
      <h2>${message}</h2>
      <p>Você pode fechar esta aba.</p>
    </body></html>`,
    { headers: { 'content-type': 'text/html' } }
  )
}
