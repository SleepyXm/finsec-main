import type { RawData } from "@/app/types/charts"

export function createBarContext(bars: RawData[]) {
  return {
    close: (offset: number) => bars[offset].close,
    high:  (offset: number) => bars[offset].high,
    low:   (offset: number) => bars[offset].low,
    open:  (offset: number) => bars[offset].open,
    time:  (offset: number) => bars[offset].time,
    length: bars.length,
  }
}
