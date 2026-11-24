export const LONG_LEAD_TABLE = 'dbp6_000401_longlead'
export const ENGINEERING_HISTORY_TABLE = 'dbp6_000401_engineering_history'
export interface LongLeadRecord {
  id: string; transmittal_ref: string; engineering_revision: number | null
  order_planned_date: string | null; first_delivery_planned_date: string | null
  order_placed_date: string | null; delivered_date: string | null
  procurement_tracker_status: string | null; supplier_name: string | null
  lpo_number: number | null; week_num: number | null; created_at: string
}
export interface EngineeringReference {
  dgt_transmittalref: string | null; dgt_revision: number | null
  dgt_transmittalsubject: string | null; is_long_lead: boolean | null
}
export const longLeadFields = [
  ['order_planned_date', 'Order planned date'], ['first_delivery_planned_date', 'First delivery planned date'],
  ['order_placed_date', 'Order placed date'], ['delivered_date', 'Delivered date'],
] as const
export const emptyLongLead = { transmittal_ref: '', engineering_revision: '', week_num: '', order_planned_date: '', first_delivery_planned_date: '', order_placed_date: '', delivered_date: '', procurement_tracker_status: '', supplier_name: '', lpo_number: '' }
export type LongLeadDraft = typeof emptyLongLead
export function latestEngineeringRevision(rows: EngineeringReference[]): number | null {
  const revisions = rows.map(row => row.dgt_revision).filter((value): value is number => value != null)
  return revisions.length ? Math.max(...revisions) : null
}
export function integerError(value: string, label: string, minimum: number) {
  return value !== '' && (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) < minimum || Number(value) > 2147483647) ? `${label} must be a whole number from ${minimum} to 2147483647.` : ''
}
