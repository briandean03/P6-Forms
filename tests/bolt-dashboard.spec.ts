import { test, expect } from '@playwright/test'

const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P2', dgt_projectname: 'Test Project' }
const url = `/?view=app&project=${project.dgt_dbp6bd00projectdataid}&schema=other_project&tab=bolt_weekly_dashboard`
const structures = [56, 55].map(week => ({
  id: week, structure_id: `s${week}`, report_id: `r${week}`, project_id: 'P2', week_num: week, data_date: week === 56 ? '2026-10-12' : '2026-10-05', dashboard_title: `Construction intelligence week ${week}`, structure_version: '1', design_id: `d${week}`,
  structure_plan: JSON.stringify({ pages: [{ page_id: `overview-${week}`, title: `Executive overview ${week}`, widgets: ['WGT-002', 'WGT-008', 'WGT-NEW'].map((id, index) => ({ widget_id: id, display_order: index, grid: { column_span: 12 } })) }] }),
}))

for (const mode of ['ready', 'empty', 'denied'] as const) test(`Bolt dashboard: ${mode}`, async ({ page }, testInfo) => {
  let deny = mode === 'denied'
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const reads: { table: string; structure?: string | null }[] = []
  await page.route('https://sample.supabase.co/**', async route => {
    const request = route.request(), uri = new URL(request.url()), table = uri.pathname.split('/').pop()!
    let data: unknown = []
    if (table === 'dbp6_0000_projectdata') data = request.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'other_project' }
    if (table.startsWith('dbp6_0008_dashboard')) {
      expect(request.method()).toBe('GET')
      expect(request.headers()['accept-profile']).toBe('other_project')
      reads.push({ table, structure: uri.searchParams.get('structure_id') })
      if (table !== 'dbp6_0008_dashboard_designs') expect(uri.searchParams.get('project_id')).toBe('eq.P2')
      if (deny) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied for table dbp6_0008_dashboard_structures' }) })
        return
      }
      if (table === 'dbp6_0008_dashboard_structures') {
        data = mode === 'empty' ? [] : structures
        if (uri.searchParams.has('structure_id')) data = structures.filter(row => `eq.${row.structure_id}` === uri.searchParams.get('structure_id'))
      }
      if (table === 'dbp6_0008_dashboard_designs') {
        const id = uri.searchParams.get('design_id')!.slice(3)
        data = [{ id: 1, design_id: id, design_name: 'Bolt test theme', design_version: id, design_specification: JSON.stringify({ color_tokens: { primary: { hex: id === 'd56' ? '#5741DF' : '#087F5B' }, text_primary: { hex: '#24252D' }, text_secondary: { hex: '#666675' } } }) }]
      }
      if (table === 'dbp6_0008_dashboard_widgets') {
        const week = uri.searchParams.get('structure_id') === 'eq.s56' ? 56 : 55
        const widgets = [
          { widget_id: 'WGT-002', widget_type: 'kpi_group', widget_title: 'Progress summary', content: { kpis: [{ key: 'cumulative_actual_progress', label: 'Overall actual progress', value: week, unit: '%' }] } },
          { widget_id: 'WGT-008', widget_type: 'line_chart', widget_title: 'Progress trend', content: { category_field: 'date', series: [{ name: 'Actual', value_field: 'actual', color_token: 'primary' }], data: [{ date: '2026-10-01', actual: 20 }, { date: '2026-10-12', actual: week }] } },
          { widget_id: 'WGT-NEW', widget_type: 'future_widget', widget_title: 'Future data', content: {} },
        ]
        data = widgets.map((widget, index) => ({ ...widget, id: index, widget_record_id: `w${week}-${index}`, structure_id: `s${week}`, report_id: `r${week}`, project_id: 'P2', page_id: `overview-${week}`, widget_order: index, widget_ast: JSON.stringify({ type: widget.widget_type, title: widget.widget_title, content: widget.content }) }))
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto(url)
  if (mode === 'empty') {
    await expect(page.getByRole('heading', { name: 'No weekly dashboards available' })).toBeVisible()
  } else {
    if (mode === 'denied') {
      await expect(page.getByRole('heading', { name: 'Dashboard unavailable' })).toBeVisible()
      await expect(page.getByText(/permission denied for table/)).toBeVisible()
      deny = false
      await page.getByRole('button', { name: 'Try again' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Construction intelligence week 56' })).toBeVisible()
    await expect(page.getByText('Overall actual progress', { exact: true })).toBeVisible()
    await expect(page.locator('.bolt-dashboard')).toHaveCSS('--dt-primary', '#5741DF')
    await expect(page.getByRole('region', { name: 'Progress trend', exact: true }).locator('svg path')).not.toHaveCount(0)
    await expect(page.getByText('Widget type "future_widget" is not yet supported')).toBeVisible()
    await page.getByLabel('Select reporting week').selectOption('s55')
    await expect(page.getByRole('heading', { name: 'Construction intelligence week 55' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Executive overview 55' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Executive overview 56' })).toHaveCount(0)
    await expect(page.locator('.bolt-dashboard')).toHaveCSS('--dt-primary', '#087F5B')
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('heading', { name: 'Executive overview 55' })).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Dashboard sections' })).toBeHidden()
    if (mode === 'ready') await page.pdf({ path: testInfo.outputPath('bolt-report.pdf'), format: 'A4', printBackground: true })
    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: 'Executive overview 55' })).toBeVisible()
    await expect(page.getByRole('complementary')).toHaveCSS('width', '56px')
    if (mode === 'ready') await page.screenshot({ path: testInfo.outputPath('bolt-mobile.png'), fullPage: true })
    expect(reads.some(read => read.table.endsWith('_widgets') && read.structure === 'eq.s55')).toBe(true)
  }
  await page.getByRole('button', { name: 'Online Weekly Dashboard', exact: true }).click()
  await expect(page).toHaveURL(/tab=online_weekly_dashboard/)
  await expect(page.locator('html')).not.toHaveClass(/bolt-dashboard-printing/)
  expect(errors).toEqual([])
})
