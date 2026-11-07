import type { CSSProperties } from 'react'
import { designNumber, designObject } from './dashboardDesign'

export type WeeklyDesignRow = Record<string, unknown>
export type WeeklyDesign = Record<string, Record<string, unknown>>

export function decodeWeeklyDesign(value: unknown): unknown {
  let parsed = value
  for (let i = 0; i < 6 && typeof parsed === 'string'; i++) {
    try { parsed = JSON.parse(parsed) } catch { break }
  }
  return parsed
}

export function selectWeeklyDesign(rows: WeeklyDesignRow[], projectId: string, reportId: string): WeeklyDesignRow | null {
  const eligible = rows.filter(row => row.is_active === true && row.is_approved === true
    && (row.project_id == null || row.project_id === projectId)
    && (row.report_id == null || row.report_id === reportId)
    && String(row.report_type ?? 'Weekly Progress Report').replace(/[\W_]/g, '').toLowerCase() === 'weeklyprogressreport')
  const priority = (row: WeeklyDesignRow) => (row.report_id === reportId ? 4 : 0) + (row.project_id === projectId ? 2 : 0)
  eligible.sort((a, b) => priority(b) - priority(a)
    || (Date.parse(String(b.updated_at)) || 0) - (Date.parse(String(a.updated_at)) || 0)
    || Number(b.id ?? 0) - Number(a.id ?? 0))
  return eligible[0] ?? null
}

export function normaliseWeeklyDesign(row: WeeklyDesignRow | null): WeeklyDesign {
  if (!row) return {}
  const result: WeeklyDesign = {}
  for (const key of ['design_system', 'page', 'typography', 'colors', 'cover_page', 'header', 'footer', 'sections', 'kpi_cards', 'tables', 'status_styles', 'callouts', 'charts', 'layout_rules']) {
    result[key] = designObject(decodeWeeklyDesign(row[key]))
  }
  return result
}

export function weeklyColor(design: WeeklyDesign, value: unknown, fallback: string): string {
  const resolved = typeof value === 'string' ? design.colors?.[value] ?? value : value
  return typeof resolved === 'string' && /^#[0-9a-f]{3,8}$/i.test(resolved) ? resolved : fallback
}

export function weeklySeriesColor(design: WeeklyDesign, name: string, explicit: string | null | undefined, fallback: string, cumulativeProgress = false): string {
  if (cumulativeProgress && /actual/i.test(name)) {
    const actual = weeklyColor(design, 'positive', '#159b75')
    const planned = weeklySeriesColor(design, 'Planned', undefined, '#4f46e5')
    return actual.toLowerCase() !== planned.toLowerCase() ? actual : planned.toLowerCase() === '#159b75' ? '#d97706' : '#159b75'
  }
  const key = /planned|baseline/i.test(name) ? 'planned_series_color' : /actual/i.test(name) ? 'actual_series_color' : ''
  const explicitColor = weeklyColor(design, explicit, fallback)
  const semanticColor = weeklyColor(design, key === 'actual_series_color' ? 'secondary' : key === 'planned_series_color' ? 'primary' : '', explicitColor)
  return weeklyColor(design, design.charts?.[key], semanticColor)
}

const pt = (value: unknown, fallback: number) => `${designNumber(value, fallback)}pt`
export function weeklyDesignStyle(design: WeeklyDesign): CSSProperties {
  const c = (key: string, fallback: string) => weeklyColor(design, key, fallback)
  const vars: Record<string, string> = {}
  for (const [key, fallback] of Object.entries({ primary: '#4f46e5', secondary: '#10b981', dark_neutral: '#1e293b', medium_neutral: '#64748b', muted: '#94a3b8', page_background: '#fff', positive: '#059669', negative: '#dc2626', warning: '#d97706', light_neutral: '#e2e8f0' })) vars[`--wr-${key.replace(/_/g, '-')}`] = c(key, fallback)
  const tables = design.tables ?? {}, kpi = design.kpi_cards ?? {}, rules = design.layout_rules ?? {}
  vars['--wr-table-header'] = weeklyColor(design, tables.header_background, c('table_header_background', '#f8fafc'))
  vars['--wr-table-header-text'] = weeklyColor(design, tables.header_text, c('table_header_text', '#475569'))
  vars['--wr-table-border'] = weeklyColor(design, tables.border_color, c('table_border', '#e2e8f0'))
  vars['--wr-table-stripe'] = tables.alternate_rows === false ? 'transparent' : weeklyColor(design, tables.alternate_row_color, c('alternate_row', '#f8fafc'))
  vars['--wr-table-head-display'] = tables.repeat_header_on_new_page === false ? 'table-row-group' : 'table-header-group'
  vars['--wr-table-row-height'] = pt(tables.body_row_height_pt, 15)
  vars['--wr-table-head-height'] = pt(tables.header_height_pt, 18)
  vars['--wr-table-border-width'] = pt(tables.border_width_pt, 0.5)
  vars['--wr-table-padding'] = pt(tables.cell_padding_pt, 4)
  vars['--wr-kpi-bg'] = weeklyColor(design, kpi.background_color, '#f8fafc')
  vars['--wr-kpi-border'] = weeklyColor(design, kpi.border_color, '#e2e8f0')
  vars['--wr-kpi-radius'] = pt(kpi.border_radius_pt, 6)
  vars['--wr-kpi-padding'] = pt(kpi.padding_pt, 8)
  vars['--wr-kpi-min-height'] = pt(kpi.minimum_height_pt, 48)
  vars['--wr-kpi-columns'] = String(Math.max(1, Math.min(6, designNumber(kpi.cards_per_row, 4))))
  vars['--wr-paragraph-gap'] = pt(rules.space_between_paragraphs_pt, 6)
  vars['--wr-chart-gap'] = pt(rules.space_after_chart_pt, 12)
  vars['--wr-table-gap'] = pt(rules.space_after_table_pt, 12)
  vars['--wr-section-accent'] = pt(design.sections?.accent_bar_width_pt, 0)
  vars['--wr-cover-bg'] = weeklyColor(design, design.cover_page?.background_color, c('page_background', '#fff'))
  for (const [name, fallback] of Object.entries({ body: 10.5, h1: 18, h2: 14, kpi_label: 8.25, kpi_value: 18, table_body: 7.5, table_header: 7.5 })) {
    const role = designObject(design.typography?.[name])
    vars[`--wr-${name.replace(/_/g, '-')}-font`] = pt(role.font_size_pt ?? role.size_pt ?? design.typography?.[`${name}_size_pt`], fallback)
  }
  const family = design.typography?.font_family ?? design.typography?.font_family_primary
  const stack = typeof family === 'string' ? family : designObject(family).stack
  return { ...vars, fontFamily: typeof stack === 'string' ? stack : 'Arial, Helvetica, sans-serif', color: c('dark_neutral', '#1e293b') } as CSSProperties
}

