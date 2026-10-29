import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
  ReferenceLine,
} from 'recharts'
import { schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StructurePlanWidget {
  widget_id: string
  widget_type: string
  title?: string
  display_order?: number
  include_in_a3_export?: boolean
  grid?: { column_span?: number; row_span?: number; preferred_width?: string }
}

// Region from a3_layout.layout.regions
interface A3Region {
  region_id: string
  title: string
  region_order: number
  column_span: number
  row_span: number
  widget_ids: string[]
  presentation_mode: string
}

// Top-level a3_layout column
interface A3Layout {
  document_type?: string
  layout_version?: string
  paper?: {
    size?: string
    width_mm?: number
    height_mm?: number
    orientation?: string
    margins_mm?: { top?: number; left?: number; right?: number; bottom?: number }
  }
  footer?: {
    show_data_date?: boolean
    show_report_id?: boolean
    show_project_id?: boolean
    show_design_version?: boolean
  }
  layout?: {
    columns?: number
    regions?: A3Region[]
  }
  dashboard_context?: {
    schema?: string
    week_num?: number
    data_date?: string
    design_id?: string
    report_id?: string
    project_id?: string
    report_type?: string
    structure_id?: string
    design_version?: string
    dashboard_title?: string
    structure_version?: string
  }
  planning_metadata?: {
    selected_widget_ids?: string[]
    omitted_widget_ids?: string[]
    non_widget_region_ids?: string[]
  }
}

interface DashboardStructure {
  structure_id: string
  report_id: string | null
  project_id: string | null
  week_num: number | null
  data_date: string | null
  dashboard_title: string | null
  // pages use { page_id, title, page_order, ... } — note "title" not "page_title"
  structure_plan: { pages?: StructurePlanPage[] } | null
  a3_layout: A3Layout | null
  processing_status: string | null
  is_approved: boolean | null
}

interface StructurePlanPage {
  page_id: string
  page_key?: string
  title: string        // the JSON field is "title", not "page_title"
  page_order: number
  subtitle?: string
  widgets?: StructurePlanWidget[]
}

interface DashboardWidget {
  widget_record_id: string
  structure_id: string | null
  page_id: string | null
  widget_id: string | null
  widget_order: number | null
  widget_title: string | null
  widget_type: string | null
  widget_ast: Record<string, unknown> | null
}

interface DashboardDesign {
  design_id: string
  design_name: string
  design_version: string
  design_specification: Record<string, unknown>
  is_approved: boolean
  is_default: boolean
}

// ── Design token resolver ─────────────────────────────────────────────────────

// Builds a token→hex lookup from design_specification.color_tokens
// e.g. tok('primary') → '#5741DF', tok('surface_primary') → '#FFFFFF'
function buildTokenResolver(spec: Record<string, unknown>) {
  const tokens = (spec.color_tokens ?? {}) as Record<string, { hex?: string }>
  return function tok(name: string, fallback = '#6b7280'): string {
    return tokens[name]?.hex ?? fallback
  }
}

// Default fallback resolver used before design loads (matches current hardcoded values)
const DEFAULT_TOK = buildTokenResolver({
  color_tokens: {
    surface_primary:  { hex: '#ffffff' },
    canvas:           { hex: '#f1f5f9' },
    subtle_border:    { hex: '#e2e8f0' },
    text_primary:     { hex: '#1e293b' },
    text_secondary:   { hex: '#64748b' },
    muted_text:       { hex: '#94a3b8' },
    primary:          { hex: '#3b82f6' },
    mint:             { hex: '#10b981' },
    warning:          { hex: '#f59e0b' },
    critical:         { hex: '#ef4444' },
    success:          { hex: '#10b981' },
    shadow_card:      { hex: 'transparent' },
  },
})

// Context that carries the active token resolver to all sub-components
const DesignContext = createContext<ReturnType<typeof buildTokenResolver>>(DEFAULT_TOK)

// ── Helpers ───────────────────────────────────────────────────────────────────


function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return String(d) }
}

function fmtNum(v: unknown, decimals = 1): string {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return String(v)
  return n % 1 === 0 ? String(n) : n.toFixed(decimals)
}

// Whole-number formatter — rounds to nearest integer (for worker/manpower counts)
function fmtInt(v: unknown): string {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return String(v)
  return String(Math.round(n))
}

// Returns true if the unit string indicates a headcount / manpower quantity
function isWorkerUnit(unit: string | null | undefined): boolean {
  if (!unit) return false
  const u = unit.toLowerCase()
  return ['worker', 'workers', 'manpower', 'headcount', 'persons', 'person', 'people', 'staff', 'head'].some(k => u.includes(k))
}

// Context that carries the current report's Data Date (ISO string) to all chart widgets
const DataDateContext = createContext<string>('')

// Find the x-axis label value in chart data whose date is closest to the given dataDate ISO string
function findDataDateLabel(
  data: Record<string, unknown>[],
  xKey: string,
  labelKey: string,
  dataDate: string,
): string | null {
  if (!dataDate || !data.length) return null
  const target = new Date(dataDate).getTime()
  if (isNaN(target)) return null
  let best: string | null = null
  let bestDiff = Infinity
  for (const row of data) {
    const raw = String(row[labelKey] ?? row[xKey] ?? '')
    const t = new Date(raw).getTime()
    if (!isNaN(t)) {
      const diff = Math.abs(t - target)
      if (diff < bestDiff) {
        bestDiff = diff
        best = raw
      }
    }
  }
  return best
}

// ── Generic reusable sub-components ──────────────────────────────────────────

function NoData({ msg = 'No data available' }: { msg?: string }) {
  return <p className="text-xs text-gray-400 italic py-2">{msg}</p>
}

// Generic table — handles any columns/rows shape
// col spec: either a plain string key or { key, label } object
type ColSpec = { key: string; label: string }

function toColSpecs(columns: unknown[]): ColSpec[] {
  return columns.map(c => {
    if (typeof c === 'string') return { key: c, label: c.replace(/_/g, ' ') }
    if (c != null && typeof c === 'object') {
      const o = c as Record<string, unknown>
      const key   = String(o.key   ?? o.field ?? o.name  ?? o.id    ?? '')
      const label = String(o.label ?? o.title ?? o.header ?? key).replace(/_/g, ' ')
      return { key, label }
    }
    return { key: String(c), label: String(c) }
  }).filter(c => c.key)
}

// ── SortableTable — frozen header, sort, per-column filter ───────────────────

type SortDir = 'asc' | 'desc' | null

function SortableTable({
  columns,
  rows,
  accentHeader = false,
}: {
  columns: unknown[]
  rows: Record<string, unknown>[]
  accentHeader?: boolean
}) {
  const specs = useMemo(() => toColSpecs(columns), [columns])
  const [sortKey, setSortKey]   = useState<string | null>(null)
  const [sortDir, setSortDir]   = useState<SortDir>(null)
  const [filter, setFilter]     = useState('')
  const [colFilter, setColFilter] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (!specs.length || !rows.length) return <NoData />

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows
    const q = filter.toLowerCase()
    // If a column filter is active, only search that column
    return rows.filter(row => {
      if (colFilter) {
        return String(row[colFilter] ?? '').toLowerCase().includes(q)
      }
      return specs.some(({ key }) => String(row[key] ?? '').toLowerCase().includes(q))
    })
  }, [rows, filter, colFilter, specs])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      // numeric sort if both parse as numbers
      const an = Number(av), bn = Number(bv)
      const numA = !isNaN(an) && av !== '' && av != null
      const numB = !isNaN(bn) && bv !== '' && bv != null
      let cmp = 0
      if (numA && numB) {
        cmp = an - bn
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    setSortKey(null); setSortDir(null)
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return (
      <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 8v-8m0 8l4-4m-4 4l-4-4" />
      </svg>
    )
    return sortDir === 'asc'
      ? <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  }

  const thBase = accentHeader
    ? 'px-3 py-2.5 text-left font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap bg-red-50 text-[11px]'
    : 'px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 text-[11px]'

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Filter bar */}
      <div className="no-print flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter rows…"
            className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>
        <select
          value={colFilter ?? ''}
          onChange={e => setColFilter(e.target.value || null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-600 max-w-[120px]"
        >
          <option value="">All columns</option>
          {specs.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {(filter || sortKey) && (
          <button
            onClick={() => { setFilter(''); setColFilter(null); setSortKey(null); setSortDir(null) }}
            className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded border border-gray-200 whitespace-nowrap"
          >
            Clear
          </button>
        )}
        <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
          {sorted.length}/{rows.length} rows
        </span>
      </div>

      {/* Table with frozen header */}
      <div ref={containerRef} className="overflow-auto flex-1" style={{ maxHeight: '560px' }}>
        <table className="min-w-full border-separate border-spacing-0" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {specs.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`${thBase} sticky top-0 cursor-pointer select-none z-10`}
                  style={{ boxShadow: '0 1px 0 #e5e7eb' }}
                >
                  <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <SortIcon col={key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={specs.length} className="px-3 py-4 text-center text-gray-400 italic text-xs">No matching rows</td>
              </tr>
            ) : sorted.map((row, idx) => (
              <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50/40 transition-colors`}>
                {specs.map(({ key }) => (
                  <td key={key} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                    {row[key] != null ? String(row[key]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Derive columns automatically from first row keys
function AutoTable({ rows, accentHeader }: { rows: Record<string, unknown>[]; accentHeader?: boolean }) {
  if (!rows?.length) return <NoData />
  const columns = Object.keys(rows[0])
  return <SortableTable columns={columns} rows={rows} accentHeader={accentHeader} />
}

// ── Helpers to extract content safely ─────────────────────────────────────────

// All widget_ast objects have shape { type, content: { ... } }
// This unwraps the content layer.
function getContent(ast: Record<string, unknown>): Record<string, unknown> {
  const c = ast.content
  if (c != null && typeof c === 'object' && !Array.isArray(c)) {
    return c as Record<string, unknown>
  }
  // Fallback: treat ast itself as content (defensive)
  return ast
}

// ── Widget renderers ──────────────────────────────────────────────────────────

// Shared KPI item type used by kpi_card + kpi_group
type KpiItem = {
  label: string
  value: unknown
  unit?: string | null
  status?: string | null
  variance?: number | null
  variance_unit?: string | null
  comparison_label?: string | null
  comparison_value?: number | null
  data_type?: string
}

function severityColor(status: string | null | undefined) {
  if (!status) return 'text-gray-500'
  if (['critical', 'error', 'behind'].includes(status)) return 'text-red-500'
  if (['overdue', 'warning'].includes(status)) return 'text-amber-600'
  if (['ahead', 'ok', 'good', 'on_track'].includes(status)) return 'text-green-600'
  if (status === 'neutral') return 'text-gray-500'
  return 'text-gray-500'
}

function KpiCard({ item }: { item: KpiItem }) {
  const sColor = severityColor(item.status)
  const variance = item.variance
  const isWorker = isWorkerUnit(item.unit) || item.data_type === 'integer' || item.data_type === 'count'
  const displayValue = item.value != null
    ? (isWorker ? fmtInt(item.value) : String(item.value))
    : '—'
  return (
    <div className="flex flex-col rounded-lg px-4 py-3 bg-gray-50 border border-gray-100">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">{item.label}</span>
      <span className="text-2xl font-bold mt-1 text-gray-900">
        {displayValue}
        {item.unit && <span className="text-sm font-normal text-gray-500 ml-1">{item.unit}</span>}
      </span>
      {item.comparison_label && (
        <span className="text-[11px] text-gray-400 mt-1">
          {item.comparison_label}{item.comparison_value != null ? `: ${isWorker ? fmtInt(item.comparison_value) : fmtNum(item.comparison_value)}${item.unit ? ' ' + item.unit : ''}` : ''}
        </span>
      )}
      {variance != null && (
        <span className={`text-[11px] font-semibold mt-1 ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {variance >= 0 ? '+' : ''}{fmtNum(variance)}{item.variance_unit ? ' ' + item.variance_unit : (item.unit ? ' ' + item.unit : '')}
        </span>
      )}
      {item.status && (
        <span className={`text-[11px] font-semibold mt-1 capitalize ${sColor}`}>{item.status}</span>
      )}
    </div>
  )
}

// kpi_card — content.{ value, label, unit, status, variance, comparison_label, comparison_value }
//            OR content.kpi.{ ... } (some variance widgets wrap kpi under content.kpi)
function KpiCardWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  // Some cards put the main metric inside content.kpi
  const raw = (content.kpi ?? content) as Record<string, unknown>
  const item: KpiItem = {
    label:            String(raw.label ?? ast.title ?? ''),
    value:            raw.value,
    unit:             raw.unit as string | null,
    status:           raw.status as string | null,
    variance:         raw.variance as number | null,
    variance_unit:    raw.variance_unit as string | null,
    comparison_label: raw.comparison_label as string | null,
    comparison_value: raw.comparison_value as number | null,
    data_type:        raw.data_type as string | undefined,
  }
  const primaryMetrics = content.primary_metrics as KpiItem[] | null
  return (
    <div className="space-y-2">
      <KpiCard item={item} />
      {primaryMetrics?.length ? (
        <div className="grid grid-cols-2 gap-2">
          {primaryMetrics.map((m, i) => <KpiCard key={i} item={m} />)}
        </div>
      ) : null}
    </div>
  )
}

// kpi_group — content.items[] OR content.kpis[] OR content.metrics[]
// Some KPI items use actual_current_period/kpi instead of value/label.
// content.empty_state: { title, message, hint } shown when data is unavailable.
function KpiGroupWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rawItems = (content.items ?? content.kpis ?? content.metrics) as (KpiItem & Record<string, unknown>)[] | null

  // If all items have status "unavailable" or none exist, check for an empty_state
  const emptyState = content.empty_state as { title?: string; message?: string; hint?: string } | null
  const hasData = rawItems?.some(r => r.value != null && r.status !== 'unavailable')

  if (!rawItems?.length || (!hasData && emptyState?.title)) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-5 text-center space-y-1">
        <p className="text-xs font-semibold text-gray-500">{emptyState?.title ?? 'No data available'}</p>
        {emptyState?.message && <p className="text-xs text-gray-400 leading-relaxed">{emptyState.message}</p>}
        {emptyState?.hint && <p className="text-[10px] text-gray-300 italic leading-relaxed mt-1">{emptyState.hint}</p>}
      </div>
    )
  }

  const items: KpiItem[] = rawItems.map(raw => ({
    ...raw,
    label:            (raw.label ?? raw.kpi ?? '') as string,
    value:            raw.value ?? raw.actual_current_period ?? null,
    unit:             raw.unit as string | null,
    status:           raw.status as string | null,
    variance:         raw.variance as number | null,
    variance_unit:    raw.variance_unit as string | null,
    comparison_label: (raw.comparison_label ?? (raw.planned_current_period != null ? 'Planned' : null)) as string | null,
    comparison_value: (raw.comparison_value ?? raw.planned_current_period ?? null) as number | null,
    data_type:        raw.data_type as string | undefined,
  }))
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => <KpiCard key={i} item={item} />)}
    </div>
  )
}

