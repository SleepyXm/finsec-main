import { RawData } from "@/app/types/charts"

export type Bar = {
  time: number  // parse the string once, store as unix ms
  open: number
  high: number
  low: number
  close: number
}

export function createBarContext(bars: Bar[]) {
  return {
    close: (offset: number) => bars[offset].close,
    high:  (offset: number) => bars[offset].high,
    low:   (offset: number) => bars[offset].low,
    open:  (offset: number) => bars[offset].open,
    time:  (offset: number) => bars[offset].time,
    length: bars.length,
  }
}

export function normalizeBars(raw: RawData[]): Bar[] {
  return raw.map(r => ({
    time: Date.parse(r.time),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
  }))
}