export function weeklyStatusStyle(design: WeeklyDesign, status: string | null | undefined): CSSProperties {
  const rule = designObject(design.status_styles?.[String(status ?? '').toLowerCase()])
  return rule.color ? { color: weeklyColor(design, rule.color, '#1e293b') } : {}
}

export function weeklyCalloutStyle(design: WeeklyDesign, category: unknown): CSSProperties {
  const rule = designObject(design.callouts?.[String(category ?? '')])
  return Object.keys(rule).length ? { background: weeklyColor(design, rule.background, '#f8fafc'), borderColor: weeklyColor(design, rule.border_color, '#94a3b8'), '--wr-callout-title': weeklyColor(design, rule.title_color, '#1e293b') } as CSSProperties : {}
}

export function weeklyPage(design: WeeklyDesign, landscape: boolean) {
  const page = design.page ?? {}, margins = designObject(page.margins_pt)
  const sizes: Record<string, [number, number]> = { A4: [595.28, 841.89], A3: [841.89, 1190.55], Letter: [612, 792] }
  const size = typeof page.default_size === 'string' && page.default_size in sizes ? page.default_size : 'A4'
  const [short, long] = sizes[size]
  const width = landscape ? long : short
  const height = landscape ? short : long
  const left = Math.min(width / 4, designNumber(margins.left, 36.85)), right = Math.min(width / 4, designNumber(margins.right, 36.85))
  const top = Math.min(height / 4, designNumber(margins.top, 39.69)), bottom = Math.min(height / 4, designNumber(margins.bottom, 39.69))
  return { size, width, height, left, right, top, bottom, contentWidth: width - left - right }
}

export function weeklyPrintCss(design: WeeklyDesign, context: { projectId: string; dataDate: string }) {
  const coverLandscape = design.page?.default_orientation === 'landscape'
  const pageRule = (name: string, landscape: boolean) => {
    const page = weeklyPage(design, landscape)
    const footer = design.footer ?? {}, header = design.header ?? {}
    const footerText = [footer.show_project_id !== false ? context.projectId : '', footer.show_report_date !== false && context.dataDate ? `Data Date: ${context.dataDate}` : ''].filter(Boolean).join(' · ')
    return `@page ${name} { size: ${page.size} ${landscape ? 'landscape' : 'portrait'}; margin: ${page.top}pt ${page.right}pt ${page.bottom}pt ${page.left}pt;
      @top-left { content: ${header.enabled === true && header.show_report_title !== false ? '"Weekly Progress Report"' : 'none'}; font: 8pt Arial; }
      @bottom-left { content: ${footer.enabled === true ? JSON.stringify(footerText) : 'none'}; font: 8pt Arial; }
      @bottom-right { content: ${footer.enabled === true && footer.show_page_number !== false ? '"Page " counter(page)' : 'none'}; font: 8pt Arial; }
    }`
  }
  return `${pageRule('weekly-cover', coverLandscape)} ${pageRule('weekly-report', false)} ${pageRule('wr-landscape', true)}
    @media print {
      html.weekly-report-printing .weekly-report-themed .weekly-report-cover { height: ${weeklyPage(design, coverLandscape).height - weeklyPage(design, coverLandscape).top - weeklyPage(design, coverLandscape).bottom - 2}pt !important; min-height: 0 !important; padding: 24pt !important; }
      .weekly-report-themed .weekly-report-cover, .weekly-report-themed .weekly-report-toc { page: weekly-cover; width: auto !important; }
      .weekly-report-themed .weekly-report-section { page: weekly-report; width: auto !important; }
      .weekly-report-themed .weekly-report-section.print-landscape { page: wr-landscape; width: ${weeklyPage(design, true).contentWidth}pt !important; }
    }`
}
