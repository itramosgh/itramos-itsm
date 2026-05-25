import { describe, it, expect } from 'vitest'

function calculateTotalCost(params: {
  serviceTimeMinutes: number
  travelDiscountMinutes: number
  kmTraveled: number
  tollAmount: number
  parkingAmount: number
  hourlyRate: number
  kmRate: number
}): number {
  const { serviceTimeMinutes, travelDiscountMinutes, kmTraveled, tollAmount, parkingAmount, hourlyRate, kmRate } = params
  const billableMinutes = Math.max(0, serviceTimeMinutes - travelDiscountMinutes)
  const technicalFee = (billableMinutes / 60) * hourlyRate
  const kmFee = kmTraveled * kmRate
  return Number((technicalFee + kmFee + tollAmount + parkingAmount).toFixed(2))
}

describe('calculateTotalCost', () => {
  it('calcula custo com valores cheios', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 120,
      travelDiscountMinutes: 0,
      kmTraveled: 30,
      tollAmount: 5.5,
      parkingAmount: 10,
      hourlyRate: 200,
      kmRate: 1.5,
    })
    // 2h × R$200 + 30km × R$1.5 + R$5.5 + R$10 = 400 + 45 + 5.5 + 10 = 460.5
    expect(total).toBe(460.5)
  })

  it('aplica desconto no tempo de deslocamento corretamente', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 180,
      travelDiscountMinutes: 60,
      kmTraveled: 0,
      tollAmount: 0,
      parkingAmount: 0,
      hourlyRate: 100,
      kmRate: 0,
    })
    // 180min - 60min = 120min = 2h × R$100 = 200
    expect(total).toBe(200)
  })

  it('desconto não pode resultar em minutos negativos', () => {
    const total = calculateTotalCost({
      serviceTimeMinutes: 30,
      travelDiscountMinutes: 60,
      kmTraveled: 0,
      tollAmount: 0,
      parkingAmount: 0,
      hourlyRate: 100,
      kmRate: 0,
    })
    expect(total).toBe(0)
  })
})
