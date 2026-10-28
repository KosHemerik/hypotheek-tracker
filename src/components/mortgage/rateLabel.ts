import type { MortgageSummary } from '@/lib/calculations'
import { formatRate } from '@/lib/format'

/**
 * Huidige rente voor kaarten en kerncijfers. Eén leningdeel (of overal dezelfde rente):
 * "3,72%". Meerdere delen met verschillende rente: "gem. 3,81%" plus de bandbreedte.
 */
export function rateLabel(summary: MortgageSummary): { value: string; range: string | null } {
  if (summary.currentRateMilliPct === null || !summary.rateRange) return { value: '—', range: null }
  const { min, max } = summary.rateRange
  if (min === max) return { value: formatRate(min), range: null }
  return {
    value: `gem. ${formatRate(summary.currentRateMilliPct)}`,
    range: `${formatRate(min)} – ${formatRate(max)}`,
  }
}
