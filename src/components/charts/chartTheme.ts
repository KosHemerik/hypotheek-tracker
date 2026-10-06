/** Gedeelde stijl voor grafieken: recessieve assen/grid, tekst altijd in inkt-tinten. */
export const CHART_COLORS = {
  principal: '#2a78d6',
  interest: '#eb6834',
  theoretical: '#52514e',
  grid: '#e2e8f0',
  axis: '#64748b',
  surface: '#ffffff',
} as const

export const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.axis, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const
