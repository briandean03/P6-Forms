import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react'
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
  LabelList,
} from 'recharts'
import { selectWeeklyDesign, normaliseWeeklyDesign, weeklyColor, weeklySeriesColor, weeklyDesignStyle, weeklyStatusStyle, weeklyCalloutStyle, weeklyPage, weeklyPrintCss, type WeeklyDesign, type WeeklyDesignRow } from '@/lib/weeklyReportDesign'
import { designNumber } from '@/lib/dashboardDesign'
import { prepareWeeklyTable, visibleWeeklyColumns, prepareWeeklyChart, type ReportChartSeries } from '@/lib/weeklyReportPresentation'
import { allWeeklyRows, weeklyReportOptions, disciplineLookup, type ReportIndexRow } from '@/lib/weeklyReportData'
import { schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const WeeklyMetadataContext = createContext<Record<string, string>>({})
const WeeklyDesignContext = createContext<WeeklyDesign>({})

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

type ChartSeries = ReportChartSeries

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
  hasSections?: boolean
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

// Print chart widths:
// Portrait: 210mm − 2×13mm margins = 184mm ≈ 696px at 96dpi, use 680 with headroom.
// Landscape: 297mm − 2×12mm margins = 273mm ≈ 1032px at 96dpi, use 1000 with headroom.
const PRINT_CHART_WIDTH_PORTRAIT = 680
const PRINT_CHART_WIDTH_LANDSCAPE = 1000
const PRINT_CHART_HEIGHT = 200
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
function PrintLegend({ series, isLine, cumulativeProgress = false }: { series: ChartSeries[]; isLine: boolean; cumulativeProgress?: boolean }) {
  const design = useContext(WeeklyDesignContext)
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-1" style={{ fontSize: designNumber(design.charts?.legend_size_pt, 6) * 96 / 72 }}>
      {series.map((s, si) => {
        const color = weeklySeriesColor(design, s.color_key ?? s.name, s.color, CHART_COLORS[si % CHART_COLORS.length], cumulativeProgress)
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
  opts: { print: boolean; width?: number; height?: number; design: WeeklyDesign; cumulativeProgress?: boolean },
): React.ReactElement {
  const { print, width, height, design, cumulativeProgress = false } = opts
  const fs = designNumber(design.charts?.axis_label_size_pt, print ? 6 : 7.5) * 96 / 72
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
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke={weeklyColor(design, design.charts?.gridline_color, '#e5e7eb')} />,
    <XAxis
      key="x"
      dataKey="name"
      allowDuplicatedCategory={false}
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
    ...(print ? [] : [<Legend key="legend" verticalAlign="top" height={26} wrapperStyle={{ fontSize: designNumber(design.charts?.legend_size_pt, 8) * 96 / 72 }} />]),
  ]
  return isLine ? (
    <LineChart {...common}>
      {axes}
      {series.map((s, si) => (
        <Line
          key={si}
          // Smooth each weekly transition without averaging or overshooting its endpoints.
          type={cumulativeProgress ? 'bumpX' : 'monotone'}
          strokeLinecap="round"
          strokeLinejoin="round"
          data={s.points ?? chartData}
          connectNulls={false}
          dataKey={s.name}
          stroke={weeklySeriesColor(design, s.color_key ?? s.name, s.color, CHART_COLORS[si % CHART_COLORS.length], cumulativeProgress)}
          strokeWidth={designNumber(design.charts?.line_width_pt, 1.5) * 96 / 72}
          strokeDasharray="none"
          dot={n === 1 ? { r: 2.5, fill: weeklySeriesColor(design, s.color_key ?? s.name, s.color, CHART_COLORS[si % CHART_COLORS.length], cumulativeProgress), strokeWidth: 0 } : false}
          activeDot={print ? false : undefined}
          isAnimationActive={false}
        >
          {cumulativeProgress && <LabelList dataKey={s.name} content={props => {
            const { x, y, index, value } = props as unknown as { x?: number; y?: number; index?: number; value?: unknown }
            const count = (s.points ?? chartData).length
            const step = Math.max(1, Math.ceil(count / (print ? 4 : 6)))
            if (typeof x !== 'number' || typeof y !== 'number' || typeof value !== 'number' || !Number.isFinite(value) || index == null || (index !== 0 && index !== count - 1 && index % step !== 0)) return null
            const color = weeklySeriesColor(design, s.color_key ?? s.name, s.color, CHART_COLORS[si % CHART_COLORS.length], true)
            return <text x={x} y={y + (/actual/i.test(s.name) && value !== 0 ? 14 : -8)} textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'} fill={color} fontSize={print ? 8 : 10} fontWeight={600}>{value.toFixed(2)}%</text>
          }} />}
        </Line>
      ))}
    </LineChart>
  ) : (
    <BarChart {...common} barCategoryGap="20%">
      {axes}
      {series.map((s, si) => (
        <Bar
          key={si}
          dataKey={s.name}
          fill={weeklySeriesColor(design, s.color_key ?? s.name, s.color, CHART_COLORS[si % CHART_COLORS.length], cumulativeProgress)}
          radius={[2, 2, 0, 0]}
          maxBarSize={48}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Recursively unwrap double-encoded JSON strings — mirrors Python's decode() in main.py.
// Supabase stores JSON columns as serialised strings (sometimes more than once).
// This ensures section_ast always arrives as a real object regardless of encoding depth.
function parseJsonCol(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  try {
    const once = JSON.parse(raw)
    // If parsing again gives another string, keep unwrapping
    if (typeof once === 'string') {
      try { return JSON.parse(once) } catch { return once }
    }
    return once
  } catch {
    return raw
  }
}

function parseSectionAst(raw: unknown): SectionAST | null {
  const v = parseJsonCol(raw)
  if (v != null && typeof v === 'object' && !Array.isArray(v)) return v as SectionAST
  return null
}

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

function fmtVal(v: unknown, unit?: string | null): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (unit === '%') return v.toFixed(2)
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '')
  }
  return String(v)
}

function resolveColumns(columns: (string | TableColumn)[] | undefined): TableColumn[] {
  if (!columns) return []
  return visibleWeeklyColumns(columns.map(c => {
    if (typeof c === 'string') return { key: c, label: c.replace(/_/g, ' ') }
    return { key: c.key, label: c.label ?? c.key.replace(/_/g, ' ') }
  }))
}

// ── Block renderer ──────────────────────────────────────────────────────────

function renderBlock(block: ASTBlock, idx: number, isLandscape = false, design: WeeklyDesign = {}, sectionContext = '', disciplines: Record<string, string> = {}): React.ReactNode {
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
        <div className="wr-kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {cards.map((card, ci) => {
            const statusClass =
              KPI_STATUS_COLOR[(card.status ?? 'neutral').toLowerCase()] ??
              'text-slate-800'
            return (
              <div
                key={ci}
                className="wr-kpi-card bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex flex-col"
              >
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                  {card.label ?? ''}
                </span>
                <span className={`wr-kpi-value text-2xl font-bold mt-1 break-all ${statusClass}`} data-status={card.status ?? 'neutral'} style={weeklyStatusStyle(design, card.status)}>
                  {fmtVal(card.value, card.unit)}
                  {card.unit && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      {card.unit}
                    </span>
                  )}
                </span>
                {card.comparison_label != null && card.comparison_value != null && (
                  <span className="text-[11px] text-gray-400 mt-1">
                    {card.comparison_label}: {fmtVal(card.comparison_value, card.unit)}
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
      const { chartData, series } = prepareWeeklyChart(cc.categories ?? [], cc.series ?? [])
      const isLine = ['line', 'line_chart'].includes((cc.chart_type ?? 'bar').toLowerCase())
      const cumulativeProgress = isLine && /cumulative/i.test(`${cc.title ?? ''} ${sectionContext}`) && /progress/i.test(`${cc.title ?? ''} ${sectionContext}`) && series.some(s => /actual/i.test(s.name)) && series.some(s => /planned|baseline/i.test(s.name))
      const printW = Object.keys(design).length ? Math.floor(weeklyPage(design, isLandscape).contentWidth * 96 / 72) - 8 : isLandscape ? PRINT_CHART_WIDTH_LANDSCAPE : PRINT_CHART_WIDTH_PORTRAIT
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
              {buildChart(isLine, chartData, series, { print: false, design, cumulativeProgress })}
            </ResponsiveContainer>
          </div>
          {/* Print copy — fixed size, static, hidden on screen */}
          <div className="hidden print:block print-chart mx-auto" style={{ width: printW }}>
            <PrintLegend series={series} isLine={isLine} cumulativeProgress={cumulativeProgress} />
            {buildChart(isLine, chartData, series, { print: true, width: printW, height: PRINT_CHART_HEIGHT, design, cumulativeProgress })}
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
        <div className={`wr-callout border-l-4 rounded-r-lg px-4 py-3 ${borderCls}`} style={weeklyCalloutStyle(design, c.callout_type ?? c.category ?? ({ warning: 'schedule_concern', critical: 'risk', info: 'management_attention' } as Record<string, string>)[severity] ?? block.design_style)}>
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
      const { columns: specs, rows } = prepareWeeklyTable(resolveColumns(tc.columns), (tc.rows ?? []) as Record<string, unknown>[], `${sectionContext} ${tc.title ?? ''}`, disciplines)
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
                      {specs.map(col => {
                        const isPercent = /percent|pct|%/i.test(col.key)
                        return (
                          <td
                            key={col.key}
                            data-numeric={typeof row[col.key] === 'number'} className="px-3 py-2 text-slate-700 [overflow-wrap:anywhere]"
                          >
                            {fmtVal(row[col.key], isPercent ? '%' : null)}
                          </td>
                        )
                      })}
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

    case 'image_gallery': {
      // content.images[] or content.photos[] — each item may have image_url/photo_url,
      // image_reference/filename, work_area/location_or_area, photo_date/photo_date_display, caption
      const rawItems =
        (c.images ?? c.photos ?? []) as Record<string, unknown>[]
      if (rawItems.length === 0) {
        node = (
          <div className="py-4 px-4 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 italic">
            No photographs available
          </div>
        )
      } else {
        node = (
          <div className={rawItems.length === 1 ? '' : 'grid grid-cols-2 gap-3'}>
            {rawItems.map((photo, pi) => {
              const url = String(photo.image_url ?? photo.photo_url ?? '')
              const ref = photo.image_reference ?? photo.filename ?? null
              const area = photo.work_area ?? photo.location_or_area ?? null
              const date = photo.photo_date ?? photo.photo_date_display ?? null
              const caption = photo.caption ?? photo.caption_or_description ?? null
              return (
                <figure key={pi}>
                  {url ? (
                    <img
                      src={url}
                      alt={String(caption ?? area ?? ref ?? 'Progress photograph')}
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
                  {(ref != null || area != null || date != null || caption != null) && (
                    <figcaption className="text-[11px] text-gray-400 mt-1 text-center">
                      {[ref, area, date, caption]
                        .filter(v => v != null)
                        .map(String)
                        .join(' · ')}
                    </figcaption>
                  )}
                </figure>
              )
            })}
          </div>
        )
      }
      break
    }

    default: {
      // Catch-all for any remaining *_table types not explicitly listed above
      if (type.endsWith('_table') || type.endsWith('table')) {
        const tc = c as unknown as TableContent
        const { columns: specs, rows } = prepareWeeklyTable(resolveColumns(tc.columns), (tc.rows ?? []) as Record<string, unknown>[], `${sectionContext} ${tc.title ?? ''}`, disciplines)
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
                            data-numeric={typeof row[col.key] === 'number'} className="px-3 py-2 text-slate-700 [overflow-wrap:anywhere]"
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

  const isTableBlock =
    type === 'table' ||
    type === 'data_table' ||
    type.endsWith('_table')
  return (
    <div key={block.block_id ?? idx} className={`wr-block${isTableBlock ? ' wr-block-table' : ''}${isTableBlock && /shop.*drawing|dwg/i.test(`${sectionContext} ${c.title ?? ''}`) && /discipline/i.test(`${sectionContext} ${c.title ?? ''}`) ? ' wr-discipline-distribution' : ''} mb-4`}>
      {node}
      {footnotes}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CoverPage({
  projectTextId,
  projectName,
  weekNum,
  dataDate,
  reportId,
}: {
  projectTextId: string
  projectName: string
  weekNum: number | null
  dataDate: string | null
  reportId: string
}) {
  // All sizes are in px/pt — NOT rem — so the 10px root font-size set for
  // content pages in print does not shrink the cover.
  return (
    <section
      id="cover"
      className="weekly-report-cover"
      style={{
        background: 'linear-gradient(125deg, #172642 20%, #3a3d82 100%)',
        color: '#fff',
        borderRadius: 17,
        padding: '48px 48px 39px',
        marginBottom: 25,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 320,
      }}
    >
      {/* Eyebrow */}
      <div style={{ fontSize: 11, letterSpacing: '2.2px', textTransform: 'uppercase', color: '#aebde1' }}>
        CONSTRUCTION PROJECT CONTROLS · WEEKLY REPORT
      </div>

      {/* Main title block */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0 20px' }}>
        <h1 style={{ fontSize: 40, lineHeight: 1.18, margin: '16px 0 10px', letterSpacing: -1, fontWeight: 800 }}>
          {projectName || projectTextId}
        </h1>
        <h2 style={{ fontSize: 18, fontWeight: 400, color: '#dbe2fa', margin: '0 0 0' }}>
          Weekly Progress &amp; Performance Report
        </h2>
      </div>

      {/* Meta strip */}
      <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 18 }}>
        {([
          ['Reporting week', weekNum ?? '—'],
          ['Data Date', fmtDate(dataDate)],
          ['Project ID', projectTextId],
          ['Report ID', reportId],
        ] as [string, string | number][]).map(([label, value]) => (
          <div key={label} style={{ minWidth: 130 }}>
            <span style={{ display: 'block', color: '#abbcdb', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              {label}
            </span>
            <strong style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' as const, color: '#fff' }}>
              {value}
            </strong>
          </div>
        ))}
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
      className="weekly-report-toc bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6"
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
  const design = useContext(WeeklyDesignContext)
  const disciplines = useContext(WeeklyMetadataContext)
  const blocks = section.section_ast?.blocks ?? []
  const badge = design.sections?.numbering_enabled === false ? '' : resolveNumbering(section.numbering, section.section_id)
  // Only use the orientation field from the DB — portrait sections with tables
  // stay portrait (handled by table styling: 7.5pt, word-wrap, auto layout).
  const printLandscape = section.orientation === 'landscape'

  return (
    <section
      id={`section-${section.section_id}`}
      className={`weekly-report-section bg-white rounded-xl border border-gray-100 shadow-sm p-8 mb-6${printLandscape ? ' print-landscape' : ''}`}
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
          blocks.map((block, idx) => renderBlock(block, idx, printLandscape, design, `${section.title ?? ''} ${section.semantic_role ?? ''}`, disciplines))
        )}
      </div>
    </section>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function WeeklyReportForm({
  projectId,
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
  const [loadedReportId, setLoadedReportId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const { notification, hideNotification, showError } = useNotification()
  const _printAreaRef = useRef<HTMLDivElement>(null)
  const [projectName, setProjectName] = useState('')
  const [disciplines, setDisciplines] = useState<Record<string, string>>({})
  const [designRows, setDesignRows] = useState<WeeklyDesignRow[]>([])
  const scopeKey = `${schemaName}:${projectTextId}:${projectId}`
  const [loadedScope, setLoadedScope] = useState('')
  const designRow = useMemo(() => selectWeeklyDesign(loadedScope === scopeKey ? designRows : [], projectTextId, selectedReportId), [designRows, loadedScope, scopeKey, projectTextId, selectedReportId])
  const design = useMemo(() => normaliseWeeklyDesign(designRow), [designRow])

  // Add the weekly-report-printing class while this form is mounted so that
  // Ctrl+P also picks up the correct print CSS (not just the Print button).
  useEffect(() => {
    document.documentElement.classList.add('weekly-report-printing')
    return () => {
      document.documentElement.classList.remove('weekly-report-printing')
    }
  }, [])

  // Queries are scoped to the selected schema and project. Clear the previous
  // report immediately and ignore late responses when projects/schemas switch.
  useEffect(() => {
    let cancelled = false
    setWeekOptions([])
    setSelectedReportId('')
    setSections([])
    setDesignRows([])
    setProjectName('')
    setDisciplines({})
    setLoadedScope('')
    if (!projectTextId || !schemaName || schemaName === 'public') {
      setLoadingOptions(false)
      setLoadedScope(scopeKey)
      return () => { cancelled = true }
    }
    async function fetchOptions() {
      setLoadingOptions(true)
      const db = schemaClient(schemaName)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = db as any
        const [options, catalogue, projectDesigns, sharedDesigns, project, disciplineRows] = await Promise.all([
          allWeeklyRows<ReportIndexRow>(() => client.from('dbp6_0008_weekly_report_sections').select('report_id, week_num, data_date').eq('project_id', projectTextId).order('data_date', { ascending: false }).order('id', { ascending: true })),
          allWeeklyRows<ReportIndexRow>(() => client.from('dbp6_0008_weekly_reports_calculations').select('report_id, week_num, data_date, report_type').eq('project_id', projectTextId).order('data_date', { ascending: false }).order('id', { ascending: true })),
          client.from('dbp6_0008_weekly_report_design').select('*').eq('project_id', projectTextId).eq('is_active', true).eq('is_approved', true),
          client.from('dbp6_0008_weekly_report_design').select('*').is('project_id', null).eq('is_active', true).eq('is_approved', true),
          client.from('dbp6_0000_projectdata').select('dgt_projectname').eq(projectId ? 'dgt_dbp6bd00projectdataid' : 'dgt_projectid', projectId || projectTextId).maybeSingle(),
          allWeeklyRows<{ discipline_code: string | null; discipline_name: string | null }>(() => client.from('dbp6_0018_discipline').select('discipline_code, discipline_name').order('discipline_code', { ascending: true }).order('id', { ascending: true })),
        ])
        if (cancelled) return
        if (options.error && catalogue.error) throw new Error(options.error.message)
        const opts = weeklyReportOptions(catalogue.data ?? [], options.data ?? [])
        if (catalogue.error || options.error) showError('Some report weeks could not be loaded. Showing the available report records.')
        let details = project
        if (!details.error && !details.data && projectId) {
          details = await client.from('dbp6_0000_projectdata').select('dgt_projectname').eq('dgt_projectid', projectTextId).maybeSingle()
        }
        if (cancelled) return
        setProjectName(details.data?.dgt_projectname?.trim() ?? '')
        setDisciplines(disciplineLookup(disciplineRows.data ?? []))
        if (details.error || disciplineRows.error) showError('Some project or discipline names could not be loaded. Original identifiers are shown where names are unavailable.')
        if (projectDesigns.error || sharedDesigns.error) showError('Weekly report design could not be loaded. Using fallback styling.')
        setDesignRows([...(projectDesigns.data ?? []), ...(sharedDesigns.data ?? [])])
        setWeekOptions(opts)
        setSelectedReportId(opts[0]?.report_id ?? '')
        setLoadedScope(scopeKey)
      } catch (err) {
        if (!cancelled) {
          showError('Failed to load report list: ' + (err instanceof Error ? err.message : String(err)))
          setLoadedScope(scopeKey)
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }
    void fetchOptions()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectTextId, schemaName, scopeKey])

  useEffect(() => {
    let cancelled = false
    setSections([])
    if (!selectedReportId || loadedScope !== scopeKey || !schemaName || schemaName === 'public') {
      setLoadingReport(false)
      setLoadedReportId('')
      return () => { cancelled = true }
    }
    async function fetchSections() {
      setLoadingReport(true)
      setLoadedReportId('')
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (schemaClient(schemaName) as any)
          .from('dbp6_0008_weekly_report_sections').select('*')
          .eq('report_id', selectedReportId).eq('project_id', projectTextId)
          .order('section_order', { ascending: true })
        if (cancelled) return
        if (error) throw new Error(error.message)
        setSections(((data ?? []) as WeeklyReportSection[]).map(section => ({ ...section, section_ast: parseSectionAst(section.section_ast) })))
      } catch (err) {
        if (!cancelled) showError('Failed to load report sections: ' + (err instanceof Error ? err.message : String(err)))
      } finally {
        if (!cancelled) { setLoadingReport(false); setLoadedReportId(selectedReportId) }
      }
    }
    void fetchSections()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportId, schemaName, projectTextId, loadedScope, scopeKey])

  const selectedWeek = weekOptions.find(o => o.report_id === selectedReportId)

  // Always render appendices after all regular sections, regardless of section_order from the DB.
  const sortedSections = useMemo(() =>
    [...sections].sort((a, b) => {
      const aIsAppendix = (a.type ?? '').toLowerCase() === 'appendix' ? 1 : 0
      const bIsAppendix = (b.type ?? '').toLowerCase() === 'appendix' ? 1 : 0
      if (aIsAppendix !== bIsAppendix) return aIsAppendix - bIsAppendix
      return (a.section_order ?? 0) - (b.section_order ?? 0)
    }),
  [sections])

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sortedSections
    const q = searchQuery.toLowerCase()
    return sortedSections.filter(
      s =>
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.semantic_role ?? '').toLowerCase().includes(q) ||
        (s.section_id ?? '').toLowerCase().includes(q),
    )
  }, [sortedSections, searchQuery])

  return (
    <WeeklyDesignContext.Provider value={design}>
    <WeeklyMetadataContext.Provider value={loadedScope === scopeKey ? disciplines : {}}>
    <div className="weekly-report-themed min-h-full" style={weeklyDesignStyle(design)}>
      <style>{weeklyPrintCss(design, { projectId: projectTextId, dataDate: selectedWeek?.data_date ?? '' })}</style>
      {!designRow && sections.length > 0 && <p className="no-print text-xs text-amber-700 mb-3">No approved active design matches this report. Using fallback styling.</p>}
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
          onClick={() => window.print()}
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
              {sortedSections
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
          {loadingReport || loadingOptions || loadedScope !== scopeKey || loadedReportId !== selectedReportId ? (
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
                  : selectedWeek?.hasSections === false ? 'Calculations exist for this week, but report sections have not been generated. Generate the report for the selected week to view its content.' : 'The selected report has no sections.'}
              </p>
            </div>
          ) : (
            <>
              {selectedWeek && (
                <CoverPage
                  projectTextId={projectTextId}
                  projectName={projectName}
                  weekNum={selectedWeek.week_num}
                  dataDate={selectedWeek.data_date}
                  reportId={selectedWeek.report_id}
                />
              )}

              {sections.length > 0 && <TableOfContents sections={sortedSections} />}

              {filteredSections.map(section => (
                <SectionCard key={section.section_id} section={section} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
    </WeeklyMetadataContext.Provider>
    </WeeklyDesignContext.Provider>
  )
}