// metadata_panel — content.fields[] or content.items[]:
//   { key, label, value, display_value?, status, emphasis, data_type }
// emphasis: "primary" (col-span-2, large text) | "secondary" (normal, prominent) | "tertiary" (small, muted)
function MetadataPanelWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type Field = { key?: string; label: string; value: unknown; display_value?: unknown; status?: string; emphasis?: string; data_type?: string }
  const fields = (content.fields ?? content.items) as Field[] | null
  if (!fields?.length) return <NoData />
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      {fields.map((f, i) => {
        const isUnavailable = f.status === 'unavailable'
        const isPrimary   = f.emphasis === 'primary'
        const isTertiary  = f.emphasis === 'tertiary'
        // Prefer display_value when present (e.g. "W17" instead of 17, or formatted date)
        const display = f.display_value ?? f.value
        return (
          <div key={i} className={isPrimary ? 'col-span-2' : ''}>
            <dt className={`text-[10px] font-semibold uppercase tracking-wide ${isTertiary ? 'text-gray-300' : 'text-gray-400'}`}>{f.label}</dt>
            <dd className={`font-medium ${isPrimary ? 'text-base text-gray-900' : isTertiary ? 'text-xs text-gray-400' : 'text-sm text-gray-800'} ${isUnavailable ? 'italic opacity-50' : ''}`}>
              {display != null ? String(display) : isUnavailable ? 'Unavailable' : '—'}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// alert_panel — content.alerts[]: { alert_id, title|headline, severity, value, unit, summary|detail, metrics[] }
function AlertPanelWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type AlertMetric = { label: string; value: unknown; unit?: string | null }
  type AlertItem = {
    alert_id?: string
    title?: string
    headline?: string
    label?: string
    severity?: string
    value?: number | null
    unit?: string
    summary?: string
    detail?: string
    metrics?: AlertMetric[]
    // engineering exception fields (WGT-005 shape)
    reference?: string
    subject?: string
    metric_label?: string
    metric_value?: number | null
    metric_unit?: string
    date_label?: string
    date_value?: string
    document_class_label?: string
    discipline?: string
    exception_type?: string
  }
  const alerts = (content.alerts ?? content.items ?? content.exceptions) as AlertItem[] | null
  if (!alerts?.length) return <NoData />

  // Also render a top-level headline summary if present
  const panelHeadline = content.headline as string | undefined

  return (
    <div className="space-y-2">
      {panelHeadline && (
        <p className="text-[11px] text-gray-600 leading-relaxed pb-1">{panelHeadline}</p>
      )}
      {alerts.map((alert, i) => {
        const sev = alert.severity ?? 'warning'
        const isCritical = sev === 'critical' || sev === 'error'
        const isOverdue  = sev === 'overdue'
        const rowCls = isCritical
          ? 'bg-red-50 border-red-200'
          : isOverdue
          ? 'bg-orange-50 border-orange-200'
          : 'bg-amber-50 border-amber-200'
        const badgeCls = isCritical
          ? 'bg-red-100 text-red-700'
          : isOverdue
          ? 'bg-orange-100 text-orange-700'
          : 'bg-amber-100 text-amber-700'

        // Resolve headline: prefer explicit title/headline/label, fall back to
        // the engineering exception shape (reference + optional subject)
        const headline = alert.title ?? alert.headline ?? alert.label
          ?? (alert.reference
            ? [alert.reference, alert.subject].filter(Boolean).join(' — ')
            : '')

        // Resolve detail text
        const detail = alert.summary ?? alert.detail
          ?? (alert.date_label && alert.date_value
            ? `${alert.date_label}: ${alert.date_value}`
            : undefined)

        // Resolve numeric metric
        const metricValue = alert.value ?? alert.metric_value
        const metricUnit  = alert.unit  ?? alert.metric_unit

        // Sub-chips for document class / discipline / metric label
        const chips = [
          alert.document_class_label,
          alert.discipline,
          alert.metric_label,
        ].filter(Boolean)

        return (
          <div key={alert.alert_id ?? i} className={`rounded-lg border px-4 py-3 ${rowCls}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray-800 leading-snug flex-1">{headline}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {metricValue != null && (
                  <span className="text-base font-bold text-gray-900">{String(metricValue)}</span>
                )}
                {metricUnit && <span className="text-xs text-gray-500">{metricUnit}</span>}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${badgeCls}`}>{sev}</span>
              </div>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chips.map((chip, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 border border-gray-200 text-gray-500">{chip}</span>
                ))}
              </div>
            )}
            {detail && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{detail}</p>
            )}
            {alert.metrics && alert.metrics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {alert.metrics.map((m, j) => (
                  <span key={j} className="text-[10px] text-gray-600">
                    <span className="font-medium">{m.label}:</span>{' '}
                    {m.value != null ? String(m.value) : '—'}
                    {m.unit ? ` ${m.unit}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// status_summary — multiple content shapes:
//   content.items[]:        { key, label, value|count, unit, semantic_status|status_semantic, reference_label, reference_value }
//   content.statuses[]:     { label, value, unit, semantic_status, status_code, percentage_of_total }   (widget [32] QA/QC)
//   content.metrics[]:      { key, label, value, unit, status, status_label, share_of_total_percent }   (widget [31] Aging)
//   content.status_counts[]: fallback
// Also renders content.breakdown.rows[] as a compact table when present.
// Extended to handle engineering transmittal shape:
//   content.headline_metrics[], content.status_distribution.statuses[], content.aging_metrics[]
function StatusSummaryWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const tok = useContext(DesignContext)

  type StatusItem = {
    key?: string
    label: string
    value?: number | null
    count?: number | null
    unit?: string
    status?: string
    semantic_status?: string
    status_semantic?: string
    status_label?: string
    reference_label?: string
    reference_value?: number | null
    share_of_total_percent?: number | null
    percentage_of_total?: number | null
  }

  // ── Engineering transmittal variant ───────────────────────────────────────
  const headlineMet = content.headline_metrics as StatusItem[] | null
  const statusDist  = content.status_distribution as Record<string, unknown> | null
  const agingMet    = content.aging_metrics as StatusItem[] | null

  if (Array.isArray(headlineMet) && headlineMet.length) {
    const distStatuses = Array.isArray(statusDist?.statuses)
      ? (statusDist!.statuses as { status_code: string; status_label: string; count: number; share_percent: number }[])
      : []

    // Color map for engineering status codes
    const statusCodeColor: Record<string, string> = {
      A: tok('mint',     '#10b981'),
      B: tok('primary',  '#3b82f6'),
      C: tok('warning',  '#f59e0b'),
      D: tok('critical', '#ef4444'),
      UR: '#94a3b8',
    }
    const totalWithStatus = (statusDist?.total_with_recorded_status as number | null) ?? 1

    return (
      <div className="space-y-3">
        {/* Headline metrics — 3-col grid */}
        <div className="grid grid-cols-3 gap-2">
          {headlineMet.map((item, i) => {
            const val    = item.value ?? item.count
            const sColor = severityColor(item.semantic_status ?? item.semantic_status)
            return (
              <div key={i} className="flex flex-col rounded-lg bg-gray-50 border border-gray-100 px-2 py-2">
                <span className={`text-xl font-bold ${sColor}`}>{val != null ? fmtInt(val) : '—'}</span>
                <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-tight mt-0.5">{item.label}</span>
              </div>
            )
          })}
        </div>

        {/* Status distribution stacked bar */}
        {distStatuses.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Status Distribution</p>
            <div className="flex h-3 rounded-full overflow-hidden w-full gap-px">
              {distStatuses.map((s, i) => (
                <div
                  key={i}
                  title={`${s.status_label}: ${s.count} (${fmtNum(s.share_percent, 1)}%)`}
                  style={{
                    width: `${(s.count / totalWithStatus) * 100}%`,
                    background: statusCodeColor[s.status_code] ?? '#cbd5e1',
                    minWidth: s.count > 0 ? 2 : 0,
                  }}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {distStatuses.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: statusCodeColor[s.status_code] ?? '#cbd5e1' }} />
                  <span className="text-[9px] text-gray-500">{s.status_label} <span className="font-semibold text-gray-700">{s.count}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aging metrics */}
        {Array.isArray(agingMet) && agingMet.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Aging Alerts</p>
            <div className="space-y-1">
              {agingMet.map((item, i) => {
                const val    = item.value ?? item.count
                const sColor = severityColor(item.semantic_status)
                return (
                  <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-[10px] text-gray-600">{item.label}</span>
                    <span className={`text-sm font-bold ${sColor}`}>{val != null ? fmtInt(val) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Generic / original variant ─────────────────────────────────────────────
  const raw = (content.items ?? content.statuses ?? content.metrics ?? content.status_counts) as StatusItem[] | null
  if (!raw?.length) return <NoData />

  const breakdownRows = ((content.breakdown as Record<string, unknown> | null)?.rows) as Record<string, unknown>[] | null
  const breakdownCols = ((content.breakdown as Record<string, unknown> | null)?.columns) as { key: string; label: string }[] | null

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {raw.map((item, i) => {
          const displayValue = item.value ?? item.count
          const statusKey    = item.status ?? item.semantic_status ?? item.status_semantic
          const sColor       = severityColor(statusKey)
          const subLabel     = item.status_label ?? (item.share_of_total_percent != null ? `${fmtNum(item.share_of_total_percent, 1)}% of total` : null) ?? (item.percentage_of_total != null ? `${fmtNum(item.percentage_of_total, 1)}%` : null)
          return (
            <div key={i} className="flex flex-col rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <span className={`text-2xl font-bold ${sColor}`}>{displayValue != null ? String(displayValue) : '—'}</span>
              {item.unit && <span className="text-[10px] text-gray-400">{item.unit}</span>}
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-0.5 leading-tight">{item.label}</span>
              {subLabel && <span className="text-[10px] text-gray-400 mt-0.5">{subLabel}</span>}
              {item.reference_label && item.reference_value != null && (
                <span className="text-[10px] text-gray-400 mt-0.5">of {item.reference_value} {item.reference_label.toLowerCase()}</span>
              )}
            </div>
          )
        })}
      </div>
      {breakdownRows?.length ? (
        <SortableTable
          columns={breakdownCols?.length ? breakdownCols : Object.keys(breakdownRows[0])}
          rows={breakdownRows}
        />
      ) : null}
    </div>
  )
}

// ── trade_schedule_gantt ───────────────────────────────────────────────────────
// content.trades[]: { trade_code, trade_label, planned.{cumulative_percent_complete},
//                     actual.{cumulative_percent_complete, status}, variance.{...} }
function TradeScheduleGanttWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const tok = useContext(DesignContext)

  type Trade = {
    trade_code: string
    trade_label: string
    trade_name?: string | null
    planned: { cumulative_percent_complete: number; start?: string | null; finish?: string | null }
    actual:  { cumulative_percent_complete: number; status?: string; start?: string | null; finish?: string | null }
    variance: { start_variance_days?: number | null; finish_variance_days?: number | null }
  }

  const trades = Array.isArray(content.trades) ? (content.trades as Trade[]) : []
  if (!trades.length) return <NoData />

  const plannedColor = tok('primary',      '#9B8ADC')
  const actualColor  = tok('mint',         '#4FAE91')
  const bgTrack      = tok('canvas',       '#f1f5f9')

  return (
    <div className="space-y-1.5 overflow-y-auto max-h-96">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm" style={{ background: plannedColor }} />
          <span className="text-[10px] text-gray-500">Planned %</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm" style={{ background: actualColor }} />
          <span className="text-[10px] text-gray-500">Actual %</span>
        </div>
      </div>

      {/* Row per trade */}
      {trades.map((trade, i) => {
        const plannedPct = Math.min(trade.planned?.cumulative_percent_complete ?? 0, 100)
        const actualPct  = Math.min(trade.actual?.cumulative_percent_complete  ?? 0, 100)
        const label      = trade.trade_name ?? trade.trade_label ?? trade.trade_code
        const finVar     = trade.variance?.finish_variance_days
        const varColor   = finVar == null ? 'text-gray-400' : finVar > 0 ? 'text-red-500' : finVar < 0 ? 'text-green-600' : 'text-gray-500'

        return (
          <div key={i} className="grid items-center gap-x-2" style={{ gridTemplateColumns: '56px 1fr 40px' }}>
            {/* Trade label */}
            <span className="text-[10px] font-semibold text-gray-600 truncate text-right pr-1">{label}</span>

            {/* Dual progress bars */}
            <div className="space-y-0.5">
              {/* Planned */}
              <div className="w-full rounded-sm overflow-hidden" style={{ height: 6, background: bgTrack }}>
                <div className="h-full rounded-sm transition-all" style={{ width: `${plannedPct}%`, background: plannedColor, opacity: 0.7 }} />
              </div>
              {/* Actual */}
              <div className="w-full rounded-sm overflow-hidden" style={{ height: 6, background: bgTrack }}>
                <div className="h-full rounded-sm transition-all" style={{ width: `${actualPct}%`, background: actualColor }} />
              </div>
            </div>

            {/* Percentages */}
            <div className="text-right">
              <div className="text-[9px] text-gray-400">{fmtNum(plannedPct, 1)}%</div>
              <div className="text-[9px] font-semibold text-gray-700">{fmtNum(actualPct, 1)}%</div>
              {finVar != null && <div className={`text-[9px] ${varColor}`}>{finVar > 0 ? `+${finVar}d` : `${finVar}d`}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// progress_bar — content.value (0–100), content.label
function ProgressBarWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const raw    = content.value    as number | null
  const label  = content.label   as string | null
  const target = content.target  as number | null
  const pct = raw != null ? (raw > 1 ? raw : raw * 100) : null
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label ?? 'Progress'}</span>
        <span className="font-bold text-gray-900">{pct != null ? `${fmtNum(pct)}%` : '—'}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
      {target != null && <p className="text-[10px] text-gray-400">Target: {fmtNum(target)}%</p>}
    </div>
  )
}

// ── Shared chart helpers ───────────────────────────────────────────────────────

// Static fallback palette — used when no series color is specified and design hasn't loaded
const PALETTE_FALLBACK = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

// Returns a design-aware chart palette from the DesignContext
function useChartPalette(): string[] {
  const tok = useContext(DesignContext)
  return [
    tok('primary',    PALETTE_FALLBACK[0]),
    tok('mint',       PALETTE_FALLBACK[1]),
    tok('warning',    PALETTE_FALLBACK[2]),
    tok('critical',   PALETTE_FALLBACK[3]),
    tok('primary_light', PALETTE_FALLBACK[4]),
    tok('chart_neutral', PALETTE_FALLBACK[5]),
    tok('chart_highlight', PALETTE_FALLBACK[6]),
  ]
}

// Keep PALETTE as alias for backwards-compat in places that can't use hooks
const PALETTE = PALETTE_FALLBACK

// Compact timeframe picker — pill buttons that control how many data points to show.
// frames: array of { label, pct } where pct is the tail-% of the full data set to keep.
// "All" = 100%, "6M" ≈ last 26 weeks, "3M" ≈ last 13 weeks, "1M" ≈ last 4 weeks.
const TIMEFRAMES = [
  { label: '1M',  pct: 12 },
  { label: '3M',  pct: 37 },
  { label: '6M',  pct: 74 },
  { label: 'All', pct: 100 },
] as const
type TFLabel = typeof TIMEFRAMES[number]['label']

function TimeframePicker({ active, setActive }: { active: TFLabel; setActive: (v: TFLabel) => void }) {
  return (
    <div className="no-print flex items-center gap-1 mt-2 justify-end">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.label}
          onClick={() => setActive(tf.label)}
          style={{
            fontSize: 10, fontWeight: active === tf.label ? 700 : 500,
            padding: '2px 8px', borderRadius: 4, border: '1px solid',
            borderColor: active === tf.label ? '#3b82f6' : '#e2e8f0',
            background: active === tf.label ? '#eff6ff' : '#ffffff',
            color: active === tf.label ? '#1d4ed8' : '#64748b',
            cursor: 'pointer', lineHeight: '16px',
          }}
        >
          {tf.label}
        </button>
      ))}
    </div>
  )
}

// Convert a timeframe label to a data-slice pct
function tfPct(label: TFLabel): number {
  return TIMEFRAMES.find(t => t.label === label)?.pct ?? 100
}

// Detect low-cardinality string columns suitable for filtering
// Returns { key, values[] } pairs, ignoring xKey and the label field
function detectFilterFields(
  data: Record<string, unknown>[],
  excludeKeys: string[]
): { key: string; values: string[] }[] {
  if (!data.length) return []
  return Object.keys(data[0])
    .filter(k => {
      if (excludeKeys.includes(k)) return false
      const sample = data[0][k]
      if (typeof sample !== 'string') return false
      const uniq = new Set(data.map(d => String(d[k] ?? '')))
      return uniq.size >= 2 && uniq.size <= 15
    })
    .map(k => ({ key: k, values: [...new Set(data.map(d => String(d[k] ?? '')))] }))
}

// Compact filter bar — renders one dropdown per filterable field
function ChartFilters({
  fields,
  active,
  setActive,
}: {
  fields: { key: string; values: string[] }[]
  active: Record<string, string>
  setActive: (v: Record<string, string>) => void
}) {
  if (!fields.length) return null
  return (
    <div className="no-print flex flex-wrap items-center gap-1.5 mt-2">
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-1">
          <span className="text-[9px] text-gray-400 capitalize">{f.key.replace(/_/g, ' ')}:</span>
          <select
            value={active[f.key] ?? ''}
            onChange={e => setActive({ ...active, [f.key]: e.target.value })}
            className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">All</option>
            {f.values.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      ))}
      {Object.values(active).some(Boolean) && (
        <button
          onClick={() => setActive({})}
          className="text-[9px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded border border-gray-200"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function applyFilters(data: Record<string, unknown>[], active: Record<string, string>) {
  return Object.entries(active).reduce((acc, [k, v]) => {
    if (!v) return acc
    return acc.filter(row => String(row[k] ?? '') === v)
  }, data)
}

type SeriesSpec = { key: string; label: string; color?: string; dashed?: boolean }

// Normalise series from content:
//   content.series[]: { value_field, name, color?, line_style?, semantic_series? }
// Falls back to all numeric keys except xKey.
function normaliseSeries(content: Record<string, unknown>, xKey: string): SeriesSpec[] {
  type RawSeries = { value_field?: string; name?: string; color?: string; line_style?: string; semantic_series?: string }
  const raw = content.series as RawSeries[] | null
  if (raw?.length) {
    return raw
      .filter(s => s.value_field)
      .map((s, i) => ({
        key:    s.value_field!,
        label:  s.name ?? s.value_field!,
        color:  s.color ?? (s.semantic_series === 'planned' ? '#3b82f6' : s.semantic_series === 'actual' ? '#10b981' : PALETTE[i % PALETTE.length]),
        dashed: s.line_style === 'dashed',
      }))
  }
  // Auto-infer from first data row
  const data = content.data as Record<string, unknown>[] | null
  if (!data?.length) return []
  return Object.keys(data[0])
    .filter(k => k !== xKey && typeof data[0][k] === 'number')
    .map((k, i) => ({ key: k, label: k.replace(/_/g, ' '), color: PALETTE[i % PALETTE.length] }))
}

// ── Print mode hook — fires before print dialog opens ─────────────────────────
// Returns true while the browser is in print layout. Used to disable animations
// and switch ResponsiveContainer to a fixed-height wrapper.
function usePrintMode(): boolean {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const onBefore = () => setPrinting(true)
    const onAfter  = () => setPrinting(false)
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint',  onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint',  onAfter)
    }
  }, [])
  return printing
}

// line_chart — content.data[], content.series[].value_field, content.category_field
// Routes to SCurveLineChartWidget when semantic_role === 's_curve'
function LineChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const semanticRole = ast.semantic_role as string | null
  const title = ast.title as string | null
  const isSCurve = semanticRole === 's_curve' || (title ?? '').toLowerCase().includes('s-curve')
  if (isSCurve) return <SCurveLineChartWidget ast={ast} />

  const content = getContent(ast)
  const data  = content.data as Record<string, unknown>[] | null
  const xKey  = (content.category_field ?? content.x_key ?? content.x_axis ?? 'period_end') as string
  const labelKey = (content.category_label_field ?? xKey) as string
  const series = normaliseSeries(content, xKey)
  const [tf, setTf] = useState<TFLabel>('All')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const dataDate = useContext(DataDateContext)
  const isPrinting = usePrintMode()
  const palette  = useChartPalette()

  if (!data?.length) return <NoData />

  const filterFields = useMemo(() => detectFilterFields(data, [xKey, labelKey]), [data, xKey, labelKey])
  const filtered = useMemo(() => applyFilters(data, activeFilters), [data, activeFilters])
  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * tfPct(tf) / 100)))
  const chartData = sliced.map(d => ({ ...d, __x: d[labelKey] ?? d[xKey] }))
  const ddLabel = findDataDateLabel(sliced, xKey, labelKey, dataDate)

  return (
    <div>
      <div className="print-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="__x" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? palette[i % palette.length]}
                strokeDasharray={s.dashed ? '6 3' : undefined}
                dot={false}
                activeDot={isPrinting ? false : { r: 5, strokeWidth: 2 }}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={!isPrinting}
                animationBegin={i * 150}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            ))}
            {ddLabel && (
              <ReferenceLine
                x={ddLabel}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: 'Data Date', position: 'insideTopRight', fontSize: 9, fill: '#ef4444', dy: 6, dx: -4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {!isPrinting && filtered.length > 4 && <TimeframePicker active={tf} setActive={setTf} />}
    </div>
  )
}

// ── S-Curve widget with Power BI-style range slicer ───────────────────────────
function SCurveLineChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const data = content.data as Record<string, unknown>[] | null
  const palette = useChartPalette()
  if (!data?.length) return <NoData />

  const xKey      = (content.category_field      ?? 'period_end')   as string
  const labelKey  = (content.category_label_field ?? xKey)           as string
  const series    = normaliseSeries(content, xKey)
  const yUnit     = ((content.y_axis as Record<string, unknown> | null)?.unit ?? '') as string
  const dataDate  = useContext(DataDateContext)
  const isPrinting = usePrintMode()

  const totalLen = data.length
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd,   setRangeEnd]   = useState(totalLen - 1)
  const trackRef  = useRef<HTMLDivElement>(null)
  const dragging  = useRef<'start' | 'end' | null>(null)

  // Keep range valid if data length changes
  useEffect(() => {
    setRangeStart(0)
    setRangeEnd(totalLen - 1)
  }, [totalLen])

  const slicedData = useMemo(
    () => data.slice(rangeStart, rangeEnd + 1).map(d => ({ ...d, __x: d[labelKey] ?? d[xKey] })),
    [data, rangeStart, rangeEnd, labelKey, xKey]
  )

  // Convert clientX → index clamped to [0, totalLen-1]
  function clientXToIndex(clientX: number): number {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * (totalLen - 1))
  }

  function onMouseDown(handle: 'start' | 'end') {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = handle
      const onMove = (ev: MouseEvent) => {
        const idx = clientXToIndex(ev.clientX)
        if (dragging.current === 'start') setRangeStart(Math.min(idx, rangeEnd - 1))
        else                              setRangeEnd(Math.max(idx, rangeStart + 1))
      }
      const onUp = () => {
        dragging.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup',   onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup',   onUp)
    }
  }

  function onTouchStart(handle: 'start' | 'end') {
    return () => {
      const onMove = (ev: TouchEvent) => {
        const idx = clientXToIndex(ev.touches[0].clientX)
        if (handle === 'start') setRangeStart(Math.min(idx, rangeEnd - 1))
        else                    setRangeEnd(Math.max(idx, rangeStart + 1))
      }
      const onEnd = () => {
        window.removeEventListener('touchmove', onMove)
        window.removeEventListener('touchend',  onEnd)
      }
      window.addEventListener('touchmove', onMove)
      window.addEventListener('touchend',  onEnd)
    }
  }

  const startPct = (rangeStart / (totalLen - 1)) * 100
  const endPct   = (rangeEnd   / (totalLen - 1)) * 100
  const startLabel = String(data[rangeStart]?.[labelKey] ?? data[rangeStart]?.[xKey] ?? '')
  const endLabel   = String(data[rangeEnd]  ?.[labelKey] ?? data[rangeEnd]  ?.[xKey] ?? '')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customTooltip = (props: any) => {
    const { active, payload, label } = props
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
        <p className="font-semibold text-gray-600 mb-1">{label}</p>
        {payload.map((p: { name: string; value: number; color: string }, i: number) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: p.color }} />
            <span className="text-gray-500">{p.name}:</span>
            <span className="font-bold text-gray-800">{p.value != null ? `${Number(p.value).toFixed(2)}${yUnit}` : '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  const ddLabelSC = findDataDateLabel(slicedData, xKey, labelKey, dataDate)

  return (
    <div className="flex flex-col gap-3">
      {/* Chart */}
      <div className="print-chart">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={slicedData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="__x" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} unit={yUnit} domain={[0, 'auto']} />
            <Tooltip content={customTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? palette[i % palette.length]}
                strokeDasharray={s.dashed ? '6 3' : undefined}
                dot={false}
                activeDot={isPrinting ? false : { r: 5, strokeWidth: 2 }}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={!isPrinting}
                animationBegin={i * 150}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            ))}
            {ddLabelSC && (
              <ReferenceLine
                x={ddLabelSC}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: 'Data Date', position: 'insideTopRight', fontSize: 9, fill: '#ef4444', dy: 6, dx: -4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Slicer — hidden on print */}
      <div className={`no-print px-1 pt-1 pb-2 bg-gray-50 rounded-lg border border-gray-200`}>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date Range</span>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="font-medium text-gray-700">{startLabel}</span>
            <span className="text-gray-300">→</span>
            <span className="font-medium text-gray-700">{endLabel}</span>
            <span className="ml-1 text-gray-400">({rangeEnd - rangeStart + 1} periods)</span>
          </div>
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className="relative mx-3 h-1.5 rounded-full bg-gray-200 cursor-pointer select-none"
          style={{ userSelect: 'none' }}
        >
          {/* Selected range fill */}
          <div
            className="absolute h-full rounded-full bg-blue-400"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />

          {/* Start handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-md cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
            style={{ left: `${startPct}%` }}
            onMouseDown={onMouseDown('start')}
            onTouchStart={onTouchStart('start')}
          >
            <div className="w-1 h-2 rounded-full bg-blue-400" />
          </div>

          {/* End handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-md cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
            style={{ left: `${endPct}%` }}
            onMouseDown={onMouseDown('end')}
            onTouchStart={onTouchStart('end')}
          >
            <div className="w-1 h-2 rounded-full bg-blue-400" />
          </div>
        </div>

        {/* Tick labels — show first, middle, last */}
        <div className="flex justify-between px-3 mt-1">
          {[0, Math.floor((totalLen - 1) / 2), totalLen - 1].map(idx => (
            <span key={idx} className="text-[9px] text-gray-400">
              {String(data[idx]?.[labelKey] ?? data[idx]?.[xKey] ?? '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// bar_chart / grouped_bar_chart / stacked_bar_chart
// Some grouped_bar_chart records nest data under content.chart.data instead of content.data
function BarChartWidget({ ast, horizontal, stacked }: { ast: Record<string, unknown>; horizontal?: boolean; stacked?: boolean }) {
  const content = getContent(ast)
  const chartObj = (content.chart ?? {}) as Record<string, unknown>
  const data  = (content.data ?? chartObj.data) as Record<string, unknown>[] | null
  const merged = chartObj.data ? { ...content, ...chartObj } : content
  const xKey  = (merged.category_field ?? merged.x_key ?? merged.x_axis ?? 'category') as string
  const series = normaliseSeries(merged, xKey)
  const [tf, setTf] = useState<TFLabel>('All')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const palette = useChartPalette()

  if (!data?.length) {
    const emptyState = (content.empty_state ?? chartObj.empty_state) as { heading?: string; message?: string } | null
    if (emptyState?.heading) {
      return (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-gray-500">{emptyState.heading}</p>
          {emptyState.message && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{emptyState.message}</p>}
        </div>
      )
    }
    return <NoData />
  }

  const filterFields = useMemo(() => detectFilterFields(data, [xKey]), [data, xKey])
  const filtered = useMemo(() => applyFilters(data, activeFilters), [data, activeFilters])
  const isPrinting = usePrintMode()

  const toggleSeries = (key: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const visibleSeries = series.filter(s => !hidden.has(s.key))

  if (horizontal) {
    const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * tfPct(tf) / 100)))
    const hHeight = Math.max(220, sliced.length * 36)
    return (
      <div>
        <div className="print-chart">
          <ResponsiveContainer width="100%" height={hHeight}>
            <BarChart data={sliced} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11 }} width={76} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} onClick={p => toggleSeries(p.dataKey as string)} />
              {visibleSeries.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? palette[i % palette.length]} radius={[0, 3, 3, 0]}
                  isAnimationActive={!isPrinting} animationBegin={i * 100} animationDuration={800} animationEasing="ease-out" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
        {!isPrinting && filtered.length > 4 && <TimeframePicker active={tf} setActive={setTf} />}
      </div>
    )
  }

  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * tfPct(tf) / 100)))
  // Scale height to data: 48px per bar group, min 160, max 340
  const vHeight = Math.min(340, Math.max(160, sliced.length * 48))
  return (
    <div>
      <div className="print-chart">
        <ResponsiveContainer width="100%" height={vHeight}>
          <BarChart data={sliced} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} onClick={p => toggleSeries(p.dataKey as string)} />
            {visibleSeries.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color ?? palette[i % palette.length]}
                stackId={stacked ? 'stack' : undefined}
                radius={stacked ? undefined : [3, 3, 0, 0]}
                isAnimationActive={!isPrinting}
                animationBegin={i * 100}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {!isPrinting && filtered.length > 4 && <TimeframePicker active={tf} setActive={setTf} />}
    </div>
  )
}

// area_chart
function AreaChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const data  = content.data as Record<string, unknown>[] | null
  const xKey  = (content.category_field ?? content.x_key ?? content.x_axis ?? 'period_end') as string
  const series = normaliseSeries(content, xKey)
  const [tf, setTf] = useState<TFLabel>('All')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const dataDate = useContext(DataDateContext)
  const palette  = useChartPalette()
  const isPrinting = usePrintMode()

  if (!data?.length) return <NoData />

  const filterFields = useMemo(() => detectFilterFields(data, [xKey]), [data, xKey])
  const filtered = useMemo(() => applyFilters(data, activeFilters), [data, activeFilters])
  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * tfPct(tf) / 100)))
  const ddLabelArea = findDataDateLabel(sliced, xKey, xKey, dataDate)

  return (
    <div>
      <div className="print-chart">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={sliced} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? palette[i % palette.length]}
                fill={s.color ?? palette[i % palette.length]}
                fillOpacity={0.15}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={!isPrinting}
              />
            ))}
            {ddLabelArea && (
              <ReferenceLine
                x={ddLabelArea}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: 'Data Date', position: 'insideTopRight', fontSize: 9, fill: '#ef4444', dy: 6, dx: -4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {!isPrinting && filtered.length > 4 && <TimeframePicker active={tf} setActive={setTf} />}
    </div>
  )
}

// donut_chart — data items vary by widget but share common patterns:
//   name:  status_label | label | name | status_code
//   value: count | value
//   pct:   share_percent | display_percent | percentage | percent_of_categorized | share_of_categorised_statuses_percent
//   color: color (optional, falls back to STATUS_COLORS then PALETTE)
//   zero:  zero_value | is_zero_count | (value === 0)
// center: center_metric | center_label — { label, value, unit, secondary_label?, secondary_value?, secondary_unit? }

// Fixed colour map for engineering/QA status codes (A=green, B=blue, C=amber, D=red, UR=slate, OPN=red, CLS=green)
const STATUS_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444', UR: '#94a3b8',
  OPN: '#ef4444', CLS: '#10b981',
}

function DonutChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type Slice = Record<string, unknown>
  const chartObj = (content.chart ?? {}) as Record<string, unknown>
  const raw = (content.data ?? chartObj.data ?? content.segments ?? content.slices) as Slice[] | null

  // Resolve center metric — supports both center_metric and center_label shapes
  type CenterMeta = { label?: string; value?: number; unit?: string; secondary_label?: string; secondary_value?: number; secondary_unit?: string }
  const centerMeta = (content.center_metric ?? content.center_label) as CenterMeta | null

  if (!raw?.length) return <NoData />

  type NormSlice = { name: string; code: string; value: number; pct: number; color: string }
  const normalised: NormSlice[] = raw
    .map(d => {
      const code  = String(d.status_code ?? d.code ?? '')
      const name  = String(d.status_label ?? d.label ?? d.name ?? code ?? '?')
      const value = (d.count ?? d.value ?? 0) as number
      // Accept any of the percentage field names used across widgets
      const pct   = (
        d.share_percent ??
        d.share_of_categorised_statuses_percent ??
        d.display_percent ??
        d.percentage ??
        d.percent_of_categorized ??
        0
      ) as number
      const color = (d.color as string | undefined) ?? STATUS_COLORS[code] ?? PALETTE[0]
      return { name, code, value, pct, color }
    })
    .filter(d => d.value > 0)

  if (!normalised.length) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center gap-1">
        <p className="text-xs font-semibold text-gray-400">All categories are zero</p>
        {centerMeta && (
          <p className="text-[10px] text-gray-300">{centerMeta.label}: {centerMeta.value ?? 0} {centerMeta.unit ?? ''}</p>
        )}
      </div>
    )
  }

  const total = normalised.reduce((s, d) => s + d.value, 0)

  const isPrinting = usePrintMode()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Donut + center metric */}
      <div className="print-chart" style={{ position: 'relative', flexShrink: 0, width: 180 }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={normalised}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={!isPrinting}
              animationBegin={0}
              animationDuration={900}
              animationEasing="ease-out"
            >
              {normalised.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val, name) => {
                const n = typeof val === 'number' ? val : Number(val ?? 0)
                return [`${n} (${((n / total) * 100).toFixed(2)}%)`, name]
              }}
              contentStyle={{ fontSize: 11, borderRadius: 6, zIndex: 9999, position: 'relative' }}
              wrapperStyle={{ zIndex: 9999 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label overlay */}
        {centerMeta && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center', pointerEvents: 'none', width: 90, zIndex: 1,
          }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1 }}>
              {centerMeta.value ?? total}
            </p>
            <p style={{ fontSize: 9, color: '#94a3b8', margin: '3px 0 0', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {centerMeta.unit ?? 'total'}
            </p>
          </div>
        )}
      </div>
      {/* Right-side legend */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {normalised.map((entry, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#64748b', flex: 1, lineHeight: 1.3 }}>{entry.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{entry.value}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 36, textAlign: 'right' }}>
              {entry.pct > 0 ? `${entry.pct.toFixed(0)}%` : `${((entry.value / total) * 100).toFixed(0)}%`}
            </span>
          </div>
        ))}
        {centerMeta?.label && (
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>{centerMeta.label}</p>
        )}
      </div>
    </div>
  )
}

// data_table — content.columns[] + content.rows[], or content.rows[] (auto columns)
function DataTableWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rawCols = content.columns as unknown[] | null
  const rows = (content.rows ?? content.data) as Record<string, unknown>[] | null
  if (!rows?.length) return <NoData />
  const columns = rawCols?.length ? rawCols : Object.keys(rows[0])
  return <SortableTable columns={columns} rows={rows} />
}

// exception_table — red accent header, no-exceptions state
function ExceptionTableWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rows = (content.rows ?? content.data ?? content.exceptions ?? content.items) as Record<string, unknown>[] | null
  const rawCols = content.columns as unknown[] | null
  if (!rows?.length) return (
    <div className="flex items-center gap-2 text-xs text-green-600 py-2">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      No exceptions
    </div>
  )
  const columns = rawCols?.length ? rawCols : Object.keys(rows[0])
  return <SortableTable columns={columns} rows={rows} accentHeader />
}

// milestone_table / lookahead_table
function MilestoneTableWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rows = (content.rows ?? content.milestones ?? content.activities ?? content.items ?? content.data) as Record<string, unknown>[] | null
  if (!rows?.length) return <NoData />
  return <AutoTable rows={rows} />
}

// hierarchical_table — flatten to a regular table
function HierarchicalTableWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rows = (content.rows ?? content.data ?? content.items) as Record<string, unknown>[] | null
  if (!rows?.length) return <NoData />
  return <AutoTable rows={rows} />
}

// resource_table
function ResourceTableWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const rows = (content.rows ?? content.resources ?? content.items ?? content.data) as Record<string, unknown>[] | null
  if (!rows?.length) return <NoData />
  return <AutoTable rows={rows} />
}

// text_block — content can be a string directly, or content.text / content.body
function TextBlockWidget({ ast }: { ast: Record<string, unknown> }) {
  const raw = ast.content
  // If content is a plain string, render it directly
  if (typeof raw === 'string') {
    return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{raw}</p>
  }
  const content = getContent(ast)
  const text = (content.text ?? content.body ?? content.narrative ?? content.summary) as string | null
  return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text ?? '—'}</p>
}

// JSON fallback for unknown widget types
// ── Smart fallback renderer ────────────────────────────────────────────────────
// Inspects the widget_ast shape and delegates to the best-matching existing
// component so that new widget types added by n8n render without a code change.
// Falls back to a clean "unavailable" placeholder only when no match is found.

function inferWidgetType(ast: Record<string, unknown>): string | null {
  const content = (ast.content ?? ast) as Record<string, unknown>
  // Chart signals
  if (Array.isArray(content.series) && Array.isArray(content.data)) {
    const typeHint = String(ast.chart_type ?? ast.type ?? '').toLowerCase()
    if (typeHint.includes('area'))                    return 'area_chart'
    if (typeHint.includes('bar'))                     return 'bar_chart'
    if (typeHint.includes('stacked'))                 return 'stacked_bar_chart'
    if (typeHint.includes('horizontal'))              return 'horizontal_bar_chart'
    return 'line_chart'
  }
  if (Array.isArray(content.slices) || Array.isArray(content.segments))
                                                      return 'donut_chart'
  // Table signals
  if (Array.isArray(content.rows) || Array.isArray(content.columns))
                                                      return 'data_table'
  if (Array.isArray(content.milestones))              return 'milestone_table'
  if (Array.isArray(content.exceptions))              return 'exception_table'
  // KPI / metric signals
  if (content.value !== undefined || Array.isArray(content.metrics) ||
      Array.isArray(content.primary_metrics))         return 'kpi_card'
  if (Array.isArray(content.items) &&
      (content.items as Record<string,unknown>[])[0]?.status !== undefined)
                                                      return 'status_summary'
  if (Array.isArray(content.items) &&
      (content.items as Record<string,unknown>[])[0]?.narrative !== undefined)
                                                      return 'narrative_summary'
  if (Array.isArray(content.alerts))                  return 'alert_panel'
  if (typeof content.text === 'string' ||
      typeof content.body === 'string')               return 'text_block'
  if (typeof content.percent !== 'undefined' ||
      typeof content.progress !== 'undefined')        return 'progress_bar'
  return null
}

function SmartFallback({ ast, type }: { ast: Record<string, unknown>; type: string | null }) {
  const inferred = inferWidgetType(ast)
  if (inferred) {
    switch (inferred) {
      case 'line_chart':           return <LineChartWidget ast={ast} />
      case 'area_chart':           return <AreaChartWidget ast={ast} />
      case 'bar_chart':            return <BarChartWidget ast={ast} />
      case 'stacked_bar_chart':    return <BarChartWidget ast={ast} stacked />
      case 'horizontal_bar_chart': return <BarChartWidget ast={ast} horizontal />
      case 'donut_chart':          return <DonutChartWidget ast={ast} />
      case 'data_table':           return <DataTableWidget ast={ast} />
      case 'milestone_table':      return <MilestoneTableWidget ast={ast} />
      case 'exception_table':      return <ExceptionTableWidget ast={ast} />
      case 'kpi_card':             return <KpiCardWidget ast={ast} />
      case 'status_summary':       return <StatusSummaryWidget ast={ast} />
      case 'narrative_summary':    return <NarrativeSummaryWidget ast={ast} />
      case 'alert_panel':          return <AlertPanelWidget ast={ast} />
      case 'text_block':           return <TextBlockWidget ast={ast} />
      case 'progress_bar':         return <ProgressBarWidget ast={ast} />
      case 'trade_schedule_gantt': return <TradeScheduleGanttWidget ast={ast} />
    }
  }
  // No match — clean placeholder (never shows raw JSON in production)
  return (
    <div className="flex flex-col items-center justify-center h-24 gap-1 text-gray-300">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h.01M15 9h.01M9 15h6" />
      </svg>
      <span className="text-[10px] text-gray-400 italic">
        {type ? `Widget type "${type}" not yet supported` : 'Unknown widget'}
      </span>
    </div>
  )
}

// narrative_summary — content.items[]: { id, order, title, category, severity, narrative, evidence[], required_action, navigation }
function NarrativeSummaryWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type EvidenceItem = { label: string; value: unknown; unit?: string | null; data_type?: string }
  type NarrativeItem = {
    id?: string
    order?: number
    title?: string
    category?: string
    severity?: string
    narrative?: string
    evidence?: EvidenceItem[]
    required_action?: string
    navigation?: { label?: string; target_page_id?: string }
  }
  const heading  = content.heading  as string | undefined
  const subtitle = content.subtitle as string | undefined
  const footerNote = content.footer_note as string | undefined
  const items = (content.items ?? []) as NarrativeItem[]
  if (!items.length) return <NoData />

  return (
    <div className="space-y-3">
      {heading && <p className="text-xs font-semibold text-gray-700">{heading}</p>}
      {subtitle && <p className="text-[11px] text-gray-500 leading-relaxed">{subtitle}</p>}
      {items
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item, i) => {
          const sev = item.severity ?? 'info'
          const isCritical = sev === 'critical' || sev === 'error'
          const isWarning  = sev === 'warning'
          const borderCls  = isCritical ? 'border-red-300'  : isWarning ? 'border-amber-300'  : 'border-blue-200'
          const bgCls      = isCritical ? 'bg-red-50'       : isWarning ? 'bg-amber-50'       : 'bg-blue-50'
          const badgeCls   = isCritical ? 'bg-red-100 text-red-700' : isWarning ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          const actionCls  = isCritical ? 'border-red-200 text-red-800' : isWarning ? 'border-amber-200 text-amber-800' : 'border-blue-200 text-blue-800'
          return (
            <div key={item.id ?? i} className={`rounded-lg border ${borderCls} ${bgCls} px-4 py-3 space-y-2`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-gray-800 leading-snug flex-1">{item.title}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${badgeCls}`}>{sev}</span>
              </div>
              {item.narrative && (
                <p className="text-[11px] text-gray-600 leading-relaxed">{item.narrative}</p>
              )}
              {item.evidence && item.evidence.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {item.evidence.map((ev, j) => (
                    <span key={j} className="text-[10px] text-gray-600">
                      <span className="font-medium">{ev.label}:</span>{' '}
                      {ev.value != null ? String(ev.value) : '—'}
                      {ev.unit ? ` ${ev.unit}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {item.required_action && (
                <div className={`mt-1 rounded border-l-2 pl-2 py-1 ${actionCls}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Required action: </span>
                  <span className="text-[10px]">{item.required_action}</span>
                </div>
              )}
            </div>
          )
        })}
      {footerNote && (
        <p className="text-[10px] text-gray-400 leading-relaxed italic pt-1">{footerNote}</p>
      )}
    </div>
  )
}

// ── Widget sizing hint ────────────────────────────────────────────────────────
// Returns a CSS grid column-span class for a 4-column grid.
// small (1 col): KPI tiles, progress bars, single-metric cards
// medium (2 col): charts
// large (4 col / full): tables, alert panels, text blocks
function colSpan(type: string | null): string {
  switch (type) {
    case 'kpi_card':
    case 'progress_bar':
      return 'col-span-1'
    case 'kpi_group':
    case 'status_summary':
    case 'metadata_panel':
    case 'donut_chart':
    case 'pie_chart':
      return 'col-span-2'
    case 'line_chart':
    case 'bar_chart':
    case 'grouped_bar_chart':
    case 'stacked_bar_chart':
    case 'horizontal_bar_chart':
    case 'area_chart':
      return 'col-span-2'
    case 'data_table':
    case 'exception_table':
    case 'milestone_table':
    case 'lookahead_table':
    case 'hierarchical_table':
    case 'resource_table':
    case 'alert_panel':
    case 'narrative_summary':
    case 'text_block':
    default:
      return 'col-span-4'
  }
}

// ── Widget dispatcher ─────────────────────────────────────────────────────────

// Renders just the widget content (no card wrapper) — used by both WidgetRenderer and A3WeeklyDashboardPage
function WidgetInner({ widget }: { widget: DashboardWidget }) {
  const ast  = widget.widget_ast ?? {}
  const type = widget.widget_type
  switch (type) {
    case 'kpi_card':           return <KpiCardWidget ast={ast} />
    case 'kpi_group':          return <KpiGroupWidget ast={ast} />
    case 'metadata_panel':     return <MetadataPanelWidget ast={ast} />
    case 'alert_panel':        return <AlertPanelWidget ast={ast} />
    case 'status_summary':     return <StatusSummaryWidget ast={ast} />
    case 'progress_bar':       return <ProgressBarWidget ast={ast} />
    case 'line_chart':         return <LineChartWidget ast={ast} />
    case 'bar_chart':
    case 'grouped_bar_chart':  return <BarChartWidget ast={ast} />
    case 'stacked_bar_chart':  return <BarChartWidget ast={ast} stacked />
    case 'horizontal_bar_chart':return <BarChartWidget ast={ast} horizontal />
    case 'area_chart':         return <AreaChartWidget ast={ast} />
    case 'pie_chart':          return <DonutChartWidget ast={ast} />
    case 'donut_chart':        return <DonutChartWidget ast={ast} />
    case 'data_table':         return <DataTableWidget ast={ast} />
    case 'exception_table':    return <ExceptionTableWidget ast={ast} />
    case 'milestone_table':
    case 'lookahead_table':    return <MilestoneTableWidget ast={ast} />
    case 'hierarchical_table': return <HierarchicalTableWidget ast={ast} />
    case 'resource_table':     return <ResourceTableWidget ast={ast} />
    case 'narrative_summary':  return <NarrativeSummaryWidget ast={ast} />
    case 'text_block':         return <TextBlockWidget ast={ast} />
    case 'trade_schedule_gantt':return <TradeScheduleGanttWidget ast={ast} />
    default:                   return <SmartFallback ast={ast} type={type} />
  }
}

function WidgetRenderer({ widget }: { widget: DashboardWidget }) {
  const type = widget.widget_type

  const isTable = [
    'data_table','exception_table','milestone_table','lookahead_table',
    'hierarchical_table','resource_table',
  ].includes(type ?? '')

  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col ${colSpan(type)}`}>
      {widget.widget_title && (
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 leading-tight flex-shrink-0">
          {widget.widget_title}
        </p>
      )}
      <div className={isTable ? 'flex-1 flex flex-col min-h-0' : ''}>
        <WidgetInner widget={widget} />
      </div>
    </div>
  )
}

// ── Executive Overview — full redesign ────────────────────────────────────────

type ExecPageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
  structure: DashboardStructure
  structures: DashboardStructure[]
  selectedStructureId: string
  onStructureChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

function ExecutiveOverviewPage({
  page: _page,
  pageWidgets,
  structure,
  structures,
  selectedStructureId,
  onStructureChange,
}: ExecPageProps) {
  type KR = Record<string, unknown>
  const tok = useContext(DesignContext)

  // widget lookup
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt001 = w('WGT-001')
  const wgt002 = w('WGT-002')
  const wgt003 = w('WGT-003')
  const wgt005 = w('WGT-005')
  const wgt006 = w('WGT-006')
  const wgt007 = w('WGT-007')

  // ── WGT-001 header ───────────────────────────────────────────────────────────
  const metaC = wgt001 ? getContent(wgt001.widget_ast ?? {}) : null
  // content.items is the array of display fields; content.fields is a flat key-value object — always prefer items
  const _metaRaw = metaC?.items ?? metaC?.fields
  const metaItems: { key?: string; label?: string; value: unknown }[] = Array.isArray(_metaRaw) ? _metaRaw : []
  const m = (key: string) => metaItems.find(f => f.key === key)?.value
  const projectName = String(m('project_name') ?? structure.dashboard_title ?? 'Project Report')
  const period      = String(m('reporting_period_label') ?? '')
  const dataDate    = String(m('data_date') ?? structure.data_date ?? '')
  const weekNum     = m('week_num') ?? structure.week_num

  // ── KPI helpers ───────────────────────────────────────────────────────────────
  const itemsOf = (wgt: typeof wgt001): KR[] => {
    if (!wgt) return []
    const c = getContent(wgt.widget_ast ?? {})
    const raw = c.items ?? c.kpis ?? c.metrics
    return Array.isArray(raw) ? (raw as KR[]) : []
  }
  const v = (item: KR, dec = 2) => {
    const val = item.value
    if (val == null) return '—'
    const n = Number(val)
    return isNaN(n) ? String(val) : n % 1 === 0 ? String(n) : n.toFixed(dec)
  }
  const chip = (item: KR, posGood = true) => {
    const n = Number(item.variance)
    if (isNaN(n) || item.variance == null) return null
    const unit = String(item.variance_unit ?? item.unit ?? '')
    const txt = `${n >= 0 ? '+' : ''}${n % 1 === 0 ? n : n.toFixed(2)}${unit ? ' ' + unit : ''}`
    return { txt, good: posGood ? n >= 0 : n <= 0 }
  }

  // ── WGT-002 progress ─────────────────────────────────────────────────────────
  const progItems = itemsOf(wgt002)
  const pPlanned  = progItems.find(x => x.key === 'overall_planned_progress')  ?? progItems[0] ?? {}
  const pActual   = progItems.find(x => x.key === 'overall_actual_progress')   ?? progItems[1] ?? {}
  const pVar      = progItems.find(x => x.key === 'progress_variance')         ?? progItems[2] ?? {}

  // ── WGT-003 schedule ─────────────────────────────────────────────────────────
  const schItems  = itemsOf(wgt003)
  const sForecast = schItems.find(x => x.key === 'forecast_completion_date')   ?? schItems[0] ?? {}
  const sDelay    = schItems.find(x => x.key === 'current_project_delay_days') ?? schItems[1] ?? {}
  const sCrit     = schItems.find(x => x.key === 'critical_activity_count')    ?? schItems[2] ?? {}
  const sStatus   = schItems.find(x => x.key === 'schedule_status')            ?? schItems[3] ?? {}

  // ── WGT-005 engineering ───────────────────────────────────────────────────────
  const engC     = wgt005 ? getContent(wgt005.widget_ast ?? {}) : null
  const engPrim  = Array.isArray(engC?.primary_metrics) ? (engC!.primary_metrics as KR[]) : []
  const engCtx   = Array.isArray(engC?.context_metrics) ? (engC!.context_metrics as KR[]) : []
  const engDistRaw = (engC?.status_distribution as KR | null)?.segments
  const engDist  = Array.isArray(engDistRaw) ? (engDistRaw as KR[]) : []
  const engTotM  = engCtx.find(x => x.key === 'total_transmittals')
  const engTotal = Number(engTotM?.value ?? 0)
  const ePlanned = engPrim.find(x => x.key === 'planned_submissions_to_date')
  const eSubmit  = engPrim.find(x => x.key === 'submitted_to_date')
  const eOverdue = engPrim.find(x => x.key === 'overdue_not_submitted')
  const eUR      = engCtx.find(x => x.key === 'under_review_over_14_days')
  const eSTC     = engCtx.find(x => x.key === 'status_c_not_resubmitted_over_14_days')
  const ENG_COLORS: Record<string, string> = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#9ca3af', UR: '#ef4444' }

  // ── WGT-006 QA/QC ────────────────────────────────────────────────────────────
  const qaC    = wgt006 ? getContent(wgt006.widget_ast ?? {}) : null
  const qaMet  = Array.isArray(qaC?.metrics)           ? (qaC!.metrics           as KR[]) : []
  const qaSeg  = Array.isArray(qaC?.segments)          ? (qaC!.segments          as KR[]) : []
  const qaAge  = Array.isArray(qaC?.aging_exceptions)  ? (qaC!.aging_exceptions  as KR[]) : []
  const qaT    = qaMet.find(x => x.key === 'total_documents')
  const qaCls  = qaMet.find(x => x.key === 'closed')
  const qaOpn  = qaMet.find(x => x.key === 'open')
  const qa14   = qaMet.find(x => x.key === 'open_over_14_days')
  const QA_COLORS: Record<string, string> = { CLS: '#10b981', OPN: '#f59e0b' }

  // ── WGT-007 exceptions ────────────────────────────────────────────────────────
  const excC      = wgt007 ? getContent(wgt007.widget_ast ?? {}) : null
  const excGroups = Array.isArray(excC?.groups)     ? (excC!.groups     as KR[]) : []
  const excItems  = Array.isArray(excC?.exceptions) ? (excC!.exceptions as KR[]) : []
  const excHd     = excC?.headline as string | undefined
  const excCnts   = excC?.counts  as KR | undefined

  // ── WGT-002 previous-week comparison data ─────────────────────────────────────
  const compBasis = (() => {
    if (!wgt002) return null
    const c = getContent(wgt002.widget_ast ?? {})
    return c.comparison_basis as KR | null
  })()
  const prevWeekNum   = compBasis?.previous_reporting_week_num
  const prevCutoff    = compBasis?.previous_reporting_cutoff as string | undefined
  const prevPlanned   = (compBasis?.baseline_period_for_previous_cutoff as KR | undefined)?.cumulative_planned_percent
  const prevActual    = (compBasis?.actual_period_for_previous_cutoff   as KR | undefined)?.cumulative_actual_percent
  const currPlanned   = Number(pPlanned.value ?? 0)
  const currActual    = Number(pActual.value  ?? 0)

  // ── colour helpers ────────────────────────────────────────────────────────────
  const tokBg = (t: string | undefined) => {
    if (t === 'critical') return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
    if (t === 'overdue')  return { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' }
    if (t === 'warning')  return { bg: '#fffbeb', border: '#fde68a', text: '#b45309' }
    if (t === 'success')  return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' }
    return { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' }
  }
  const tokBorderL = (t: string | undefined) => {
    if (t === 'critical') return '#ef4444'
    if (t === 'overdue')  return '#f97316'
    if (t === 'warning')  return '#f59e0b'
    return '#d1d5db'
  }

  // ── shared style tokens — driven by design specification ─────────────────────
  const CARD: React.CSSProperties = {
    background: tok('surface_primary', '#ffffff'),
    borderRadius: 8,
    border: `1px solid ${tok('subtle_border', '#e2e8f0')}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: tok('text_secondary', '#64748b'),
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
  }
  const ROW_LABEL: React.CSSProperties = { fontSize: 13, color: tok('text_secondary', '#64748b') }
  const ROW_VAL: React.CSSProperties   = { fontSize: 13, fontWeight: 700, color: tok('text_primary', '#1e293b') }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: tok('text_primary', '#1e293b'), background: tok('canvas', '#f1f5f9'), minHeight: '100%' }}>

      {/* ══════════════════════════════════════════════════════════════════════
          TOP NAV BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ background: tok('app_header_bg', '#fff'), borderBottom: `1px solid ${tok('subtle_border', '#e2e8f0')}`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${tok('charcoal', '#1e40af')}, ${tok('primary', '#3b82f6')})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18M3 9h18M3 15h12M3 21h8" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: tok('text_primary', '#1e293b'), letterSpacing: '-0.01em' }}>P6 Control</span>
          <span style={{ fontSize: 13, color: tok('muted_text', '#94a3b8') }}>/</span>
          <span style={{ fontSize: 13, color: tok('text_secondary', '#64748b') }}>{projectName}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Metadata pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {weekNum != null && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              Week {String(weekNum)}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
            Data Date: <strong style={{ color: '#1e293b' }}>{fmtDate(dataDate)}</strong>
          </span>
          {structure.is_approved && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Approved
            </span>
          )}
          {/* Report selector */}
          <select
            value={selectedStructureId}
            onChange={onStructureChange}
            style={{ fontSize: 11, color: '#374151', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', outline: 'none' }}
          >
            {structures.map(s => (
              <option key={s.structure_id} value={s.structure_id}>
                {s.week_num != null ? `Week ${s.week_num}` : 'Week —'} · {fmtDate(s.data_date)}
              </option>
            ))}
          </select>
          {/* Print button */}
          <button
            onClick={() => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 300))) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, background: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" rx="1" />
            </svg>
            Print / PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PAGE TITLE BLOCK
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)' }} />
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Executive Overview</h1>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
              Current project posture, schedule and executive exceptions.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Reporting Period</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{period || `Week ${String(weekNum ?? '—')}`}</p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BODY CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Project & Reporting Identification ─────────────────────────────── */}
        <div style={{ ...CARD }}>
          <p style={{ ...SECTION_LABEL }}>{wgt001?.widget_title ?? 'Project and Reporting Identification'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 20px' }}>
            {metaItems.map((f, i) => (
              <div key={i}>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{String(f.label ?? f.key ?? '')}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0, wordBreak: 'break-word' }}>{String(f.value ?? '—')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Overall Progress Position ──────────────────────────────────────── */}
        <div style={{ ...CARD }}>
          <p style={{ ...SECTION_LABEL }}>{wgt002?.widget_title ?? 'Overall Progress Position'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            {/* Planned */}
            {(() => {
              const d = chip(pPlanned)
              return (
                <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px', borderTop: '3px solid #3b82f6' }}>
                  <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Planned Progress (Cumulative)</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{v(pPlanned)}</span>
                    <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>%</span>
                    {d && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: d.good ? '#f0fdf4' : '#fef2f2', color: d.good ? '#15803d' : '#b91c1c' }}>{d.txt}</span>}
                  </div>
                  {pPlanned.comparison_value != null && (
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ ...ROW_LABEL }}>Previous Week</span>
                        <span style={{ ...ROW_VAL }}>{fmtNum(pPlanned.comparison_value)} %</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ ...ROW_LABEL }}>Weekly Increment</span>
                        <span style={{ ...ROW_VAL, color: '#3b82f6' }}>+{fmtNum(pPlanned.variance)} pp</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Actual */}
            {(() => {
              const d = chip(pActual)
              return (
                <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px', borderTop: '3px solid #10b981' }}>
                  <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Actual Progress (Cumulative)</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{v(pActual)}</span>
                    <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>%</span>
                    {d && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: d.good ? '#f0fdf4' : '#fef2f2', color: d.good ? '#15803d' : '#b91c1c' }}>{d.txt}</span>}
                  </div>
                  {pActual.comparison_value != null && (
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ ...ROW_LABEL }}>Previous Week</span>
                        <span style={{ ...ROW_VAL }}>{fmtNum(pActual.comparison_value)} %</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ ...ROW_LABEL }}>Weekly Increment</span>
                        <span style={{ ...ROW_VAL, color: '#10b981' }}>+{fmtNum(pActual.variance)} pp</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Variance */}
            {(() => {
              const varNeg = Number(pVar.value) < 0
              return (
                <div style={{ background: varNeg ? '#fef2f2' : '#f0fdf4', borderRadius: 8, border: `1px solid ${varNeg ? '#fecaca' : '#bbf7d0'}`, padding: '14px 16px', borderTop: `3px solid ${varNeg ? '#ef4444' : '#10b981'}` }}>
                  <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Progress Variance (Actual − Planned)</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: varNeg ? '#dc2626' : '#15803d', lineHeight: 1 }}>{v(pVar)}</span>
                    <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>pp</span>
                  </div>
                  {!!pVar.status_label && (
                    <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: varNeg ? '#fef2f2' : '#f0fdf4', border: `1px solid ${varNeg ? '#fecaca' : '#bbf7d0'}`, color: varNeg ? '#b91c1c' : '#15803d', marginBottom: 8 }}>
                      {String(pVar.status_label)}
                    </span>
                  )}
                  <div style={{ borderTop: `1px solid ${varNeg ? '#fecaca' : '#bbf7d0'}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...ROW_LABEL }}>Planned</span>
                      <span style={{ ...ROW_VAL }}>{v(pPlanned)} %</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...ROW_LABEL }}>Actual</span>
                      <span style={{ ...ROW_VAL }}>{v(pActual)} %</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Executive Schedule Position ────────────────────────────────────── */}
        <div style={{ ...CARD }}>
          <p style={{ ...SECTION_LABEL }}>{wgt003?.widget_title ?? 'Executive Schedule Position'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>

            {/* Forecast Completion */}
            <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px', borderTop: '3px solid #6366f1' }}>
              <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{String(sForecast.label ?? 'Forecast Completion Date')}</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>{String(sForecast.value ?? '—')}</p>
            </div>

            {/* Project Delay */}
            <div style={{ background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', padding: '14px 16px', borderTop: '3px solid #f59e0b' }}>
              <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{String(sDelay.label ?? 'Current Project Delay')}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#d97706', lineHeight: 1 }}>{v(sDelay, 0)}</span>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>days</span>
              </div>
            </div>

            {/* Critical Activities */}
            {(() => {
              const critD = chip(sCrit, false)
              return (
                <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px', borderTop: '3px solid #64748b' }}>
                  <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{String(sCrit.label ?? 'Critical Activities')}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{v(sCrit, 0)}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>activities</span>
                    {critD && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: critD.good ? '#f0fdf4' : '#fef2f2', color: critD.good ? '#15803d' : '#b91c1c' }}>{critD.txt}</span>}
                  </div>
                  {sCrit.comparison_value != null && (
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Previous week: {String(sCrit.comparison_value)}</p>
                  )}
                </div>
              )
            })()}

            {/* Schedule Status */}
            <div style={{ background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa', padding: '14px 16px', borderTop: '3px solid #ea580c' }}>
              <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{String(sStatus.label ?? 'Schedule Status')}</p>
              <span style={{ display: 'inline-block', fontSize: 16, fontWeight: 800, padding: '5px 14px', borderRadius: 6, background: '#fff', border: '1px solid #fed7aa', color: '#c2410c' }}>
                {String(sStatus.value ?? '—')}
              </span>
            </div>
          </div>
        </div>

        {/* ── Previous Reporting Week Comparison ────────────────────────────── */}
        {compBasis && (
          <div style={{ ...CARD }}>
            <p style={{ ...SECTION_LABEL }}>Previous Reporting Week Comparison</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Planned comparison */}
              <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 10 }}>
                  Planned Progress — W{String(prevWeekNum ?? '')} vs W{String(weekNum ?? '')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>W{String(prevWeekNum ?? '')} · {fmtDate(prevCutoff)}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{fmtNum(prevPlanned)} %</p>
                  </div>
                  <div style={{ flex: 1, height: 2, background: '#e2e8f0', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                      +{fmtNum(currPlanned - Number(prevPlanned ?? 0))} pp
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>W{String(weekNum ?? '')} · {fmtDate(dataDate)}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{fmtNum(currPlanned)} %</p>
                  </div>
                </div>
              </div>

              {/* Actual comparison */}
              <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 10 }}>
                  Actual Progress — W{String(prevWeekNum ?? '')} vs W{String(weekNum ?? '')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>W{String(prevWeekNum ?? '')} · {fmtDate(prevCutoff)}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{fmtNum(prevActual)} %</p>
                  </div>
                  <div style={{ flex: 1, height: 2, background: '#e2e8f0', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: '#10b981', background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                      +{fmtNum(currActual - Number(prevActual ?? 0))} pp
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>W{String(weekNum ?? '')} · {fmtDate(dataDate)}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{fmtNum(currActual)} %</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Overall Engineering Submissions ────────────────────────────────── */}
        <div style={{ ...CARD }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{wgt005?.widget_title ?? 'Overall Engineering Submissions'}</p>
            {engTotal > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                Total Register: <strong style={{ color: '#1e293b', fontSize: 14 }}>{engTotal}</strong> transmittals
              </span>
            )}
          </div>

          {/* 3 primary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {[ePlanned, eSubmit, eOverdue].map((mm, i) => {
              if (!mm) return <div key={i} />
              const isOvd = mm.key === 'overdue_not_submitted'
              const isAct = mm.key === 'submitted_to_date'
              const supporting = mm.supporting_metric as KR | undefined
              return (
                <div key={i} style={{
                  borderRadius: 8, padding: '14px 16px',
                  background: isOvd ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${isOvd ? '#fecaca' : '#e2e8f0'}`,
                  borderTop: `3px solid ${isOvd ? '#ef4444' : isAct ? '#10b981' : '#3b82f6'}`,
                }}>
                  <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{String(mm.label ?? '')}</p>
                  <p style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: isOvd ? '#dc2626' : '#1e293b', marginBottom: supporting ? 6 : 0 }}>{String(mm.value ?? '—')}</p>
                  {supporting && (
                    <p style={{ fontSize: 12, color: '#64748b' }}>{fmtNum(supporting.value as number, 1)}% of planned</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Status distribution bar */}
          {engDist.length > 0 && (() => {
            const total = engDist.reduce((s, sg) => s + Number(sg.count ?? 0), 0)
            const allSegs = engDist
            return (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Status Distribution (by recorded status code)</p>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                  {allSegs.map((sg, i) => (
                    <div key={i} style={{
                      flex: total > 0 ? Number(sg.count) / total : 0,
                      background: ENG_COLORS[String(sg.code ?? '')] ?? '#9ca3af',
                      minWidth: Number(sg.count) > 0 ? 2 : 0,
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {allSegs.map((sg, i) => (
                    <span key={i} style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, display: 'inline-block', background: ENG_COLORS[String(sg.code ?? '')] ?? '#9ca3af', flexShrink: 0 }} />
                      <strong style={{ color: '#1e293b', fontWeight: 700 }}>{String(sg.code ?? '')}</strong>
                      {' — '}{String(sg.count ?? 0)}
                      {Number(sg.share_of_categorised_percent ?? 0) > 0 && (
                        <span style={{ color: '#94a3b8' }}>({fmtNum(sg.share_of_categorised_percent as number, 1)}%)</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Threshold alerts */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[eUR, eSTC].filter(Boolean).map((mm, i) => {
              const isOvd = mm!.semantic === 'overdue'
              return (
                <div key={i} style={{ flex: '1 1 200px', background: isOvd ? '#fff7ed' : '#fffbeb', border: `1px solid ${isOvd ? '#fed7aa' : '#fde68a'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#64748b', flex: 1 }}>{String(mm!.label ?? '')}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: isOvd ? '#ea580c' : '#d97706', marginLeft: 12 }}>{String(mm!.value ?? '—')}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── QA/QC + Exceptions — single-column stacked layout ─────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* QA/QC — full-width row 1 */}
          <div style={{ ...CARD }}>
            <p style={{ ...SECTION_LABEL, marginBottom: 8 }}>{wgt006?.widget_title ?? 'Overall QA/QC Open vs Closed'}</p>

            {/* Segment bar */}
            {qaSeg.length > 0 && (() => {
              const total = qaSeg.reduce((s, sg) => s + Number(sg.count ?? 0), 0)
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    {qaSeg.map((sg, i) => (
                      <div key={i} style={{ flex: Number(sg.count) / total, background: QA_COLORS[String(sg.status_code ?? '')] ?? '#9ca3af' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {qaSeg.map((sg, i) => (
                      <span key={i} style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, display: 'inline-block', flexShrink: 0, background: QA_COLORS[String(sg.status_code ?? '')] ?? '#9ca3af' }} />
                        <strong style={{ color: '#1e293b', fontWeight: 700 }}>{String(sg.status_label ?? sg.status_code ?? '')}</strong>
                        {' '}{String(sg.count ?? 0)}{' '}
                        <span style={{ color: '#94a3b8' }}>({String(sg.share_percent ?? 0)}%)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Metric boxes — 2×2 compact grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {[qaT, qaCls, qaOpn, qa14].filter(Boolean).map((mm, i) => {
                const is14  = mm!.key === 'open_over_14_days'
                const isCls = mm!.key === 'closed'
                return (
                  <div key={i} style={{
                    borderRadius: 6, padding: '9px 12px',
                    background: is14 ? '#fff7ed' : isCls ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${is14 ? '#fed7aa' : isCls ? '#bbf7d0' : '#e2e8f0'}`,
                  }}>
                    <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{String(mm!.label ?? '')}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: is14 ? '#ea580c' : isCls ? '#15803d' : '#1e293b', margin: 0, lineHeight: 1 }}>{String(mm!.value ?? '—')}</p>
                  </div>
                )
              })}
            </div>

            {/* Aging exceptions — scrollable if many items */}
            {qaAge.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Open &gt; 14 Days</p>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 2 }}>
                  {qaAge.map((ex, i) => (
                    <div key={i} style={{ borderRadius: 6, background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '3px solid #f97316', padding: '7px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{String(ex.doc_ref ?? ex.reference ?? '')}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#ea580c', marginLeft: 8, flexShrink: 0 }}>{String(ex.days_open ?? '')} days</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, margin: '0 0 4px' }}>{String(ex.document_subject ?? ex.description ?? '')}</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {!!ex.discipline_code && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#fff', border: '1px solid #e2e8f0', color: '#475569' }}>{String(ex.discipline_code)}</span>}
                        {!!ex.document_type   && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#fff', border: '1px solid #e2e8f0', color: '#475569' }}>{String(ex.document_type)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Major Exceptions — full-width row 2 */}
          {wgt007 && (
            <div style={{ ...CARD, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{wgt007.widget_title}</p>
                {excCnts && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    {String(excCnts.combined_category_exception_total ?? '')} total
                  </span>
                )}
              </div>

              {excHd && (
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>{excHd}</p>
              )}

              {/* Category summary pills */}
              {excGroups.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {excGroups.map((g, i) => {
                    const tok = String(g.status_token ?? '')
                    const col = tokBg(tok)
                    const bd  = g.breakdown as KR | undefined
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8, background: col.bg, border: `1px solid ${col.border}`, minWidth: 130 }}>
                        <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: col.text }}>{String(g.count ?? '—')}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: col.text, lineHeight: 1.2, marginBottom: 2 }}>{String(g.category_label ?? '')}</p>
                          {bd && (
                            <p style={{ fontSize: 11, color: col.text, opacity: 0.8 }}>
                              {Object.entries(bd).map(([k, val]) => `${String(val)} ${k.replace(/_/g, ' ')}`).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Exception rows */}
              {excItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {excItems.map((ex, i) => {
                    const tok = String(ex.status_token ?? 'warning')
                    const bdrColor = tokBorderL(tok)
                    const isSched  = ex.category === 'schedule'
                    const ageLabel = ex.age_basis === 'overdue_days'      ? 'days overdue'
                                   : ex.age_basis === 'days_under_review'  ? 'days u/review'
                                   : ex.age_basis === 'days_since_return'  ? 'days since return'
                                   : ex.age_basis === 'days_open'          ? 'days open'
                                   : 'days'
                    const col = tokBg(tok)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `4px solid ${bdrColor}`, padding: '10px 14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{String(ex.reference ?? '')}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: col.bg, border: `1px solid ${col.border}`, color: col.text }}>
                              {String(ex.category_label ?? ex.category ?? '')}
                            </span>
                          </div>
                          <p style={{ fontSize: 13, color: '#475569', margin: '0 0 5px', lineHeight: 1.5 }}>{String(ex.description ?? '')}</p>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {!!ex.transmittal_type_label && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#fff', border: '1px solid #e2e8f0', color: '#475569' }}>{String(ex.transmittal_type_label)}</span>}
                            {!!ex.document_type          && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#fff', border: '1px solid #e2e8f0', color: '#475569' }}>{String(ex.document_type)}</span>}
                            {!!ex.discipline_code        && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#fff', border: '1px solid #e2e8f0', color: '#475569' }}>{String(ex.discipline_code)}</span>}
                          </div>
                          {isSched && ex.total_float_days != null && (
                            <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                              Float: {Number(ex.total_float_days).toFixed(1)} days{ex.location ? ` · ${String(ex.location)}` : ''}
                            </p>
                          )}
                        </div>
                        {ex.age_days != null && (
                          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 52 }}>
                            <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, color: tok === 'critical' ? '#dc2626' : tok === 'overdue' ? '#ea580c' : '#d97706', margin: 0 }}>
                              {String(ex.age_days)}
                            </p>
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>{ageLabel}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>{/* /body */}
    </div>
  )
}

// ── Progress Analysis Page — 5-row custom layout ──────────────────────────────

type ProgressPageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
}

function ProgressAnalysisPage({ page, pageIdx, pageWidgets }: ProgressPageProps) {
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt008 = w('WGT-008')
  const wgt009 = w('WGT-009')
  const wgt010 = w('WGT-010')
  const wgt011 = w('WGT-011')
  const wgt012 = w('WGT-012')
  const wgt013 = w('WGT-013')
  const wgt014 = w('WGT-014')

  // Extract annotation text from WGT-010 content
  const wgt010Content = wgt010 ? getContent(wgt010.widget_ast ?? {}) : null
  const unitsNote  = wgt010Content?.units_note  as string | undefined
  const windowNote = wgt010Content?.window_note as string | undefined

  // Extract management assessment text from WGT-011 content
  const wgt011Content = wgt011 ? getContent(wgt011.widget_ast ?? {}) : null
  const mgmtAssess    = wgt011Content?.management_assessment as Record<string, unknown> | undefined
  const schedCtx      = wgt011Content?.schedule_context     as Record<string, unknown> | undefined

  // ── shared style tokens — identical to ExecutiveOverviewPage ─────────────────
  const CARD: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
    flexShrink: 0,
  }

  // Helper — renders a widget's chart content inside a sized card
  const ChartCard = ({
    widget,
    height = 260,
    style,
    noteSlot,
  }: {
    widget: DashboardWidget | undefined
    height?: number
    style?: React.CSSProperties
    noteSlot?: React.ReactNode
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'line_chart':          return <LineChartWidget ast={ast} />
        case 'bar_chart':
        case 'grouped_bar_chart':   return <BarChartWidget ast={ast} />
        case 'horizontal_bar_chart':return <BarChartWidget ast={ast} horizontal />
        case 'area_chart':          return <AreaChartWidget ast={ast} />
        default:                    return <SmartFallback ast={ast} type={type} />
      }
    })()
    return (
      <div style={{ ...CARD, ...style }}>
        <p style={{ ...SECTION_LABEL }}>{widget.widget_title ?? ''}</p>
        <div style={{ flex: 1, height, minHeight: height }}>{inner}</div>
        {noteSlot}
      </div>
    )
  }

  // Helper — renders a data table widget
  const TableCard = ({
    widget,
    style,
    headerSlot,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
    headerSlot?: React.ReactNode
  }) => {
    if (!widget) return null
    const ast = widget.widget_ast ?? {}
    return (
      <div style={{ ...CARD, ...style }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12, flexShrink: 0 }}>
          <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{widget.widget_title ?? ''}</p>
          {headerSlot}
        </div>
        <div style={{ flex: 1 }}>
          <DataTableWidget ast={ast} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1e293b', background: '#f1f5f9', minHeight: '100%' }}>

      {/* ── Page title block — matches Executive Overview style ──────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h2>
            </div>
            {page.subtitle ? (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>{page.subtitle}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
                Progress tracking, recovery planning and trade-level analysis.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Page</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{pageIdx + 1}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── ROW 1: Cumulative progress chart (full-width) ───────────────────── */}
      <ChartCard widget={wgt008} height={280} />

      {/* ── ROW 2: Weekly progress (left) + Weekly variance (right) ────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Weekly planned vs actual */}
        <ChartCard widget={wgt009} height={240} />

        {/* Weekly variance + explanatory text below */}
        <ChartCard
          widget={wgt010}
          height={200}
          noteSlot={
            (unitsNote || windowNote) ? (
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 12, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {windowNote && (
                  <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, margin: 0 }}>{windowNote}</p>
                )}
                {unitsNote && (
                  <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>{unitsNote}</p>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      {/* ── ROW 3: Delay Recovery Scenario Planner (full-width) ─────────────── */}
      <TableCard
        widget={wgt011}
        headerSlot={
          !!mgmtAssess ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Schedule context pills */}
              {!!schedCtx && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {schedCtx.reported_schedule_delay_days != null && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
                      {String(schedCtx.reported_schedule_delay_days)} days delay
                    </span>
                  )}
                  {!!schedCtx.forecast_completion_date && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                      FCT: {String(schedCtx.forecast_completion_date)}
                    </span>
                  )}
                </div>
              )}
              {/* Management assessment badge */}
              {!!mgmtAssess.overall_status && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                  background: String(mgmtAssess.overall_status).includes('feasible') ? '#f0fdf4' : '#fff7ed',
                  border: `1px solid ${String(mgmtAssess.overall_status).includes('feasible') ? '#bbf7d0' : '#fed7aa'}`,
                  color: String(mgmtAssess.overall_status).includes('feasible') ? '#15803d' : '#c2410c',
                }}>
                  {String(mgmtAssess.overall_status).replace(/_/g, ' ')}
                </span>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Management assessment text block */}
      {!!mgmtAssess && (!!mgmtAssess.headline || !!mgmtAssess.summary || !!mgmtAssess.recommended_action) && (
        <div style={{
          background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {!!mgmtAssess.headline && (
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{String(mgmtAssess.headline)}</p>
          )}
          {!!mgmtAssess.summary && (
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, margin: 0 }}>{String(mgmtAssess.summary)}</p>
          )}
          {!!mgmtAssess.recommended_action && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', flexShrink: 0, marginTop: 1 }}>ACTION</span>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.55, margin: 0 }}>{String(mgmtAssess.recommended_action)}</p>
            </div>
          )}
        </div>
      )}

      {/* ── ROW 4: Recovery scenario comparison (left) + Progress by phase (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ChartCard widget={wgt012} height={260} />
        <ChartCard widget={wgt013} height={260} />
      </div>

      {/* ── ROW 5: Construction progress by trade (full-width) ─────────────── */}
      <ChartCard widget={wgt014} height={300} />

      </div>{/* /body */}
    </div>
  )
}

// ── Schedule Intelligence Page — 5-row custom layout ──────────────────────────

type SchedulePageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
}

function ScheduleIntelligencePage({ page, pageIdx, pageWidgets }: SchedulePageProps) {
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt015 = w('WGT-015')   // Forecast Completion and Project Delay   — kpi_group
  const wgt016 = w('WGT-016')   // Critical and Longest-Path Summary       — kpi_group
  const wgt017 = w('WGT-017')   // Driving Activities                      — data_table
  const wgt018 = w('WGT-018')   // Key Milestones — Planned vs Forecast    — milestone_table
  const wgt020 = w('WGT-020')   // Two-Week Lookahead                      — lookahead_table

  // ── shared style tokens — identical to ExecutiveOverviewPage ──────────────
  const CARD: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
    flexShrink: 0,
  }

  // Helper — renders a kpi_group widget inside a card
  const KpiCard = ({
    widget,
    style,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
  }) => {
    if (!widget) return null
    const ast = widget.widget_ast ?? {}
    return (
      <div style={{ ...CARD, ...style }}>
        <p style={{ ...SECTION_LABEL }}>{widget.widget_title ?? ''}</p>
        <div style={{ flex: 1 }}>
          <KpiGroupWidget ast={ast} />
        </div>
      </div>
    )
  }

  // Helper — renders a table widget (data_table / milestone_table / lookahead_table)
  const TableCard = ({
    widget,
    style,
    summarySlot,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
    summarySlot?: React.ReactNode
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'data_table':                 return <DataTableWidget ast={ast} />
        case 'milestone_table':
        case 'lookahead_table':            return <MilestoneTableWidget ast={ast} />
        default:                           return <DataTableWidget ast={ast} />
      }
    })()
    return (
      <div style={{ ...CARD, ...style }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12, flexShrink: 0 }}>
          <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{widget.widget_title ?? ''}</p>
          {summarySlot}
        </div>
        <div style={{ flex: 1 }}>{inner}</div>
      </div>
    )
  }

  // Extract lookahead summary counts from WGT-020 content
  const lookaheadContent = wgt020 ? getContent(wgt020.widget_ast ?? {}) : null
  const lookaheadSummary = lookaheadContent?.summary as Record<string, unknown> | undefined

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1e293b', background: '#f1f5f9', minHeight: '100%' }}>

      {/* ── Page title block — matches Executive Overview style ──────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h2>
            </div>
            {page.subtitle ? (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>{page.subtitle}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
                Critical path, milestones, driving activities and two-week lookahead.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Page</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{pageIdx + 1}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ROW 1: Forecast Completion (left) + Critical Path Summary (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <KpiCard widget={wgt015} />
          <KpiCard widget={wgt016} />
        </div>

        {/* ── ROW 2: Driving Activities table (full-width) ──────────────────── */}
        <TableCard widget={wgt017} />

        {/* ── ROW 3: Key Milestones — Planned vs Forecast (full-width) ─────── */}
        <TableCard widget={wgt018} />

        {/* ── ROW 4: Schedule Exceptions — rendered only when widget present ── */}
        {pageWidgets
          .filter(pw => pw.widget_id != null && !['WGT-015','WGT-016','WGT-017','WGT-018','WGT-020'].includes(pw.widget_id))
          .map(pw => {
            const ast  = pw.widget_ast ?? {}
            const type = pw.widget_type
            const inner = (() => {
              switch (type) {
                case 'alert_panel':     return <AlertPanelWidget ast={ast} />
                case 'exception_table': return <ExceptionTableWidget ast={ast} />
                case 'data_table':      return <DataTableWidget ast={ast} />
                default:                return <SmartFallback ast={ast} type={type} />
              }
            })()
            return (
              <div key={pw.widget_record_id} style={{ ...CARD }}>
                <p style={{ ...SECTION_LABEL }}>{pw.widget_title ?? ''}</p>
                <div style={{ flex: 1 }}>{inner}</div>
              </div>
            )
          })}

        {/* ── ROW 5: Two-Week Lookahead (full-width) ────────────────────────── */}
        <TableCard
          widget={wgt020}
          summarySlot={
            !!lookaheadSummary && (
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {[
                  { label: 'Activities',   value: lookaheadSummary.total_activities },
                  { label: 'Starting',     value: lookaheadSummary.starting },
                  { label: 'Critical',     value: lookaheadSummary.critical },
                  { label: 'Longest Path', value: lookaheadSummary.longest_path },
                  { label: 'Milestones',   value: lookaheadSummary.milestones },
                ].filter(s => s.value != null).map((s, i) => (
                  <div key={i} style={{ textAlign: 'center', minWidth: 52 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{String(s.value)}</p>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )
          }
        />

      </div>{/* /body */}
    </div>
  )
}

// ── Engineering, QA/QC and HSE Page — 7-row custom layout ─────────────────────

type EngineeringPageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
}

function EngineeringQAPage({ page, pageIdx, pageWidgets }: EngineeringPageProps) {
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt021 = w('WGT-021')   // Engineering Submission Summary           — kpi_group
  const wgt022 = w('WGT-022')   // Eng Status Distribution — DWG            — donut_chart
  const wgt023 = w('WGT-023')   // Eng Status Distribution — MAT            — donut_chart
  const wgt024 = w('WGT-024')   // Eng Status Distribution — PRQ            — donut_chart
  const wgt025 = w('WGT-025')   // Eng Status Counts by Type & Discipline   — hierarchical_table
  const wgt026 = w('WGT-026')   // Eng Submissions — Last 4 Weeks           — line_chart
  const wgt027 = w('WGT-027')   // QA/QC Status Counts by Discipline & Type — stacked_bar_chart
  const wgt028 = w('WGT-028')   // QA/QC Document Status Summary            — kpi_group
  const wgt029 = w('WGT-029')   // Material Submission Exceptions            — exception_table
  const wgt030 = w('WGT-030')   // QA/QC Open Exceptions                    — exception_table

  // ── shared style tokens — identical to ExecutiveOverviewPage ──────────────
  const CARD: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
    flexShrink: 0,
  }

  // Helper — generic card wrapper that dispatches to the right widget renderer
  const WidgetCard = ({
    widget,
    style,
    height,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
    height?: number
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'kpi_group':          return <KpiGroupWidget ast={ast} />
        case 'donut_chart':
        case 'pie_chart':          return <DonutChartWidget ast={ast} />
        case 'line_chart':         return <LineChartWidget ast={ast} />
        case 'bar_chart':
        case 'grouped_bar_chart':  return <BarChartWidget ast={ast} />
        case 'stacked_bar_chart':  return <BarChartWidget ast={ast} stacked />
        case 'hierarchical_table': return <HierarchicalTableWidget ast={ast} />
        case 'data_table':         return <DataTableWidget ast={ast} />
        case 'exception_table':    return <ExceptionTableWidget ast={ast} />
        default:                   return <SmartFallback ast={ast} type={type} />
      }
    })()
    const needsHeight = ['donut_chart','pie_chart','line_chart','bar_chart','grouped_bar_chart','stacked_bar_chart'].includes(type ?? '')
    return (
      <div style={{ ...CARD, ...style }}>
        <p style={{ ...SECTION_LABEL }}>{widget.widget_title ?? ''}</p>
        <div style={{ flex: 1, ...(needsHeight && height ? { minHeight: height } : {}) }}>
          {inner}
        </div>
      </div>
    )
  }

  // Helper — table card with optional row-count badge in header
  const TableCard = ({
    widget,
    style,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'hierarchical_table': return <HierarchicalTableWidget ast={ast} />
        case 'exception_table':    return <ExceptionTableWidget ast={ast} />
        case 'data_table':         return <DataTableWidget ast={ast} />
        default:                   return <AutoTable rows={(getContent(ast).rows ?? []) as Record<string, unknown>[]} />
      }
    })()
    // Extract row count from content for badge
    const cnt = getContent(ast)
    const rowCount = (cnt.total_exception_rows ?? cnt.row_count ?? (cnt.rows as unknown[] | null)?.length) as number | undefined
    return (
      <div style={{ ...CARD, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0, gap: 12 }}>
          <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{widget.widget_title ?? ''}</p>
          {rowCount != null && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '2px 8px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>{inner}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1e293b', background: '#f1f5f9', minHeight: '100%' }}>

      {/* ── Page title block — matches Executive Overview style ──────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h2>
            </div>
            {page.subtitle ? (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>{page.subtitle}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
                Transmittal status, QA/QC document tracking and exception management.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Page</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{pageIdx + 1}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ROW 1: Submission Summary (left) + DWG donut (right) ─────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WidgetCard widget={wgt021} />
          <WidgetCard widget={wgt022} height={220} />
        </div>

        {/* ── ROW 2: MAT donut (left) + PRQ donut (right) ──────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WidgetCard widget={wgt023} height={220} />
          <WidgetCard widget={wgt024} height={220} />
        </div>

        {/* ── ROW 3: Eng Status Counts by Type & Discipline (full-width) ───── */}
        <TableCard widget={wgt025} />

        {/* ── ROW 4: Last 4-week submissions trend (left) + QA/QC stacked bar (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WidgetCard widget={wgt026} height={240} />
          <WidgetCard widget={wgt027} height={240} />
        </div>

        {/* ── ROW 5: QA/QC Document Status Summary (left half) ─────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WidgetCard widget={wgt028} />
          {/* Right slot intentionally empty — balance the grid */}
          <div />
        </div>

        {/* ── ROW 6: Material Submission Exceptions (full-width) ────────────── */}
        <TableCard widget={wgt029} />

        {/* ── ROW 7: QA/QC Open Exceptions (full-width) ────────────────────── */}
        <TableCard widget={wgt030} />

      </div>{/* /body */}
    </div>
  )
}

// ── Resources and Manpower Page — 4-row custom layout ─────────────────────────

type ResourcesPageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
}

function ResourcesManpowerPage({ page, pageIdx, pageWidgets }: ResourcesPageProps) {
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt031 = w('WGT-031')   // Current Manpower Summary                       — kpi_group
  const wgt032 = w('WGT-032')   // Weekly Manpower Trend — Planned vs Actual       — line_chart
  const wgt033 = w('WGT-033')   // Current Planned vs Actual Manpower by Resource  — grouped_bar_chart
  const wgt034 = w('WGT-034')   // Resource Manpower and Manhour Breakdown         — resource_table
  const wgt035 = w('WGT-035')   // Manhour Summary — Planned vs Estimated Actual   — kpi_group
  const wgt036 = w('WGT-036')   // Weekly Manhour Trend — Planned vs Est. Actual   — line_chart

  // Extract notes from WGT-035 for display beneath its KPI cards
  const wgt035Notes = (getContent(wgt035?.widget_ast ?? {}).notes) as string[] | undefined

  // ── shared style tokens ────────────────────────────────────────────────────
  const CARD: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
    flexShrink: 0,
  }

  // Helper — renders any widget into a styled card with title
  const WidgetCard = ({
    widget,
    style,
    height,
    footerSlot,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
    height?: number
    footerSlot?: React.ReactNode
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'kpi_group':          return <KpiGroupWidget ast={ast} />
        case 'line_chart':         return <LineChartWidget ast={ast} />
        case 'bar_chart':
        case 'grouped_bar_chart':  return <BarChartWidget ast={ast} />
        case 'stacked_bar_chart':  return <BarChartWidget ast={ast} stacked />
        case 'resource_table':     return <ResourceTableWidget ast={ast} />
        case 'data_table':         return <DataTableWidget ast={ast} />
        default:                   return <SmartFallback ast={ast} type={type} />
      }
    })()
    const needsHeight = ['line_chart','bar_chart','grouped_bar_chart','stacked_bar_chart'].includes(type ?? '')
    return (
      <div style={{ ...CARD, ...style }}>
        <p style={{ ...SECTION_LABEL }}>{widget.widget_title ?? ''}</p>
        <div style={{ flex: 1, ...(needsHeight && height ? { minHeight: height } : {}) }}>
          {inner}
        </div>
        {footerSlot}
      </div>
    )
  }

  // Helper — table card (resource_table / data_table) with row-count badge
  const TableCard = ({
    widget,
    style,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'resource_table': return <ResourceTableWidget ast={ast} />
        case 'data_table':     return <DataTableWidget ast={ast} />
        default:               return <AutoTable rows={(getContent(ast).rows ?? []) as Record<string, unknown>[]} />
      }
    })()
    const cnt = getContent(ast)
    const rowCount = (cnt.row_count ?? (cnt.rows as unknown[] | null)?.length) as number | undefined
    return (
      <div style={{ ...CARD, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0, gap: 12 }}>
          <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{widget.widget_title ?? ''}</p>
          {rowCount != null && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '2px 8px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>{inner}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1e293b', background: '#f1f5f9', minHeight: '100%' }}>

      {/* ── Page title block ─────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h2>
            </div>
            {page.subtitle ? (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>{page.subtitle}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
                Workforce deployment, manpower trends and manhour performance.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Page</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{pageIdx + 1}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ROW 1: Manpower Summary KPIs (left) + Weekly Trend chart (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
          <WidgetCard widget={wgt031} />
          <WidgetCard widget={wgt032} height={260} />
        </div>

        {/* ── ROW 2: Planned vs Actual by Resource — grouped bar (full-width) */}
        <WidgetCard widget={wgt033} height={260} />

        {/* ── ROW 3: Resource Manpower & Manhour Breakdown table (full-width) */}
        <TableCard widget={wgt034} />

        {/* ── ROW 4: Manhour Summary KPIs (left) + Weekly Manhour Trend (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
          {/* Left: KPI card + notes footnote */}
          <WidgetCard
            widget={wgt035}
            footerSlot={
              !!wgt035Notes?.length && (
                <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {wgt035Notes.map((note, i) => (
                    <p key={i} style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{note}</p>
                  ))}
                </div>
              )
            }
          />
          <WidgetCard widget={wgt036} height={260} />
        </div>

      </div>{/* /body */}
    </div>
  )
}

