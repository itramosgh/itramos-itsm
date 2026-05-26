# Monitoramento e Integrações Microsoft 365 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar monitoramento via webhooks Zabbix/Azure Monitor, verificação ativa de URLs com cron job, painel de status unificado, SSO com Microsoft via Azure AD, e notificações no Teams com Adaptive Cards.

**Architecture:** Webhooks recebem alertas via `/api/webhooks/{ferramenta}/{token}`, validam o token contra `monitoring_integrations` e criam chamados respeitando a janela de monitoramento. Alertas fora da janela com `aguardar_e_abrir` ficam em `pending_monitoring_alerts` e são processados pelo cron `/api/cron/process-pending-alerts`. Verificação de URLs roda em `/api/cron/url-check` a cada 5 minutos. SSO usa Supabase OAuth com provedor `azure`. Notificações Teams usam `src/lib/teams.ts` chamado a partir de webhooks, cron SLA e ações de chamados.

**Tech Stack:** Next.js 16 · TypeScript · Supabase (Auth OAuth + PostgreSQL) · Zod v4 · Vitest · Microsoft Teams Incoming Webhooks · Microsoft Entra ID (Azure AD) · shadcn/ui

---

## Mapa de Arquivos

```
src/
├── app/
│   ├── (auth)/login/
│   │   ├── page.tsx                              [modify: botão SSO Microsoft]
│   │   └── actions.ts                            [modify: loginWithMicrosoftAction]
│   ├── auth/callback/route.ts                    [modify: log SSO login]
│   ├── (internal)/
│   │   ├── monitoramento/page.tsx                [create: painel de status]
│   │   ├── clientes/[id]/monitoramento/
│   │   │   ├── page.tsx                          [create: config integrações + URLs]
│   │   │   └── actions.ts                        [create]
│   │   └── configuracoes/teams/
│   │       ├── page.tsx                          [create: config webhooks Teams]
│   │       └── actions.ts                        [create]
│   └── api/
│       ├── webhooks/
│       │   ├── zabbix/[token]/route.ts           [create]
│       │   └── azure/[token]/route.ts            [create]
│       └── cron/
│           ├── url-check/route.ts                [create]
│           └── process-pending-alerts/route.ts   [create]
├── components/
│   ├── monitoring/
│   │   ├── MonitoringIntegrationForm.tsx         [create]
│   │   ├── MonitoringIntegrationList.tsx         [create]
│   │   ├── MonitoredUrlForm.tsx                  [create]
│   │   ├── MonitoredUrlList.tsx                  [create]
│   │   └── MonitoringStatusPanel.tsx             [create]
│   └── settings/
│       ├── TeamsWebhookForm.tsx                  [create]
│       └── TeamsWebhookList.tsx                  [create]
└── lib/
    ├── monitoring.ts                             [create: janela + severidade]
    ├── teams.ts                                  [create: Adaptive Cards + notify]
    └── validations/
        ├── monitoring.ts                         [create]
        └── teams.ts                              [create]
supabase/migrations/
├── 20260526000001_monitoring_schema.sql          [create]
└── 20260526000002_monitoring_rls.sql             [create]
tests/
├── monitoring.test.ts                            [create]
└── validations.test.ts                           [modify: adicionar testes]
```

---

## Task 1: Migration — Schema de Monitoramento e Teams

**Files:**
- Create: `supabase/migrations/20260526000001_monitoring_schema.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new monitoring_schema
```

Renomear o arquivo gerado para `20260526000001_monitoring_schema.sql` se necessário.

- [ ] **Escrever migration**

```sql
-- monitoring_integrations: configurações de Zabbix e Azure Monitor por cliente
create table public.monitoring_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connector_type text not null check (connector_type in ('zabbix', 'azure_monitor')),
  webhook_token uuid not null default gen_random_uuid() unique,
  window_type text not null default 'horario_comercial'
    check (window_type in ('24x7', 'horario_comercial', 'personalizado')),
  window_custom_days integer[],
  window_custom_start time,
  window_custom_end time,
  out_of_window_behavior text not null default 'descartar'
    check (out_of_window_behavior in ('descartar', 'aguardar_e_abrir')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- monitored_urls: URLs monitoradas por cliente
create table public.monitored_urls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  name text not null,
  check_interval_minutes integer not null default 10
    check (check_interval_minutes in (5, 10, 15, 30)),
  last_checked_at timestamptz,
  last_status text check (last_status in ('up', 'down')),
  current_ticket_id uuid references public.tickets(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- url_check_history: histórico de verificações para o painel de status
create table public.url_check_history (
  id uuid primary key default gen_random_uuid(),
  monitored_url_id uuid not null references public.monitored_urls(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('up', 'down')),
  http_status_code integer,
  response_time_ms integer,
  error_message text
);

-- teams_webhook_configs: configurações de canais do Microsoft Teams
create table public.teams_webhook_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  webhook_url text not null,
  is_active boolean not null default true,
  notify_new_tickets boolean not null default true,
  notify_sla_warning boolean not null default true,
  notify_sla_breach boolean not null default true,
  notify_url_down boolean not null default true,
  notify_url_up boolean not null default false,
  notify_monitoring_alert boolean not null default true,
  notify_ticket_reopened boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- pending_monitoring_alerts: alertas recebidos fora da janela com aguardar_e_abrir
create table public.pending_monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  monitoring_integration_id uuid not null references public.monitoring_integrations(id) on delete cascade,
  external_alert_id text,
  alert_title text not null,
  alert_description text,
  priority text not null check (priority in ('critica', 'alta', 'media', 'baixa')),
  raw_payload jsonb,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Triggers updated_at
create trigger trg_monitoring_integrations_updated_at
  before update on public.monitoring_integrations
  for each row execute function public.set_updated_at();

create trigger trg_monitored_urls_updated_at
  before update on public.monitored_urls
  for each row execute function public.set_updated_at();

create trigger trg_teams_webhook_configs_updated_at
  before update on public.teams_webhook_configs
  for each row execute function public.set_updated_at();

-- Indexes
create index idx_monitoring_integrations_company_id
  on public.monitoring_integrations(company_id);
create index idx_monitoring_integrations_token
  on public.monitoring_integrations(webhook_token);
create index idx_monitored_urls_company_id
  on public.monitored_urls(company_id);
create index idx_monitored_urls_active
  on public.monitored_urls(is_active) where is_active = true;
create index idx_url_check_history_url_id_checked
  on public.url_check_history(monitored_url_id, checked_at desc);
create index idx_pending_alerts_integration_id
  on public.pending_monitoring_alerts(monitoring_integration_id);
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Verificar no Studio** — abrir `http://127.0.0.1:54323` → Table Editor. Confirmar 5 novas tabelas existem.

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: migration monitoring_schema — tabelas de monitoramento e Teams"
```

---

## Task 2: Migration — RLS Policies de Monitoramento

**Files:**
- Create: `supabase/migrations/20260526000002_monitoring_rls.sql`

- [ ] **Criar arquivo de migration**

```bash
npx supabase migration new monitoring_rls
```

- [ ] **Escrever migration**

```sql
-- Habilitar RLS
alter table public.monitoring_integrations enable row level security;
alter table public.monitored_urls enable row level security;
alter table public.url_check_history enable row level security;
alter table public.teams_webhook_configs enable row level security;
alter table public.pending_monitoring_alerts enable row level security;

-- monitoring_integrations: Admin e Gestor gerenciam
create policy "monitoring_integrations_select_admin_gestor"
  on public.monitoring_integrations for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_insert_admin_gestor"
  on public.monitoring_integrations for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_update_admin_gestor"
  on public.monitoring_integrations for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitoring_integrations_delete_admin"
  on public.monitoring_integrations for delete
  using (public.get_user_role() = 'admin');

-- monitored_urls: Analista pode ver, Admin/Gestor gerenciam
create policy "monitored_urls_select_internal"
  on public.monitored_urls for select
  using (public.is_internal());

create policy "monitored_urls_insert_admin_gestor"
  on public.monitored_urls for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "monitored_urls_update_admin_gestor"
  on public.monitored_urls for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "monitored_urls_delete_admin_gestor"
  on public.monitored_urls for delete
  using (public.get_user_role() in ('admin', 'gestor'));

-- url_check_history: interno pode ver, apenas service role insere
create policy "url_check_history_select_internal"
  on public.url_check_history for select
  using (public.is_internal());

