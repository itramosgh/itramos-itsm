import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from: string
  replyTo?: string
  attachments?: Array<{ filename: string; content: Buffer | Uint8Array; contentType?: string }>
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { error } = await resend.emails.send({
    from: params.from,
    to: typeof params.to === 'string' ? [params.to] : params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(params.attachments ? { attachments: params.attachments as any } : {}),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

export function buildFromAddress(name: string | null, address: string | null): string {
  const n = name ?? 'ITRAMOS Suporte'
  const a = address ?? 'suporte@itramos.com.br'
  return `${n} <${a}>`
}

export function slaAlertHtml(params: {
  ticketNumber: number
  ticketTitle: string
  deadlineStr: string
  alertType: 'proximo' | 'violado'
  appUrl: string
}): string {
  const { ticketNumber, ticketTitle, deadlineStr, alertType, appUrl } = params
  const heading = alertType === 'proximo'
    ? `⚠️ SLA próximo de vencer — Chamado #${ticketNumber}`
    : `🚨 SLA VIOLADO — Chamado #${ticketNumber}`
  return `
    <h2>${heading}</h2>
    <p><strong>Chamado:</strong> #${ticketNumber} — ${ticketTitle}</p>
    <p><strong>Prazo SLA:</strong> ${deadlineStr}</p>
    <p><a href="${appUrl}/chamados/${ticketNumber}">Abrir chamado</a></p>
  `
}

export function schedulingReminderHtml(params: {
  ticketNumber: number
  ticketTitle: string
  scheduledAtStr: string
  appUrl: string
}): string {
  return `
    <h2>Lembrete de atendimento agendado</h2>
    <p><strong>Chamado:</strong> #${params.ticketNumber} — ${params.ticketTitle}</p>
    <p><strong>Horário agendado:</strong> ${params.scheduledAtStr}</p>
    <p><a href="${params.appUrl}/chamados/${params.ticketNumber}">Abrir chamado</a></p>
  `
}

export function approvalRequestHtml(params: {
  ticketNumber: number
  ticketTitle: string
  requesterName: string
  approvePath: string
  rejectPath: string
  appUrl: string
}): string {
  return `
    <h2>Solicitação de aprovação — Chamado #${params.ticketNumber}</h2>
    <p>O chamado "<strong>${params.ticketTitle}</strong>" solicitado por <strong>${params.requesterName}</strong> requer sua aprovação.</p>
    <p>
      <a href="${params.appUrl}${params.approvePath}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        ✅ Aprovar
      </a>
      &nbsp;&nbsp;
      <a href="${params.appUrl}${params.rejectPath}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        ❌ Reprovar
      </a>
    </p>
  `
}

export function approvalResultHtml(params: {
  ticketNumber: number
  ticketTitle: string
  approved: boolean
  reason?: string
  appUrl: string
}): string {
  const result = params.approved ? '✅ Aprovado' : '❌ Reprovado'
  return `
    <h2>Resultado da aprovação — Chamado #${params.ticketNumber}</h2>
    <p>O chamado "<strong>${params.ticketTitle}</strong>" foi <strong>${result}</strong>.</p>
    ${params.reason ? `<p><strong>Motivo:</strong> ${params.reason}</p>` : ''}
    <p><a href="${params.appUrl}/chamados/${params.ticketNumber}">Abrir chamado</a></p>
  `
}

export function awaitingClientReminderHtml(params: {
  ticketNumber: number
  ticketTitle: string
  portalUrl: string
}): string {
  return `
    <h2>Aguardamos seu retorno — Chamado #${params.ticketNumber}</h2>
    <p>Seu chamado "<strong>${params.ticketTitle}</strong>" está aguardando sua resposta.</p>
    <p><a href="${params.portalUrl}/portal/chamados/${params.ticketNumber}">Responder no portal</a></p>
  `
}

export function kbLinkHtml(params: {
  ticketNumber: number
  articleTitle: string
  articleSummary: string | null
  confirmUrl: string
  denyUrl: string
}): string {
  return `
    <h2>Artigo relacionado ao seu chamado #${params.ticketNumber}</h2>
    <p><strong>${params.articleTitle}</strong></p>
    ${params.articleSummary ? `<p>${params.articleSummary}</p>` : ''}
    <p>Isso resolveu seu problema?</p>
    <p>
      <a href="${params.confirmUrl}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        Sim, resolvido
      </a>
      &nbsp;&nbsp;
      <a href="${params.denyUrl}" style="background:#6b7280;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
        Não, ainda preciso de ajuda
      </a>
    </p>
  `
}

export function passwordSetupHtml(params: {
  fullName: string
  setupUrl: string
}): string {
  return `
    <h2>Bem-vindo(a), ${params.fullName}!</h2>
    <p>Sua conta no portal ITRAMOS foi criada. Clique no link abaixo para definir sua senha (válido por 24 horas):</p>
    <p><a href="${params.setupUrl}">Definir minha senha</a></p>
  `
}
