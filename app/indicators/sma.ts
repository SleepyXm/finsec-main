import { createBarContext } from "@/app/indicators/types"

export function sma(ctx: ReturnType<typeof createBarContext>, source: (offset: number) => number, period: number): number {
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += source(i)
  }
  return sum / period
}