-- teams_webhook_configs: Admin e Gestor
create policy "teams_webhook_configs_select_admin_gestor"
  on public.teams_webhook_configs for select
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_insert_admin_gestor"
  on public.teams_webhook_configs for insert
  with check (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_update_admin_gestor"
  on public.teams_webhook_configs for update
  using (public.get_user_role() in ('admin', 'gestor'));

create policy "teams_webhook_configs_delete_admin"
  on public.teams_webhook_configs for delete
  using (public.get_user_role() = 'admin');

-- pending_monitoring_alerts: apenas service role (sem policies de usuário)
-- (acessada apenas pelo service client em webhooks e cron)
```

- [ ] **Aplicar migration**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Commit**

```bash
git add supabase/migrations/
git commit -m "feat: RLS policies para monitoramento, URLs e Teams webhooks"
```

---

## Task 3: Tipos TypeScript — Novas Tabelas

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Adicionar tipos** ao final do bloco de tipos exportados (antes de `export interface Database`):

```typescript
export type MonitoringWindowType = '24x7' | 'horario_comercial' | 'personalizado'
export type OutOfWindowBehavior = 'descartar' | 'aguardar_e_abrir'
export type UrlCheckStatus = 'up' | 'down'
export type ConnectorType = 'zabbix' | 'azure_monitor'
```

- [ ] **Adicionar entradas** dentro de `Database['public']['Tables']` (após a última tabela existente):

```typescript
monitoring_integrations: {
  Row: {
    id: string; company_id: string; connector_type: ConnectorType
    webhook_token: string; window_type: MonitoringWindowType
    window_custom_days: number[] | null; window_custom_start: string | null
    window_custom_end: string | null; out_of_window_behavior: OutOfWindowBehavior
    is_active: boolean; created_by: string | null
    created_at: string; updated_at: string
  }
  Insert: Omit<Database['public']['Tables']['monitoring_integrations']['Row'], 'id' | 'webhook_token' | 'created_at' | 'updated_at'>
  Update: Partial<Database['public']['Tables']['monitoring_integrations']['Insert']>
}
monitored_urls: {
  Row: {
    id: string; company_id: string; url: string; name: string
    check_interval_minutes: number; last_checked_at: string | null
    last_status: UrlCheckStatus | null; current_ticket_id: string | null
    is_active: boolean; created_by: string | null
    created_at: string; updated_at: string
  }
  Insert: Omit<Database['public']['Tables']['monitored_urls']['Row'], 'id' | 'created_at' | 'updated_at' | 'last_checked_at' | 'last_status' | 'current_ticket_id'>
  Update: Partial<Database['public']['Tables']['monitored_urls']['Insert']> & {
    last_checked_at?: string | null; last_status?: UrlCheckStatus | null; current_ticket_id?: string | null
  }
}
url_check_history: {
  Row: {
    id: string; monitored_url_id: string; checked_at: string
    status: UrlCheckStatus; http_status_code: number | null
    response_time_ms: number | null; error_message: string | null
  }
  Insert: Omit<Database['public']['Tables']['url_check_history']['Row'], 'id'>
  Update: never
}
teams_webhook_configs: {
  Row: {
    id: string; name: string; webhook_url: string; is_active: boolean
    notify_new_tickets: boolean; notify_sla_warning: boolean
    notify_sla_breach: boolean; notify_url_down: boolean
    notify_url_up: boolean; notify_monitoring_alert: boolean
    notify_ticket_reopened: boolean; created_by: string | null
    created_at: string; updated_at: string
  }
  Insert: Omit<Database['public']['Tables']['teams_webhook_configs']['Row'], 'id' | 'created_at' | 'updated_at'>
  Update: Partial<Database['public']['Tables']['teams_webhook_configs']['Insert']>
}
pending_monitoring_alerts: {
  Row: {
    id: string; monitoring_integration_id: string
    external_alert_id: string | null; alert_title: string
    alert_description: string | null; priority: SLAPriority
    raw_payload: Json | null; event_at: string; created_at: string
  }
  Insert: Omit<Database['public']['Tables']['pending_monitoring_alerts']['Row'], 'id' | 'created_at'>
  Update: never
}
```

- [ ] **Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros relacionados às novas tabelas.

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: tipos TypeScript para monitoring_integrations, monitored_urls, url_check_history, teams_webhook_configs, pending_monitoring_alerts"
```

---

## Task 4: lib/monitoring.ts — Lógica de Janela e Mapeamento de Severidade

**Files:**
- Create: `src/lib/monitoring.ts`
- Create: `tests/monitoring.test.ts`

- [ ] **Escrever teste** em `tests/monitoring.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import {
  isWithinMonitoringWindow,
  mapZabbixSeverity,
  mapAzureMonitorSeverity,
} from '@/lib/monitoring'
import type { Database } from '@/types/database'

type MonitoringIntegration = Database['public']['Tables']['monitoring_integrations']['Row']

const baseIntegration: MonitoringIntegration = {
  id: 'uuid-1',
  company_id: 'uuid-2',
  connector_type: 'zabbix',
  webhook_token: 'uuid-token',
  window_type: '24x7',
  window_custom_days: null,
  window_custom_start: null,
  window_custom_end: null,
  out_of_window_behavior: 'descartar',
  is_active: true,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('isWithinMonitoringWindow', () => {
  it('24x7 sempre retorna true', () => {
    const integration = { ...baseIntegration, window_type: '24x7' as const }
    const now = new Date('2026-01-15T03:00:00') // madrugada de quinta
    expect(isWithinMonitoringWindow(integration, now, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('horario_comercial retorna false fora do horário', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const saturday = new Date('2026-01-17T10:00:00') // sábado
    expect(isWithinMonitoringWindow(integration, saturday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })

  it('horario_comercial retorna true dentro do horário comercial', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const weekday = new Date('2026-01-15T10:30:00') // quinta, 10:30
    expect(isWithinMonitoringWindow(integration, weekday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('horario_comercial retorna false em feriado', () => {
    const integration = { ...baseIntegration, window_type: 'horario_comercial' as const }
    const holiday = new Date('2026-01-15T10:00:00') // quinta
    expect(isWithinMonitoringWindow(integration, holiday, ['2026-01-15'], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })

  it('personalizado retorna true quando dentro da janela', () => {
    const integration = {
      ...baseIntegration,
      window_type: 'personalizado' as const,
      window_custom_days: [1, 2, 3, 4, 5], // seg-sex
      window_custom_start: '08:00',
      window_custom_end: '20:00',
    }
    const weekday = new Date('2026-01-15T09:00:00') // quinta, 09:00
    expect(isWithinMonitoringWindow(integration, weekday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(true)
  })

  it('personalizado retorna false fora dos dias configurados', () => {
    const integration = {
      ...baseIntegration,
      window_type: 'personalizado' as const,
      window_custom_days: [1, 2, 3, 4, 5], // só seg-sex
      window_custom_start: '08:00',
      window_custom_end: '20:00',
    }
    const saturday = new Date('2026-01-17T10:00:00') // sábado
    expect(isWithinMonitoringWindow(integration, saturday, [], { start: '09:00', end: '18:00', days: [1,2,3,4,5] })).toBe(false)
  })
})

describe('mapZabbixSeverity', () => {
  it('Disaster → critica', () => {
    expect(mapZabbixSeverity('Disaster')).toBe('critica')
  })
  it('High → critica', () => {
    expect(mapZabbixSeverity('High')).toBe('critica')
  })
  it('Average → alta', () => {
    expect(mapZabbixSeverity('Average')).toBe('alta')
  })
  it('Warning → media', () => {
    expect(mapZabbixSeverity('Warning')).toBe('media')
  })
  it('Information → baixa', () => {
    expect(mapZabbixSeverity('Information')).toBe('baixa')
  })
  it('Not classified → baixa', () => {
    expect(mapZabbixSeverity('Not classified')).toBe('baixa')
  })
  it('valor desconhecido → baixa', () => {
    expect(mapZabbixSeverity('Outro')).toBe('baixa')
  })
})

describe('mapAzureMonitorSeverity', () => {
  it('Sev0 → critica', () => {
    expect(mapAzureMonitorSeverity('Sev0')).toBe('critica')
  })
  it('Critical → critica', () => {
    expect(mapAzureMonitorSeverity('Critical')).toBe('critica')
  })
  it('Sev1 → alta', () => {
    expect(mapAzureMonitorSeverity('Sev1')).toBe('alta')
  })
  it('Error → alta', () => {
    expect(mapAzureMonitorSeverity('Error')).toBe('alta')
  })
  it('Sev2 → media', () => {
    expect(mapAzureMonitorSeverity('Sev2')).toBe('media')
  })
  it('Warning → media', () => {
    expect(mapAzureMonitorSeverity('Warning')).toBe('media')
  })
  it('Sev3 → baixa', () => {
    expect(mapAzureMonitorSeverity('Sev3')).toBe('baixa')
  })
  it('Informational → baixa', () => {
    expect(mapAzureMonitorSeverity('Informational')).toBe('baixa')
  })
})
```

- [ ] **Rodar teste para verificar falha**

```bash
npx vitest run tests/monitoring.test.ts
```

Expected: FAIL — `isWithinMonitoringWindow is not a function`

- [ ] **Criar `src/lib/monitoring.ts`**

```typescript
import type { Database } from '@/types/database'
import type { BusinessHoursSettings } from '@/lib/sla'

type MonitoringIntegration = Database['public']['Tables']['monitoring_integrations']['Row']
type SLAPriority = Database['public']['Tables']['monitoring_integrations']['Row'] extends never ? never
  : 'critica' | 'alta' | 'media' | 'baixa'

function toISOWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function isWithinMonitoringWindow(
  integration: MonitoringIntegration,
  now: Date,
  holidays: string[],
  platformHours: BusinessHoursSettings
): boolean {
  if (integration.window_type === '24x7') return true

  const isoDay = toISOWeekday(now.getDay())
  const dateStr = now.toISOString().slice(0, 10)
  const currentMins = now.getHours() * 60 + now.getMinutes()

  if (integration.window_type === 'horario_comercial') {
    if (!platformHours.days.includes(isoDay)) return false
    if (holidays.includes(dateStr)) return false
    const startMins = parseTime(platformHours.start)
    const endMins = parseTime(platformHours.end)
    return currentMins >= startMins && currentMins < endMins
  }

  // personalizado
  if (!integration.window_custom_days || !integration.window_custom_start || !integration.window_custom_end) {
    return false
  }
  if (!integration.window_custom_days.includes(isoDay)) return false
  const startMins = parseTime(integration.window_custom_start)
  const endMins = parseTime(integration.window_custom_end)
  return currentMins >= startMins && currentMins < endMins
}

export function mapZabbixSeverity(severity: string): 'critica' | 'alta' | 'media' | 'baixa' {
  switch (severity) {
    case 'Disaster':
    case 'High':
      return 'critica'
    case 'Average':
      return 'alta'
    case 'Warning':
      return 'media'
    case 'Information':
    case 'Not classified':
    default:
      return 'baixa'
  }
}

export function mapAzureMonitorSeverity(severity: string): 'critica' | 'alta' | 'media' | 'baixa' {
  switch (severity) {
    case 'Sev0':
    case 'Critical':
      return 'critica'
    case 'Sev1':
    case 'Error':
      return 'alta'
    case 'Sev2':
    case 'Warning':
      return 'media'
    case 'Sev3':
    case 'Informational':
    default:
      return 'baixa'
  }
}
```

- [ ] **Rodar teste para verificar que passa**

```bash
npx vitest run tests/monitoring.test.ts
```

Expected: PASS (todos os testes)

- [ ] **Commit**

```bash
git add src/lib/monitoring.ts tests/monitoring.test.ts
git commit -m "feat: lib/monitoring — janela de monitoramento e mapeamento de severidade com testes"
```

---

## Task 5: Validações Zod — Monitoramento e Teams

**Files:**
- Create: `src/lib/validations/monitoring.ts`
- Create: `src/lib/validations/teams.ts`
- Modify: `tests/validations.test.ts`

- [ ] **Adicionar testes** ao `tests/validations.test.ts` (ao final do arquivo):

```typescript
import { monitoringIntegrationSchema, monitoredUrlSchema } from '@/lib/validations/monitoring'
import { teamsWebhookSchema } from '@/lib/validations/teams'

describe('monitoringIntegrationSchema', () => {
  it('aceita integração Zabbix com janela 24x7', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'zabbix',
      window_type: '24x7',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita personalizado sem window_custom_days', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'azure_monitor',
      window_type: 'personalizado',
      out_of_window_behavior: 'aguardar_e_abrir',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('dias')
  })

  it('aceita personalizado com todos os campos', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'zabbix',
      window_type: 'personalizado',
      window_custom_days: [1, 2, 3, 4, 5],
      window_custom_start: '08:00',
      window_custom_end: '20:00',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita connector_type inválido', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'grafana',
      window_type: '24x7',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(false)
  })
})

describe('monitoredUrlSchema', () => {
  it('aceita URL válida com campos mínimos', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'https://empresa.com.br',
      name: 'Portal principal',
      check_interval_minutes: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejeita URL sem protocolo', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'empresa.com.br',
      name: 'Portal',
      check_interval_minutes: 5,
    })
    expect(result.success).toBe(false)
  })

  it('rejeita intervalo não permitido', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'https://empresa.com.br',
      name: 'Portal',
      check_interval_minutes: 7,
    })
    expect(result.success).toBe(false)
  })
})

describe('teamsWebhookSchema', () => {
  it('aceita webhook válido', () => {
    const result = teamsWebhookSchema.safeParse({
      name: 'Canal Chamados',
      webhook_url: 'https://outlook.office.com/webhook/abc123',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    const result = teamsWebhookSchema.safeParse({
      name: '',
      webhook_url: 'https://outlook.office.com/webhook/abc123',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita URL inválida', () => {
    const result = teamsWebhookSchema.safeParse({
      name: 'Canal',
      webhook_url: 'nao-eh-url',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Rodar para verificar falha**

```bash
npx vitest run tests/validations.test.ts
```

Expected: FAIL

- [ ] **Criar `src/lib/validations/monitoring.ts`**

```typescript
import { z } from 'zod'

export const monitoringIntegrationSchema = z.object({
  connector_type: z.enum(['zabbix', 'azure_monitor']),
  window_type: z.enum(['24x7', 'horario_comercial', 'personalizado']),
  window_custom_days: z.array(z.number().int().min(1).max(7)).optional(),
  window_custom_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  window_custom_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  out_of_window_behavior: z.enum(['descartar', 'aguardar_e_abrir']),
  is_active: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.window_type !== 'personalizado') return true
    return !!(data.window_custom_days?.length && data.window_custom_start && data.window_custom_end)
  },
  { message: 'Para janela personalizada, informe os dias, horário de início e fim', path: ['window_custom_days'] }
)

