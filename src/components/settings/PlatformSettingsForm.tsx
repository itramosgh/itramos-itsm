'use client'
import * as React from 'react'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { platformSettingsSchema, type PlatformSettingsInput } from '@/lib/validations/settings'
import { updateSettingsAction } from '@/app/(internal)/configuracoes/actions'
import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Settings = Database['public']['Tables']['platform_settings']['Row']

interface Props {
  initialData: Settings | null
}

export function PlatformSettingsForm({ initialData }: Props) {
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [logoLightUrl, setLogoLightUrl] = useState(initialData?.logo_light_url ?? '')
  const [logoDarkUrl, setLogoDarkUrl] = useState(initialData?.logo_dark_url ?? '')
  const [uploadError, setUploadError] = useState('')

  async function handleLogoUpload(file: File, variant: 'light' | 'dark') {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('variant', variant)
    const res = await fetch('/api/upload/logo', { method: 'POST', body: fd })
    const data = await res.json() as { url?: string; error?: string }
    if (data.error) {
      setUploadError(data.error)
    } else if (data.url) {
      if (variant === 'light') setLogoLightUrl(data.url)
      else setLogoDarkUrl(data.url)
      setUploadError('')
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlatformSettingsInput>({
    resolver: zodResolver(platformSettingsSchema) as unknown as Resolver<PlatformSettingsInput>,
    defaultValues: {
      company_name: initialData?.company_name ?? '',
      company_website: initialData?.company_website ?? '',
      company_address: initialData?.company_address ?? '',
      company_phone: initialData?.company_phone ?? '',
      company_whatsapp: initialData?.company_whatsapp ?? '',
      email_from_address: initialData?.email_from_address ?? '',
      email_from_name: initialData?.email_from_name ?? 'ITRAMOS Suporte',
      holiday_notice_days: initialData?.holiday_notice_days ?? 7,
      recurrence_min_tickets: initialData?.recurrence_min_tickets ?? 3,
      recurrence_window_days: initialData?.recurrence_window_days ?? 30,
      business_hours_start: initialData?.business_hours_start ?? '09:00',
      business_hours_end: initialData?.business_hours_end ?? '18:00',
      business_hours_days: (initialData?.business_hours_days as number[])?.map(String) as unknown as number[] ?? [1, 2, 3, 4, 5],
      hourly_rate: initialData?.hourly_rate ?? undefined,
      km_rate: initialData?.km_rate ?? undefined,
      billing_alert_days: initialData?.billing_alert_days ?? 7,
    },
  })

  async function onSubmit(data: PlatformSettingsInput) {
    setFeedback(null)
    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'business_hours_days' && Array.isArray(value)) {
        value.forEach((v) => formData.append('business_hours_days', String(v)))
      } else if (value !== undefined && value !== null) {
        formData.append(key, String(value))
      }
    })

    if (logoLightUrl) formData.append('logo_light_url', logoLightUrl)
    if (logoDarkUrl) formData.append('logo_dark_url', logoDarkUrl)

    const result = await updateSettingsAction(formData)
    if (result?.error) {
      setFeedback({ type: 'error', message: result.error })
    } else {
      setFeedback({ type: 'success', message: 'Configurações salvas com sucesso.' })
    }
  }

  const weekdays = [
    { value: 1, label: 'Seg' },
    { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' },
    { value: 4, label: 'Qui' },
    { value: 5, label: 'Sex' },
    { value: 6, label: 'Sáb' },
    { value: 7, label: 'Dom' },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {feedback && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-800 ring-1 ring-green-200'
              : 'bg-destructive/10 text-destructive ring-1 ring-destructive/20'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nome da empresa</label>
            <input {...register('company_name')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Website</label>
            <input {...register('company_website')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.company_website && <p className="text-sm text-destructive mt-1">{errors.company_website.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Endereço</label>
            <input {...register('company_address')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Telefone</label>
            <input {...register('company_phone')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">WhatsApp</label>
            <input {...register('company_whatsapp')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>

          {/* Logo uploads */}
          <div className="space-y-4 pt-2">
            <p className="text-sm font-semibold">Logotipos</p>
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
            <div>
              <label className="text-sm font-medium">Logo (tema claro)</label>
              {logoLightUrl && (
                <div className="mt-1 mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoLightUrl} alt="Logo claro" className="h-12 object-contain border rounded-md p-1 bg-white" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(file, 'light')
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Logo (tema escuro)</label>
              {logoDarkUrl && (
                <div className="mt-1 mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoDarkUrl} alt="Logo escuro" className="h-12 object-contain border rounded-md p-1 bg-gray-900" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(file, 'dark')
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>E-mail</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">E-mail remetente</label>
            <input {...register('email_from_address')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.email_from_address && <p className="text-sm text-destructive mt-1">{errors.email_from_address.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Nome do remetente</label>
            <input {...register('email_from_name')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.email_from_name && <p className="text-sm text-destructive mt-1">{errors.email_from_name.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Horário de Atendimento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium">Início</label>
              <input type="time" {...register('business_hours_start')} className="mt-1 block border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Fim</label>
              <input type="time" {...register('business_hours_end')} className="mt-1 block border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">Dias da semana</label>
            <div className="flex gap-3">
              {weekdays.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    value={value}
                    {...register('business_hours_days')}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.business_hours_days && <p className="text-sm text-destructive mt-1">{errors.business_hours_days.message ?? 'Selecione ao menos um dia.'}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Custos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Valor hora (R$)</label>
            <input type="number" step="0.01" {...register('hourly_rate')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Valor km (R$)</label>
            <input type="number" step="0.01" {...register('km_rate')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notificações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Aviso de feriado (dias antes)</label>
            <input type="number" {...register('holiday_notice_days')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.holiday_notice_days && <p className="text-sm text-destructive mt-1">{errors.holiday_notice_days.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Mínimo de chamados para recorrência</label>
            <input type="number" {...register('recurrence_min_tickets')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.recurrence_min_tickets && <p className="text-sm text-destructive mt-1">{errors.recurrence_min_tickets.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Janela de recorrência (dias)</label>
            <input type="number" {...register('recurrence_window_days')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.recurrence_window_days && <p className="text-sm text-destructive mt-1">{errors.recurrence_window_days.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Alerta de vencimento de contrato (dias antes)</label>
            <input type="number" {...register('billing_alert_days')} className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
            {errors.billing_alert_days && <p className="text-sm text-destructive mt-1">{errors.billing_alert_days.message}</p>}
          </div>
        </CardContent>
      </Card>

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Salvando...' : 'Salvar configurações'}
      </button>
    </form>
  )
}
