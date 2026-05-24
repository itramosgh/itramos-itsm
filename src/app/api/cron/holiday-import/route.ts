import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface BrasilAPIHoliday {
  date: string
  name: string
  type: 'national' | 'bank' | 'optional' | 'observance'
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const year = new URL(request.url).searchParams.get('year')
    ?? new Date().getFullYear().toString()

  const supabase = await createServiceClient()

  const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`)
  if (!response.ok) {
    await supabase.from('system_logs').insert({
      category: 'cron_job',
      status: 'failure',
      description: `Falha ao importar feriados ${year} da BrasilAPI`,
      details: { status: response.status },
    } as never)
    return NextResponse.json({ error: 'BrasilAPI request failed' }, { status: 502 })
  }

  const holidays: BrasilAPIHoliday[] = await response.json()
  let imported = 0
  let skipped = 0

  for (const h of holidays) {
    const type = h.type === 'national' ? 'nacional' : 'municipal'
    const { error } = await supabase
      .from('holidays')
      .insert({ date: h.date, name: h.name, type, year: parseInt(year) } as never)

    if (error?.code === '23505') skipped++
    else if (!error) imported++
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: `Feriados ${year} importados da BrasilAPI`,
    details: { imported, skipped, total: holidays.length },
  } as never)

  return NextResponse.json({ ok: true, year, imported, skipped })
}
