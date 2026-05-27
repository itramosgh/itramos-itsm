-- Adiciona sla_starts_at para registrar quando o SLA efetivamente começa a contar.
-- NULL em chamados antigos → fallback para created_at no display.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS sla_starts_at TIMESTAMPTZ NULL;
