# GMUD Pré-Aprovada — Design Spec

## Goal

Permitir que usuários `admin` e `gestor` criem uma GMUD já no status `aprovada`, sem enviar solicitação de aprovação por e-mail. O responsável pela pré-aprovação é registrado para fins de auditoria.

## Architecture

Desvio condicional dentro do fluxo existente de criação de GMUD. Nenhum novo status é adicionado ao sistema — a GMUD pré-aprovada entra diretamente em `aprovada` e segue o fluxo normal a partir daí (Iniciar Execução → Concluir / Reverter).

A rastreabilidade é mantida inserindo um registro em `change_approvals` com `status = 'aprovado'` e `approved_at = now()` na própria criação, sem enviar token por e-mail.

## Tech Stack

- Next.js 16 App Router — Server Actions, `useActionState`
- Supabase — `createClient` (leitura/form), `createServiceClient` (insert em `change_approvals`)
- Zod v4 — validação com `superRefine`
- shadcn/ui — Checkbox, Badge, Input

---

## Data Model

### Migration

```sql
alter table change_requests
  add column is_pre_approved boolean not null default false;
```

Nenhuma outra coluna é adicionada. O e-mail do responsável pela pré-aprovação é armazenado em `change_approvals.approver_email` (campo já existente), com `status = 'aprovado'` e `approved_at` preenchido na criação.

---

## Validation Schema (`src/lib/validations/change-request.ts`)

Adicionar ao `changeRequestSchema` existente:

```ts
is_pre_approved: z.boolean().default(false),
pre_approval_email: z.string().email().optional(),
```

Adicionar refinamento ao final do schema:

```ts
.superRefine((data, ctx) => {
  if (data.is_pre_approved && !data.pre_approval_email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe o e-mail do responsável pela pré-aprovação',
      path: ['pre_approval_email'],
    })
  }
})
```

---

## Form (`src/components/mudancas/ChangeRequestForm.tsx`)

### Nova prop

```ts
userRole: string
```

Passada pela page `src/app/(internal)/mudancas/nova/page.tsx`, que já lê o perfil do usuário via Supabase.

### Comportamento

- **Checkbox "GMUD pré-aprovada"** — renderizado somente quando `userRole === 'admin' || userRole === 'gestor'`.
- Quando checkbox **desmarcado**: comportamento atual inalterado.
- Quando checkbox **marcado**:
  - Exibe campo "E-mail do responsável pela pré-aprovação" (input email, obrigatório).
  - Label do botão de submit muda para **"Criar como aprovada"**.
- Os valores `is_pre_approved` e `pre_approval_email` são incluídos no `FormData` enviado à action.

---

## Server Action (`src/app/(internal)/mudancas/actions.ts` — `createChangeRequestAction`)

### Fluxo normal (inalterado)

```
parse FormData → insert change_requests { status: 'rascunho' }
→ revalidatePath('/mudancas')
→ return { success: true, id: changeRequest.id }
```

### Fluxo pré-aprovada

```
parse FormData (is_pre_approved = true)
→ insert change_requests { status: 'aprovada', is_pre_approved: true }
→ insert change_approvals {
     change_request_id: <id>,
     approver_email: pre_approval_email,
     status: 'aprovado',
     approved_at: now(),
     token: crypto.randomUUID()   -- satisfaz NOT NULL, nunca enviado
   }
→ revalidatePath('/mudancas')
→ return { success: true, id: changeRequest.id }
```

O insert em `change_approvals` usa `createServiceClient()` (mesmo padrão do `submitForApprovalAction` existente). Nenhum e-mail é enviado.

---

## Detail View (`src/components/mudancas/ChangeRequestDetail.tsx`)

### Quando `is_pre_approved = true`

**1. Badge adicional ao lado do status principal:**

```
● Aprovada   [Pré-aprovada]
```

Badge com `variant="secondary"` e texto "Pré-aprovada".

**2. Bloco informativo no lugar do botão "Solicitar Aprovação":**

```
✓ Pré-aprovada por fulano@empresa.com em 27/05/2026 14:32
```

Dados vindos do registro em `change_approvals` (query já feita na página de detalhe via `src/app/(internal)/mudancas/[id]/page.tsx`).

O `[id]/page.tsx` já busca `change_approvals` — garantir que `approved_at` e `approver_email` estejam no select.

### Demais ações

Inalteradas. Como a GMUD entra em `aprovada`, o `ChangeRequestDetail` já exibe corretamente "Iniciar Execução" a partir desse status.

---

## Files Changed / Created

| Arquivo | Tipo | O que muda |
|---|---|---|
| `supabase/migrations/<timestamp>_gmud_pre_aprovada.sql` | Criar | `ALTER TABLE` adicionando `is_pre_approved` |
| `src/lib/validations/change-request.ts` | Modificar | Campos `is_pre_approved`, `pre_approval_email`, `superRefine` |
| `src/components/mudancas/ChangeRequestForm.tsx` | Modificar | Nova prop `userRole`, checkbox, campo de e-mail, label do botão |
| `src/app/(internal)/mudancas/nova/page.tsx` | Modificar | Ler `userRole` do perfil e passar para `ChangeRequestForm` |
| `src/app/(internal)/mudancas/actions.ts` | Modificar | Desvio condicional: status + insert `change_approvals` |
| `src/app/(internal)/mudancas/[id]/page.tsx` | Modificar | Garantir `approved_at` no select de `change_approvals` |
| `src/components/mudancas/ChangeRequestDetail.tsx` | Modificar | Badge "Pré-aprovada" + bloco informativo |

---

## Out of Scope

- Portal do cliente: sem alterações (clientes veem apenas o status, não o fluxo de aprovação).
- Relatórios: sem alterações (GMUDs pré-aprovadas aparecem como `aprovada` normalmente).
- E-mails: nenhum novo template necessário.
- Analistas: não têm acesso à funcionalidade.
