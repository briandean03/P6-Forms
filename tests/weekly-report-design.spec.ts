import { test, expect } from '@playwright/test'
import { normaliseWeeklyDesign, selectWeeklyDesign, weeklyDesignStyle, weeklyPage, weeklyPrintCss, weeklySeriesColor } from '../src/lib/weeklyReportDesign'

const base = { is_active: true, is_approved: true, report_type: 'weekly_progress_report', updated_at: '2026-01-01' }
test('selects approved report then project then schema-wide design without crossing projects', () => {
  const shared = { ...base, id: 1, project_id: null }
  const project = { ...base, id: 2, project_id: 'p1' }
  const report = { ...base, id: 3, project_id: 'p1', report_id: 'r1' }
  const other = { ...base, id: 4, project_id: 'p2', updated_at: '2027-01-01' }
  const draft = { ...report, id: 5, is_approved: false }
  expect(selectWeeklyDesign([shared, project, report, other, draft], 'p1', 'r1')).toEqual(report)
  expect(selectWeeklyDesign([shared, project, report], 'p1', 'r2')).toEqual(project)
  expect(selectWeeklyDesign([shared, project, report], 'p3', 'r3')).toEqual(shared)
  expect(selectWeeklyDesign([draft, other], 'p1', 'r1')).toBeNull()
})

test('decodes encoded columns and uses chart and table design colours', () => {
  const design = normaliseWeeklyDesign({ colors: JSON.stringify({ primary: '#1F4E79' }), tables: JSON.stringify({ header_background: '#1F4E79', header_text: '#FFFFFF' }), charts: JSON.stringify({ actual_series_color: '#1F4E79', planned_series_color: '#2E8B8B' }) })
  const style = weeklyDesignStyle(design) as Record<string, unknown>
  expect(style['--wr-table-header']).toBe('#1F4E79')
  expect(style['--wr-table-header-text']).toBe('#FFFFFF')
  expect(weeklySeriesColor(design, 'Actual progress', '#ff0000', '#000000')).toBe('#1F4E79')
  expect(weeklySeriesColor(design, 'Planned progress', '#ff0000', '#000000')).toBe('#2E8B8B')
})

test('tolerates the supplied malformed typography and preserves landscape page dimensions', () => {
  const design = normaliseWeeklyDesign({ typography: '{"default_size":"A4"}', page: '{"default_size":"A4","margins_pt":{"top":48,"bottom":48,"left":54,"right":54}}' })
  const style = weeklyDesignStyle(design) as Record<string, unknown>
  expect(style['--wr-body-font']).toBe('10.5pt')
  expect(weeklyPage(design, false).contentWidth).toBeCloseTo(487.28)
  expect(weeklyPage(design, true).width).toBeCloseTo(841.89)
  expect(weeklyPrintCss(design, { projectId: 'p1', dataDate: '2026-01-01' })).toContain('A4 landscape')
})
