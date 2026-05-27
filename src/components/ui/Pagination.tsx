import Link from 'next/link'

interface Props {
  page: number
  total: number
  perPage: number
  searchParams: Record<string, string | undefined>
}

export function Pagination({ page, total, perPage, searchParams }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (total <= perPage) return null

  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  function href(p: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== 'page' && v) params.set(k, v)
    }
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `?${qs}` : '?'
  }

  function pages(): (number | 'gap')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set([1, totalPages, page - 1, page, page + 1].filter(n => n >= 1 && n <= totalPages))
    const sorted = [...set].sort((a, b) => a - b)
    const result: (number | 'gap')[] = []
    let prev = 0
    for (const n of sorted) {
      if (n - prev > 1) result.push('gap')
      result.push(n)
      prev = n
    }
    return result
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
      <span>{total === 0 ? 'Nenhum resultado' : `Mostrando ${from}–${to} de ${total}`}</span>
      <div className="flex items-center gap-1">
        {page > 1
          ? <Link href={href(page - 1)} className="px-3 py-1 rounded border hover:bg-muted">‹ Anterior</Link>
          : <span className="px-3 py-1 rounded border opacity-40">‹ Anterior</span>
        }
        {pages().map((p, i) =>
          p === 'gap'
            ? <span key={`g${i}`} className="px-1">…</span>
            : <Link key={p} href={href(p)}
                className={`w-8 h-8 flex items-center justify-center rounded border text-sm ${p === page ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>
                {p}
              </Link>
        )}
        {page < totalPages
          ? <Link href={href(page + 1)} className="px-3 py-1 rounded border hover:bg-muted">Próxima ›</Link>
          : <span className="px-3 py-1 rounded border opacity-40">Próxima ›</span>
        }
      </div>
    </div>
  )
}
