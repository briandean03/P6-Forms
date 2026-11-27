import { readFileSync } from 'node:fs'
const referenceWidths: Record<string, number> = JSON.parse(readFileSync(new URL('./fixtures/bolt-reference-widths.json', import.meta.url), 'utf8'))
import { test, expect } from '@playwright/test'
import type { StructureWidgetPlacement, WidgetRow } from '../src/boltDashboard/api/dashboardApi'
import { preferredWidgetSpan, resolveWidgetSpans } from '../src/boltDashboard/utils/widgetLayout'
const widget = (id: string, type = 'kpi_group', content: Record<string, unknown> = {}) => ({ widget_id: id, widget_type: type, widget_ast: { type, title: id, content } })
const placement = (id: string, span: number) => ({ widget_id: id, grid: { column_span: span } }) as StructureWidgetPlacement

test('all 49 known widget widths match the uploaded Bolt reference despite generated JSON', () => {
  expect(Object.keys(referenceWidths)).toHaveLength(49)
  for (const [id, expected] of Object.entries(referenceWidths)) {
    for (const requested of [3, 6, 12, NaN]) expect(preferredWidgetSpan(widget(id), requested)).toBe(expected)
  }
})
test('progress charts and phase/Gantt pairs keep the same rows as Bolt', () => {
  const ids = ['WGT-008', 'WGT-009', 'WGT-010', 'WGT-013', 'WGT-014', 'WGT-044']
  const widgets = ids.map(id => widget(id))
  expect(resolveWidgetSpans(widgets as WidgetRow[], ids.map(id => placement(id, 12)))).toEqual([12, 6, 6, 6, 6, 12])
})
test('wide tables including nested composite tables get a full row', () => {
  const columns = Array.from({ length: 6 }, (_, index) => ({ key: String(index) }))
  expect(preferredWidgetSpan(widget('FUTURE-TABLE', 'data_table', { columns }), 4)).toBe(12)
  expect(preferredWidgetSpan(widget('COMPOSITE', 'composite', { components: [{ content: { columns } }] }), 6)).toBe(12)
  expect(preferredWidgetSpan(widget('SMALL', 'data_table', { columns: columns.slice(0, 2) }), 6)).toBe(6)
})
test('partial rows fill available columns without reordering widgets', () => {
  for (const [input, output] of [
    [[6, 12], [12, 12]], [[4, 4], [6, 6]], [[3, 3, 3], [4, 4, 4]],
    [[8, 4, 4], [8, 4, 12]], [[12, 6, 6], [12, 6, 6]], [[6], [12]],
  ]) {
    const widgets = input.map((_, i) => widget(`widget-${i}`))
    const placements = input.map((span, i) => placement(`widget-${i}`, span))
    expect(resolveWidgetSpans(widgets as WidgetRow[], placements)).toEqual(output)
  }
})
test('normalizes invalid spans and keeps existing KPI pairs readable', () => {
  expect(preferredWidgetSpan(widget('SMALL'), -4)).toBe(6)
  expect(preferredWidgetSpan(widget('SMALL'), 100)).toBe(12)
  expect(preferredWidgetSpan(widget('SMALL'), 1)).toBe(3)
  expect(preferredWidgetSpan(widget('WGT-039'), 3)).toBe(6)
})