export const monitoredUrlSchema = z.object({
  url: z.string().url('URL inválida — inclua https://'),
  name: z.string().min(1, 'Nome é obrigatório'),
  check_interval_minutes: z.coerce.number().refine(
    (v) => [5, 10, 15, 30].includes(v),
    'Intervalo deve ser 5, 10, 15 ou 30 minutos'
  ),
  is_active: z.boolean().default(true),
})

export type MonitoringIntegrationInput = z.infer<typeof monitoringIntegrationSchema>
export type MonitoredUrlInput = z.infer<typeof monitoredUrlSchema>
```

- [ ] **Criar `src/lib/validations/teams.ts`**

```typescript
import { z } from 'zod'

export const teamsWebhookSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  webhook_url: z.string().url('URL de webhook inválida'),
  is_active: z.boolean().default(true),
  notify_new_tickets: z.boolean().default(true),
  notify_sla_warning: z.boolean().default(true),
  notify_sla_breach: z.boolean().default(true),
  notify_url_down: z.boolean().default(true),
  notify_url_up: z.boolean().default(false),
  notify_monitoring_alert: z.boolean().default(true),
  notify_ticket_reopened: z.boolean().default(false),
})

export type TeamsWebhookInput = z.infer<typeof teamsWebhookSchema>
```

- [ ] **Rodar para verificar que passa**

```bash
npx vitest run tests/validations.test.ts
```

Expected: PASS (todos os testes)

- [ ] **Commit**

```bash
git add src/lib/validations/ tests/validations.test.ts
git commit -m "feat: validações Zod para monitoramento, URLs e Teams webhooks com testes"
```

---

## Task 6: UI — Configuração de Integrações por Cliente

**Files:**
- Create: `src/app/(internal)/clientes/[id]/monitoramento/page.tsx`
- Create: `src/app/(internal)/clientes/[id]/monitoramento/actions.ts`
- Create: `src/components/monitoring/MonitoringIntegrationForm.tsx`
- Create: `src/components/monitoring/MonitoringIntegrationList.tsx`
- Create: `src/components/monitoring/MonitoredUrlForm.tsx`
- Create: `src/components/monitoring/MonitoredUrlList.tsx`

- [ ] **Criar `src/app/(internal)/clientes/[id]/monitoramento/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { monitoringIntegrationSchema, monitoredUrlSchema } from '@/lib/validations/monitoring'

export async function createMonitoringIntegrationAction(companyId: string, formData: FormData) {
  const raw = {
    connector_type: formData.get('connector_type'),
    window_type: formData.get('window_type'),
    window_custom_days: formData.getAll('window_custom_days').map(Number),
    window_custom_start: formData.get('window_custom_start') || undefined,
    window_custom_end: formData.get('window_custom_end') || undefined,
    out_of_window_behavior: formData.get('out_of_window_behavior'),
    is_active: formData.get('is_active') !== 'false',
  }
  const parsed = monitoringIntegrationSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('monitoring_integrations').insert({
    ...parsed.data,
    company_id: companyId,
    created_by: user!.id,
  } as any)

  if (error) return { error: error.message }
  revalidatePath(`/clientes/${companyId}/monitoramento`)
  return { success: true }
}

