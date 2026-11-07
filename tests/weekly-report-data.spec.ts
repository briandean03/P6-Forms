import { test, expect } from '@playwright/test'
import { allWeeklyRows, disciplineLookup, weeklyReportOptions } from '../src/lib/weeklyReportData'
import { prepareWeeklyTable } from '../src/lib/weeklyReportPresentation'
import { weeklySeriesColor } from '../src/lib/weeklyReportDesign'

test('paginates the report index so older weeks are not lost behind section rows', async () => {
  const source = Array.from({ length: 1101 }, (_, i) => i)
  const ranges: number[][] = []
  const result = await allWeeklyRows(() => ({ range: async (from, to) => {
    ranges.push([from, to])
    return { data: source.slice(from, to + 1), error: null }
  } }))
  expect(result.data).toEqual(source)
  expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]])
})

test('does not return a silently incomplete index if a later page fails', async () => {
  const result = await allWeeklyRows(() => ({ range: async from => from === 0
    ? { data: [1, 2], error: null }
    : { data: null, error: { message: 'Unavailable' } }
  }), 2)
  expect(result).toEqual({ data: [], error: { message: 'Unavailable' } })
})

test('unions generated reports and calculation weeks without inventing report content', () => {
  const latest = { report_id: 'r54', week_num: 54, data_date: '2026-09-27' }
  const older = { report_id: 'r53', week_num: 53, data_date: '2026-09-20', report_type: 'Weekly Progress Report' }
  const options = weeklyReportOptions([older, latest, { ...older, report_id: 'dashboard', report_type: 'Dashboard' }], [latest, latest])
  expect(options.map(row => [row.report_id, row.hasSections])).toEqual([['r54', true], ['r53', false]])
  expect(options[1].label).toContain('sections not generated')
})

test('maps discipline names only in the drawing distribution and preserves unknown codes and values', () => {
  const names = disciplineLookup([{ discipline_code: ' arc ', discipline_name: 'Architecture' }, { discipline_code: 'ME', discipline_name: 'Mechanical' }])
  const rows = [{ discipline_code: 'ARC', total: 0 }, { discipline_code: 'UNKNOWN', total: 12 }]
  const columns = [{ key: 'discipline_code' }, { key: 'total' }]
  expect(prepareWeeklyTable(columns, rows, 'Shop Drawing (DWG) Discipline Distribution', names).rows).toEqual([{ discipline_code: 'Architecture', total: 0 }, { discipline_code: 'UNKNOWN', total: 12 }])
  expect(prepareWeeklyTable(columns, rows, 'Other Table', names).rows).toBe(rows)
  expect(rows[0].discipline_code).toBe('ARC')
  expect(disciplineLookup([{ discipline_code: 'ARC', discipline_name: 'Other project name' }]).ARC).toBe('Other project name')
})

test('falls back to the code for conflicting discipline mappings', () => {
  expect(disciplineLookup([{ discipline_code: 'ARC', discipline_name: 'Architecture' }, { discipline_code: 'ARC', discipline_name: 'Other' }])).toEqual({})
})

test('uses a distinct actual colour for cumulative progress without recolouring other charts', () => {
  const design = { colors: { secondary: '#159b75' }, charts: { actual_series_color: '#A78BFA', planned_series_color: '#5741DF' } }
  expect(weeklySeriesColor(design, 'Actual', 'actual', '#000000', true)).toBe('#159b75')
  expect(weeklySeriesColor(design, 'Actual', 'actual', '#000000')).toBe('#A78BFA')
  expect(weeklySeriesColor(design, 'Planned', 'planned', '#000000', true)).toBe('#5741DF')
  const suppliedDesign = { colors: { secondary: '#2E8B8B', positive: '#2E7D32' }, charts: { planned_series_color: '#2E8B8B' } }
  expect(weeklySeriesColor(suppliedDesign, 'Actual', undefined, '#000000', true)).toBe('#2E7D32')
  expect(weeklySeriesColor({ colors: { positive: '#5741DF' }, charts: design.charts }, 'Actual', undefined, '#000000', true)).not.toBe('#5741DF')
})