// ── KPI Performance Page — 5-row custom layout ────────────────────────────────

type KpiPageProps = {
  page: StructurePlanPage
  pageIdx: number
  pageWidgets: DashboardWidget[]
}

function KpiPerformancePage({ page, pageIdx, pageWidgets }: KpiPageProps) {
  const w = (id: string) => pageWidgets.find(x => x.widget_id === id)
  const wgt037 = w('WGT-037')   // KPI Coverage Summary                                   — kpi_group
  const wgt038 = w('WGT-038')   // Total vs Actual KPI Quantities to Date                 — data_table
  const wgt039 = w('WGT-039')   // Planned vs Actual KPI Quantities Cumulative to Date    — data_table
  const wgt040 = w('WGT-040')   // Weekly Planned vs Actual KPI Quantities — Current Week — grouped_bar_chart
  const wgt041 = w('WGT-041')   // KPI Current-Week and Cumulative Variances               — exception_table

  // ── shared style tokens ────────────────────────────────────────────────────
  const CARD: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 10,
    flexShrink: 0,
  }

  // Helper — generic widget card
  const WidgetCard = ({
    widget,
    style,
    height,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
    height?: number
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'kpi_group':          return <KpiGroupWidget ast={ast} />
        case 'line_chart':         return <LineChartWidget ast={ast} />
        case 'bar_chart':
        case 'grouped_bar_chart':  return <BarChartWidget ast={ast} />
        case 'stacked_bar_chart':  return <BarChartWidget ast={ast} stacked />
        case 'data_table':         return <DataTableWidget ast={ast} />
        case 'exception_table':    return <ExceptionTableWidget ast={ast} />
        default:                   return <SmartFallback ast={ast} type={type} />
      }
    })()
    const needsHeight = ['line_chart','bar_chart','grouped_bar_chart','stacked_bar_chart'].includes(type ?? '')
    return (
      <div style={{ ...CARD, ...style }}>
        <p style={{ ...SECTION_LABEL }}>{widget.widget_title ?? ''}</p>
        <div style={{ flex: 1, ...(needsHeight && height ? { minHeight: height } : {}) }}>
          {inner}
        </div>
      </div>
    )
  }

  // Helper — table / exception card with row-count badge
  const TableCard = ({
    widget,
    style,
  }: {
    widget: DashboardWidget | undefined
    style?: React.CSSProperties
  }) => {
    if (!widget) return null
    const ast  = widget.widget_ast ?? {}
    const type = widget.widget_type
    const inner = (() => {
      switch (type) {
        case 'data_table':      return <DataTableWidget ast={ast} />
        case 'exception_table': return <ExceptionTableWidget ast={ast} />
        default:                return <DataTableWidget ast={ast} />
      }
    })()
    const cnt = getContent(ast)
    const rowCount = (cnt.row_count ?? (cnt.rows as unknown[] | null)?.length) as number | undefined
    return (
      <div style={{ ...CARD, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0, gap: 12 }}>
          <p style={{ ...SECTION_LABEL, marginBottom: 0 }}>{widget.widget_title ?? ''}</p>
          {rowCount != null && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '2px 8px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>{inner}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1e293b', background: '#f1f5f9', minHeight: '100%' }}>

      {/* ── Page title block ─────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #1e40af, #3b82f6)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h2>
            </div>
            {page.subtitle ? (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>{page.subtitle}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 0 12px', fontStyle: 'italic' }}>
                Key performance indicator coverage, quantities and variance tracking.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Page</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{pageIdx + 1}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ROW 1: KPI Coverage Summary — full-width KPI group ───────────── */}
        <WidgetCard widget={wgt037} />

        {/* ── ROW 2: Total vs Actual KPI Quantities to Date — full-width table */}
        <TableCard widget={wgt038} />

        {/* ── ROW 3: Planned vs Actual KPI Quantities Cumulative — full-width */}
        <TableCard widget={wgt039} />

        {/* ── ROW 4: Weekly KPI bar chart (left half) + balanced right slot ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WidgetCard widget={wgt040} height={280} />
          <div />
        </div>

        {/* ── ROW 5: KPI Variances exception table — full-width ─────────────── */}
        <TableCard widget={wgt041} />

      </div>{/* /body */}
    </div>
  )
}

