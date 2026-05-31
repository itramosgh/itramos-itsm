# Responsividade Mobile — ITSM ITRAMOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a interface interna (analistas/admins) e o portal do cliente utilizáveis em dispositivos móveis via sidebar drawer, cards de chamados e navbar responsiva.

**Architecture:** A interface interna ganha um `InternalShell` Client Component que gerencia o estado `sidebarOpen` e passa props para `Sidebar` (overlay mobile) e `HeaderClient` (botão hamburger). O portal extrai `PortalNav` como Client Component para gerenciar o menu mobile sem quebrar o Server Component que faz fetches. `TicketList` usa renderização condicional CSS (cards mobile / tabela desktop) sem props novas.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, Lucide React, Supabase (server-only no layout), Vitest (sem testes de componente UI — verificação via `npm run build`)

---

## Task 1: Criar HeaderClient

Novo Client Component que recebe `profileName` e `onMenuOpen` como props. Substitui o atual `Header` Server Component que buscava dados.

**Files:**
- Create: `src/components/layout/HeaderClient.tsx`

- [ ] **Step 1: Criar o arquivo `HeaderClient.tsx`**

```tsx
'use client'
import { logoutAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'

interface HeaderClientProps {
  profileName: string | null
  onMenuOpen: () => void
}

export function HeaderClient({ profileName, onMenuOpen }: HeaderClientProps) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6 shrink-0">
      <button
        type="button"
        onClick={onMenuOpen}
        className="md:hidden p-1 rounded-md hover:bg-muted transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{profileName}</span>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" type="submit">Sair</Button>
        </form>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npm run build 2>&1 | tail -20
```

