import { z } from 'zod'

export const monitoringIntegrationSchema = z.object({
  connector_type: z.enum(['zabbix', 'azure_monitor']),
  window_type: z.enum(['24x7', 'horario_comercial', 'personalizado']),
  window_custom_days: z.array(z.number().int().min(1).max(7)).optional(),
  window_custom_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  window_custom_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  out_of_window_behavior: z.enum(['descartar', 'aguardar_e_abrir', 'abrir_imediatamente']),
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
