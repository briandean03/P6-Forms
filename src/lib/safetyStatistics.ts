export const safetyCategories = [
  ['manpower', '1 Manpower'], ['accidents', '2 Accident'],
  ['vehicular_accidents', '3 Vehicular Accident'], ['training_and_meetings', '4 Training and Meeting'],
  ['illness_first_aid_near_misses', '5 Illness / First Aid / Near misses'], ['fire_incidents', '6 Fire Incident'],
  ['property', '7 Property'], ['inspections_observations', '8 Inspection / Observation Report (SOR, SI, NCR)'],
  ['emergency_drills', '9 Mock up Drill'], ['environment', '10 Environmental'],
] as const
export interface SafetyMetric { category: string; metric_key: string; kind: 'period' | 'status'; doc_no: string; label: string; sort_order: number }
export const periodFields = ['month_value', 'ytd', 'inception'] as const
export const statusFields = ['open_count', 'closed_count', 'total_count'] as const
export type ValueField = typeof periodFields[number] | typeof statusFields[number]
export type MetricValues = Partial<Record<ValueField, string>>
export const metricId = (metric: Pick<SafetyMetric, 'category' | 'metric_key'>) => JSON.stringify([metric.category, metric.metric_key])
export function parseSafetyNumber(raw: string): number | null {
  const value = raw.trim().replace(/,/g, '')
  if (!value || value === '-') return null
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Enter a non-negative number, or leave empty.')
  return Number(value)
}
export function metricWarning(metric: SafetyMetric, values: MetricValues) {
  try {
    const [a, b, c] = (metric.kind === 'period' ? periodFields : statusFields).map(field => parseSafetyNumber(values[field] ?? ''))
    if (metric.kind === 'status') return a !== null && b !== null && c !== null && a + b !== c ? 'Open + Closed does not equal Total.' : ''
    return (a !== null && b !== null && a > b) || (b !== null && c !== null && b > c) ? 'Expected Month ≤ Year To Date ≤ From Job Inception.' : ''
  } catch { return '' }
}
