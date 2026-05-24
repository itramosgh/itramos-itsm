'use server'

export async function saveTemplateAction(
  _slug: string,
  _data: { subject: string; body_html: string; body_rich_text: Record<string, unknown> }
): Promise<{ error?: string }> {
  return {}
}

export async function restoreDefaultAction(_slug: string): Promise<void> {}