// ── A3 Weekly Dashboard Page ──────────────────────────────────────────────────
// Renders a print-optimised A3 single-page summary using only the widgets
// flagged include_in_a3_export=true in the structure plan, laid out on a
// 12-column grid matching the grid.column_span values from the plan.

type A3PageProps = {
  structure: DashboardStructure
  widgets: DashboardWidget[]
}

function A3WeeklyDashboardPage({ structure, widgets }: A3PageProps) {
  const tok = useContext(DesignContext)

  const a3 = structure.a3_layout
  const ctx = a3?.dashboard_context
  const footerCfg = a3?.footer

  // Read regions from a3_layout, skip header/footer metadata regions (no widget_ids)
  const nonWidgetIds = new Set(a3?.planning_metadata?.non_widget_region_ids ?? [])
  const regions: A3Region[] = [...(a3?.layout?.regions ?? [])]
    .sort((a, b) => (a.region_order ?? 0) - (b.region_order ?? 0))
    .filter(r => !nonWidgetIds.has(r.region_id) && r.widget_ids.length > 0)

  // Map widget_id → DashboardWidget (fetched row)
  const widgetById = useMemo(() => {
    const m: Record<string, DashboardWidget> = {}
    for (const w of widgets) { if (w.widget_id) m[w.widget_id] = w }
    return m
  }, [widgets])

  const dataDate = ctx?.data_date ?? structure.data_date ?? ''
  const weekNum  = ctx?.week_num  ?? structure.week_num  ?? ''
  const title    = ctx?.dashboard_title ?? structure.dashboard_title ?? 'Weekly Project Dashboard'
  const reportType = ctx?.report_type ?? 'Weekly Progress Report'

  // Column span → Tailwind grid-cols-12 span class
  const spanClass = (span: number | undefined): string => {
    switch (span) {
      case 1:  return 'col-span-1'
      case 2:  return 'col-span-2'
      case 3:  return 'col-span-3'
      case 4:  return 'col-span-4'
      case 5:  return 'col-span-5'
      case 6:  return 'col-span-6'
      case 7:  return 'col-span-7'
      case 8:  return 'col-span-8'
      case 9:  return 'col-span-9'
      case 10: return 'col-span-10'
      case 11: return 'col-span-11'
      case 12: return 'col-span-12'
      default: return 'col-span-4'
    }
  }

  return (
    <div
      className="a3-page"
      style={{ background: tok('canvas', '#f1f5f9'), minHeight: '100%', padding: '0 0 24px 0' }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 mb-4 no-print-break"
        style={{ background: tok('primary', '#1d4ed8'), color: tok('text_on_primary', '#ffffff') }}
      >
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <div>
            <p className="text-sm font-bold tracking-wide">{title}</p>
            <p className="text-[10px] opacity-75">{reportType} — A3 Executive Summary</p>
          </div>
        </div>
        <div className="text-right">
          {dataDate && <p className="text-xs font-semibold">Data Date: {dataDate}</p>}
          {weekNum   && <p className="text-[10px] opacity-75">Week {weekNum}</p>}
        </div>
      </div>

      {/* ── Widget grid — driven entirely by a3_layout.layout.regions ───────── */}
      <div className="px-4">
        {!a3 ? (
          <p className="text-xs text-gray-400 italic p-4">
            No A3 layout configured for this report. Please ensure the a3_layout column is populated.
          </p>
        ) : regions.length === 0 ? (
          <p className="text-xs text-gray-400 italic p-4">
            No widget regions found in the A3 layout.
          </p>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            {regions.map((region, ri) => {
              // A region may contain multiple widget_ids (e.g. REG-005 has WGT-009 + WGT-010)
              const regionWidgets = region.widget_ids.map(id => widgetById[id]).filter(Boolean) as DashboardWidget[]

              return (
                <div
                  key={region.region_id ?? ri}
                  className={`${spanClass(region.column_span)} bg-white rounded-xl border shadow-sm p-4 flex flex-col`}
                  style={{ borderColor: tok('subtle_border', '#e2e8f0') }}
                >
                  {/* Region title */}
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-3 leading-tight flex-shrink-0"
                    style={{ color: tok('muted_text', '#94a3b8') }}
                  >
                    {region.title}
                  </p>

                  {/* Render each widget in the region */}
                  {regionWidgets.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-gray-300">
                      <span className="text-[10px] italic">
                        Widget{region.widget_ids.length > 1 ? 's' : ''} not loaded
                        {region.widget_ids.length > 0 && ` (${region.widget_ids.join(', ')})`}
                      </span>
                    </div>
                  ) : regionWidgets.length === 1 ? (
                    <WidgetInner widget={regionWidgets[0]} />
                  ) : (
                    // Multiple widgets in one region — stack them with a divider
                    <div className="flex flex-col gap-3">
                      {regionWidgets.map((w, wi) => (
                        <div key={w.widget_id ?? wi}>
                          {wi > 0 && (
                            <div className="border-t my-2" style={{ borderColor: tok('subtle_border', '#e2e8f0') }} />
                          )}
                          {w.widget_title && (
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1"
                               style={{ color: tok('muted_text', '#94a3b8') }}>
                              {w.widget_title}
                            </p>
                          )}
                          <WidgetInner widget={w} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Footer bar ──────────────────────────────────────────────────────── */}
      {(footerCfg?.show_data_date || footerCfg?.show_report_id || footerCfg?.show_project_id || footerCfg?.show_design_version) && (
        <div
          className="flex items-center justify-between px-6 py-2 mt-4 mx-4 rounded-lg"
          style={{ background: tok('subtle_border', '#e2e8f0'), color: tok('text_secondary', '#64748b') }}
        >
          <div className="flex gap-4 text-[9px]">
            {footerCfg?.show_project_id  && ctx?.project_id    && <span>Project: {ctx.project_id}</span>}
            {footerCfg?.show_report_id   && ctx?.report_id     && <span>Report: {ctx.report_id}</span>}
          </div>
          <div className="flex gap-4 text-[9px]">
            {footerCfg?.show_data_date      && dataDate        && <span>Data Date: {dataDate}</span>}
            {footerCfg?.show_design_version && ctx?.design_version && <span>Design v{ctx.design_version}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReportDashboardForm({
  projectId,
  projectTextId: _projectTextId,
  schemaName,
  a3Mode = false,
}: {
  projectId: string
  projectTextId: string
  schemaName: string
  a3Mode?: boolean
}) {
  void projectId

  const [structures, setStructures] = useState<DashboardStructure[]>([])
  const [loadingStructures, setLoadingStructures] = useState(true)
  const [selectedStructureId, setSelectedStructureId] = useState<string>('')
  const [selectedStructure, setSelectedStructure] = useState<DashboardStructure | null>(null)
  const [widgets, setWidgets] = useState<DashboardWidget[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(false)
  const [activePageId, setActivePageId] = useState<string>('')
  const [tok, setTok] = useState<ReturnType<typeof buildTokenResolver>>(() => DEFAULT_TOK)

  const { notification, showError, hideNotification } = useNotification()

  // Fetch the approved dashboard design and build a token resolver from it
  useEffect(() => {
    const load = async () => {
      try {
        const db = schemaClient(schemaName)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any)
          .from('dbp6_0008_dashboard_designs')
          .select('design_id, design_name, design_version, design_specification, is_approved, is_default')
          .eq('is_approved', true)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) { console.warn('[ReportDashboard] design fetch error:', error.message); return }
        if (data) {
          const row = data as DashboardDesign
          const spec = typeof row.design_specification === 'string'
            ? (() => { try { return JSON.parse(row.design_specification as unknown as string) } catch { return {} } })()
            : (row.design_specification ?? {})
          setTok(() => buildTokenResolver(spec))
        }
      } catch (err) {
        console.warn('[ReportDashboard] design fetch failed:', err)
      }
    }
    load()
  }, [schemaName])

  // Fetch all structures (no project_id filter — schema scoping handles isolation)
  useEffect(() => {
    const load = async () => {
      setLoadingStructures(true)
      setStructures([])
      setSelectedStructureId('')
      setSelectedStructure(null)
      setWidgets([])
      try {
        const db = schemaClient(schemaName)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any)
          .from('dbp6_0008_dashboard_structures')
          .select('structure_id, report_id, project_id, week_num, data_date, dashboard_title, structure_plan, a3_layout, processing_status, is_approved')
          .order('data_date', { ascending: false })
        if (error) throw error
        // JSON columns may arrive as strings (or double-encoded) from Supabase — parse safely
        const parseJsonCol = (raw: unknown) => {
          if (raw == null) return null
          if (typeof raw === 'object' && !Array.isArray(raw)) return raw
          if (typeof raw === 'string') {
            try {
              const once = JSON.parse(raw)
              if (typeof once === 'string') { try { return JSON.parse(once) } catch { return null } }
              return once
            } catch { return null }
          }
          return null
        }
        const rows = ((data ?? []) as DashboardStructure[]).map(s => ({
          ...s,
          structure_plan: parseJsonCol(s.structure_plan) as DashboardStructure['structure_plan'],
          a3_layout: parseJsonCol(s.a3_layout) as A3Layout | null,
        }))
        setStructures(rows)
        if (rows.length > 0) {
          setSelectedStructureId(rows[0].structure_id)
          setSelectedStructure(rows[0])
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load report list')
      }
      setLoadingStructures(false)
    }
    load()
  }, [schemaName])

  // Fetch widgets when selected structure changes
  useEffect(() => {
    if (!selectedStructureId) return
    const load = async () => {
      setLoadingWidgets(true)
      setWidgets([])
      try {
        const db = schemaClient(schemaName)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any)
          .from('dbp6_0008_dashboard_widgets')
          .select('widget_record_id, structure_id, page_id, widget_id, widget_order, widget_title, widget_type, widget_ast')
          .eq('structure_id', selectedStructureId)
          .order('widget_order', { ascending: true })
        if (error) throw error
        // widget_ast may arrive as a JSON string (or even double-encoded) from Supabase
        const parseAst = (raw: unknown): Record<string, unknown> => {
          if (raw == null) return {}
          if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
          if (typeof raw === 'string') {
            try {
              const once = JSON.parse(raw)
              // If it was double-encoded, parse again
              if (typeof once === 'string') {
                try { return JSON.parse(once) } catch { return {} }
              }
              if (typeof once === 'object' && once !== null && !Array.isArray(once)) return once
            } catch { /* fall through */ }
          }
          return {}
        }
        const parsed = ((data ?? []) as DashboardWidget[]).map(w => ({
          ...w,
          widget_ast: parseAst(w.widget_ast),
        }))
        setWidgets(parsed)
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load widgets')
      }
      setLoadingWidgets(false)
    }
    load()
  }, [selectedStructureId, schemaName])

  function getPages(structure: DashboardStructure | null): StructurePlanPage[] {
    if (!structure?.structure_plan?.pages) return []
    return [...structure.structure_plan.pages].sort((a, b) => (a.page_order ?? 0) - (b.page_order ?? 0))
  }

  const handleStructureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedStructureId(id)
    setSelectedStructure(structures.find(s => s.structure_id === id) ?? null)
  }

  const pages = getPages(selectedStructure)

  // Set initial active page when pages load
  useEffect(() => {
    if (pages.length > 0) setActivePageId(pages[0].page_id)
  }, [selectedStructureId])

  // IntersectionObserver — track which section is most visible
  // Runs after widgets finish loading so the section divs exist in the DOM
  useEffect(() => {
    if (!pages.length || loadingWidgets) return
    const observers: IntersectionObserver[] = []
    const visibilityMap: Record<string, number> = {}

    // Use the <main> scroll container as the root so intersection is
    // calculated within the visible scroll area, not the document
    const scrollRoot = document.querySelector('main') ?? null

    pages.forEach(page => {
      const el = document.getElementById(`section-${page.page_id}`)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => {
          visibilityMap[page.page_id] = entry.intersectionRatio
          const best = Object.entries(visibilityMap).sort((a, b) => b[1] - a[1])[0]
          if (best && best[1] > 0) setActivePageId(best[0])
        },
        { root: scrollRoot, threshold: [0, 0.05, 0.1, 0.25, 0.5] }
      )
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [pages.length, selectedStructureId, loadingWidgets])

  function scrollToPage(pageId: string) {
    const el = document.getElementById(`section-${pageId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loadingStructures) return <LoadingSpinner />

  if (structures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 font-medium">No reports available</p>
        <p className="text-gray-400 text-sm mt-1">Reports are generated automatically after each weekly update.</p>
      </div>
    )
  }

  const reportDataDate = selectedStructure?.data_date ?? ''

  // ── A3 mode — render the single-page summary layout ────────────────────────
  if (a3Mode) {
    const isLoading = loadingStructures || loadingWidgets
    return (
      <DesignContext.Provider value={tok}>
      <DataDateContext.Provider value={reportDataDate}>
        {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}

        {/* A3 toolbar — hidden on print */}
        <div className="no-print flex items-center justify-between px-4 py-2 mb-2 border-b" style={{ borderColor: tok('subtle_border', '#e2e8f0') }}>
          <div className="flex items-center gap-3">
            <select
              value={selectedStructureId}
              onChange={handleStructureChange}
              style={{ fontSize: 11, color: '#374151', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', outline: 'none' }}
            >
              {structures.map(s => (
                <option key={s.structure_id} value={s.structure_id}>
                  {s.week_num != null ? `Week ${s.week_num}` : 'Week —'} · {fmtDate(s.data_date)}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-gray-400">Weekly Project Dashboard — A3 Executive Summary</span>
          </div>
          <button
            onClick={() => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 300))) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
              background: tok('primary', '#1d4ed8'), color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" rx="1" />
            </svg>
            Print / Export PDF
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : !selectedStructure ? (
          <p className="text-xs text-gray-400 italic p-6">No dashboard structure available.</p>
        ) : (
          <div className="a3-print-root">
            <A3WeeklyDashboardPage structure={selectedStructure} widgets={widgets} />
          </div>
        )}
      </DataDateContext.Provider>
      </DesignContext.Provider>
    )
  }

  return (
    <DesignContext.Provider value={tok}>
    <DataDateContext.Provider value={reportDataDate}>
    <div className="flex gap-4 items-start" style={{ maxWidth: '100%' }}>

      {/* ── Left nav ─────────────────────────────────────────────────────── */}
      {pages.length > 0 && (
        <nav className="no-print hidden lg:flex flex-col w-56 flex-shrink-0" style={{ position: 'sticky', top: '0', maxHeight: 'calc(100vh - 5rem)' }}>
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: tok('sidebar_bg', '#ffffff'), border: `1px solid ${tok('subtle_border', '#e2e8f0')}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${tok('subtle_border', '#e2e8f0')}` }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: tok('primary', '#3b82f6') }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tok('muted_text', '#94a3b8') }}>Pages</p>
            </div>
            {/* Items */}
            <ul className="py-2 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
              {pages.map((page, idx) => {
                const isActive = activePageId === page.page_id
                return (
                  <li key={page.page_id} className="px-2 py-0.5">
                    <button
                      onClick={() => scrollToPage(page.page_id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors"
                      style={{
                        background:  isActive ? tok('sidebar_active_bg', '#eff6ff') : 'transparent',
                        color:       isActive ? tok('primary', '#1d4ed8')            : tok('text_secondary', '#6b7280'),
                        fontWeight:  isActive ? 600 : 400,
                        borderLeft:  isActive ? `2px solid ${tok('primary', '#2563eb')}` : '2px solid transparent',
                      }}
                    >
                      <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 transition-colors" style={{
                        background: isActive ? tok('primary', '#2563eb')    : tok('surface_secondary', '#eff6ff'),
                        color:      isActive ? tok('text_on_primary', '#fff') : tok('primary', '#3b82f6'),
                      }}>
                        {idx + 1}
                      </span>
                      <span className="leading-snug line-clamp-2 tracking-tight">{page.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {notification && (
          <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
        )}

        {loadingWidgets ? (
          <LoadingSpinner />
        ) : pages.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm">No pages defined for this report.</div>
        ) : (
          pages.map((page, pageIdx) => {
            const pageWidgets = widgets.filter(w => w.page_id === page.page_id)
            const isExecutivePage         = pageIdx === 0
            const isProgressAnalysis      = page.page_id === 'PAGE-002'
            const isScheduleIntelligence  = page.page_id === 'PAGE-003'
            const isEngineeringQA         = page.page_id === 'PAGE-004'
            const isResourcesManpower     = page.page_id === 'PAGE-005'
            const isKpiPerformance        = page.page_id === 'PAGE-006'

            return (
              <div
                key={page.page_id}
                id={`section-${page.page_id}`}
                className={`print-page${pageIdx > 0 ? ' mt-6' : ''}`}
              >
                {isExecutivePage ? (
                  // Special rich layout for the Executive Overview page
                  <ExecutiveOverviewPage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                    structure={selectedStructure!}
                    structures={structures}
                    selectedStructureId={selectedStructureId}
                    onStructureChange={handleStructureChange}
                  />
                ) : isProgressAnalysis ? (
                  // 5-row custom layout for Progress Analysis page
                  <ProgressAnalysisPage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                  />
                ) : isScheduleIntelligence ? (
                  // 5-row custom layout for Schedule Intelligence page
                  <ScheduleIntelligencePage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                  />
                ) : isEngineeringQA ? (
                  // 7-row custom layout for Engineering, QA/QC and HSE page
                  <EngineeringQAPage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                  />
                ) : isResourcesManpower ? (
                  // 4-row custom layout for Resources and Manpower page
                  <ResourcesManpowerPage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                  />
                ) : isKpiPerformance ? (
                  // 5-row custom layout for KPI Performance page
                  <KpiPerformancePage
                    page={page}
                    pageIdx={pageIdx}
                    pageWidgets={pageWidgets}
                  />
                ) : (
                  <>
                    {/* Section header — compact bar */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-5 h-5 rounded-md text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
                      >
                        {pageIdx + 1}
                      </span>
                      <h2 className="text-sm font-bold text-gray-700 tracking-wide">{page.title}</h2>
                      {page.subtitle && (
                        <span className="text-xs text-gray-400 font-normal">— {page.subtitle}</span>
                      )}
                    </div>

                    {/* Widget grid — 4 cols on large screens */}
                    {pageWidgets.length === 0 ? (
                      <p className="text-xs text-gray-400 italic mb-4">No content on this page.</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 mb-2">
                        {pageWidgets.map(w => (
                          <WidgetRenderer key={w.widget_record_id} widget={w} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
    </DataDateContext.Provider>
    </DesignContext.Provider>
  )
}
