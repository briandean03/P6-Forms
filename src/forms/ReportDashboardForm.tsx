import { useState, useEffect, useMemo, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import { schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStructure {
  structure_id: string
  report_id: string | null
  project_id: string | null
  week_num: number | null
  data_date: string | null
  dashboard_title: string | null
  // pages use { page_id, title, page_order, ... } — note "title" not "page_title"
  structure_plan: { pages?: StructurePlanPage[] } | null
  processing_status: string | null
  is_approved: boolean | null
}

interface StructurePlanPage {
  page_id: string
  title: string        // the JSON field is "title", not "page_title"
  page_order: number
  subtitle?: string
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
    ? 'px-3 py-2 text-left font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap bg-red-50'
    : 'px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50'

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter rows…"
            className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>
        <select
          value={colFilter ?? ''}
          onChange={e => setColFilter(e.target.value || null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-600 max-w-[120px]"
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
        <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
          {sorted.length}/{rows.length} rows
        </span>
      </div>

      {/* Table with frozen header */}
      <div ref={containerRef} className="overflow-auto flex-1" style={{ maxHeight: '420px' }}>
        <table className="min-w-full text-xs border-separate border-spacing-0">
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
                  <td key={key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
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
  comparison_label?: string | null
  comparison_value?: number | null
  data_type?: string
}

function severityColor(status: string | null | undefined) {
  if (!status) return 'text-gray-500'
  if (['critical', 'error', 'behind'].includes(status)) return 'text-red-500'
  if (['overdue', 'warning'].includes(status)) return 'text-amber-600'
  if (['ahead', 'ok', 'good'].includes(status)) return 'text-green-600'
  return 'text-gray-500'
}

function KpiCard({ item }: { item: KpiItem }) {
  const sColor = severityColor(item.status)
  const variance = item.variance
  return (
    <div className="flex flex-col rounded-lg px-3 py-2 bg-gray-50 border border-gray-100">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{item.label}</span>
      <span className="text-xl font-bold mt-0.5 text-gray-900">
        {item.value != null ? String(item.value) : '—'}
        {item.unit && <span className="text-sm font-normal text-gray-500 ml-1">{item.unit}</span>}
      </span>
      {item.comparison_label && (
        <span className="text-[10px] text-gray-400 mt-0.5">
          {item.comparison_label}{item.comparison_value != null ? `: ${fmtNum(item.comparison_value)}${item.unit ? ' ' + item.unit : ''}` : ''}
        </span>
      )}
      {variance != null && (
        <span className={`text-[10px] font-semibold mt-0.5 ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {variance >= 0 ? '+' : ''}{fmtNum(variance)}{item.unit ? ' ' + item.unit : ''}
        </span>
      )}
      {item.status && (
        <span className={`text-[10px] font-semibold mt-0.5 capitalize ${sColor}`}>{item.status}</span>
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

// kpi_group — content.items[] OR content.kpis[]
function KpiGroupWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const items = (content.items ?? content.kpis) as KpiItem[] | null
  if (!items?.length) return <NoData />
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => <KpiCard key={i} item={item} />)}
    </div>
  )
}

// metadata_panel — content.fields[]: { key, label, value, status, emphasis, data_type }
function MetadataPanelWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type Field = { key?: string; label: string; value: unknown; status?: string; emphasis?: string; data_type?: string }
  // Actual schema uses "fields", fallback to "items" for robustness
  const fields = (content.fields ?? content.items) as Field[] | null
  if (!fields?.length) return <NoData />
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      {fields.map((f, i) => {
        const isUnavailable = f.status === 'unavailable'
        const isPrimary = f.emphasis === 'primary'
        return (
          <div key={i} className={isPrimary ? 'col-span-2' : ''}>
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{f.label}</dt>
            <dd className={`text-sm font-medium ${isUnavailable ? 'text-gray-300 italic' : 'text-gray-800'}`}>
              {f.value != null ? String(f.value) : isUnavailable ? 'Unavailable' : '—'}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// alert_panel — content.alerts[]: { alert_id, headline, severity, value, unit, detail, metrics[] }
function AlertPanelWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type AlertItem = {
    alert_id?: string
    headline?: string
    label?: string
    severity?: string
    value?: number | null
    unit?: string
    detail?: string
    metrics?: { label: string; value: unknown; unit?: string }[]
  }
  const alerts = (content.alerts ?? content.items ?? content.exceptions) as AlertItem[] | null
  if (!alerts?.length) return <NoData />

  return (
    <div className="space-y-2">
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
        const headline = alert.headline ?? alert.label ?? ''
        return (
          <div key={i} className={`rounded-lg border px-4 py-3 ${rowCls}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray-800 leading-snug flex-1">{headline}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {alert.value != null && (
                  <span className="text-base font-bold text-gray-900">{String(alert.value)}</span>
                )}
                {alert.unit && <span className="text-xs text-gray-500">{alert.unit}</span>}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${badgeCls}`}>{sev}</span>
              </div>
            </div>
            {alert.detail && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{alert.detail}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// status_summary — content.items[]: { key, label, value, unit, status_semantic, reference_value, reference_label }
function StatusSummaryWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type StatusItem = {
    key?: string
    label: string
    value?: number | null
    unit?: string
    status_semantic?: string
    reference_label?: string
    reference_value?: number | null
  }
  const items = (content.items ?? content.statuses ?? content.status_counts) as StatusItem[] | null
  if (!items?.length) return <NoData />

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => {
        const sColor = severityColor(item.status_semantic)
        return (
          <div key={i} className="flex flex-col rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <span className={`text-2xl font-bold ${sColor}`}>{item.value != null ? String(item.value) : '—'}</span>
            {item.unit && <span className="text-[10px] text-gray-400">{item.unit}</span>}
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-0.5 leading-tight">{item.label}</span>
            {item.reference_label && item.reference_value != null && (
              <span className="text-[10px] text-gray-400 mt-0.5">of {item.reference_value} {item.reference_label.toLowerCase()}</span>
            )}
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

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

// Compact zoom slider — shows last `zoom`% of data points
function ZoomSlider({ zoom, setZoom }: { zoom: number; setZoom: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[9px] text-gray-400 uppercase tracking-wider flex-shrink-0">Zoom</span>
      <input
        type="range" min={10} max={100} step={5} value={zoom}
        onChange={e => setZoom(Number(e.target.value))}
        className="flex-1 h-1 accent-blue-500 cursor-pointer"
      />
      <span className="text-[9px] text-gray-400 w-7 text-right">{zoom}%</span>
    </div>
  )
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
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
  const [zoom, setZoom] = useState(100)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  if (!data?.length) return <NoData />

  const filterFields = useMemo(() => detectFilterFields(data, [xKey, labelKey]), [data, xKey, labelKey])
  const filtered = useMemo(() => applyFilters(data, activeFilters), [data, activeFilters])
  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * zoom / 100)))
  const chartData = sliced.map(d => ({ ...d, __x: d[labelKey] ?? d[xKey] }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="__x" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeDasharray={s.dashed ? '6 3' : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {filtered.length > 1 && <ZoomSlider zoom={zoom} setZoom={setZoom} />}
    </div>
  )
}

// ── S-Curve widget with Power BI-style range slicer ───────────────────────────
function SCurveLineChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const data = content.data as Record<string, unknown>[] | null
  if (!data?.length) return <NoData />

  const xKey      = (content.category_field      ?? 'period_end')   as string
  const labelKey  = (content.category_label_field ?? xKey)           as string
  const series    = normaliseSeries(content, xKey)
  const yUnit     = ((content.y_axis as Record<string, unknown> | null)?.unit ?? '') as string

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
            <span className="font-bold text-gray-800">{p.value != null ? `${Number(p.value).toFixed(1)}${yUnit}` : '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={slicedData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="__x" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} unit={yUnit} domain={[0, 'auto']} />
          <Tooltip content={customTooltip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeDasharray={s.dashed ? '6 3' : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Slicer */}
      <div className="px-1 pt-1 pb-2 bg-gray-50 rounded-lg border border-gray-200">
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

// bar_chart / grouped_bar_chart
// Some grouped_bar_chart records nest data under content.chart.data instead of content.data
function BarChartWidget({ ast, horizontal }: { ast: Record<string, unknown>; horizontal?: boolean }) {
  const content = getContent(ast)
  const chartObj = (content.chart ?? {}) as Record<string, unknown>
  const data  = (content.data ?? chartObj.data) as Record<string, unknown>[] | null
  const merged = chartObj.data ? { ...content, ...chartObj } : content
  const xKey  = (merged.category_field ?? merged.x_key ?? merged.x_axis ?? 'category') as string
  const series = normaliseSeries(merged, xKey)
  const [zoom, setZoom] = useState(100)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

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

  const toggleSeries = (key: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const visibleSeries = series.filter(s => !hidden.has(s.key))

  if (horizontal) {
    const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * zoom / 100)))
    return (
      <div>
        <ResponsiveContainer width="100%" height={Math.max(200, sliced.length * 32)}>
          <BarChart data={sliced} layout="vertical" margin={{ top: 4, right: 12, left: 80, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey={xKey} tick={{ fontSize: 10 }} width={76} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} onClick={p => toggleSeries(p.dataKey as string)} />
            {visibleSeries.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[0, 2, 2, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
        {filtered.length > 1 && <ZoomSlider zoom={zoom} setZoom={setZoom} />}
      </div>
    )
  }

  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * zoom / 100)))
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={sliced} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} onClick={p => toggleSeries(p.dataKey as string)} />
          {visibleSeries.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {filtered.length > 1 && <ZoomSlider zoom={zoom} setZoom={setZoom} />}
    </div>
  )
}

// area_chart
function AreaChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  const data  = content.data as Record<string, unknown>[] | null
  const xKey  = (content.category_field ?? content.x_key ?? content.x_axis ?? 'period_end') as string
  const series = normaliseSeries(content, xKey)
  const [zoom, setZoom] = useState(100)
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  if (!data?.length) return <NoData />

  const filterFields = useMemo(() => detectFilterFields(data, [xKey]), [data, xKey])
  const filtered = useMemo(() => applyFilters(data, activeFilters), [data, activeFilters])
  const sliced = filtered.slice(-Math.max(1, Math.round(filtered.length * zoom / 100)))

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={sliced} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              fillOpacity={0.15}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ChartFilters fields={filterFields} active={activeFilters} setActive={setActiveFilters} />
      {filtered.length > 1 && <ZoomSlider zoom={zoom} setZoom={setZoom} />}
    </div>
  )
}

// donut_chart — content.data[]: { status_label, status_code, count, percentage, color? }
function DonutChartWidget({ ast }: { ast: Record<string, unknown> }) {
  const content = getContent(ast)
  type Slice = {
    name?: string; label?: string; status_label?: string; status_code?: string
    value?: number; count?: number; color?: string
  }
  const raw = (content.data ?? content.segments ?? content.slices) as Slice[] | null

  if (!raw?.length) return <NoData />
  // Filter out zero-count slices to keep the donut readable
  const normalised = raw
    .map(d => ({
      name:  d.status_label ?? d.label ?? d.name ?? d.status_code ?? '?',
      value: d.count ?? d.value ?? 0,
      color: d.color,
    }))
    .filter(d => d.value > 0)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={normalised}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
          }
        >
          {normalised.map((entry, idx) => (
            <Cell key={idx} fill={entry.color ?? PALETTE[idx % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
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
function JsonFallback({ ast, type }: { ast: Record<string, unknown>; type: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-1 italic">Widget type: {type ?? 'unknown'}</p>
      <pre className="text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto max-h-48">
        {JSON.stringify(ast, null, 2)}
      </pre>
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
    case 'text_block':
    default:
      return 'col-span-4'
  }
}

// ── Widget dispatcher ─────────────────────────────────────────────────────────

function WidgetRenderer({ widget }: { widget: DashboardWidget }) {
  const ast  = widget.widget_ast ?? {}
  const type = widget.widget_type

  const inner = (() => {
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
      case 'text_block':         return <TextBlockWidget ast={ast} />
      default:                   return <JsonFallback ast={ast} type={type} />
    }
  })()

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
      <div className={isTable ? 'flex-1 flex flex-col min-h-0' : ''}>{inner}</div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReportDashboardForm({
  projectId,
  projectTextId: _projectTextId,
  schemaName,
}: {
  projectId: string
  projectTextId: string
  schemaName: string
}) {
  void projectId

  const [structures, setStructures] = useState<DashboardStructure[]>([])
  const [loadingStructures, setLoadingStructures] = useState(true)
  const [selectedStructureId, setSelectedStructureId] = useState<string>('')
  const [selectedStructure, setSelectedStructure] = useState<DashboardStructure | null>(null)
  const [widgets, setWidgets] = useState<DashboardWidget[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(false)
  const [activePageId, setActivePageId] = useState<string>('')

  const { notification, showError, hideNotification } = useNotification()

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
          .select('structure_id, report_id, project_id, week_num, data_date, dashboard_title, structure_plan, processing_status, is_approved')
          .order('data_date', { ascending: false })
        if (error) throw error
        const rows = (data ?? []) as DashboardStructure[]
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
        setWidgets((data ?? []) as DashboardWidget[])
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

  return (
    <div className="flex gap-4 items-start" style={{ maxWidth: '100%' }}>

      {/* ── Left nav ─────────────────────────────────────────────────────── */}
      {pages.length > 0 && (
        <nav className="hidden lg:flex flex-col w-48 flex-shrink-0" style={{ position: 'sticky', top: '0', maxHeight: 'calc(100vh - 5rem)' }}>
          {/* Report selector */}
          <div className="mb-2">
            <select
              value={selectedStructureId}
              onChange={handleStructureChange}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-700"
            >
              {structures.map(s => (
                <option key={s.structure_id} value={s.structure_id}>
                  {s.week_num != null ? `Week ${s.week_num}` : 'Week —'}{' · '}{fmtDate(s.data_date)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
              <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Pages</p>
              {selectedStructure?.is_approved && (
                <span className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-green-100 text-green-700">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Approved
                </span>
              )}
            </div>
            {/* Items */}
            <ul className="py-1 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
              {pages.map((page, idx) => {
                const isActive = activePageId === page.page_id
                return (
                  <li key={page.page_id} className="px-1.5 py-0.5">
                    <button
                      onClick={() => scrollToPage(page.page_id)}
                      className={`report-nav-item w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left${isActive ? ' active' : ''}`}
                    >
                      <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                        isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-medium leading-tight line-clamp-2">{page.title}</span>
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
            return (
              <div
                key={page.page_id}
                id={`section-${page.page_id}`}
                className={pageIdx > 0 ? 'mt-6' : ''}
              >
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
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
