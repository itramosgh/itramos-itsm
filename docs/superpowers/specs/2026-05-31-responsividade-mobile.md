# Spec: Responsividade Mobile — ITSM ITRAMOS

**Data:** 2026-05-31  
**Status:** Aprovado

---

## Contexto

O sistema ITSM possui duas interfaces distintas: a **interface interna** (analistas, gestores, admins) e o **portal do cliente**. Nenhuma das duas foi projetada para mobile. O objetivo desta iteração é tornar ambas utilizáveis em dispositivos móveis sem reescrever a aplicação.

---

## Escopo

### Dentro do escopo

- Sidebar interna: drawer/hamburger no mobile
- Header interno: botão hamburger no mobile
- `TicketList`: cards no mobile, tabela no desktop
- Portal: navbar com menu dropdown no mobile
- Dashboard interno: ajustes de layout nas seções com `flex justify-between`
- Filtros de chamados: largura dos `<select>` no mobile
- Padding do `<main>` interno: `p-4 md:p-6`

### Fora do escopo

- Formulários complexos (novo chamado interno, nova GMUD, editor de templates de e-mail) — ficam usáveis via scroll horizontal
- Tabelas de outras seções (clientes, usuários, tarefas, mudanças) — scroll horizontal mantido
- Otimizações de performance para mobile
- PWA / instalação como app

---

## Design

### 1. Layout interno — Sidebar + Header

**Problema:** `Sidebar` tem `w-64` fixo sem breakpoint. Ocupa espaço em telas pequenas e não tem forma de fechar.

**Solução:**

**Estado compartilhado:**  
`InternalLayout` vira `'use client'` e gerencia `useState<boolean>` para `sidebarOpen`. Passa `isOpen` e `onClose` para `Sidebar`, e `onOpen` para `Header`.

**Sidebar (`src/components/layout/Sidebar.tsx`):**
- Desktop (`md:` e acima): `md:relative md:translate-x-0 md:flex` — comportamento atual
- Mobile (abaixo de `md`): `fixed inset-y-0 left-0 z-50 w-64` com `transform transition-transform duration-200`
  - Fechada: `-translate-x-full`
  - Aberta: `translate-x-0`
- Backdrop: `<div>` com `fixed inset-0 bg-black/40 z-40 md:hidden` que aparece quando `isOpen=true` e chama `onClose` ao clicar
- Fecha automaticamente no `useEffect` que observa `pathname` (já existe no componente)

**Header (`src/components/layout/Header.tsx`):**
- Vira `'use client'` e recebe prop `onMenuOpen: () => void`
- Botão hamburger (`Menu` do lucide, `h-5 w-5`) aparece na esquerda com `md:hidden`
- O `<div />` placeholder à esquerda do header atual é substituído pelo botão

**`InternalLayout` (`src/app/(internal)/layout.tsx`):**
- Vira `'use client'`
- `useState` para `sidebarOpen`
- Passa props para `Sidebar` e `Header`
- O `Header` (async Server Component atualmente) precisa ser refatorado: a busca de dados do perfil sobe para o layout ou é extraída para um subcomponente server

> **Detalhe de arquitetura:** `Header` atualmente é um Server Component async que busca o perfil do usuário. Para receber `onMenuOpen` (prop de função client), ele precisa virar Client Component. A busca de dados pode ser movida para um Server Component wrapper que passa os dados como props para o Header Client.

---

### 2. TicketList — Mobile Cards

**Arquivo:** `src/components/tickets/TicketList.tsx`

**Estrutura:**

```
<div>
  {/* Mobile: cards — visível abaixo de md */}
  <div className="md:hidden space-y-2">
    {tickets.map(t => <TicketCard key={t.id} ticket={t} />)}
  </div>

  {/* Desktop: tabela — visível em md e acima */}
  <div className="hidden md:block rounded-md border overflow-x-auto">
    <table>...</table>  {/* tabela atual sem alteração */}
  </div>
</div>
```

