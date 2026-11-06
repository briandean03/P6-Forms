import type { CSSProperties } from 'react'

export type DesignSpec = Record<string, unknown>
export const designObject = (value: unknown): DesignSpec =>
  value != null && typeof value === 'object' && !Array.isArray(value) ? value as DesignSpec : {}

export function designNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

// CSS variables are scoped to the dashboard; geometry belongs to a3_layout.
export function dashboardDesignStyle(spec: DesignSpec, color: (key: string, fallback?: string) => string): CSSProperties {
  const typography = designObject(spec.typography)
  const print = designObject(designObject(spec.print_specification).typography)
  const chart = designObject(designObject(spec.chart_styles).line_chart)
  const printCharts = designObject(designObject(spec.print_specification).charts)
  const radii = designObject(spec.radii)
  const spacing = designObject(spec.spacing)
  const kpi = designObject(designObject(spec.component_styles).kpi_card)
  const variables: Record<string, string> = {}
  for (const [name, fallback] of Object.entries({
    canvas: '#f1f5f9', surface_primary: '#fff', text_primary: '#1e293b', text_secondary: '#64748b',
    primary: '#3b82f6', mint: '#10b981', critical: '#ef4444', warning: '#f59e0b', success: '#10b981',
    subtle_border: '#e2e8f0', chart_gridline: '#e5e7eb', chart_axis_label: '#64748b', muted_text: '#94a3b8',
  })) variables[`--design-${name.replace(/_/g, '-')}`] = color(name, fallback)
  for (const [role, size] of Object.entries({ kpi_label: 11, kpi_value: 28, widget_title: 14, table_body: 13, table_header: 12, chart_legend: 12, chart_axis_label: 11, dashboard_page_title: 24 })) {
    const rule = designObject(typography[role])
    variables[`--design-${role.replace(/_/g, '-')}-size`] = `${designNumber(rule.font_size_px, size)}px`
    variables[`--design-${role.replace(/_/g, '-')}-weight`] = String(designNumber(rule.font_weight, 600))
  }
  for (const [role, size] of Object.entries({ kpi_label: 7.5, kpi_value: 18, section_title: 10.5, table_body: 7.5, table_header: 7.5, chart_legend: 8, chart_axis_label: 7.5, page_title: 16 })) {
    variables[`--design-print-${role.replace(/_/g, '-')}`] = `${designNumber(print[`${role}_pt`], size)}pt`
  }
  variables['--design-widget-radius'] = `${designNumber(radii.widget_card, 8)}px`
  variables['--design-kpi-radius'] = `${designNumber(radii.kpi_card, 8)}px`
  variables['--design-widget-padding'] = `${designNumber(spacing.widget_padding, 8)}px`
  variables['--design-chart-line-width'] = String(designNumber(chart.line_width_px, 2.5))
  variables['--design-print-line-width'] = `${designNumber(printCharts.line_width_pt, 1.5)}pt`
  variables['--design-kpi-padding'] = `${designNumber(spacing.kpi_card_padding, 10)}px`
  variables['--design-kpi-min-height'] = `${designNumber(kpi.min_height_px, 0)}px`
  const shadow = designObject(spec.shadows).shadow_card
  variables['--design-card-shadow'] = typeof shadow === 'string' && !/[;{}]|url\s*\(/i.test(shadow) ? shadow : 'none'
  const stack = designObject(typography.font_family_primary).stack
  return { ...variables, fontFamily: typeof stack === 'string' ? stack : 'inherit', color: color('text_primary', '#1e293b') } as CSSProperties
}
