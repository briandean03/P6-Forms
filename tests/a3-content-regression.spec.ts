import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

test('responsive A3 screen prints percentage trades and every photograph on one landscape sheet', async ({ page }, info) => {
  const project = { dgt_dbp6bd00projectdataid: 'uuid', dgt_projectid: 'P2', dgt_projectname: 'Test' }
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="orange"/></svg>')
  const widgets = [
    { widget_id: 'WGT-007', widget_title: 'Trade Schedule Comparison', widget_type: 'trade_schedule_gantt', widget_ast: { content: { data: [{ trade_code: 'ST', trade_label: 'Structure', trade_cumulative_planned_percent_complete: 58.2, trade_cumulative_actual_percent_complete: 59.8 }] } } },
    { widget_id: 'WGT-050', widget_title: 'Progress Photographs', widget_type: 'photo_gallery', widget_ast: { content: { photos: Array.from({ length: 5 }, (_, index) => ({ photo_url: image, caption_or_description: `Photo ${index + 1}` })) } } },
  ].map((w, index) => ({ ...w, widget_record_id: `w${index}`, structure_id: 's', page_id: 'p', widget_order: index }))
  const structure = { structure_id: 's', project_id: 'P2', report_id: 'r', week_num: 56, data_date: '2026-10-12', dashboard_title: 'A3 regression', structure_plan: { pages: [] }, a3_layout: { layout: { regions: widgets.map((w, index) => ({ region_id: `region${index}`, title: w.widget_title, widget_ids: [w.widget_id], column_span: 6, row_span: 2, region_order: index })) } } }
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()
    let data: unknown = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0008_dashboard_structures') data = [structure]
    if (table === 'dbp6_0008_dashboard_widgets') data = widgets
    if (table === 'dbp6_0008_dashboard_designs') data = [{ design_id: 'd', design_specification: {} }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?view=app&project=uuid&schema=test_schema&tab=weekly_dashboard')
  await expect(page.getByRole('button', { name: 'Print A3', exact: true })).toBeVisible()
  await expect(page.locator('.a3-screen-page').getByText('Trade Schedule Comparison', { exact: true })).toBeVisible()
  const widths = await page.locator('.a3-screen-page').evaluate(el => ({ width: el.getBoundingClientRect().width, available: el.parentElement!.getBoundingClientRect().width }))
  expect(Math.abs(widths.available - widths.width)).toBeLessThan(3)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await expect(page.locator('.a3-print-sheet .a3-trades')).toContainText('59.8%')
  await expect(page.locator('.a3-print-sheet .a3-photo-grid img')).toHaveCount(5)
  await expect(page.locator('.a3-print-sheet .a3-empty')).toHaveCount(0)
  await page.emulateMedia({ media: 'print' })
  const path = info.outputPath('a3.pdf')
  await page.pdf({ path, preferCSSPageSize: true, printBackground: true })
  const pdf = await createRequire(import.meta.url)('pdf-parse')(readFileSync(path))
  expect(pdf.numpages).toBe(1)
  expect(pdf.text).toContain('59.8%')
})
