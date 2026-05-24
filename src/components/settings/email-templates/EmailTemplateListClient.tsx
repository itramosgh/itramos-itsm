'use client'
import { useRouter } from 'next/navigation'
import { EmailTemplateList } from './EmailTemplateList'
import type { Database } from '@/types/database'

type TemplateListItem = Pick<
  Database['public']['Tables']['email_templates']['Row'],
  'slug' | 'category' | 'name' | 'is_customized' | 'updated_at'
>

interface EmailTemplateListClientProps {
  templates: TemplateListItem[]
  selectedSlug: string | null
}

export function EmailTemplateListClient({ templates, selectedSlug }: EmailTemplateListClientProps) {
  const router = useRouter()
  return (
    <EmailTemplateList
      templates={templates}
      selectedSlug={selectedSlug}
      onSelect={(slug) => router.push(`/configuracoes/email-templates?slug=${slug}`)}
    />
  )
}