export async function toggleMonitoringIntegrationAction(id: string, companyId: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('monitoring_integrations').update({ is_active: isActive } as any).eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function deleteMonitoringIntegrationAction(id: string, companyId: string) {
  const supabase = await createClient()
  await supabase.from('monitoring_integrations').delete().eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function createMonitoredUrlAction(companyId: string, formData: FormData) {
  const raw = {
    url: formData.get('url'),
    name: formData.get('name'),
    check_interval_minutes: formData.get('check_interval_minutes'),
  }
  const parsed = monitoredUrlSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('monitored_urls').insert({
    ...parsed.data,
    company_id: companyId,
    created_by: user!.id,
  } as any)

  if (error) return { error: error.message }
  revalidatePath(`/clientes/${companyId}/monitoramento`)
  return { success: true }
}

export async function toggleMonitoredUrlAction(id: string, companyId: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('monitored_urls').update({ is_active: isActive } as any).eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function deleteMonitoredUrlAction(id: string, companyId: string) {
  const supabase = await createClient()
  await supabase.from('monitored_urls').delete().eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}
```

- [ ] **Criar `src/app/(internal)/clientes/[id]/monitoramento/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MonitoringIntegrationList } from '@/components/monitoring/MonitoringIntegrationList'
import { MonitoredUrlList } from '@/components/monitoring/MonitoredUrlList'

export default async function MonitoramentoClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: companyId } = await params
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single()

  if (!company) notFound()

  const [{ data: integrations }, { data: urls }] = await Promise.all([
    supabase
      .from('monitoring_integrations')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('monitored_urls')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Monitoramento — {company.name}</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Integrações (Zabbix / Azure Monitor)</h2>
        <MonitoringIntegrationList
          integrations={(integrations ?? []) as any[]}
          companyId={companyId}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">URLs Monitoradas</h2>
        <MonitoredUrlList
          urls={(urls ?? []) as any[]}
          companyId={companyId}
        />
      </section>
    </div>
  )
}
```

- [ ] **Criar `src/components/monitoring/MonitoringIntegrationForm.tsx`** — formulário com:
  - Select `connector_type`: Zabbix | Azure Monitor
  - Select `window_type`: 24x7 | Horário Comercial | Personalizado
  - Condicional: se personalizado, mostrar campos de dias (checkboxes seg-dom) e horários start/end
  - Select `out_of_window_behavior`: Descartar | Aguardar e abrir
  - Chama `createMonitoringIntegrationAction`

```typescript
'use client'
import { useActionState } from 'react'
import { createMonitoringIntegrationAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useState } from 'react'

const DAYS = [
  { value: '1', label: 'Seg' }, { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' }, { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' }, { value: '6', label: 'Sáb' },
  { value: '7', label: 'Dom' },
]

export function MonitoringIntegrationForm({ companyId }: { companyId: string }) {
  const [windowType, setWindowType] = useState<string>('horario_comercial')
  const action = createMonitoringIntegrationAction.bind(null, companyId)
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Nova Integração</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Ferramenta</Label>
          <select name="connector_type" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
            <option value="zabbix">Zabbix</option>
            <option value="azure_monitor">Azure Monitor</option>
          </select>
        </div>

        <div>
          <Label>Janela de Monitoramento</Label>
          <select
            name="window_type"
            className="w-full border rounded-md px-3 py-2 text-sm mt-1"
            value={windowType}
            onChange={(e) => setWindowType(e.target.value)}
          >
            <option value="24x7">24x7</option>
            <option value="horario_comercial">Horário Comercial</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
      </div>

      {windowType === 'personalizado' && (
        <div className="space-y-3 p-3 bg-muted rounded-md">
          <div>
            <Label>Dias da semana</Label>
            <div className="flex gap-3 mt-1 flex-wrap">
              {DAYS.map(d => (
                <label key={d.value} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" name="window_custom_days" value={d.value} defaultChecked={parseInt(d.value) <= 5} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="time" name="window_custom_start" defaultValue="09:00" className="mt-1" />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="time" name="window_custom_end" defaultValue="18:00" className="mt-1" />
            </div>
          </div>
        </div>
      )}

      <div>
        <Label>Fora da janela</Label>
        <select name="out_of_window_behavior" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
          <option value="descartar">Descartar silenciosamente</option>
          <option value="aguardar_e_abrir">Aguardar início da janela e abrir</option>
        </select>
      </div>

      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adicionando...' : 'Adicionar Integração'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/monitoring/MonitoringIntegrationList.tsx`** — tabela com colunas: Ferramenta (badge), Token do Webhook (campo copiável), Janela, Comportamento Fora da Janela, Status (ativo/inativo toggle), botão remover. Abaixo da lista, renderizar `<MonitoringIntegrationForm>`.

```typescript
'use client'
import { MonitoringIntegrationForm } from './MonitoringIntegrationForm'
import { toggleMonitoringIntegrationAction, deleteMonitoringIntegrationAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'

const WINDOW_LABELS: Record<string, string> = {
  '24x7': '24x7',
  horario_comercial: 'Horário Comercial',
  personalizado: 'Personalizado',
}

const BEHAVIOR_LABELS: Record<string, string> = {
  descartar: 'Descartar',
  aguardar_e_abrir: 'Aguardar e abrir',
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL

export function MonitoringIntegrationList({
  integrations,
  companyId,
}: {
  integrations: any[]
  companyId: string
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copyToken(token: string, id: string) {
    const url = `${appUrl}/api/webhooks/zabbix/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-4">
      {integrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Ferramenta</th>
                <th className="text-left p-3">Webhook URL</th>
                <th className="text-left p-3">Janela</th>
                <th className="text-left p-3">Fora da janela</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {integrations.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <Badge variant="secondary">
                      {item.connector_type === 'zabbix' ? 'Zabbix' : 'Azure Monitor'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToken(item.webhook_token, item.id)}
                      className="font-mono text-xs max-w-[200px] truncate"
                    >
                      {copied === item.id ? 'Copiado!' : `.../${item.webhook_token.slice(0, 8)}...`}
                    </Button>
                  </td>
                  <td className="p-3">{WINDOW_LABELS[item.window_type] ?? item.window_type}</td>
                  <td className="p-3">{BEHAVIOR_LABELS[item.out_of_window_behavior] ?? item.out_of_window_behavior}</td>
                  <td className="p-3">
                    <form action={async () => {
                      'use server'
                      await toggleMonitoringIntegrationAction(item.id, companyId, !item.is_active)
                    }}>
                      <Button variant="ghost" size="sm" type="submit">
                        {item.is_active ? '✓ Ativo' : '○ Inativo'}
                      </Button>
                    </form>
                  </td>
                  <td className="p-3">
                    <form action={async () => {
                      'use server'
                      await deleteMonitoringIntegrationAction(item.id, companyId)
                    }}>
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Remover
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MonitoringIntegrationForm companyId={companyId} />
    </div>
  )
}
```

- [ ] **Criar `src/components/monitoring/MonitoredUrlForm.tsx`**

```typescript
'use client'
import { useActionState } from 'react'
import { createMonitoredUrlAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MonitoredUrlForm({ companyId }: { companyId: string }) {
  const action = createMonitoredUrlAction.bind(null, companyId)
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Nova URL</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>URL</Label>
          <Input name="url" placeholder="https://empresa.com.br" className="mt-1" required />
        </div>
        <div>
          <Label>Nome / Descrição</Label>
          <Input name="name" placeholder="Portal do cliente" className="mt-1" required />
        </div>
      </div>
      <div className="w-48">
        <Label>Verificar a cada</Label>
        <select name="check_interval_minutes" className="w-full border rounded-md px-3 py-2 text-sm mt-1">
          <option value="5">5 minutos</option>
          <option value="10" selected>10 minutos</option>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
        </select>
      </div>
      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Adicionando...' : 'Adicionar URL'}</Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/monitoring/MonitoredUrlList.tsx`** — tabela com URL, nome, intervalo, último status (badge UP verde / DOWN vermelho), última verificação, toggle ativo/inativo, botão remover. Abaixo, renderizar `<MonitoredUrlForm>`.

```typescript
import { MonitoredUrlForm } from './MonitoredUrlForm'
import { toggleMonitoredUrlAction, deleteMonitoredUrlAction } from '@/app/(internal)/clientes/[id]/monitoramento/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function MonitoredUrlList({
  urls,
  companyId,
}: {
  urls: any[]
  companyId: string
}) {
  return (
    <div className="space-y-4">
      {urls.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma URL monitorada.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Intervalo</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Última verificação</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {urls.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{item.url}</td>
                  <td className="p-3">{item.check_interval_minutes}min</td>
                  <td className="p-3">
                    {item.last_status === 'up' && <Badge className="bg-green-100 text-green-800">UP</Badge>}
                    {item.last_status === 'down' && <Badge className="bg-red-100 text-red-800">DOWN</Badge>}
                    {!item.last_status && <Badge variant="outline">Pendente</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {item.last_checked_at
                      ? new Date(item.last_checked_at).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="p-3 flex gap-2">
                    <form action={async () => {
                      'use server'
                      await toggleMonitoredUrlAction(item.id, companyId, !item.is_active)
                    }}>
                      <Button variant="ghost" size="sm" type="submit">
                        {item.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </form>
                    <form action={async () => {
                      'use server'
                      await deleteMonitoredUrlAction(item.id, companyId)
                    }}>
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Remover
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MonitoredUrlForm companyId={companyId} />
    </div>
  )
}
```

- [ ] **Testar manualmente** — acessar `/clientes/{id}/monitoramento`. Adicionar integração Zabbix com janela 24x7. Verificar token gerado. Adicionar URL. Verificar que os dados aparecem na tabela.

- [ ] **Instalar componentes shadcn se necessário**

```bash
npx shadcn@latest add badge
```

- [ ] **Commit**

```bash
git add src/app/\(internal\)/clientes/ src/components/monitoring/
git commit -m "feat: UI de configuração de integrações de monitoramento e URLs por cliente"
```

---

## Task 7: API — Webhook Zabbix

**Files:**
- Create: `src/app/api/webhooks/zabbix/[token]/route.ts`

O endpoint recebe payloads de problema e recovery do Zabbix. Zabbix envia `problem_type: "PROBLEM"` ou `"RECOVERY"` (ou campo `event_type`). Na ausência, detectar recovery por presença de `r_eventid` ou `recovery: "1"`.

- [ ] **Criar `src/app/api/webhooks/zabbix/[token]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow, mapZabbixSeverity } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'

interface ZabbixPayload {
  problem_type?: string       // "PROBLEM" ou "RECOVERY"
  recovery?: string           // "1" indica recovery
  r_eventid?: string          // presente em recovery
  event_id?: string
  trigger_name?: string
  trigger_description?: string
  host_name?: string
  severity?: string
  problem_name?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServiceClient()

  // 1. Validar token
  const { data: integration, error: intError } = await supabase
    .from('monitoring_integrations')
    .select('*, companies!inner(id, name, is_blocked)')
    .eq('webhook_token', token)
    .eq('connector_type', 'zabbix')
    .eq('is_active', true)
    .single()

  if (intError || !integration) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const company = (integration as any).companies

  // 2. Verificar bloqueio do cliente
  if (company.is_blocked) {
    return NextResponse.json({ ok: true, action: 'ignored_blocked_company' })
  }

  let payload: ZabbixPayload = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const isRecovery = payload.problem_type === 'RECOVERY'
    || payload.recovery === '1'
    || !!payload.r_eventid

  const externalAlertId = payload.event_id ?? payload.r_eventid ?? null

  // 3. Recovery — fechar chamado existente
  if (isRecovery) {
    if (externalAlertId) {
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id, status')
        .eq('external_alert_id', externalAlertId)
        .not('status', 'in', '("fechado","resolvido")')
        .single()

      if (existingTicket) {
        await supabase.from('tickets').update({
          status: 'resolvido',
          resolution: 'Resolvido automaticamente via Zabbix',
          closed_at: new Date().toISOString(),
        } as any).eq('id', existingTicket.id)

        await supabase.from('ticket_interactions').insert({
          ticket_id: existingTicket.id,
          type: 'system',
          content: 'Resolvido automaticamente via Zabbix',
          is_system: true,
        } as any)
      }
    }
    await insertLog(supabase, 'webhook_received', 'success', `Zabbix recovery recebido: ${payload.trigger_name ?? 'sem nome'}`, { external_alert_id: externalAlertId })
    return NextResponse.json({ ok: true, action: 'recovery_processed' })
  }

  // 4. Verificar janela de monitoramento
  const now = new Date()
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  const settings = settingsRaw as any

  const platformHours = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  const todayStr = now.toISOString().slice(0, 10)
  const { data: holidayRows } = await supabase
    .from('holidays')
    .select('date')
    .eq('date', todayStr)
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  const withinWindow = isWithinMonitoringWindow(integration as any, now, holidays, platformHours)

  if (!withinWindow) {
    if ((integration as any).out_of_window_behavior === 'aguardar_e_abrir') {
      await supabase.from('pending_monitoring_alerts').insert({
        monitoring_integration_id: integration.id,
        external_alert_id: externalAlertId,
        alert_title: payload.trigger_name ?? 'Alerta Zabbix sem nome',
        alert_description: payload.trigger_description ?? payload.host_name ?? null,
        priority: mapZabbixSeverity(payload.severity ?? ''),
        raw_payload: payload as any,
        event_at: now.toISOString(),
      } as any)
      await insertLog(supabase, 'webhook_received', 'success', 'Zabbix alerta enfileirado (fora da janela)', { external_alert_id: externalAlertId })
    } else {
      await insertLog(supabase, 'webhook_received', 'success', 'Zabbix alerta descartado (fora da janela)', { external_alert_id: externalAlertId })
    }
    return NextResponse.json({ ok: true, action: 'out_of_window' })
  }

  // 5. Verificar duplicata
  if (externalAlertId) {
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('external_alert_id', externalAlertId)
      .not('status', 'in', '("fechado","resolvido")')
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, action: 'duplicate_ignored' })
    }
  }

  // 6. Buscar primeiro contato ativo do cliente
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', integration.company_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!contact) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Zabbix: nenhum contato ativo no cliente — chamado não criado', { company_id: integration.company_id })
    return NextResponse.json({ ok: true, action: 'no_contact_skipped' })
  }

  // 7. Buscar categoria "Incidente"
  const { data: category } = await supabase
    .from('ticket_categories')
    .select('id')
    .eq('slug', 'incidente')
    .single()

  const priority = mapZabbixSeverity(payload.severity ?? '')
  const title = `[Zabbix] ${payload.trigger_name ?? 'Alerta sem nome'}${payload.host_name ? ` — ${payload.host_name}` : ''}`
  const description = [
    payload.trigger_description,
    payload.host_name ? `Host: ${payload.host_name}` : null,
    payload.severity ? `Severidade: ${payload.severity}` : null,
  ].filter(Boolean).join('\n')

  // 8. Criar chamado
  const { data: newTicket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      title,
      description,
      company_id: integration.company_id,
      contact_id: contact.id,
      category_id: category?.id ?? null,
      priority,
      channel: 'zabbix',
      external_alert_id: externalAlertId,
    } as any)
    .select('id, number')
    .single()

  if (ticketError || !newTicket) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Zabbix: erro ao criar chamado', { error: ticketError?.message })
    return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })
  }

  await supabase.from('ticket_interactions').insert({
    ticket_id: (newTicket as any).id,
    type: 'system',
    content: `Chamado criado automaticamente via Zabbix.\nHost: ${payload.host_name ?? 'N/A'}\nSeveridade: ${payload.severity ?? 'N/A'}`,
    is_system: true,
  } as any)

  await insertLog(supabase, 'webhook_received', 'success', `Zabbix: chamado #${(newTicket as any).number} criado`, { ticket_id: (newTicket as any).id, external_alert_id: externalAlertId })

  // 9. Notificar Teams
  try {
    await notifyTeams(supabase, 'monitoring_alert', {
      source: 'Zabbix',
      resource: payload.host_name ?? 'N/A',
      severity: payload.severity ?? 'N/A',
      description: payload.trigger_name ?? 'Alerta sem nome',
      ticketNumber: String((newTicket as any).number),
      ticketId: (newTicket as any).id,
      companyName: company.name,
    })
  } catch {
    await insertLog(supabase, 'webhook_received', 'failure', 'Falha ao enviar notificação Teams (não crítico)', {})
  }

  return NextResponse.json({ ok: true, action: 'ticket_created', ticket_number: (newTicket as any).number })
}
```

- [ ] **Testar manualmente** com `curl`:

```bash
# Primeiro buscar token de uma integração Zabbix no banco local
# Depois enviar payload de teste
curl -X POST http://localhost:3000/api/webhooks/zabbix/SEU_TOKEN_AQUI \
  -H "Content-Type: application/json" \
  -d '{
    "problem_type": "PROBLEM",
    "event_id": "test-001",
    "trigger_name": "High CPU usage on web server",
    "host_name": "web-01.empresa.com",
    "severity": "High",
    "trigger_description": "CPU acima de 90% por 5 minutos"
  }'
```

Expected: `{"ok":true,"action":"ticket_created","ticket_number":N}` e chamado visível no painel.

- [ ] **Commit**

```bash
git add src/app/api/webhooks/
git commit -m "feat: webhook Zabbix — abertura e fechamento automático de chamados com janela de monitoramento"
```

---

## Task 8: API — Webhook Azure Monitor

**Files:**
- Create: `src/app/api/webhooks/azure/[token]/route.ts`

Payload do Azure Monitor (schema v2): `data.status` é `"Activated"` ou `"Resolved"`. A severidade fica em `data.context.severity` como `"Sev0"`, `"Sev1"` etc. O `id` do alerta fica em `data.context.id`.

- [ ] **Criar `src/app/api/webhooks/azure/[token]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow, mapAzureMonitorSeverity } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'

interface AzurePayload {
  schemaId?: string
  data?: {
    status?: string          // "Activated" | "Resolved"
    context?: {
      id?: string
      name?: string
      description?: string
      severity?: string      // "Sev0", "Sev1", "Sev2", "Sev3"
      resourceName?: string
      resourceType?: string
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: integration, error: intError } = await supabase
    .from('monitoring_integrations')
    .select('*, companies!inner(id, name, is_blocked)')
    .eq('webhook_token', token)
    .eq('connector_type', 'azure_monitor')
    .eq('is_active', true)
    .single()

  if (intError || !integration) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const company = (integration as any).companies

  if (company.is_blocked) {
    return NextResponse.json({ ok: true, action: 'ignored_blocked_company' })
  }

  let payload: AzurePayload = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const status = payload.data?.status
  const externalAlertId = payload.data?.context?.id ?? null
  const isResolved = status === 'Resolved'

  // Recovery
  if (isResolved) {
    if (externalAlertId) {
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('external_alert_id', externalAlertId)
        .not('status', 'in', '("fechado","resolvido")')
        .single()

      if (existingTicket) {
        await supabase.from('tickets').update({
          status: 'resolvido',
          resolution: 'Resolvido automaticamente via Azure Monitor',
          closed_at: new Date().toISOString(),
        } as any).eq('id', existingTicket.id)

        await supabase.from('ticket_interactions').insert({
          ticket_id: existingTicket.id,
          type: 'system',
          content: 'Resolvido automaticamente via Azure Monitor',
          is_system: true,
        } as any)
      }
    }
    await insertLog(supabase, 'webhook_received', 'success', `Azure Monitor recovery: ${payload.data?.context?.name ?? 'sem nome'}`, { external_alert_id: externalAlertId })
    return NextResponse.json({ ok: true, action: 'recovery_processed' })
  }

  // Verificar janela
  const now = new Date()
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  const settings = settingsRaw as any

  const platformHours = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  const todayStr = now.toISOString().slice(0, 10)
  const { data: holidayRows } = await supabase.from('holidays').select('date').eq('date', todayStr)
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  const withinWindow = isWithinMonitoringWindow(integration as any, now, holidays, platformHours)

  if (!withinWindow) {
    if ((integration as any).out_of_window_behavior === 'aguardar_e_abrir') {
      const ctx = payload.data?.context
      await supabase.from('pending_monitoring_alerts').insert({
        monitoring_integration_id: integration.id,
        external_alert_id: externalAlertId,
        alert_title: ctx?.name ?? 'Alerta Azure Monitor sem nome',
        alert_description: ctx?.description ?? ctx?.resourceName ?? null,
        priority: mapAzureMonitorSeverity(ctx?.severity ?? ''),
        raw_payload: payload as any,
        event_at: now.toISOString(),
      } as any)
      await insertLog(supabase, 'webhook_received', 'success', 'Azure Monitor alerta enfileirado (fora da janela)', { external_alert_id: externalAlertId })
    } else {
      await insertLog(supabase, 'webhook_received', 'success', 'Azure Monitor alerta descartado (fora da janela)', {})
    }
    return NextResponse.json({ ok: true, action: 'out_of_window' })
  }

  // Verificar duplicata
  if (externalAlertId) {
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('external_alert_id', externalAlertId)
      .not('status', 'in', '("fechado","resolvido")')
      .maybeSingle()
    if (existing) return NextResponse.json({ ok: true, action: 'duplicate_ignored' })
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', integration.company_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!contact) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Azure Monitor: nenhum contato ativo — chamado não criado', { company_id: integration.company_id })
    return NextResponse.json({ ok: true, action: 'no_contact_skipped' })
  }

  const { data: category } = await supabase
    .from('ticket_categories')
    .select('id')
    .eq('slug', 'incidente')
    .single()

  const ctx = payload.data?.context
  const priority = mapAzureMonitorSeverity(ctx?.severity ?? '')
  const title = `[Azure Monitor] ${ctx?.name ?? 'Alerta sem nome'}${ctx?.resourceName ? ` — ${ctx.resourceName}` : ''}`
  const description = [
    ctx?.description,
    ctx?.resourceName ? `Recurso: ${ctx.resourceName}` : null,
    ctx?.severity ? `Severidade: ${ctx.severity}` : null,
  ].filter(Boolean).join('\n')

  const { data: newTicket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      title,
      description,
      company_id: integration.company_id,
      contact_id: contact.id,
      category_id: category?.id ?? null,
      priority,
      channel: 'azure_monitor',
      external_alert_id: externalAlertId,
    } as any)
    .select('id, number')
    .single()

  if (ticketError || !newTicket) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Azure Monitor: erro ao criar chamado', { error: ticketError?.message })
    return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })
  }

  await supabase.from('ticket_interactions').insert({
    ticket_id: (newTicket as any).id,
    type: 'system',
    content: `Chamado criado automaticamente via Azure Monitor.\nRecurso: ${ctx?.resourceName ?? 'N/A'}\nSeveridade: ${ctx?.severity ?? 'N/A'}`,
    is_system: true,
  } as any)

  await insertLog(supabase, 'webhook_received', 'success', `Azure Monitor: chamado #${(newTicket as any).number} criado`, { ticket_id: (newTicket as any).id })

  try {
    await notifyTeams(supabase, 'monitoring_alert', {
      source: 'Azure Monitor',
      resource: ctx?.resourceName ?? 'N/A',
      severity: ctx?.severity ?? 'N/A',
      description: ctx?.name ?? 'Alerta sem nome',
      ticketNumber: String((newTicket as any).number),
      ticketId: (newTicket as any).id,
      companyName: company.name,
    })
  } catch {
    await insertLog(supabase, 'webhook_received', 'failure', 'Falha ao enviar notificação Teams (não crítico)', {})
  }

  return NextResponse.json({ ok: true, action: 'ticket_created', ticket_number: (newTicket as any).number })
}
```

- [ ] **Testar manualmente** com `curl`:

```bash
curl -X POST http://localhost:3000/api/webhooks/azure/SEU_TOKEN_AQUI \
  -H "Content-Type: application/json" \
  -d '{
    "schemaId": "azureMonitorCommonAlertSchema",
    "data": {
      "status": "Activated",
      "context": {
        "id": "azure-alert-test-001",
        "name": "High Memory Usage",
        "description": "Memory usage exceeded 90%",
        "severity": "Sev1",
        "resourceName": "vm-prod-01"
      }
    }
  }'