**Card layout (mobile):**
```
┌──────────────────────────────────────┐
│ #123 — Título do chamado (truncado)  │
│ [Status badge]  [Prioridade badge]   │
│ Empresa · Analista                   │
│ SLA indicator          Aberto em ... │
└──────────────────────────────────────┘
```

Card usa `border rounded-md p-3 hover:bg-muted/30` (mesmo padrão dos cards do portal).  
Link envolve o card inteiro com `href="/chamados/{id}"`.

---

### 3. Portal do cliente — Navbar mobile

**Arquivo:** `src/app/(portal)/layout.tsx`

**Problema:** itens de navegação (`Chamados`, `Mudanças`, `Conhecimento`, `Relatórios`) ficam inline e colapsar em telas pequenas.

**Solução:** o layout do portal atualmente é um Server Component async que busca configurações, dados do usuário e contato. Para adicionar estado client, aplicar o mesmo padrão do layout interno: extrair um `PortalNav` Client Component que recebe as props já resolvidas (settings, contactName, navItems, isPortalUser) e gerencia `mobileMenuOpen` internamente. O `PortalLayout` Server Component continua fazendo os fetches e passa os dados para `PortalNav`.

- Desktop: comportamento atual (`flex items-center gap-1` para os itens)
- Mobile: itens somem (`hidden sm:flex`), aparece botão hamburger (`sm:hidden`)
- Menu dropdown: `absolute top-14 left-0 right-0 bg-card border-b z-50` com os itens empilhados verticalmente, fecha ao clicar em qualquer link (via `usePathname` effect que detecta mudança de rota)

---

### 4. Dashboard — ajustes pontuais

**Arquivo:** `src/app/(internal)/dashboard/page.tsx`

Cada seção tem o padrão:
```jsx
<div className="flex items-center justify-between px-4 py-3 gap-4">
  <div className="min-w-0 flex-1">...</div>
  <div className="flex items-center gap-2 shrink-0">
    <Badge>...</Badge>
    <span className="text-xs whitespace-nowrap">data</span>
  </div>
</div>
```

No mobile a data e o badge podem ficar apertados. Ajuste: trocar `whitespace-nowrap` na data por `hidden sm:inline` nos itens secundários (analista, data), mantendo apenas status/badge visível no mobile.

Cabeçalho de seções com `flex items-center justify-between` e link "Ver todos" — já funciona bem.

---

### 5. Filtros de chamados

**Arquivo:** `src/app/(internal)/chamados/page.tsx`

Os `<select>` nativos têm `min-content` de ~180px e ficam apertados no mobile.

Ajuste: adicionar `w-full sm:w-auto` nos selects e no `Input` de busca para que no mobile ocupem a linha inteira.

---

### 6. Padding do main

**Arquivo:** `src/app/(internal)/layout.tsx`

Trocar `p-6` por `p-4 md:p-6` no `<main>` para ganhar 8px de margem em telas pequenas.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/app/(internal)/layout.tsx` | Vira client, gerencia `sidebarOpen`, passa props |
| `src/components/layout/Sidebar.tsx` | Overlay mobile, backdrop, fecha ao navegar |
| `src/components/layout/Header.tsx` | Refatoração client/server, botão hamburger |
| `src/components/tickets/TicketList.tsx` | Cards mobile + tabela desktop |
| `src/app/(portal)/layout.tsx` | Menu mobile dropdown |
| `src/app/(internal)/dashboard/page.tsx` | Ocultar colunas secundárias no mobile |
| `src/app/(internal)/chamados/page.tsx` | `w-full sm:w-auto` nos filtros |

---

## Critérios de aceitação

- [ ] Sidebar interna não aparece no mobile por padrão
- [ ] Botão hamburger abre/fecha a sidebar como overlay
- [ ] Clicar fora da sidebar (backdrop) fecha o menu
- [ ] Navegar para outra rota fecha a sidebar automaticamente
- [ ] `TicketList` exibe cards no mobile e tabela no desktop
- [ ] Portal tem menu hamburger funcional no mobile
- [ ] Dashboard legível em 375px (iPhone SE)
- [ ] Filtros de chamados ocupam linha inteira no mobile
- [ ] Nenhuma regressão no desktop
