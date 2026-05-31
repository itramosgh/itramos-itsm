'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'

interface DataPoint {
  month: string   // "2025-01"
  label: string   // "Jan/25"
  count: number
}

interface Props {
  data: DataPoint[]
  average: number
  currentMonth: string  // "2025-06"
}

export function TicketTimelineChart({ data, average, currentMonth }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          formatter={(value) => [value, 'Chamados abertos']}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          contentStyle={{ borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb' }}
        />
        <ReferenceLine
          y={average}
          stroke="#6366f1"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `Média: ${average % 1 === 0 ? average : average.toFixed(1)}`,
            position: 'insideTopRight',
            fill: '#6366f1',
            fontSize: 11,
            fontWeight: 500,
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {data.map(entry => (
            <Cell
              key={entry.month}
              fill={entry.month === currentMonth ? '#1e40af' : '#93c5fd'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