```

Expected: `{"ok":true,"action":"ticket_created","ticket_number":N}`

- [ ] **Commit**

```bash
git add src/app/api/webhooks/azure/
git commit -m "feat: webhook Azure Monitor — abertura e fechamento automático de chamados"
```

---

## Task 9: Cron — Verificação de URLs

**Files:**
- Create: `src/app/api/cron/url-check/route.ts`

Este cron roda a cada 5 minutos. Para cada URL ativa, verifica se o intervalo dela passou desde a última verificação. Se passou, faz o GET e atualiza o status.

- [ ] **Criar `src/app/api/cron/url-check/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'

async function checkUrl(url: string): Promise<{ status: 'up' | 'down'; httpStatusCode: number | null; responseTimeMs: number | null; errorMessage: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ITRAMOS-Monitor/1.0' },
    })
    clearTimeout(timeout)
    const responseTimeMs = Date.now() - start

    if (res.status >= 200 && res.status < 300) {
      return { status: 'up', httpStatusCode: res.status, responseTimeMs, errorMessage: null }
    }
    return { status: 'down', httpStatusCode: res.status, responseTimeMs, errorMessage: `HTTP ${res.status}` }
  } catch (err: any) {
    clearTimeout(timeout)
    const isTimeout = err.name === 'AbortError'
    return {
      status: 'down',
      httpStatusCode: null,
      responseTimeMs: null,
      errorMessage: isTimeout ? 'Timeout (>10s)' : (err.message ?? 'Conexão recusada'),
    }
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: urls } = await supabase
    .from('monitored_urls')
    .select('*')
    .eq('is_active', true)

  let checked = 0
  let incidents = 0

  for (const urlRow of (urls ?? []) as any[]) {
    // Verificar se o intervalo passou
    if (urlRow.last_checked_at) {
      const lastCheck = new Date(urlRow.last_checked_at)
      const diffMinutes = (now.getTime() - lastCheck.getTime()) / 60000
      if (diffMinutes < urlRow.check_interval_minutes) continue
    }

    const result = await checkUrl(urlRow.url)
    checked++

    // Registrar histórico
    await supabase.from('url_check_history').insert({
      monitored_url_id: urlRow.id,
      checked_at: now.toISOString(),
      status: result.status,
      http_status_code: result.httpStatusCode,
      response_time_ms: result.responseTimeMs,
      error_message: result.errorMessage,
    } as any)

    // Atualizar status na URL
    await supabase.from('monitored_urls').update({
      last_checked_at: now.toISOString(),
      last_status: result.status,
    } as any).eq('id', urlRow.id)

    const previousStatus = urlRow.last_status

    // DOWN → era UP ou nunca verificada
    if (result.status === 'down' && previousStatus !== 'down') {
      incidents++

      // Buscar empresa
      const { data: company } = await supabase
        .from('companies')
        .select('id, name, is_blocked')
        .eq('id', urlRow.company_id)
        .single()

      if ((company as any)?.is_blocked) continue

      // Buscar contato
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', urlRow.company_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!contact) {
        await insertLog(supabase, 'url_monitoring', 'failure', `URL DOWN sem contato ativo: ${urlRow.url}`, { url_id: urlRow.id })
        continue
      }

      const { data: category } = await supabase
        .from('ticket_categories')
        .select('id')
        .eq('slug', 'incidente')
        .single()

      const { data: ticket } = await supabase
        .from('tickets')
        .insert({
          title: `Indisponibilidade detectada: ${urlRow.name}`,
          description: `A URL ${urlRow.url} está inacessível.\nErro: ${result.errorMessage ?? 'Sem resposta'}`,
          company_id: urlRow.company_id,
          contact_id: contact.id,
          category_id: (category as any)?.id ?? null,
          priority: 'alta',
          channel: 'url_monitoring',
        } as any)
        .select('id, number')
        .single()

      if (ticket) {
        // Atualizar current_ticket_id na URL
        await supabase.from('monitored_urls').update({ current_ticket_id: (ticket as any).id } as any).eq('id', urlRow.id)

        await supabase.from('ticket_interactions').insert({
          ticket_id: (ticket as any).id,
          type: 'system',
          content: `URL indisponível detectada automaticamente.\nURL: ${urlRow.url}\nErro: ${result.errorMessage ?? 'N/A'}`,
          is_system: true,
        } as any)

        await insertLog(supabase, 'url_monitoring', 'success', `URL DOWN: chamado #${(ticket as any).number} criado — ${urlRow.name}`, { url_id: urlRow.id })

        // Notificar por e-mail analistas e gestores com notify_new_tickets
        const { data: notifyProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['gestor', 'analista'])
          .eq('is_active', true)
          .eq('notify_new_tickets', true)

        for (const profile of (notifyProfiles ?? []) as any[]) {
          const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
          if (authUser.user?.email) {
            try {
              const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
              await sendEmailFromTemplate('url_down_notification', authUser.user.email, {
                url_name: urlRow.name,
                url_address: urlRow.url,
                company_name: (company as any)?.name ?? 'Cliente',
                ticket_number: String((ticket as any).number),
                app_url: process.env.NEXT_PUBLIC_APP_URL ?? '',
                error_message: result.errorMessage ?? 'Sem resposta',
                detected_at: now.toLocaleString('pt-BR'),
              })
            } catch {
              // falha de e-mail não interrompe o fluxo
            }
          }
        }

        // Notificar Teams
        try {
          await notifyTeams(supabase, 'url_down', {
            urlName: urlRow.name,
            urlAddress: urlRow.url,
            companyName: (company as any)?.name ?? 'Cliente',
            detectedAt: now.toLocaleString('pt-BR'),
          })
        } catch {
          await insertLog(supabase, 'url_monitoring', 'failure', 'Falha ao enviar notificação Teams URL DOWN (não crítico)', {})
        }
      }
    }

    // UP → era DOWN
    if (result.status === 'up' && previousStatus === 'down') {
      const ticketId = urlRow.current_ticket_id
      if (ticketId) {
        const { data: openTicket } = await supabase
          .from('tickets')
          .select('id, number, status')
          .eq('id', ticketId)
          .not('status', 'in', '("fechado","resolvido")')
          .maybeSingle()

        if (openTicket) {
          await supabase.from('tickets').update({
            status: 'resolvido',
            resolution: 'URL voltou a responder normalmente',
            closed_at: now.toISOString(),
          } as any).eq('id', ticketId)

          await supabase.from('ticket_interactions').insert({
            ticket_id: ticketId,
            type: 'system',
            content: 'URL voltou a responder normalmente. Chamado encerrado automaticamente.',
            is_system: true,
          } as any)

          await insertLog(supabase, 'url_monitoring', 'success', `URL UP: chamado #${(openTicket as any).number} encerrado — ${urlRow.name}`, { url_id: urlRow.id })
        }
      }

      // Limpar current_ticket_id
      await supabase.from('monitored_urls').update({ current_ticket_id: null } as any).eq('id', urlRow.id)

      // Notificar Teams
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', urlRow.company_id)
          .single()

        await notifyTeams(supabase, 'url_up', {
          urlName: urlRow.name,
          urlAddress: urlRow.url,
          companyName: (company as any)?.name ?? 'Cliente',
          restoredAt: now.toLocaleString('pt-BR'),
        })
      } catch {
        // falha de Teams não interrompe
      }
    }
  }

  return NextResponse.json({ ok: true, checked, incidents })
}
```

- [ ] **Registrar cron job** para rodar a cada 5 minutos no `vercel.json` (criar se não existir):

```json
{
  "crons": [
    { "path": "/api/cron/url-check", "schedule": "*/5 * * * *" }
  ]
}
```

Se o `vercel.json` já existir, adicionar o item ao array `crons` existente.

- [ ] **Testar manualmente**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/url-check
```

