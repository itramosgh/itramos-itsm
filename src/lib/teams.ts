// Stub — implementação completa na Task 14
// Esta função será substituída pela versão real que envia Adaptive Cards ao Microsoft Teams.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamsEventType =
  | 'new_ticket'
  | 'sla_warning'
  | 'sla_breach'
  | 'url_down'
  | 'url_up'
  | 'monitoring_alert'
  | 'ticket_reopened'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyTeams(
  supabase: SupabaseClient,
  event: TeamsEventType,
  data: Record<string, string>
): Promise<void> {
  // TODO (Task 14): buscar webhooks ativos, filtrar por evento, enviar Adaptive Card
  void supabase
  void event
  void data
}
