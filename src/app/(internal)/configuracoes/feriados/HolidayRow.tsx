'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { deleteHolidayAction } from './actions'
import { HolidayNoticeButton } from './HolidayNoticeButton'
import { HolidayNoticeSheet } from './HolidayNoticeSheet'

interface Props {
  holiday: { id: string; date: string; name: string; type: string }
  typeLabel: string
  sentCount: number
}

export function HolidayRow({ holiday, typeLabel, sentCount }: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false)

  return (
    <tr className="border-b">
      <td className="p-3">{new Date(holiday.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
      <td className="p-3">{holiday.name}</td>
      <td className="p-3 text-muted-foreground text-xs">{typeLabel}</td>
      <td className="p-3">
        <button
          onClick={() => setSheetOpen(true)}
          className={`text-xs font-medium rounded-full px-2 py-0.5 ${
            sentCount > 0
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {sentCount > 0 ? `${sentCount} enviados` : 'Não enviado'}
        </button>
        <HolidayNoticeSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          holidayId={holiday.id}
          holidayName={holiday.name}
          holidayDate={holiday.date}
        />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1 justify-end">
          <HolidayNoticeButton
            holidayId={holiday.id}
            holidayName={holiday.name}
            sentCount={sentCount}
          />
          <form action={deleteHolidayAction.bind(null, holiday.id)}>
            <Button variant="ghost" size="sm" type="submit">Remover</Button>
          </form>
        </div>
      </td>
    </tr>
  )
}
