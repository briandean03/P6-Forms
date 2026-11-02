import { useState, useEffect, useMemo, useRef } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ── TypeScript interfaces ───────────────────────────────────────────────────

interface WeeklyReportSection {
  id: number
  report_id: string
  project_id: string
  week_num: number | null
  data_date: string | null
  section_id: string
  section_order: number | null
  type: 'section' | 'appendix'
  semantic_role: string | null
  title: string | null
  numbering: string | null
  orientation: 'portrait' | 'landscape'
  section_ast: SectionAST | null
  processing_status: string | null
  created_at: string
  updated_at: string
  include_in_toc: boolean | null
  page_break_before: boolean | null
}

interface SectionAST {
  blocks: ASTBlock[]
}

type ASTBlockType =
  | 'paragraph'
  | 'heading'
  | 'kpi_cards'
  | 'chart'
  | 'bullet_list'
  | 'numbered_list'
  | 'progress_bar'
  | 'callout'
  | 'finding'
  | 'timeline'
  | 'table'
  | 'data_table'
  | 'image'
  | string

interface ASTBlock {
  type: ASTBlockType
  block_id?: string | null
  content: Record<string, unknown>
  design_style?: string | null
  source_references?: SourceRef[] | null
}

interface SourceRef {
  record_id?: string | null
  source_id?: string | null
  field_path?: string | null
  source_type?: string | null
  label?: string | null
  qualification?: string | null
  note?: string | null
}

interface KpiCardData {
  label?: string | null
  value?: string | number | null
  unit?: string | null
  status?: string | null
  qualification?: string | null
  comparison_label?: string | null
  comparison_value?: number | null
  source_references?: SourceRef[] | null
}

interface ChartSeries {
  name: string
  data: number[]
  color?: string | null
  color_key?: string | null
}

interface ChartContent {
  chart_type?: string | null
  title?: string | null
  categories?: string[]
  series?: ChartSeries[]
  x_axis?: { label?: string | null; unit?: string | null } | null
  y_axis?: { label?: string | null; unit?: string | null } | null
  legend?: boolean | null
  qualification?: string | null
}

interface TableColumn {
  key: string
  label?: string | null
}

interface TableContent {
  title?: string | null
  columns?: (string | TableColumn)[]
  rows?: Record<string, unknown>[]
  footer_note?: string | null
}

interface TimelineItem {
  date?: string | null
  label?: string | null
  description?: string | null
}

interface ProgressBarContent {
  label?: string | null
  planned_percent?: number | null
  actual_percent?: number | null
  qualification?: string | null
}

interface WeekOption {
  report_id: string
  week_num: number | null
  data_date: string | null
  label: string
}

// ── Constants ───────────────────────────────────────────────────────────────

const KPI_STATUS_COLOR: Record<string, string> = {
  adverse: 'text-red-600',
  positive: 'text-emerald-600',
  caution: 'text-amber-600',
  neutral: 'text-slate-800',
}

const CALLOUT_SEVERITY_CLASSES: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  error: 'border-red-500 bg-red-50',
  warning: 'border-amber-500 bg-amber-50',
  info: 'border-blue-400 bg-blue-50',
  success: 'border-emerald-500 bg-emerald-50',
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

// A4 portrait content width available to a chart when printing:
// page 210mm − 2×13mm margins ≈ 695px, minus section padding (2×24px) and border ≈ 645px;
// 600 leaves headroom for any extra wrapper padding in the app shell.
const PRINT_CHART_WIDTH = 600
const PRINT_CHART_HEIGHT = 260
const SCREEN_CHART_HEIGHT = 240

// ── Chart rendering ──────────────────────────────────────────────────────────
// Every chart is rendered twice: a responsive copy for the screen (hidden when printing) and a
// fixed-size copy for print (hidden on screen). The print copy needs no ResizeObserver, no React
// state change and no animation, so it is complete the instant the browser snapshots the page —
// including when the user prints with Ctrl+P instead of the button.

// Show at most ~maxTicks x-axis labels. Recharts' `interval` is how many ticks to SKIP.
function xTickInterval(count: number, maxTicks = 8): number {
  return count <= maxTicks ? 0 : Math.ceil(count / maxTicks) - 1
}

