'use client'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import type { Database } from '@/types/database'

type EmailTemplate = Pick<
  Database['public']['Tables']['email_templates']['Row'],
  'slug' | 'category' | 'name' | 'is_customized' | 'updated_at'
>

interface EmailTemplateListProps {
  templates: EmailTemplate[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
}

export function EmailTemplateList({ templates, selectedSlug, onSelect }: EmailTemplateListProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    )
  }, [templates, search])

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplate[]>()
    filtered.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category)!.push(t)
    })
    return map
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.size === 0 && (
          <p className="p-4 text-sm text-muted-foreground text-center">Nenhum template encontrado.</p>
        )}
        {Array.from(grouped.entries()).map(([category, items]) => (
          <details key={category} open className="group">
            <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:bg-muted/50 select-none">
              {category}
              <span className="ml-auto text-xs font-normal normal-case">{items.length}</span>
            </summary>
            <ul className="pb-1">
              {items.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.slug)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                      selectedSlug === t.slug
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    {t.is_customized ? (
                      <Badge
                        variant={selectedSlug === t.slug ? 'outline' : 'secondary'}
                        className="text-xs shrink-0"
                      >
                        Custom
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs shrink-0 opacity-60">
                        Padrão
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
