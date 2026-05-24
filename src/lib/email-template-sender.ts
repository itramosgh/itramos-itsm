import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, buildFromAddress } from '@/lib/email'

export function substituteVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

export function wrapEmailHtml(
  bodyHtml: string,
  opts: { logoUrl: string | null; companyName: string | null }
): string {
  const name = opts.companyName ?? 'ITRAMOS'
  const logo = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${name}" style="height:40px;max-width:200px;" />`
    : `<span style="font-size:18px;font-weight:bold;color:#1e40af;">${name}</span>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1e40af;padding:20px 32px;">${logo}</td></tr>
        <tr><td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#6b7280;">
          ${name} · Suporte técnico
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendEmailFromTemplate(
  slug: string,
  to: string | string[],
  vars: Record<string, string>
): Promise<void> {
  const supabase = await createServiceClient()

  const { data: template, error } = await supabase
    .from('email_templates')
    .select('subject, body_html')
    .eq('slug', slug)
    .single()

  if (error || !template) {
    throw new Error(`Template "${slug}" não encontrado: ${error?.message}`)
  }

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_name, email_from_address, logo_light_url, company_name')
    .eq('id', 1)
    .single()

  const subject = substituteVariables(template.subject, vars)
  const bodyHtml = substituteVariables(template.body_html, vars)
  const wrappedHtml = wrapEmailHtml(bodyHtml, {
    logoUrl: settings?.logo_light_url ?? null,
    companyName: settings?.company_name ?? null,
  })

  await sendEmail({
    to,
    subject,
    html: wrappedHtml,
    from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
  })
}