// Static HTML legend for the print copy — no measurement, so it is correct the moment it is printed
function PrintLegend({ series, isLine }: { series: ChartSeries[]; isLine: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-1" style={{ fontSize: 10 }}>
      {series.map((s, si) => {
        const color = s.color ?? CHART_COLORS[si % CHART_COLORS.length]
        return (
          <span key={si} className="inline-flex items-center gap-1.5 text-slate-600">
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: isLine ? 2 : 8,
                background: color,
                borderRadius: 1,
              }}
            />
            {s.name}
          </span>
        )
      })}
    </div>
  )
}

function buildChart(
  isLine: boolean,
  chartData: Record<string, unknown>[],
  series: ChartSeries[],
  opts: { print: boolean; width?: number; height?: number },
): React.ReactElement {
  const { print, width, height } = opts
  const fs = print ? 9 : 10
  const n = chartData.length
  const dense = n > 6
  const dims = width && height ? { width, height } : {}
  const common = {
    data: chartData,
    margin: { top: 4, right: 16, left: dense ? 20 : 8, bottom: 4 },
    ...dims,
  }
  // NOTE: passed as a keyed array (not a fragment) so Recharts registers each child and
  // reserves space for the legend instead of drawing it over the plot area.
  const axes = [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e5e7eb" />,
    <XAxis
      key="x"
      dataKey="name"
      tick={{ fontSize: fs }}
      interval={xTickInterval(n)}
      angle={dense ? -30 : 0}
      textAnchor={dense ? 'end' : 'middle'}
      height={dense ? 52 : 28}
    />,
    <YAxis key="y" tick={{ fontSize: fs }} width={44} />,
    ...(print ? [] : [<Tooltip key="tip" />]),
    // The print copy is mounted while display:none, where Recharts would measure the legend as
    // 0px tall and draw it over the plot. Print uses the static <PrintLegend> instead.
    ...(print ? [] : [<Legend key="legend" verticalAlign="top" height={26} wrapperStyle={{ fontSize: fs + 1 }} />]),
  ]
  return isLine ? (
    <LineChart {...common}>
      {axes}
      {series.map((s, si) => (
        <Line
          key={si}
          type="monotone"
          dataKey={s.name}
          stroke={s.color ?? CHART_COLORS[si % CHART_COLORS.length]}
          strokeWidth={2}
          dot={n <= 12 ? { r: 2.5, strokeWidth: 0 } : false}
          activeDot={print ? false : undefined}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  ) : (
    <BarChart {...common} barCategoryGap="20%">
      {axes}
      {series.map((s, si) => (
        <Bar
          key={si}
          dataKey={s.name}
          fill={s.color ?? CHART_COLORS[si % CHART_COLORS.length]}
          radius={[2, 2, 0, 0]}
          maxBarSize={48}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '')
  }
  return String(v)
}

function resolveColumns(columns: (string | TableColumn)[] | undefined): TableColumn[] {
  if (!columns) return []
  return columns.map(c => {
    if (typeof c === 'string') return { key: c, label: c.replace(/_/g, ' ') }
    return { key: c.key, label: c.label ?? c.key.replace(/_/g, ' ') }
  })
}

// ── Block renderer ──────────────────────────────────────────────────────────

function renderBlock(block: ASTBlock, idx: number): React.ReactNode {
  const { type, content: c, source_references } = block

  const footnotes =
    source_references && source_references.length > 0 ? (
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 select-none">
          {source_references.length} source qualification
          {source_references.length > 1 ? 's' : ''}
        </summary>
        <ul className="mt-1 pl-4 space-y-0.5 list-disc text-[11px] text-gray-400">
          {source_references.map((ref, ri) => (
            <li key={ri}>
              {ref.source_id ?? ref.label ?? ''}
              {ref.field_path ? ` › ${ref.field_path}` : ''}
              {ref.record_id ? ` (${ref.record_id})` : ''}
            </li>
          ))}
        </ul>
      </details>
    ) : null

  let node: React.ReactNode

  switch (type) {
    case 'paragraph':
      node = (
        <p className="text-sm text-slate-700 leading-relaxed">{String(c.text ?? '')}</p>
      )
      break

    case 'heading': {
      const level = Number(c.level ?? 3)
      const text = String(c.text ?? '')
      node =
        level <= 3 ? (
          <h3 className="text-base font-bold text-slate-800 mt-4 mb-1">{text}</h3>
        ) : (
          <h4 className="text-sm font-semibold text-slate-700 mt-3 mb-1">{text}</h4>
        )
      break
    }

    case 'kpi_cards': {
      const cards = (c.cards ?? []) as KpiCardData[]
      node = (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cards.map((card, ci) => {
            const statusClass =
              KPI_STATUS_COLOR[(card.status ?? 'neutral').toLowerCase()] ??
              'text-slate-800'
            return (
              <div
                key={ci}
                className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex flex-col"
              >
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                  {card.label ?? ''}
                </span>
                <span className={`text-2xl font-bold mt-1 break-all ${statusClass}`}>
                  {fmtVal(card.value)}
                  {card.unit && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      {card.unit}
                    </span>
                  )}
                </span>
                {card.comparison_label != null && card.comparison_value != null && (
                  <span className="text-[11px] text-gray-400 mt-1">
                    {card.comparison_label}: {fmtVal(card.comparison_value)}
                    {card.unit ? ` ${card.unit}` : ''}
                  </span>
                )}
                {card.qualification && (
                  <span className="text-[10px] text-gray-400 italic mt-1 leading-snug">
                    {card.qualification}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )
      break
    }

    case 'chart': {
      const cc = c as unknown as ChartContent
      const categories = cc.categories ?? []
      const series = cc.series ?? []
      const chartData = categories.map((cat, ci) => {
        const point: Record<string, unknown> = { name: cat }
        series.forEach(s => {
          point[s.name] = s.data[ci] ?? null
        })
        return point
      })
      const isLine = (cc.chart_type ?? 'bar').toLowerCase() === 'line'
      node = (
        <figure className="m-0" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          {cc.title && (
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {cc.title}
            </p>
          )}
          {/* Screen copy — responsive, hidden when printing */}
          <div className="print:hidden">
            <ResponsiveContainer width="100%" height={SCREEN_CHART_HEIGHT}>
              {buildChart(isLine, chartData, series, { print: false })}
            </ResponsiveContainer>
          </div>
          {/* Print copy — fixed size, static, hidden on screen */}
          <div className="hidden print:block print-chart mx-auto" style={{ width: PRINT_CHART_WIDTH }}>
            <PrintLegend series={series} isLine={isLine} />
            {buildChart(isLine, chartData, series, { print: true, width: PRINT_CHART_WIDTH, height: PRINT_CHART_HEIGHT })}
          </div>
          {cc.qualification && (
            <p className="text-[11px] text-gray-400 italic mt-1">{cc.qualification}</p>
          )}
        </figure>
      )
      break
    }

    case 'bullet_list': {
      const items = (c.items ?? []) as (string | { text: string })[]
      node = (
        <ul className="list-disc pl-5 space-y-1">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm text-slate-700">
              {typeof item === 'string' ? item : item.text ?? ''}
            </li>
          ))}
        </ul>
      )
      break
    }

    case 'numbered_list': {
      const items = (c.items ?? []) as (string | { text: string })[]
      node = (
        <ol className="list-decimal pl-5 space-y-1">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm text-slate-700">
              {typeof item === 'string' ? item : item.text ?? ''}
            </li>
          ))}
        </ol>
      )
      break
    }

    case 'progress_bar': {
      const pb = c as unknown as ProgressBarContent
      const planned = Math.min(100, Math.max(0, Number(pb.planned_percent ?? 0)))
      const actual = Math.min(100, Math.max(0, Number(pb.actual_percent ?? 0)))
      const behindPlan = actual < planned
      node = (
        <div>
          {pb.label && (
            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
              <span className="text-xs font-medium text-slate-600">{pb.label}</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>
                  Planned: <strong>{planned}%</strong>
                </span>
                <span
                  className={
                    behindPlan ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'
                  }
                >
                  Actual: {actual}%
                </span>
              </div>
            </div>
          )}
          <div className="relative h-5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-200 rounded-full"
              style={{ width: `${planned}%` }}
            />
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                behindPlan ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${actual}%`, top: '6px', height: '8px' }}
            />
          </div>
          {pb.qualification && (
            <p className="text-[11px] text-gray-400 italic mt-1">{pb.qualification}</p>
          )}
        </div>
      )
      break
    }

    case 'callout':
    case 'finding': {
      const severity = String(c.severity ?? (type === 'finding' ? 'info' : 'warning')).toLowerCase()
      const borderCls =
        CALLOUT_SEVERITY_CLASSES[severity] ??
        (type === 'finding' ? 'border-violet-500 bg-violet-50' : 'border-amber-400 bg-amber-50')
      node = (
        <div className={`border-l-4 rounded-r-lg px-4 py-3 ${borderCls}`}>
          {c.title != null && (
            <p className="text-sm font-semibold text-slate-800 mb-1">{String(c.title)}</p>
          )}
          {c.text != null && (
            <p className="text-sm text-slate-700 leading-relaxed">{String(c.text)}</p>
          )}
        </div>
      )
      break
    }

    case 'timeline': {
      const items = (c.items ?? []) as TimelineItem[]
      node = (
        <div className="relative pl-6 space-y-4 border-l-2 border-slate-200 ml-2">
          {items.map((item, ti) => (
            <div key={ti} className="relative">
              <span className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-indigo-500 border-2 border-white shadow-sm" />
              {item.date && (
                <p className="text-[11px] font-semibold text-indigo-600 mb-0.5">{item.date}</p>
              )}
              {item.label && (
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
              )}
              {item.description && (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
              )}
            </div>
          ))}
        </div>
      )
      break
    }

    case 'table':
    case 'data_table':
    case 'activity_table':
    case 'lookahead_table':
    case 'exception_table':
    case 'resource_table':
    case 'milestone_table': {
      const tc = c as unknown as TableContent
      const specs = resolveColumns(tc.columns)
      const rows = (tc.rows ?? []) as Record<string, unknown>[]
      node = (
        <div>
          {tc.title && (
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {tc.title}
            </p>
          )}
          <div className="table-wrap rounded-lg border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {specs.map(col => (
                    <th
                      key={col.key}
                      className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200"
                    >
                      {col.label ?? col.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={specs.length || 1}
                      className="px-3 py-4 text-center text-xs text-gray-400 italic"
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  rows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {specs.map(col => (
                        <td
                          key={col.key}
                          className="px-3 py-2 text-slate-700 [overflow-wrap:anywhere]"
                        >
                          {fmtVal(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {tc.footer_note && (
            <p className="text-[11px] text-gray-400 italic mt-1">{tc.footer_note}</p>
          )}
        </div>
      )
      break
    }

    case 'image': {
      const imgUrl = String(c.image_url ?? '')
      node = (
        <figure>
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={String(c.work_area ?? c.image_reference ?? 'Report image')}
              className="w-full rounded-lg border border-gray-200 object-cover max-h-96"
              loading="lazy"
              onError={e => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="py-4 px-4 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 italic">
              Photograph URL unavailable
            </div>
          )}
          {(c.work_area != null || c.photo_date != null || c.image_reference != null) && (
            <figcaption className="text-[11px] text-gray-400 mt-1 text-center">
              {[c.image_reference, c.work_area, c.photo_date]
                .filter(v => v != null)
                .map(String)
                .join(' · ')}
            </figcaption>
          )}
        </figure>
      )
      break
    }

    default: {
      // Catch-all for any remaining *_table types not explicitly listed above
      if (type.endsWith('_table') || type.endsWith('table')) {
        const tc = c as unknown as TableContent
        const specs = resolveColumns(tc.columns)
        const rows = (tc.rows ?? []) as Record<string, unknown>[]
        node = (
          <div>
            {tc.title && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {tc.title}
              </p>
            )}
            <div className="table-wrap rounded-lg border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {specs.map(col => (
                      <th
                        key={col.key}
                        className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200"
                      >
                        {col.label ?? col.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={specs.length || 1}
                        className="px-3 py-4 text-center text-xs text-gray-400 italic"
                      >
                        No data
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        {specs.map(col => (
                          <td
                            key={col.key}
                            className="px-3 py-2 text-slate-700 [overflow-wrap:anywhere]"
                          >
                            {fmtVal(row[col.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {tc.footer_note && (
              <p className="text-[11px] text-gray-400 italic mt-1">{tc.footer_note}</p>
            )}
          </div>
        )
      } else {
        node = (
          <div className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded px-3 py-2">
            Unsupported block type:{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">{type}</code>
          </div>
        )
      }
    }
  }

  return (
    <div key={block.block_id ?? idx} className="mb-4">
      {node}
      {footnotes}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CoverPage({
  projectTextId,
  weekNum,
  dataDate,
  reportId,
}: {
  projectTextId: string
  weekNum: number | null
  dataDate: string | null
  reportId: string
}) {
  return (
    <section
      id="cover"
      className="weekly-report-cover print-page relative bg-gradient-to-br from-slate-900 to-indigo-800 text-white rounded-xl overflow-hidden mb-6 p-10 min-h-80 flex flex-col justify-between"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Weekly Progress Report
        </span>
        <span className="text-xs text-slate-400 font-mono">{projectTextId}</span>
      </div>

      <div className="flex-1 flex flex-col justify-center py-8">
        <h1 className="text-4xl font-extrabold mb-3 leading-tight tracking-tight">
          {projectTextId}
        </h1>
        <p className="text-2xl font-semibold text-slate-300 mb-1">
          Week {weekNum ?? '—'}
        </p>
        <p className="text-lg text-slate-400">{fmtDate(dataDate)}</p>
      </div>

      <div className="flex gap-8 border-t border-white/20 pt-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Report ID</p>
          <p className="text-xs font-mono text-slate-300 break-all">{reportId}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Project ID</p>
          <p className="text-xs font-mono text-slate-300">{projectTextId}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Data Date</p>
          <p className="text-xs font-mono text-slate-300">{fmtDate(dataDate)}</p>
        </div>
      </div>
    </section>
  )
}

/** Returns the display label for a section's numbering badge.
 *  'auto' (the DB default) → use the section_id directly (e.g. SEC-001, APP-A).
 *  null / empty → use section_id as fallback.
 *  Any other explicit value → use as-is.
 */
function resolveNumbering(numbering: string | null, sectionId: string): string {
  if (!numbering || numbering === 'auto') return sectionId
  return numbering
}

function TableOfContents({ sections }: { sections: WeeklyReportSection[] }) {
  const tocSections = sections.filter(s => s.include_in_toc !== false)

  return (
    <section
      id="toc"
      className="weekly-report-toc print-page bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6"
    >
      <h2 className="text-xl font-bold text-slate-800 mb-6 pb-3 border-b border-gray-200">
        Table of Contents
      </h2>
      <div className="grid grid-cols-2 gap-1">
        {tocSections.map(s => {
          const badge = resolveNumbering(s.numbering, s.section_id)
          return (
            <a
              key={s.section_id}
              href={`#section-${s.section_id}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group no-underline"
            >
              <span className="flex-shrink-0 text-[10px] font-bold font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                {badge}
              </span>
              <span className="text-sm text-slate-700 group-hover:text-slate-900 font-medium truncate">
                {s.title ?? s.section_id}
              </span>
            </a>
          )
        })}
        {tocSections.length === 0 && (
          <p className="col-span-2 text-sm text-gray-400 italic">No sections to display.</p>
        )}
      </div>
    </section>
  )
}

function SectionCard({ section }: { section: WeeklyReportSection }) {
  const blocks = section.section_ast?.blocks ?? []
  const badge = resolveNumbering(section.numbering, section.section_id)
  // Wide content (tables) is cut off on a portrait page, so those sections print on a
  // landscape page. Sections the data marks as landscape do too.
  const printLandscape =
    section.orientation === 'landscape' ||
    blocks.some(b => b.type === 'table' || b.type === 'data_table')

  return (
    <section
      id={`section-${section.section_id}`}
      className={`weekly-report-section print-page bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6 ${
        section.page_break_before ? 'break-before-page' : ''
      } ${section.orientation === 'landscape' ? 'landscape' : ''} ${printLandscape ? 'print-landscape' : ''}`}
    >
      <div className="flex items-start gap-4 mb-6 pb-4 border-b border-gray-100">
        <span className="flex-shrink-0 text-xs font-bold font-mono bg-indigo-600 text-white px-2.5 py-1 rounded-lg shadow-sm whitespace-nowrap">
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">
            {section.title ?? section.section_id}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {section.type === 'appendix' ? 'Appendix' : 'Section'}
            {section.processing_status
              ? ` · ${section.processing_status.replace(/_/g, ' ')}`
              : ''}
            {blocks.length > 0
              ? ` · ${blocks.length} block${blocks.length !== 1 ? 's' : ''}`
              : ''}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No content blocks in this section.</p>
        ) : (
          blocks.map((block, idx) => renderBlock(block, idx))
        )}
      </div>
    </section>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function WeeklyReportForm({
  projectId: _projectId,
  projectTextId,
  schemaName,
}: {
  projectId: string
  projectTextId: string
  schemaName: string
}) {
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string>('')
  const [sections, setSections] = useState<WeeklyReportSection[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { notification, hideNotification, showError } = useNotification()
  const _printAreaRef = useRef<HTMLDivElement>(null)

  // Fetch available week/report options
  useEffect(() => {
    if (!projectTextId || !schemaName || schemaName === 'public') return
    const db = schemaClient(schemaName)

    async function fetchOptions() {
      setLoadingOptions(true)
      try {
        const { data, error } = await (db as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: string) => {
                order: (col: string, opts: { ascending: boolean }) => Promise<{
                  data: { report_id: string; week_num: number; data_date: string }[] | null
                  error: { message: string } | null
                }>
              }
            }
          }
        })
          .from('dbp6_0008_weekly_report_sections')
          .select('report_id, week_num, data_date')
          .eq('project_id', projectTextId)
          .order('data_date', { ascending: false })

        if (error) throw new Error(error.message)

        if (!data?.length) {
          setWeekOptions([])
          setLoadingOptions(false)
          return
        }

        const seen = new Set<string>()
        const opts: WeekOption[] = []
        for (const row of data) {
          if (!seen.has(row.report_id)) {
            seen.add(row.report_id)
            const formattedDate = row.data_date
              ? new Date(row.data_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : ''
            opts.push({
              report_id: row.report_id,
              week_num: row.week_num,
              data_date: row.data_date,
              label: `Week ${row.week_num ?? '?'} — ${formattedDate}`,
            })
          }
        }

        setWeekOptions(opts)
        if (opts.length > 0) {
          setSelectedReportId(opts[0].report_id)
        }
      } catch (err) {
        showError(
          'Failed to load report list: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      } finally {
        setLoadingOptions(false)
      }
    }

    fetchOptions()
  }, [projectTextId, schemaName])

  // Fetch sections for selected report
  useEffect(() => {
    if (!selectedReportId || !schemaName || schemaName === 'public') return
    const db = schemaClient(schemaName)

    async function fetchSections() {
      setLoadingReport(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any)
          .from('dbp6_0008_weekly_report_sections')
          .select('*')
          .eq('report_id', selectedReportId)
          .order('section_order', { ascending: true })

        if (error) throw new Error(error.message)
        setSections((data ?? []) as WeeklyReportSection[])
      } catch (err) {
        showError(
          'Failed to load report sections: ' +
            (err instanceof Error ? err.message : String(err)),
        )
        setSections([])
      } finally {
        setLoadingReport(false)
      }
    }

    fetchSections()
  }, [selectedReportId, schemaName])

  const selectedWeek = weekOptions.find(o => o.report_id === selectedReportId)

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections
    const q = searchQuery.toLowerCase()
    return sections.filter(
      s =>
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.semantic_role ?? '').toLowerCase().includes(q) ||
        (s.section_id ?? '').toLowerCase().includes(q),
    )
  }, [sections, searchQuery])

  if (!schemaName || schemaName === 'public') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg
          className="w-12 h-12 mb-4 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-base font-medium text-gray-500">No project selected</p>
        <p className="text-sm mt-1">Select a project with a configured schema to view the weekly report.</p>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      {/* Toolbar — hidden on print */}
      <div className="no-print flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">
            Report Week:
          </label>
          {loadingOptions ? (
            <span className="text-xs text-gray-400">Loading…</span>
          ) : (
            <select
              value={selectedReportId}
              onChange={e => setSelectedReportId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              {weekOptions.length === 0 ? (
                <option value="">No reports found</option>
              ) : (
                weekOptions.map(opt => (
                  <option key={opt.report_id} value={opt.report_id}>
                    {opt.label}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter sections…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          onClick={() => {
            // Inject a portrait @page override so the weekly report prints correctly.
            // The global @page in index.css defaults to A4 landscape (for the chart dashboard).
            // We override it here, print, then remove the override.
            const styleEl = document.createElement('style')
            styleEl.id = 'weekly-report-print-override'
            styleEl.textContent = `
              @page { size: A4 portrait; margin: 14mm 13mm; }
              @page landscape-page { size: A4 landscape; margin: 12mm 12mm; }
              @media print {
                .weekly-report-section.print-landscape {
                  page: landscape-page;
                  /* Chromium keeps the portrait layout width for percentage widths, so set
                     the landscape printable width (297mm - 2 x 12mm margins) explicitly. */
                  width: 273mm !important;
                  max-width: none !important;
                }
                .weekly-report-section {
                  padding: 20px 24px !important;
                  border: 1px solid #e5e7eb !important;
                  border-radius: 0 !important;
                  box-shadow: none !important;
                  margin-bottom: 0 !important;
                }
                .weekly-report-cover {
                  border-radius: 0 !important;
                  box-shadow: none !important;
                  padding: 35mm 20mm !important;
                  margin-bottom: 0 !important;
                  background: #172542 !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                }
                .weekly-report-toc {
                  border-radius: 0 !important;
                  box-shadow: none !important;
                  padding: 20px 24px !important;
                  margin-bottom: 0 !important;
                }
                .table-wrap {
                  overflow: visible !important;
                }
                .table-wrap table {
                  font-size: 7.5pt !important;
                  width: 100% !important;
                }
                .table-wrap th,
                .table-wrap td {
                  padding: 4px 5px !important;
                }
              }
            `
            document.head.appendChild(styleEl)
            window.print()
            document.head.removeChild(styleEl)
          }}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print / Save PDF
        </button>

        {sections.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
            {filteredSections.length} / {sections.length} section
            {sections.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Two-column layout: sticky in-page nav + report content */}
      <div className="flex gap-6 items-start">
        {/* In-page sticky nav — hidden on print */}
        {sections.length > 0 && (
          <aside className="no-print flex-shrink-0 w-48 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-sm p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">
              Sections
            </p>
            <nav className="space-y-0.5">
              <a
                href="#cover"
                className="block px-2 py-1.5 text-xs text-gray-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
              >
                Cover
              </a>
              <a
                href="#toc"
                className="block px-2 py-1.5 text-xs text-gray-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
              >
                Contents
              </a>
              {sections
                .filter(s => s.include_in_toc !== false)
                .map(s => (
                  <a
                    key={s.section_id}
                    href={`#section-${s.section_id}`}
                    className="block px-2 py-1.5 text-xs text-gray-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors truncate"
                    title={s.title ?? s.section_id}
                  >
                    <span className="font-mono text-indigo-500 mr-1">{s.section_id}</span>
                    {s.title ?? ''}
                  </a>
                ))}
            </nav>
          </aside>
        )}

        {/* Print-target report area */}
        <div ref={_printAreaRef} className="flex-1 min-w-0">
          {loadingReport ? (
            <div className="py-16">
              <LoadingSpinner />
            </div>
          ) : sections.length === 0 && !loadingOptions ? (
            <div className="text-center py-16 text-gray-400">
              <svg
                className="w-12 h-12 mx-auto mb-4 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-base font-medium text-gray-500">No report data found</p>
              <p className="text-sm mt-1">
                {weekOptions.length === 0
                  ? 'No weekly reports are available for this project yet.'
                  : 'The selected report has no sections.'}
              </p>
            </div>
          ) : (
            <>
              {selectedWeek && (
                <CoverPage
                  projectTextId={projectTextId}
                  weekNum={selectedWeek.week_num}
                  dataDate={selectedWeek.data_date}
                  reportId={selectedWeek.report_id}
                />
              )}

              {sections.length > 0 && <TableOfContents sections={sections} />}

              {filteredSections.map(section => (
                <SectionCard key={section.section_id} section={section} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
