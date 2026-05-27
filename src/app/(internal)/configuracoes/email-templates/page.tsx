import { createClient } from '@/lib/supabase/server'
import { EmailTemplateListClient } from '@/components/settings/email-templates/EmailTemplateListClient'
import { EmailTemplateEditor } from '@/components/settings/email-templates/EmailTemplateEditor'

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('slug, category, name, is_customized, updated_at')
    .order('category')
    .order('name')
    .limit(500)

  if (!templates) return <p className="p-6">Erro ao carregar templates.</p>

  let selected = null
  if (slug) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .eq('slug', slug)
      .single()
    selected = data as any
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden -m-6">
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="px-3 py-3 border-b">
          <h1 className="text-base font-semibold">Templates de E-mail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} templates</p>
        </div>
        <EmailTemplateListClient templates={templates} selectedSlug={slug ?? null} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <EmailTemplateEditor key={selected.slug} template={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Selecione um template na lista para editar.
          </div>
        )}
      </div>
    </div>
  )
}