Expected: `{"ok":true,"checked":N,"incidents":0}` (onde N é o número de URLs ativas)

- [ ] **Commit**

```bash
git add src/app/api/cron/url-check/ vercel.json
git commit -m "feat: cron de verificação de URLs com abertura/fechamento automático de chamados"
```

---

## Task 10: Cron — Processar Alertas Pendentes (aguardar_e_abrir)

**Files:**
- Create: `src/app/api/cron/process-pending-alerts/route.ts`

Este cron roda a cada 5 minutos. Para cada alerta pendente, verifica se a janela de monitoramento agora está ativa. Se sim, cria o chamado e remove o alerta da fila.

- [ ] **Criar `src/app/api/cron/process-pending-alerts/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: pendingAlerts } = await supabase
    .from('pending_monitoring_alerts')
    .select('*, monitoring_integrations!inner(*, companies!inner(id, name, is_blocked))')
    .order('event_at', { ascending: true })

  if (!pendingAlerts?.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  const settings = settingsRaw as any

  const platformHours = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  const todayStr = now.toISOString().slice(0, 10)
  const { data: holidayRows } = await supabase
    .from('holidays')
    .select('date')
    .eq('date', todayStr)
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  let processed = 0

  for (const alert of pendingAlerts as any[]) {
    const integration = alert.monitoring_integrations
    const company = integration.companies

    if (!isWithinMonitoringWindow(integration, now, holidays, platformHours)) continue
    if (company.is_blocked) {
      await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
      continue
    }

    // Verificar duplicata (pode ter sido criado manualmente entre o enfileiramento e agora)
    if (alert.external_alert_id) {
      const { data: existing } = await supabase
        .from('tickets')
        .select('id')
        .eq('external_alert_id', alert.external_alert_id)
        .not('status', 'in', '("fechado","resolvido")')
        .maybeSingle()
      if (existing) {
        await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
        continue
      }
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', integration.company_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!contact) {
      await insertLog(supabase, 'cron_job', 'failure', `process-pending-alerts: sem contato ativo na empresa ${integration.company_id}`, {})
      await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
      continue
    }

    const { data: category } = await supabase
      .from('ticket_categories')
      .select('id')
      .eq('slug', 'incidente')
      .single()

    const channel = integration.connector_type === 'zabbix' ? 'zabbix' : 'azure_monitor'
    const description = [
      alert.alert_description,
      `Evento original em: ${new Date(alert.event_at).toLocaleString('pt-BR')} (fora da janela)`,
    ].filter(Boolean).join('\n')

    const { data: ticket } = await supabase
      .from('tickets')
      .insert({
        title: alert.alert_title,
        description,
        company_id: integration.company_id,
        contact_id: contact.id,
        category_id: (category as any)?.id ?? null,
        priority: alert.priority,
        channel,
        external_alert_id: alert.external_alert_id,
      } as any)
      .select('id, number')
      .single()

    if (ticket) {
      await supabase.from('ticket_interactions').insert({
        ticket_id: (ticket as any).id,
        type: 'system',
        content: `Chamado criado automaticamente (aguardava janela de monitoramento). Evento original: ${new Date(alert.event_at).toLocaleString('pt-BR')}`,
        is_system: true,
      } as any)

      await insertLog(supabase, 'cron_job', 'success', `Alerta pendente processado: chamado #${(ticket as any).number}`, { alert_id: alert.id, ticket_id: (ticket as any).id })
      processed++
    }

    await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
  }

  return NextResponse.json({ ok: true, processed })
}
```

- [ ] **Adicionar ao `vercel.json`** (dentro do array `crons` existente):

```json
{ "path": "/api/cron/process-pending-alerts", "schedule": "*/5 * * * *" }
```

- [ ] **Commit**

```bash
git add src/app/api/cron/process-pending-alerts/ vercel.json
git commit -m "feat: cron process-pending-alerts — processa alertas enfileirados aguardar_e_abrir"
```

---

## Task 11: UI — Painel de Status Unificado

**Files:**
- Create: `src/app/(internal)/monitoramento/page.tsx`
- Create: `src/components/monitoring/MonitoringStatusPanel.tsx`

- [ ] **Criar `src/app/(internal)/monitoramento/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { MonitoringStatusPanel } from '@/components/monitoring/MonitoringStatusPanel'

