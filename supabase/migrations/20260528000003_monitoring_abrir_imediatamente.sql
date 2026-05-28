-- Adiciona opção 'abrir_imediatamente' ao comportamento fora da janela de monitoramento.
-- Com essa opção, o chamado é criado na hora independente do horário; o SLA calcula
-- sla_starts_at via getEffectiveSLAStart (já corrigido para fuso horário SP).

alter table public.monitoring_integrations
  drop constraint if exists monitoring_integrations_out_of_window_behavior_check;

alter table public.monitoring_integrations
  add constraint monitoring_integrations_out_of_window_behavior_check
  check (out_of_window_behavior in ('descartar', 'aguardar_e_abrir', 'abrir_imediatamente'));
