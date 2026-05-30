# Design: Melhorias nos Comunicados de Feriado

**Data:** 2026-05-30  
**Status:** Aprovado

## Contexto

O sistema já possui cron automático de avisos de feriado (`/api/cron/holiday-notice`) que envia e-mails para contatos responsáveis de contratos ativos N dias antes de cada feriado. A tabela `holiday_notice_sent` já rastreia cada envio. Este design adiciona visibilidade, controle manual e configurabilidade de BCC à funcionalidade existente.

---

## Requisitos

1. **Validação de envio** — exibir na página `/configuracoes/feriados` quantos avisos foram enviados por feriado, com detalhamento por contato
2. **Envio manual por feriado** — botão por linha para disparar avisos de um feriado específico imediatamente, independente da janela de dias configurada
3. **E-mails BCC configuráveis** — campo em `/configuracoes` para definir um ou mais endereços que sempre recebem cópia de cada aviso enviado
4. **Logs** — envios manuais registrados em `system_logs`, visíveis em `/configuracoes/logs`

---

## 1. Banco de Dados

### Migration nova

```sql
-- Adicionar campo de BCC em platform_settings
ALTER TABLE platform_settings
  ADD COLUMN holiday_notice_bcc_emails text[] NOT NULL DEFAULT '{}';
```

Nenhuma outra mudança de schema. `holiday_notice_sent` já suporta rastreamento completo.

---

## 2. Lógica Compartilhada

### Novo arquivo: `src/lib/holiday-notice.ts`

Extrai o núcleo de envio do cron para uma função reutilizável:

```typescript
export async function sendHolidayNoticesForHoliday(
  holidayId: string,
  mode: 'pending' | 'all',
  serviceClient: SupabaseClient,
  triggeredBy: 'cron' | 'manual' = 'cron'
): Promise<{ sent: number; skipped: number }>
```

**Fluxo interno:**
1. Busca o feriado por `holidayId`
2. Busca contatos com `is_contract_responsible = true`, `is_active = true`, contratos com `status = 'ativo'`
3. Se `mode = 'pending'`: exclui contatos que já têm registro em `holiday_notice_sent` para este feriado
4. Se `mode = 'all'`: remove registros anteriores de `holiday_notice_sent` para este feriado antes de reinserir (evita violação da constraint unique)
5. Lê `holiday_notice_bcc_emails` de `platform_settings`
6. Para cada contato: chama `sendEmailFromTemplate('aviso_feriado', email, vars, { bcc: bccEmails })`
7. Insere registros em `holiday_notice_sent`
8. Registra em `system_logs`:
   - `category: 'cron_job'`
   - `description`: `"Aviso de feriado '{nome}' disparado {manualmente|pelo cron} — {sent} enviados, {skipped} ignorados"`

### Ajuste em `src/lib/email-template-sender.ts`

Adicionar suporte a `bcc` nas opções de envio:

```typescript
export async function sendEmailFromTemplate(
  slug: string,
  to: string,
  vars: Record<string, string>,
  options?: { bcc?: string[] }
): Promise<void>
```

### Refatoração do cron

`src/app/api/cron/holiday-notice/route.ts` passa a:
1. Buscar feriados na janela configurada
2. Para cada feriado, chamar `sendHolidayNoticesForHoliday(id, 'pending', serviceClient, 'cron')`

Sem mudança de comportamento externo.

---

## 3. Configurações de Plataforma

### `src/lib/validations/settings.ts`

```typescript
holiday_notice_bcc_emails: z.array(z.string().email()).default([])
```

### `src/components/settings/PlatformSettingsForm.tsx`

Novo campo na seção de e-mail/notificações:

- **Label:** "E-mails BCC para avisos de feriado"
- **Descrição:** "Estes endereços recebem cópia oculta de cada aviso de feriado enviado. Separe por vírgula ou pressione Enter."
- **Componente:** textarea com parse por vírgula ou quebra de linha; cada endereço aparece como chip removível abaixo do campo (implementação simples com estado local, sem dependência externa)
- **Validação inline:** formato de e-mail validado ao adicionar cada endereço

