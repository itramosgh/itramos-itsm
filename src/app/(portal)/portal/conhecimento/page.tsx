import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function PortalConhecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>
}) {
  const { categoria, q } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string } | null }

  if (!contact) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = supabase
    .from('kb_documents')
    .select('id, title, category, published_at, content_html')
    .eq('company_id', contact.company_id)
    .eq('is_active', true)
    .order('published_at', { ascending: false })

  if (categoria) query = query.eq('category', categoria)
  if (q) query = query.ilike('title', `%${q}%`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: documents } = await query as { data: any[] | null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = [...new Set((documents ?? []).map((d: any) => d.category).filter(Boolean))]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Documentos e Procedimentos</h1>

      <div className="flex gap-4">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por título..."
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="px-3 py-2 border rounded-md text-sm">Buscar</button>
        </form>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <a
            href="/portal/conhecimento"
            className={`px-3 py-1 rounded-full text-sm border ${!categoria ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Todos
          </a>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {categories.map((c: any) => (
            <a
              key={c}
              href={`/portal/conhecimento?categoria=${c}`}
              className={`px-3 py-1 rounded-full text-sm border ${categoria === c ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {c}
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(documents ?? []).map((doc: any) => (
          <div key={doc.id} className="border rounded-md p-4 space-y-2">
            <h2 className="font-medium">{doc.title}</h2>
            {doc.category && <p className="text-xs text-muted-foreground">{doc.category}</p>}
            {doc.content_html && (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: doc.content_html }}
              />
            )}
          </div>
        ))}
        {(documents ?? []).length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum documento disponível.</p>
        )}
      </div>
    </div>
  )
}
