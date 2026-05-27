# Último Logon em Usuários e Contatos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar e exibir data/hora do último login para usuários internos (tabela `profiles`) e contatos do portal (tabela `contacts`).

**Architecture:** Adicionar coluna `last_login_at timestamptz` em ambas as tabelas. O `loginAction` em `src/app/(auth)/login/actions.ts` já distingue os dois casos (tem `profile` = interno, sem = portal). Após o login, fazer um UPDATE na linha correspondente com `now()`. Exibir o valor nas telas de listagem de usuários (`/usuarios`) e contatos (`/clientes/[id]/contatos`).

**Tech Stack:** Next.js 16 App Router, Supabase (postgres), Server Actions

---

## Mapa de Arquivos

**Criar:**
- `supabase/migrations/20260527000006_last_login_at.sql` — colunas `last_login_at`

**Modificar:**
- `src/app/(auth)/login/actions.ts` — registrar `last_login_at` após login bem-sucedido
- `src/components/users/UserList.tsx` — adicionar coluna "Último acesso"
- `src/components/clients/ContactList.tsx` — adicionar coluna "Último acesso"

---

## Task 1: Migration — Coluna last_login_at

**Files:**
- Create: `supabase/migrations/20260527000006_last_login_at.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- supabase/migrations/20260527000006_last_login_at.sql
alter table public.profiles
  add column if not exists last_login_at timestamptz;

alter table public.contacts
  add column if not exists last_login_at timestamptz;
```

- [ ] **Step 2: Aplicar no Supabase remoto**

```bash
npx supabase db push
```

Expected: migration aplicada sem erros.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260527000006_last_login_at.sql
git commit -m "feat: coluna last_login_at em profiles e contacts"
```

---

## Task 2: Registrar last_login_at no loginAction

**Files:**
- Modify: `src/app/(auth)/login/actions.ts`

O arquivo atual tem `loginAction` que após autenticar:
1. Busca o `profile` do usuário
2. Se sem profile → redirect `/portal/chamados` (usuário de portal / contato)
3. Se tem profile → redirect `/dashboard` (usuário interno)

Precisamos adicionar o UPDATE de `last_login_at` em ambos os caminhos, usando `createServiceClient()` para ter permissão de escrita (RLS pode bloquear auto-update).

- [ ] **Step 1: Atualizar loginAction**

```typescript
// src/app/(auth)/login/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validations/auth'

export async function loginAction(prevState: { error: string } | null, formData: FormData) {
  const raw = { email: formData.get('email'), password: formData.get('password') }
  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  if (authData.user) {
    const serviceSupabase = await createServiceClient()
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (!profile) {
      // Usuário de portal (contato) — registrar last_login_at na tabela contacts
      await serviceSupabase
        .from('contacts')
        .update({ last_login_at: new Date().toISOString() } as never)
        .eq('user_id', authData.user.id)
      redirect('/portal/chamados')
    }

    // Usuário interno — registrar last_login_at na tabela profiles
    await serviceSupabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() } as never)
      .eq('id', authData.user.id)
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function loginWithMicrosoftAction() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile',
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })
  if (error || !data.url) {
    return { error: 'Erro ao iniciar login com Microsoft. Tente novamente.' }
  }
  redirect(data.url)
}
```

- [ ] **Step 2: Testar**

1. Fazer login com um usuário interno
2. Verificar no Supabase (tabela `profiles`) que `last_login_at` foi atualizado
3. Fazer login com um usuário do portal
4. Verificar no Supabase (tabela `contacts`) que `last_login_at` foi atualizado

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/login/actions.ts
git commit -m "feat: registrar last_login_at no login"
```

---

## Task 3: Exibir last_login_at na Lista de Usuários Internos

**Files:**
- Modify: `src/components/users/UserList.tsx`

O componente usa um layout de cards (não tabela). Cada usuário tem um card com `<div className="flex items-center justify-between">`. O nome do usuário fica na esquerda (`<p className="font-medium">{user.full_name}</p>`), e as ações na direita. O tipo `Profile` usa `Database['public']['Tables']['profiles']['Row']`. Como a migration adiciona `last_login_at` e os tipos Supabase não são regenerados automaticamente, usar cast `(user as any).last_login_at`.

- [ ] **Step 1: Adicionar import de fmtDateTime**

No topo de `src/components/users/UserList.tsx`, adicionar:
```typescript
import { fmtDateTime } from '@/lib/format-date'
```

- [ ] **Step 2: Adicionar "Último acesso" abaixo do nome do usuário no card**

Localizar o bloco `<div>` que contém `<p className="font-medium">{user.full_name}</p>` (dentro do `else` do editingId). Adicionar logo abaixo:

```tsx
<div>
  <p className="font-medium">{user.full_name}</p>
  <p className="text-xs text-muted-foreground">
    Último acesso:{' '}
    {(user as any).last_login_at
      ? fmtDateTime((user as any).last_login_at)
      : 'Nunca'}
  </p>
</div>
```

- [ ] **Step 3: Verificar visualmente**

Acessar `/usuarios` e confirmar que o texto "Último acesso: ..." aparece abaixo de cada nome.

- [ ] **Step 4: Commit**

```bash
git add src/components/users/UserList.tsx
git commit -m "feat: exibir último acesso na lista de usuários"
```

---

## Task 4: Exibir last_login_at na Lista de Contatos

**Files:**
- Modify: `src/components/clients/ContactList.tsx`

O componente também usa cards. No modo de exibição (não edição), cada contato tem um `<div className="flex items-start justify-between">` com nome, email, telefone e departamento na esquerda. O tipo `Contact` usa `Database['public']['Tables']['contacts']['Row']`. Usar cast `(contact as any).last_login_at`.

- [ ] **Step 1: Adicionar import de fmtDateTime**

No topo de `src/components/clients/ContactList.tsx`, adicionar:
```typescript
import { fmtDateTime } from '@/lib/format-date'
```

- [ ] **Step 2: Adicionar "Último acesso" no card de cada contato**

Localizar o bloco do modo de exibição (após `{editingId === contact.id ? ... : <>...`) e encontrar a `<div>` com nome, email, telefone e departamento. Adicionar logo após o departamento:

```tsx
<p className="font-medium">{contact.full_name}</p>
<p className="text-sm text-muted-foreground">{contact.email}</p>
{contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
{contact.department && <p className="text-xs text-muted-foreground">{contact.department}</p>}
<p className="text-xs text-muted-foreground">
  Último acesso:{' '}
  {(contact as any).last_login_at
    ? fmtDateTime((contact as any).last_login_at)
    : 'Nunca'}
</p>
```

- [ ] **Step 3: Verificar visualmente**

Acessar `/clientes/[id]/contatos` e confirmar que "Último acesso: ..." aparece em cada card de contato.

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/ContactList.tsx
git commit -m "feat: exibir último acesso na lista de contatos"
```

---

## Task 5: Build e Deploy

- [ ] **Step 1: Rodar build**

```bash
npm run build
```

Expected: sem erros.

- [ ] **Step 2: Push**

```bash
git push origin main
```