---

## 4. Server Actions em `/configuracoes/feriados`

Novos exports em `src/app/(internal)/configuracoes/feriados/actions.ts`:

### `getHolidayNoticeSummaryAction()`
Retorna contagem de envios por `holiday_id`:
```typescript
// { [holidayId]: number }
```
Chamado no Server Component da página para popular a coluna "Avisos".

### `getHolidayNoticeDetailsAction(holidayId: string)`
Retorna lista de envios com join em `contacts`:
```typescript
{
  contact_id: string
  contact_name: string
  company_name: string
  email: string
  sent_at: string
}[]
```

### `sendHolidayNoticesAction(holidayId: string, mode: 'pending' | 'all')`
- Verifica autenticação + role (admin ou gestor)
- Chama `sendHolidayNoticesForHoliday(holidayId, mode, serviceClient, 'manual')`
- Retorna `{ sent: number; skipped: number }`

---

## 5. UI — `/configuracoes/feriados`

### Tabela de feriados

Nova coluna **"Avisos"** após "Tipo":
- Exibe badge clicável com contagem: `12 enviados` (verde) ou `Não enviado` (cinza/neutro)
- Clique abre o Sheet de detalhes

### Botão "Enviar avisos" (por linha)

Ícone de envio (ex: `Send` do lucide-react) na coluna de ações ao lado de "Remover".

**Comportamento ao clicar:**

- Se `sent = 0`: `AlertDialog` simples
  > "Enviar aviso do feriado '{nome}' para todos os responsáveis de contratos ativos?"  
  > [Cancelar] [Enviar]

- Se `sent > 0`: `AlertDialog` com escolha
  > "{N} contatos já receberam este aviso. Como deseja prosseguir?"  
  > [Cancelar] [Apenas os faltantes] [Reenviar para todos]

Após confirmação: chama `sendHolidayNoticesAction`, exibe toast `"{sent} aviso(s) enviado(s)"` ou erro, e revalida a coluna "Avisos".

### Sheet de detalhes

Componente `HolidayNoticeDetailsSheet`:
- Título: `"Avisos enviados — {nome do feriado} ({data})"`
- Tabela: Contato | Empresa | E-mail | Enviado em
- Estado vazio: `"Nenhum aviso enviado ainda para este feriado."`
- Carrega via `getHolidayNoticeDetailsAction(holidayId)` ao abrir

---

## 6. Logs

Os registros de envio manual aparecem automaticamente em `/configuracoes/logs` (tabela `system_logs`) com:
- **Categoria:** `cron_job`
- **Descrição:** identifica claramente se foi disparo manual ou automático
- Nenhuma mudança necessária na página de logs

---

## Arquivos Afetados

| Arquivo | Tipo de mudança |
|---|---|
| `supabase/migrations/YYYYMMDD_holiday_notice_bcc.sql` | Novo — migration |
| `src/lib/holiday-notice.ts` | Novo — lógica compartilhada |
| `src/lib/email-template-sender.ts` | Editar — adicionar opção `bcc` |
| `src/app/api/cron/holiday-notice/route.ts` | Editar — delegar para lib |
| `src/lib/validations/settings.ts` | Editar — novo campo |
| `src/components/settings/PlatformSettingsForm.tsx` | Editar — novo campo BCC |
| `src/app/(internal)/configuracoes/feriados/actions.ts` | Editar — 3 novas actions |
| `src/app/(internal)/configuracoes/feriados/page.tsx` | Editar — coluna + botão + sheet |
| `src/types/database.ts` | Editar — novo campo em `platform_settings` |

---

## Fora do Escopo

- Envio de BCC para comunicados gerais (announcements) — escopo separado
- Histórico de reenvios (quem reenviou, quando) — `system_logs` é suficiente
- Configurações de feriado no portal do cliente