export default async function MonitoramentoPage() {
  const supabase = await createClient()

  const [
    { data: urls },
    { data: activeAlerts },
  ] = await Promise.all([
    supabase
      .from('monitored_urls')
      .select('id, name, url, last_status, last_checked_at, is_active, company_id, companies(name)')
      .eq('is_active', true)
      .order('last_status', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, number, title, priority, created_at, company_id, companies(name)')
      .in('channel', ['zabbix', 'azure_monitor'])
      .not('status', 'in', '("fechado","resolvido")')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Histórico de hoje para cada URL
  const today = new Date().toISOString().slice(0, 10)
  const urlIds = (urls ?? []).map((u: any) => u.id)
  const { data: todayHistory } = urlIds.length
    ? await supabase
        .from('url_check_history')
        .select('monitored_url_id, status, checked_at')
        .in('monitored_url_id', urlIds)
        .gte('checked_at', `${today}T00:00:00`)
        .order('checked_at', { ascending: true })
    : { data: [] }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Painel de Monitoramento</h1>
      <MonitoringStatusPanel
        urls={(urls ?? []) as any[]}
        activeAlerts={(activeAlerts ?? []) as any[]}
        todayHistory={(todayHistory ?? []) as any[]}
      />
    </div>
  )
}
```

- [ ] **Criar `src/components/monitoring/MonitoringStatusPanel.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function AvailabilityBar({ urlId, history }: { urlId: string; history: any[] }) {
  const urlHistory = history.filter(h => h.monitored_url_id === urlId)
  if (urlHistory.length === 0) return <span className="text-xs text-muted-foreground">Sem dados hoje</span>

  return (
    <div className="flex gap-0.5 items-center h-4">
      {urlHistory.map((h, i) => (
        <div
          key={i}
          className={`h-full w-2 rounded-sm ${h.status === 'up' ? 'bg-green-500' : 'bg-red-500'}`}
          title={`${new Date(h.checked_at).toLocaleTimeString('pt-BR')}: ${h.status.toUpperCase()}`}
        />
      ))}
    </div>
  )
}

export function MonitoringStatusPanel({
  urls,
  activeAlerts,
  todayHistory,
}: {
  urls: any[]
  activeAlerts: any[]
  todayHistory: any[]
}) {
  const downUrls = urls.filter(u => u.last_status === 'down')
  const upUrls = urls.filter(u => u.last_status === 'up')
  const pendingUrls = urls.filter(u => !u.last_status)

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">URLs Online</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{upUrls.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">URLs com Problema</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{downUrls.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-600">{activeAlerts.length}</p></CardContent>
        </Card>
      </div>

      {/* URLs Monitoradas */}
      <Card>
        <CardHeader><CardTitle>URLs Monitoradas</CardTitle></CardHeader>
        <CardContent>
          {urls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma URL monitorada configurada.</p>
          ) : (
            <div className="space-y-3">
              {urls.map(url => (
                <div key={url.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{url.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{url.url}</p>
                    <p className="text-xs text-muted-foreground">{(url.companies as any)?.name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <AvailabilityBar urlId={url.id} history={todayHistory} />
                    <div className="text-right">
                      {url.last_status === 'up' && <Badge className="bg-green-100 text-green-800">UP</Badge>}
                      {url.last_status === 'down' && <Badge className="bg-red-100 text-red-800">DOWN</Badge>}
                      {!url.last_status && <Badge variant="outline">Pendente</Badge>}
                      {url.last_checked_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(url.last_checked_at).toLocaleTimeString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas Ativos de Monitoramento */}
      <Card>
        <CardHeader><CardTitle>Alertas Ativos (Zabbix / Azure Monitor)</CardTitle></CardHeader>
        <CardContent>
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem alertas ativos.</p>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{(alert.companies as any)?.name} · #{alert.number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      alert.priority === 'critica' ? 'destructive' :
                      alert.priority === 'alta' ? 'secondary' : 'outline'
                    }>
                      {alert.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Instalar componentes shadcn se necessário**

```bash
npx shadcn@latest add card
```

- [ ] **Adicionar item na Sidebar** — modificar `src/components/layout/Sidebar.tsx` adicionando o item de monitoramento:

```typescript
// Adicionar no array navItems
{ href: '/monitoramento', label: 'Monitoramento', icon: Activity }
```

Importar `Activity` de `lucide-react`.

- [ ] **Testar manualmente** — acessar `/monitoramento`. Verificar que o painel carrega sem erros.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/monitoramento/ src/components/monitoring/MonitoringStatusPanel.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: painel de status unificado de monitoramento"
```

---

## Task 12: SSO com Microsoft (Azure AD / Entra ID)

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/app/auth/callback/route.ts`

**Pré-requisito:** Configurar o provedor OAuth Microsoft no Supabase Dashboard:
1. Acessar Supabase Dashboard → Authentication → Providers → Microsoft
2. Habilitar e inserir Client ID e Secret do App Registration no Azure AD
3. Configurar Redirect URI no Azure AD: `{SUPABASE_URL}/auth/v1/callback`

- [ ] **Adicionar `loginWithMicrosoftAction`** ao final de `src/app/(auth)/login/actions.ts`:

```typescript
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

- [ ] **Modificar `src/app/(auth)/login/page.tsx`** para adicionar o botão SSO:

```typescript
import { LoginForm } from '@/components/auth/LoginForm'
import { MicrosoftLoginButton } from '@/components/auth/MicrosoftLoginButton'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold text-center">ITRAMOS ITSM</h1>
        <LoginForm />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>
        <MicrosoftLoginButton />
        <p className="text-center text-sm">
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Criar `src/components/auth/MicrosoftLoginButton.tsx`**

```typescript
'use client'
import { loginWithMicrosoftAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { useFormStatus } from 'react-dom'

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="1" y="1" width="8.5" height="8.5" fill="#F25022"/>
      <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7FBA00"/>
      <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00A4EF"/>
      <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFB900"/>
    </svg>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" className="w-full gap-2" disabled={pending}>
      <MicrosoftIcon />
      {pending ? 'Redirecionando...' : 'Entrar com Microsoft'}
    </Button>
  )
}

export function MicrosoftLoginButton() {
  return (
    <form action={loginWithMicrosoftAction}>
      <SubmitButton />
    </form>
  )
}
```

- [ ] **Modificar `src/app/auth/callback/route.ts`** para registrar logins SSO em `system_logs`:

```typescript
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)

    // Registrar login SSO se for OAuth (provider_token presente)
    if (data?.session?.provider_token) {
      try {
        const serviceClient = await createServiceClient()
        await insertLog(
          serviceClient,
          'auth',
          'success',
          `Login SSO Microsoft: ${data.session.user.email ?? 'usuário desconhecido'}`,
          { user_id: data.session.user.id, provider: 'azure' }
        )
      } catch {
        // falha de log não bloqueia o login
      }
    }
  }

  return NextResponse.redirect(new URL(next, request.url))
}
```

- [ ] **Testar manualmente** — acessar `/login`. Verificar botão "Entrar com Microsoft" visível. Clicar e confirmar redirecionamento para a página de login Microsoft. (Requer configuração do Azure AD para funcionar completamente.)

- [ ] **Commit**

```bash
git add src/app/\(auth\)/ src/app/auth/ src/components/auth/MicrosoftLoginButton.tsx
git commit -m "feat: SSO com Microsoft via Supabase OAuth Azure AD com registro de log"
```

---

## Task 13: UI — Configuração de Webhooks do Teams

**Files:**
- Create: `src/app/(internal)/configuracoes/teams/page.tsx`
- Create: `src/app/(internal)/configuracoes/teams/actions.ts`
- Create: `src/components/settings/TeamsWebhookForm.tsx`
- Create: `src/components/settings/TeamsWebhookList.tsx`

- [ ] **Criar `src/app/(internal)/configuracoes/teams/actions.ts`**

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { teamsWebhookSchema } from '@/lib/validations/teams'

export async function createTeamsWebhookAction(formData: FormData) {
  const raw = {
    name: formData.get('name'),
    webhook_url: formData.get('webhook_url'),
    is_active: formData.get('is_active') !== 'false',
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
    notify_sla_warning: formData.get('notify_sla_warning') === 'on',
    notify_sla_breach: formData.get('notify_sla_breach') === 'on',
    notify_url_down: formData.get('notify_url_down') === 'on',
    notify_url_up: formData.get('notify_url_up') === 'on',
    notify_monitoring_alert: formData.get('notify_monitoring_alert') === 'on',
    notify_ticket_reopened: formData.get('notify_ticket_reopened') === 'on',
  }
  const parsed = teamsWebhookSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('teams_webhook_configs').insert({
    ...parsed.data,
    created_by: user!.id,
  } as any)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/teams')
  return { success: true }
}

export async function updateTeamsWebhookAction(id: string, formData: FormData) {
  const raw = {
    name: formData.get('name'),
    webhook_url: formData.get('webhook_url'),
    is_active: formData.get('is_active') === 'on',
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
    notify_sla_warning: formData.get('notify_sla_warning') === 'on',
    notify_sla_breach: formData.get('notify_sla_breach') === 'on',
    notify_url_down: formData.get('notify_url_down') === 'on',
    notify_url_up: formData.get('notify_url_up') === 'on',
    notify_monitoring_alert: formData.get('notify_monitoring_alert') === 'on',
    notify_ticket_reopened: formData.get('notify_ticket_reopened') === 'on',
  }
  const parsed = teamsWebhookSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('teams_webhook_configs')
    .update(parsed.data as any)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/teams')
  return { success: true }
}

export async function deleteTeamsWebhookAction(id: string) {
  const supabase = await createClient()
  await supabase.from('teams_webhook_configs').delete().eq('id', id)
  revalidatePath('/configuracoes/teams')
}
```

- [ ] **Criar `src/app/(internal)/configuracoes/teams/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TeamsWebhookList } from '@/components/settings/TeamsWebhookList'

export default async function TeamsConfigPage() {
  const supabase = await createClient()
  const { data: webhooks } = await supabase
    .from('teams_webhook_configs')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks Microsoft Teams</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Incoming Webhooks para receber notificações em canais do Teams.
          Para criar um webhook: no Teams, abra o canal → ••• → Conectores → Incoming Webhook.
        </p>
      </div>
      <TeamsWebhookList webhooks={(webhooks ?? []) as any[]} />
    </div>
  )
}
```

- [ ] **Criar `src/components/settings/TeamsWebhookForm.tsx`** — formulário com campos: Nome, URL do Webhook, checkboxes para cada tipo de notificação. Chama `createTeamsWebhookAction`.

```typescript
'use client'
import { useActionState } from 'react'
import { createTeamsWebhookAction } from '@/app/(internal)/configuracoes/teams/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const NOTIFICATION_OPTIONS = [
  { name: 'notify_new_tickets', label: 'Novo chamado aberto', defaultChecked: true },
  { name: 'notify_sla_warning', label: 'SLA próximo de vencer', defaultChecked: true },
  { name: 'notify_sla_breach', label: 'SLA violado', defaultChecked: true },
  { name: 'notify_url_down', label: 'URL indisponível', defaultChecked: true },
  { name: 'notify_url_up', label: 'URL voltou a responder', defaultChecked: false },
  { name: 'notify_monitoring_alert', label: 'Alerta Zabbix / Azure Monitor', defaultChecked: true },
  { name: 'notify_ticket_reopened', label: 'Chamado reaberto', defaultChecked: false },
]

export function TeamsWebhookForm() {
  const [state, formAction, pending] = useActionState(createTeamsWebhookAction, null)

  return (
    <form action={formAction} className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium">Novo Webhook</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Nome do canal</Label>
          <Input name="name" placeholder="Ex: Canal Chamados" className="mt-1" required />
        </div>
        <div>
          <Label>URL do Incoming Webhook</Label>
          <Input name="webhook_url" placeholder="https://outlook.office.com/webhook/..." className="mt-1" required />
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Notificações</Label>
        <div className="grid grid-cols-2 gap-2">
          {NOTIFICATION_OPTIONS.map(opt => (
            <label key={opt.name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name={opt.name}
                defaultChecked={opt.defaultChecked}
                className="rounded"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {(state as any)?.error && <p className="text-sm text-destructive">{(state as any).error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adicionando...' : 'Adicionar Webhook'}
      </Button>
    </form>
  )
}
```

- [ ] **Criar `src/components/settings/TeamsWebhookList.tsx`** — lista os webhooks configurados com nome, URL truncada, status ativo/inativo, contagem de notificações ativas, botões de editar e remover. Abaixo, renderizar `<TeamsWebhookForm>`.

```typescript
import { TeamsWebhookForm } from './TeamsWebhookForm'
import { deleteTeamsWebhookAction } from '@/app/(internal)/configuracoes/teams/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function TeamsWebhookList({ webhooks }: { webhooks: any[] }) {
  const activeNotifCount = (w: any) => [
    w.notify_new_tickets, w.notify_sla_warning, w.notify_sla_breach,
    w.notify_url_down, w.notify_url_up, w.notify_monitoring_alert, w.notify_ticket_reopened,
  ].filter(Boolean).length

  return (
    <div className="space-y-4">
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum webhook configurado.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Notificações</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w: any) => (
                <tr key={w.id} className="border-t">
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                    {w.webhook_url.replace('https://', '')}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{activeNotifCount(w)} ativas</Badge>
                  </td>
                  <td className="p-3">
                    {w.is_active
                      ? <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                      : <Badge variant="secondary">Inativo</Badge>}
                  </td>
                  <td className="p-3">
                    <form action={async () => {
                      'use server'
                      await deleteTeamsWebhookAction(w.id)
                    }}>
                      <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                        Remover
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TeamsWebhookForm />
    </div>
  )
}
```

- [ ] **Testar manualmente** — acessar `/configuracoes/teams`. Adicionar um webhook com URL de teste. Verificar que aparece na lista.

- [ ] **Commit**

```bash
git add src/app/\(internal\)/configuracoes/teams/ src/components/settings/TeamsWebhookForm.tsx src/components/settings/TeamsWebhookList.tsx
git commit -m "feat: UI de configuração de webhooks Microsoft Teams"
```

---

## Task 14: lib/teams.ts — Adaptive Cards e Notificações

**Files:**
- Create: `src/lib/teams.ts`

Esta lib provê uma função `notifyTeams(supabase, event, data)` que:
1. Busca todos os webhooks ativos com a flag do evento habilitada
2. Constrói o Adaptive Card para o evento
3. POST para cada webhook URL
4. Falhas são silenciosas (o caller decide se registra em log)

- [ ] **Criar `src/lib/teams.ts`**

```typescript
import type { createServiceClient } from '@/lib/supabase/server'

type SupabaseServiceClient = Awaited<ReturnType<typeof createServiceClient>>

type TeamsEvent =
  | 'new_ticket'
  | 'sla_warning'
  | 'sla_breach'
  | 'url_down'
  | 'url_up'
  | 'monitoring_alert'
  | 'ticket_reopened'

type EventFlagMap = Record<TeamsEvent, string>

const EVENT_FLAG: EventFlagMap = {
  new_ticket: 'notify_new_tickets',
  sla_warning: 'notify_sla_warning',
  sla_breach: 'notify_sla_breach',
  url_down: 'notify_url_down',
  url_up: 'notify_url_up',
  monitoring_alert: 'notify_monitoring_alert',
  ticket_reopened: 'notify_ticket_reopened',
}

function buildAdaptiveCard(event: TeamsEvent, data: Record<string, string>): object {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const colorMap: Record<TeamsEvent, string> = {
    new_ticket: 'Accent',
    sla_warning: 'Warning',
    sla_breach: 'Attention',
    url_down: 'Attention',
    url_up: 'Good',
    monitoring_alert: 'Warning',
    ticket_reopened: 'Accent',
  }

  const titleMap: Record<TeamsEvent, string> = {
    new_ticket: `🎫 Novo Chamado #${data.ticketNumber ?? ''}`,
    sla_warning: `⚠️ SLA Próximo de Vencer — #${data.ticketNumber ?? ''}`,
    sla_breach: `🚨 SLA Violado — #${data.ticketNumber ?? ''}`,
    url_down: `🔴 URL Indisponível: ${data.urlName ?? ''}`,
    url_up: `✅ URL Normalizada: ${data.urlName ?? ''}`,
    monitoring_alert: `🔔 Alerta ${data.source ?? 'Monitoramento'}: ${data.description ?? ''}`,
    ticket_reopened: `🔄 Chamado Reaberto #${data.ticketNumber ?? ''}`,
  }

  const buildFacts = (pairs: [string, string][]): object[] =>
    pairs.filter(([, v]) => !!v).map(([title, value]) => ({ title, value }))

  let facts: object[] = []
  let actions: object[] = []

  switch (event) {
    case 'new_ticket':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['Prioridade', data.priority ?? ''],
        ['Título', data.title ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'sla_warning':
      facts = buildFacts([
        ['Chamado', data.title ?? ''],
        ['Prazo Restante', data.timeRemaining ?? ''],
        ['Analista', data.assignedTo ?? 'Não atribuído'],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'sla_breach':
      facts = buildFacts([
        ['Chamado', data.title ?? ''],
        ['Violado há', data.breachTime ?? ''],
        ['Analista', data.assignedTo ?? 'Não atribuído'],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'url_down':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['URL', data.urlAddress ?? ''],
        ['Detectado em', data.detectedAt ?? ''],
      ])
      break

    case 'url_up':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['URL', data.urlAddress ?? ''],
        ['Normalizado em', data.restoredAt ?? ''],
      ])
      break

    case 'monitoring_alert':
      facts = buildFacts([
        ['Origem', data.source ?? ''],
        ['Host / Recurso', data.resource ?? ''],
        ['Severidade', data.severity ?? ''],
        ['Cliente', data.companyName ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: `Ver Chamado #${data.ticketNumber}`, url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break

    case 'ticket_reopened':
      facts = buildFacts([
        ['Cliente', data.companyName ?? ''],
        ['Título', data.title ?? ''],
        ['Motivo', data.reason ?? ''],
      ])
      if (data.ticketId) {
        actions = [{ type: 'Action.OpenUrl', title: 'Ver Chamado', url: `${appUrl}/chamados/${data.ticketId}` }]
      }
      break
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: titleMap[event],
              weight: 'Bolder',
              size: 'Medium',
              color: colorMap[event],
              wrap: true,
            },
            ...(facts.length > 0 ? [{ type: 'FactSet', facts }] : []),
          ],
          ...(actions.length > 0 ? { actions } : {}),
        },
      },
    ],
  }
}

export async function notifyTeams(
  supabase: SupabaseServiceClient,
  event: TeamsEvent,
  data: Record<string, string>
): Promise<void> {
  const flag = EVENT_FLAG[event]

  const { data: webhooks } = await supabase
    .from('teams_webhook_configs')
    .select('id, webhook_url')
    .eq('is_active', true)
    .eq(flag, true)

  if (!webhooks?.length) return

  const card = buildAdaptiveCard(event, data)

  await Promise.allSettled(
    webhooks.map((w: any) =>
      fetch(w.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      })
    )
  )
}
```

- [ ] **Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros em `src/lib/teams.ts`

- [ ] **Integrar Teams no cron SLA existente** — modificar `src/app/api/cron/sla-alerts/route.ts` para chamar `notifyTeams` após enviar o e-mail de alerta.

Adicionar ao final do loop `for (const uid of recipientIds)`, após o `sendEmail`:

```typescript
// Importar no topo do arquivo (fora do loop):
// import { notifyTeams } from '@/lib/teams'

// Após o loop de recipientIds, adicionar (uma vez por ticket, não por destinatário):
try {
  const assignedProfile = ticket.assigned_to
    ? (await supabase.auth.admin.getUserById(ticket.assigned_to)).data.user
    : null
  
  await notifyTeams(supabase, isBreached ? 'sla_breach' : 'sla_warning', {
    ticketNumber: String(ticket.number),
    ticketId: ticket.id,
    title: ticket.title,
    timeRemaining: isBreached ? 'SLA violado' : `${Math.round((deadline.getTime() - effectiveNowMs) / 60000)} min`,
    breachTime: isBreached ? `${Math.round((effectiveNowMs - deadline.getTime()) / 60000)} min` : '',
    assignedTo: assignedProfile?.email ?? 'Não atribuído',
  })
} catch {
  // falha de Teams não interrompe o fluxo
}
```

> **Atenção:** Adicionar `import { notifyTeams } from '@/lib/teams'` no topo de `sla-alerts/route.ts`. A chamada deve ficar FORA do loop `for (const uid of recipientIds)` — um único card por ticket.

- [ ] **Integrar Teams no `createTicketAction`** — em `src/app/(internal)/chamados/actions.ts`, adicionar chamada após o try/catch de e-mail da criação (após linha 107, antes do `redirect`):

```typescript
// Adicionar import no topo do arquivo:
// import { notifyTeams } from '@/lib/teams'
// import { createServiceClient } from '@/lib/supabase/server'

// Após o try/catch de e-mail em createTicketAction (após linha ~107):
try {
  const serviceSupabase = await createServiceClient()
  const { data: ticketForTeams } = await supabase
    .from('tickets')
    .select('id, number, title, priority, companies(name)')
    .eq('id', ticket!.id)
    .single()
  const ttf = ticketForTeams as any
  await notifyTeams(serviceSupabase, 'new_ticket', {
    ticketNumber: String(ttf.number),
    ticketId: ttf.id,
    title: ttf.title,
    priority: ttf.priority,
    companyName: ttf.companies?.name ?? '',
  })
} catch {
  // falha de Teams não interrompe o fluxo
}
```

- [ ] **Integrar Teams no `reopenTicketAction`** — em `src/app/(internal)/chamados/actions.ts`, adicionar chamada após o try/catch de e-mail de reabertura (após linha ~489, antes do `revalidatePath`):

```typescript
// Após o try/catch de e-mail em reopenTicketAction (após linha ~489):
try {
  const serviceSupabase = await createServiceClient()
  const { data: ticketForTeams } = await supabase
    .from('tickets')
    .select('id, number, title, company_id, companies(name)')
    .eq('id', ticketId)
    .single()
  const rtf = ticketForTeams as any
  await notifyTeams(serviceSupabase, 'ticket_reopened', {
    ticketNumber: String(rtf.number),
    ticketId: ticketId,
    title: rtf.title,
    companyName: rtf.companies?.name ?? '',
    reason,
  })
} catch {
  // falha de Teams não interrompe o fluxo
}
```

- [ ] **Verificar compilação completa**

```bash
npx tsc --noEmit
```

Expected: sem erros

- [ ] **Commit**

```bash
git add src/lib/teams.ts src/app/api/cron/sla-alerts/route.ts src/app/\(internal\)/chamados/actions.ts
git commit -m "feat: lib/teams.ts — Adaptive Cards para Teams + integração no cron SLA, criação e reabertura de chamados"
```

---

## Verificação Final

- [ ] **Rodar todos os testes**

```bash
npx vitest run
```

Expected: todos passam — monitoring.test.ts (14 testes) + validations.test.ts (todos)

- [ ] **Build de produção**

```bash
npm run build
```

Expected: sem erros TypeScript ou de build

- [ ] **Checklist de critérios do spec**

Verificar cada item manualmente:
- [ ] Configuração de integrações por cliente (Zabbix e Azure Monitor) funcional — acessar `/clientes/{id}/monitoramento`
- [ ] Webhook Zabbix validando token e criando chamados com mapeamento de severidade correto
- [ ] Webhook Azure Monitor validando token e criando chamados
- [ ] Recovery automático fechando chamado pelo `external_alert_id`
- [ ] Janela de monitoramento aplicada corretamente (24x7, comercial, personalizada) — coberto pelos testes unitários
- [ ] Comportamento fora da janela (`descartar` e `aguardar_e_abrir`) funcional
- [ ] Respeito ao calendário de feriados nas janelas — coberto pelos testes
- [ ] Chamados de monitoramento excluídos do fluxo de aprovação — verificar que `channel in ('zabbix','azure_monitor','url_monitoring')` não requer aprovação
- [ ] Cron de verificação de URLs rodando — testar `curl` com CRON_SECRET
- [ ] Abertura automática de chamado ao detectar URL DOWN
- [ ] Fechamento automático ao detectar URL UP
- [ ] Painel de status unificado com URLs e alertas ativos — acessar `/monitoramento`
- [ ] Botão "Entrar com Microsoft" funcional via Supabase OAuth — verificar redirecionamento
- [ ] Login SSO e login tradicional coexistindo para usuários internos
- [ ] Configuração de webhooks Teams na tela de Configurações — acessar `/configuracoes/teams`
- [ ] Adaptive Cards enviados para todos os eventos configurados — testar via webhook Zabbix com Teams configurado
- [ ] Falha de envio ao Teams registrada em logs sem quebrar fluxo principal

- [ ] **Commit final**

```bash
git add .
git commit -m "feat: monitoramento completo — Zabbix, Azure Monitor, URLs, SSO Microsoft, Teams"
```

---

## Notas Técnicas

**Chamados de monitoramento sem fluxo de aprovação:** O fluxo de aprovação (sub-spec 2) é acionado com base em `ticket_categories.requires_approval`. A categoria `Incidente` tem `requires_approval = false` por padrão — verificar no seed ou migration de chamados se isso está correto.

**contact_id obrigatório em chamados:** A tabela `tickets` tem `contact_id NOT NULL`. Webhooks e cron de URL usam o primeiro contato ativo da empresa como fallback. Se a empresa não tiver contatos ativos, o chamado não é criado e um log de falha é registrado.

**SSO Microsoft — configuração no Azure AD:** Exige criação de um App Registration no Azure AD com:
- Tipo: Web
- Redirect URI: `https://{SUPABASE_URL}/auth/v1/callback`
- Escopos: `email`, `profile`, `openid`
- Client ID e Secret configurados no Supabase Dashboard → Authentication → Providers → Microsoft

**Teams Incoming Webhook:** O webhook gerado pelo Teams usa `https://outlook.office.com/webhook/...` ou `https://{tenant}.webhook.office.com/...`. O payload usa o formato de Adaptive Cards v1.4.

**Server Actions em Client Components (`'use client'`):** `MonitoringIntegrationList` tem `'use client'` por usar `useState`. Nesse caso, inline server actions (`async () => { 'use server'; ... }`) não funcionam — são válidos apenas em Server Components. Usar `.bind()` para passar parâmetros nas forms:

```typescript
// Em vez de:
<form action={async () => { 'use server'; await toggleMonitoringIntegrationAction(item.id, companyId, !item.is_active) }}>

// Usar:
<form action={toggleMonitoringIntegrationAction.bind(null, item.id, companyId, !item.is_active)}>
```

`MonitoredUrlList.tsx` e `TeamsWebhookList.tsx` não têm `'use client'` — inline server actions funcionam normalmente nesses componentes.