Esperado: sem erros de TypeScript. (Build pode falhar em outros arquivos por erros pré-existentes — só importa não ter erros novos relacionados a `HeaderClient`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/HeaderClient.tsx
git commit -m "feat: add HeaderClient — client component with hamburger button"
```

---

## Task 2: Criar InternalShell

Client Component que gerencia `sidebarOpen`, renderiza Sidebar + HeaderClient + backdrop + main.

**Files:**
- Create: `src/components/layout/InternalShell.tsx`

- [ ] **Step 1: Criar o arquivo `InternalShell.tsx`**

```tsx
'use client'
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { HeaderClient } from './HeaderClient'

interface InternalShellProps {
  appName: string | null
  logoUrl: string | null
  profileName: string | null
  children: ReactNode
}

export function InternalShell({ appName, logoUrl, profileName, children }: InternalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])

  return (
    <div className="flex h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}
      <Sidebar
        appName={appName}
        logoUrl={logoUrl}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <HeaderClient
          profileName={profileName}
          onMenuOpen={openSidebar}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que Sidebar ainda aceita as novas props (vai falhar — próxima task corrige)**

O arquivo vai compilar com erro de tipo porque `Sidebar` ainda não tem `isOpen` e `onClose`. Confirme visualmente que o erro é exatamente esse antes de prosseguir.

```bash
npx tsc --noEmit 2>&1 | grep -i "isOpen\|onClose\|InternalShell"
```

Esperado: erro de tipo nas props de `Sidebar`. Isso é esperado — será corrigido na Task 3.

- [ ] **Step 3: Commit parcial**

```bash
git add src/components/layout/InternalShell.tsx
git commit -m "feat: add InternalShell client component (sidebar state management)"
```

---

## Task 3: Refatorar Sidebar para overlay mobile

Adicionar props `isOpen` e `onClose`. Mudar classes da `<aside>` para comportamento de drawer no mobile.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Adicionar props `isOpen` e `onClose` à interface `SidebarProps`**

Localizar:
```tsx
interface SidebarProps {
  appName?: string | null
  logoUrl?: string | null
}
```

Substituir por:
```tsx
interface SidebarProps {
  appName?: string | null
  logoUrl?: string | null
  isOpen?: boolean
  onClose?: () => void
}
```

- [ ] **Step 2: Atualizar assinatura da função `Sidebar` para incluir as novas props**

Localizar:
```tsx
export function Sidebar({ appName, logoUrl }: SidebarProps) {
```

Substituir por:
```tsx
export function Sidebar({ appName, logoUrl, isOpen = false, onClose }: SidebarProps) {
```

- [ ] **Step 3: Fechar sidebar ao navegar — adicionar `onClose?.()` no useEffect existente**

Localizar o `useEffect` que observa `pathname`:
```tsx
  useEffect(() => {
    setOpen(prev => {
      const updates: Record<string, boolean> = {}
      for (const entry of navigation) {
        if (isGroup(entry) && entry.items.some(i => isActive(i.href, pathname))) {
          updates[entry.label] = true
        }
      }
      return { ...prev, ...updates }
    })
  }, [pathname])
```

Substituir por:
```tsx
  useEffect(() => {
    setOpen(prev => {
      const updates: Record<string, boolean> = {}
      for (const entry of navigation) {
        if (isGroup(entry) && entry.items.some(i => isActive(i.href, pathname))) {
          updates[entry.label] = true
        }
      }
      return { ...prev, ...updates }
    })
    onClose?.()
  }, [pathname, onClose])
```

- [ ] **Step 4: Atualizar classes da `<aside>` para overlay mobile**

Localizar:
```tsx
    <aside className="w-64 border-r bg-background h-screen flex flex-col">
```

Substituir por:
```tsx
    <aside className={[
      'fixed inset-y-0 left-0 z-50 w-64 border-r bg-background h-screen flex flex-col',
      'transform transition-transform duration-200 ease-in-out',
      'md:relative md:z-auto md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    ].join(' ')}>
```

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "sidebar\|InternalShell"
```

Esperado: sem erros relacionados a `Sidebar` ou `InternalShell`.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: make Sidebar a mobile drawer overlay with isOpen/onClose props"
```

---

## Task 4: Refatorar InternalLayout para usar InternalShell

O layout vira um Server Component mais simples: busca settings + nome do perfil e passa para `InternalShell`. Remove o import de `Header` (que será deletado).

**Files:**
- Modify: `src/app/(internal)/layout.tsx`
- Delete: `src/components/layout/Header.tsx`

- [ ] **Step 1: Reescrever `src/app/(internal)/layout.tsx`**

Substituir todo o conteúdo do arquivo por:

```tsx
import { InternalShell } from '@/components/layout/InternalShell'
import { createClient } from '@/lib/supabase/server'
import type { ReactNode } from 'react'

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const [{ data: settings }, { data: { user } }] = await Promise.all([
    supabase.from('platform_settings').select('app_name, logo_light_url').single() as any,
    supabase.auth.getUser(),
  ])

  let profileName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single() as any
    profileName = profile?.full_name ?? null
  }

  return (
    <InternalShell
      appName={settings?.app_name ?? null}
      logoUrl={settings?.logo_light_url ?? null}
      profileName={profileName}
    >
      {children}
    </InternalShell>
  )
}
```

- [ ] **Step 2: Deletar `src/components/layout/Header.tsx`**

```bash
rm src/components/layout/Header.tsx
```

- [ ] **Step 3: Confirmar compilação completa**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros. Se houver erro de "Cannot find module '@/components/layout/Header'", significa que `Header` ainda é importado em algum lugar — procurar e remover.

```bash
npx tsc --noEmit 2>&1 | grep -i header
```

- [ ] **Step 4: Rodar lint**

```bash
npm run lint 2>&1 | tail -20
```

Esperado: sem erros de lint nos arquivos modificados.

- [ ] **Step 5: Commit**

```bash
git add src/app/(internal)/layout.tsx
git rm src/components/layout/Header.tsx
git commit -m "feat: refactor InternalLayout to use InternalShell, remove Header server component"
```

---

## Task 5: Criar PortalNav e refatorar PortalLayout

Extrair a navbar do portal para um Client Component `PortalNav` que gerencia `mobileMenuOpen`. Simplificar `PortalLayout` para passar dados como props.

**Files:**
- Create: `src/app/(portal)/PortalNav.tsx`
- Modify: `src/app/(portal)/layout.tsx`

- [ ] **Step 1: Criar `src/app/(portal)/PortalNav.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/(auth)/login/actions'
import { Menu, X } from 'lucide-react'

interface NavItem {
  href: string
  label: string
}

interface PortalNavProps {
  logoUrl: string | null
  appName: string | null
  contactName: string | null
  isPortalUser: boolean
  navItems: NavItem[]
  whatsapp: string | null
}

export function PortalNav({
  logoUrl,
  appName,
  contactName,
  isPortalUser,
  navItems,
  whatsapp,
}: PortalNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <>
      <nav className="border-b bg-card relative">
        <div className="px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href={isPortalUser ? '/portal/chamados' : '/portal/login'}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain max-w-[160px]" />
                : <span className="font-semibold text-sm">{appName || 'Portal do Cliente'}</span>
              }
            </Link>
            {isPortalUser && (
              <div className="hidden sm:flex items-center gap-1">
                {navItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isPortalUser && (
              <>
                <span className="text-sm text-muted-foreground hidden sm:block">{contactName}</span>
                <form action={logoutAction} className="hidden sm:block">
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                    Sair
                  </button>
                </form>
                <button
                  type="button"
                  className="sm:hidden p-1 rounded-md hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  aria-label="Menu"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </>
            )}
          </div>
        </div>

        {isPortalUser && mobileMenuOpen && (
          <div className="sm:hidden absolute top-full left-0 right-0 bg-card border-b z-50">
            <div className="px-4 py-2 space-y-1">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="block px-3 py-2.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                >
                  {label}
                </Link>
              ))}
              <div className="pt-2 pb-1 border-t mt-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{contactName}</span>
                <form action={logoutAction}>
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                    Sair
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </nav>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 bg-green-500 text-white rounded-full px-4 py-3 shadow-lg hover:bg-green-600 transition-colors flex items-center gap-2"
          aria-label="WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="text-sm font-medium whitespace-nowrap">Precisa de ajuda?</span>
        </a>
      )}
    </>
  )
}
```

- [ ] **Step 2: Reescrever `src/app/(portal)/layout.tsx`**

Substituir todo o conteúdo por:

```tsx
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PortalNav } from './PortalNav'
import type { Database } from '@/types/database'
import type { ReactNode } from 'react'

type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()

  const [{ data: settings }, { data: { user } }] = await Promise.all([
    serviceSupabase.from('platform_settings').select('*').single() as unknown as Promise<{ data: PlatformSettings | null }>,
    supabase.auth.getUser(),
  ])

  let contactName: string | null = null
  let isContractResponsible = false
  if (user) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('full_name, is_contract_responsible')
      .eq('user_id', user.id)
      .single() as { data: { full_name: string; is_contract_responsible: boolean } | null }
    contactName = contact?.full_name ?? null
    isContractResponsible = contact?.is_contract_responsible ?? false
  }

  const isPortalUser = !!user && !!contactName

  const allNavItems = [
    { href: '/portal/chamados', label: 'Chamados', restricted: false },
    { href: '/portal/mudancas', label: 'Mudanças', restricted: true },
    { href: '/portal/conhecimento', label: 'Conhecimento', restricted: false },
    { href: '/portal/relatorios', label: 'Relatórios', restricted: true },
  ]

  const navItems = allNavItems
    .filter(item => !item.restricted || isContractResponsible)
    .map(({ href, label }) => ({ href, label }))

  return (
    <div className="min-h-screen bg-background">
      <PortalNav
        logoUrl={(settings as any)?.logo_light_url ?? null}
        appName={(settings as any)?.company_name ?? null}
        contactName={contactName}
        isPortalUser={isPortalUser}
        navItems={navItems}
        whatsapp={settings?.company_whatsapp ?? null}
      />
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "portal\|PortalNav"
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/(portal)/PortalNav.tsx src/app/(portal)/layout.tsx
git commit -m "feat: extract PortalNav client component with mobile hamburger menu"
```

---

## Task 6: Adicionar cards mobile ao TicketList

Renderização condicional CSS: cards visíveis abaixo de `md`, tabela visível em `md` e acima.

**Files:**
- Modify: `src/components/tickets/TicketList.tsx`

- [ ] **Step 1: Reescrever `src/components/tickets/TicketList.tsx`**

Substituir todo o conteúdo do arquivo por:

```tsx
import Link from 'next/link'
import { TicketStatusBadge } from './TicketStatusBadge'
import { SLAIndicator } from './SLAIndicator'
import { fmtDate, fmtDateTimeShort } from '@/lib/format-date'
import type { TicketStatus, TicketPriority } from '@/types/database'

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Média', baixa: '🟢 Baixa',
}

interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; updated_at: string; sla_starts_at: string | null
  sla_deadline: string | null; sla_first_response_at: string | null
  sla_met: boolean | null; sla_paused_at: string | null; scheduled_at: string | null
  channel?: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
  profiles: { full_name: string } | null
}

function TicketCard({ t }: { t: Ticket }) {
  return (
    <Link href={`/chamados/${t.id}`} className="block border rounded-md p-3 hover:bg-muted/30 transition-colors">
      <p className="font-medium text-sm truncate">
        #{t.number} — {t.title}
      </p>
      {t.channel === 'recorrente' && (
        <span className="text-xs text-blue-600 font-medium">🔁 Recorrente</span>
      )}
      {t.scheduled_at && (
        <p className="text-xs text-blue-600">📅 {fmtDateTimeShort(t.scheduled_at)}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <TicketStatusBadge status={t.status} />
        <span className="text-xs">{PRIORITY_LABELS[t.priority]}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {t.companies?.name ?? '—'}
        {t.profiles?.full_name ? ` · ${t.profiles.full_name}` : ''}
      </p>
      <div className="flex items-center justify-between mt-1.5">
        <SLAIndicator
          createdAt={t.created_at}
          updatedAt={t.updated_at}
          slaStartsAt={t.sla_starts_at ?? null}
          slaDeadline={t.sla_deadline}
          slaFirstResponseAt={t.sla_first_response_at}
          slaMet={t.sla_met}
          slaPausedAt={t.sla_paused_at}
          status={t.status}
        />
        <span className="text-xs text-muted-foreground">{fmtDateTimeShort(t.created_at)}</span>
      </div>
    </Link>
  )
}

export function TicketList({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return (
      <p className="p-6 text-center text-muted-foreground text-sm">
        Nenhum chamado encontrado.
      </p>
    )
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {tickets.map(t => <TicketCard key={t.id} t={t} />)}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Título</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Prioridade</th>
              <th className="px-3 py-2 text-left font-medium">Empresa</th>
              <th className="px-3 py-2 text-left font-medium">Analista</th>
              <th className="px-3 py-2 text-left font-medium">SLA</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Aberto em</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">#{t.number}</td>
                <td className="px-3 py-2 max-w-[260px]">
                  <Link href={`/chamados/${t.id}`} className="hover:underline font-medium text-sm leading-snug line-clamp-2">{t.title}</Link>
                  {t.channel === 'recorrente' && (
                    <span className="inline-flex items-center text-xs text-blue-600 font-medium mt-0.5">
                      🔁 Recorrente
                    </span>
                  )}
                  {t.scheduled_at && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      📅 {fmtDateTimeShort(t.scheduled_at)}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2"><TicketStatusBadge status={t.status} /></td>
                <td className="px-3 py-2 whitespace-nowrap">{PRIORITY_LABELS[t.priority]}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{t.companies?.name ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {t.profiles?.full_name ?? <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 py-2">
                  <SLAIndicator createdAt={t.created_at} updatedAt={t.updated_at} slaStartsAt={t.sla_starts_at ?? null} slaDeadline={t.sla_deadline} slaFirstResponseAt={t.sla_first_response_at} slaMet={t.sla_met} slaPausedAt={t.sla_paused_at} status={t.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "TicketList\|TicketCard"
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/tickets/TicketList.tsx
git commit -m "feat: add mobile card view to TicketList (cards below md, table above)"
```

---

## Task 7: Ajustes no Dashboard (datas ocultas no mobile)

Tornar as datas secundárias de cada item do dashboard invisíveis no mobile para evitar layout apertado.

**Files:**
- Modify: `src/app/(internal)/dashboard/page.tsx`

- [ ] **Step 1: Substituir `whitespace-nowrap` por `hidden sm:inline` nas spans de data/hora**

Há quatro ocorrências de `text-xs text-muted-foreground whitespace-nowrap` que representam datas de items de lista. Aplicar a mudança em cada uma:

Localizar e substituir (são 4 ocorrências de datas em items do dashboard):

**Falhas recentes — data:**
```tsx
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </span>
```
→
```tsx
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {formatDateTime(log.created_at)}
                    </span>
```

**Chamados agendados — data:**
```tsx
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.scheduled_at ? formatDateTime(t.scheduled_at) : '—'}
                        </span>
```
→
```tsx
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {t.scheduled_at ? formatDateTime(t.scheduled_at) : '—'}
                        </span>
```

**Próximas reuniões — data:**
```tsx
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(meeting.scheduled_at)}
                    </span>
```
→
```tsx
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {formatDateTime(meeting.scheduled_at)}
                    </span>
```

- [ ] **Step 2: Ajustar padding raiz do dashboard**

Localizar:
```tsx
    <div className="space-y-8 p-6">
```

Substituir por:
```tsx
    <div className="space-y-6 sm:space-y-8">
```

(O padding vem do `<main>` do InternalShell que já foi ajustado para `p-4 md:p-6`.)

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "dashboard"
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/dashboard/page.tsx
git commit -m "feat: hide secondary dates on mobile in dashboard, adjust spacing"
```

---

## Task 8: Ajustes nos filtros de Chamados

Tornar os `<select>` e o campo de busca full-width no mobile.

**Files:**
- Modify: `src/app/(internal)/chamados/page.tsx`

- [ ] **Step 1: Adicionar `w-full sm:w-auto` no Input de busca**

Localizar:
```tsx
        <Input name="q" defaultValue={q} placeholder="Buscar por título, número..." className="max-w-sm" />
```

Substituir por:
```tsx
        <Input name="q" defaultValue={q} placeholder="Buscar por título, número..." className="w-full sm:max-w-sm" />
```

- [ ] **Step 2: Adicionar `w-full sm:w-auto` em todos os `<select>` do form**

Localizar os 5 selects do form. Cada um tem `className="border rounded-md px-3 py-2 text-sm bg-background"`. Adicionar `w-full sm:w-auto` em todos:

```tsx
        <select name="status" defaultValue={status ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background w-full sm:w-auto">
```

```tsx
        <select name="priority" defaultValue={priority ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background w-full sm:w-auto">
```

```tsx
        <select name="assigned_to" defaultValue={assigned_to ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background w-full sm:w-auto">
```

```tsx
        <select name="company_id" defaultValue={company_id ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background w-full sm:w-auto">
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "chamados"
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/chamados/page.tsx
git commit -m "feat: make chamados filters full-width on mobile"
```

---

## Task 9: Verificação visual no browser

Confirmar todos os critérios de aceitação do spec no browser, com DevTools em viewport 375px (iPhone SE).

**Files:** nenhum (verificação apenas)

- [ ] **Step 1: Iniciar o servidor de dev**

```bash
npm run dev
```

- [ ] **Step 2: Abrir DevTools em 375px e verificar cada critério**

Abrir `http://localhost:3000/dashboard` com DevTools → Toggle device toolbar → iPhone SE (375x667).

Checklist:
- [ ] Sidebar **não aparece** ao carregar `/dashboard` no mobile
- [ ] Botão hamburger (☰) aparece no canto esquerdo do header no mobile
- [ ] Clicar no hamburger **abre** a sidebar como overlay (slide da esquerda)
- [ ] Backdrop escuro aparece sobre o conteúdo quando sidebar está aberta
- [ ] Clicar no backdrop **fecha** a sidebar
- [ ] Navegar para `/chamados` fecha a sidebar automaticamente
- [ ] Em `/chamados`, os filtros ocupam a **linha inteira** no mobile
- [ ] Em `/chamados`, a lista exibe **cards** (não tabela) no mobile
- [ ] Cada card tem: número, título, status badge, prioridade, empresa, SLA, data
- [ ] No **desktop** (1280px), layout continua igual ao de antes (tabela, sidebar fixa)
- [ ] Portal (`/portal/chamados`): navbar mostra botão ☰ no mobile
- [ ] Clicar no ☰ do portal abre o menu dropdown com os links empilhados
- [ ] Navegar por um link do menu dropdown do portal fecha o menu

- [ ] **Step 3: Commit final se ajustes forem necessários**

Se ajustes visuais menores forem feitos durante a verificação:

```bash
git add -p
git commit -m "fix: visual adjustments after mobile verification"
```
