export type WeeklyTableColumn = { key: string; label?: string | null }
export function weeklyScheduleDelayHeadline(card: {
  label?: string | null
  value?: string | number | null
  comparison_label?: string | null
  comparison_value?: number | null
}): string | null {
  if (!/^(overall\s+)?schedule\s+status$/i.test(card.label?.trim() ?? '')
    || !/^delayed$/i.test(String(card.value ?? '').trim())
    || !/days?\s+beyond\s+(?:reference|baseline|contractual)\s+completion/i.test(card.comparison_label ?? '')
    || typeof card.comparison_value !== 'number' || !Number.isFinite(card.comparison_value) || card.comparison_value <= 0) return null
  return `${card.comparison_value.toLocaleString('en-GB')} ${card.comparison_value === 1 ? 'day' : 'days'} Delayed`
}

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
export function visibleWeeklyColumns(columns: WeeklyTableColumn[]): WeeklyTableColumn[] {
  const statusSummary = columns.some(column => [column.key, column.label ?? ''].some(value => ['count', 'statuscount', 'recordcount'].includes(compact(value))))
  return columns.filter(column => {
    const names = [column.key, column.label ?? ''].map(compact)
    const statusMetric = names.some(name => name.includes('status') && (/count|total|percent|pct/.test(name) || /^status(?:a|b|c|d|ur)$/.test(name)))
    const statusCategory = statusSummary && !names.some(name => name.includes('activitystatus')) && names.some(name => ['status', 'statuscode', 'statuslabel', 'statusname'].includes(name))
    return !names.some(name => {
    return name.includes('wbs') || (name.includes('status') && !statusMetric && !statusCategory) || name.includes('criticalpath')
      || ['critical', 'iscritical', 'criticalflag'].includes(name)
      || name.includes('longestpath') || name.includes('floatpath') || name.includes('floatorder')
    })
  })
}

const PHASES = [
  ['MI', 'Milestone'], ['EN', 'Engineering'], ['CO', 'Construction'], ['HO', 'Close-Out / Handing Over'],
  ['AUH', 'Authority Approvals'], ['TC', 'Final Testing and Commissioning'],
] as const
export function prepareWeeklyTable(columns: WeeklyTableColumn[], rows: Record<string, unknown>[], title: string, disciplines: Record<string, string> = {}) {
  const visible = visibleWeeklyColumns(columns)
  const disciplineColumn = columns.find(column => ['discipline', 'disciplinecode', 'disciplinename'].includes(compact(column.key)))
  if (disciplineColumn && /shop.*drawing|dwg/i.test(title) && /discipline/i.test(title)) {
    return {
      columns: visible.map(column => column.key === disciplineColumn.key ? { ...column, label: 'Discipline' } : column),
      rows: rows.map(row => ({ ...row, [disciplineColumn.key]: disciplines[String(row[disciplineColumn.key] ?? '').trim().toUpperCase()] ?? row[disciplineColumn.key] })),
    }
  }
  const phaseColumn = columns.find(column => ['phase', 'phasecode', 'phasename', 'dgtphase'].includes(compact(column.key)))
  const comparison = /phase.*progress|progress.*phase/i.test(title)
    || (columns.some(column => /planned/i.test(column.key)) && columns.some(column => /actual/i.test(column.key)))
  if (!phaseColumn || !comparison) return { columns: visible, rows }
  const order: [string, string][] = [...PHASES.map(([code, name]) => [code, name] as [string, string])]
  const phase = (value: unknown) => order.find(([code, name]) => compact(String(value)) === compact(code) || compact(String(value)) === compact(name))
  return {
    columns: visible.map(column => column.key === phaseColumn.key ? { ...column, label: 'Phase' } : column),
    rows: rows.filter(row => phase(row[phaseColumn.key])).map(row => ({ ...row, [phaseColumn.key]: phase(row[phaseColumn.key])![1] }))
      .sort((a, b) => order.findIndex(([, name]) => name === a[phaseColumn.key]) - order.findIndex(([, name]) => name === b[phaseColumn.key])),
  }
}

export interface ReportChartSeries {
  name: string
  color?: string | null
  color_key?: string | null
  data: (number | null | { x: string | number; y: number | null })[]
  points?: Record<string, unknown>[]
}
export function prepareWeeklyChart(categories: string[], series: ReportChartSeries[]) {
  const labels = [...categories]
  const normalised = series.map(item => {
    const points = item.data.some(value => value != null && typeof value === 'object')
      ? item.data.filter((value): value is { x: string | number; y: number | null } => value != null && typeof value === 'object')
        .map(value => {
          const name = String(value.x)
          if (!labels.includes(name)) labels.push(name)
          return { name, [item.name]: value.y }
        }) : undefined
    return { ...item, points }
  })
  if (!categories.length && labels.every(label => /^\d{4}-\d{2}-\d{2}/.test(label))) labels.sort()
  const chartData = labels.map((name, index) => {
    const row: Record<string, unknown> = { name }
    for (const item of normalised) {
      row[item.name] = item.points ? item.points.find(point => point.name === name)?.[item.name] ?? null : item.data[index] ?? null
    }
    return row
  })
  return { chartData, series: normalised }
}
