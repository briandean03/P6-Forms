import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P2', dgt_projectname: 'Test Project' }
const url = `/?view=app&project=${project.dgt_dbp6bd00projectdataid}&schema=other_project&tab=online_weekly_dashboard`
const structures = [56, 55].map(week => ({
  is_approved: true, created_at: '2026-11-27T04:00:00Z', id: week, structure_id: `s${week}`, report_id: `r${week}`, project_id: 'P2', week_num: week, data_date: week === 56 ? '2026-10-12' : '2026-10-05', dashboard_title: `Construction intelligence week ${week}`, structure_version: '1', design_id: `d${week}`,
  structure_plan: JSON.stringify({ pages: [{ page_id: `overview-${week}`, title: `Executive overview ${week}`, widgets: ['WGT-002', 'WGT-008', 'WGT-NEW', 'WGT-025', 'WGT-027', 'WGT-WIDE', 'WGT-026', 'WGT-014', 'WGT-018', 'WGT-038', 'WGT-011', 'WGT-012', 'WGT-036', 'WGT-037', 'WGT-007', 'WGT-021', 'WGT-032', 'WGT-020', 'WGT-006', 'WGT-034', 'WGT-035', 'WGT-045', 'WGT-047'].map((id, index) => ({ widget_id: id, display_order: index, grid: { column_span: ['WGT-014', 'WGT-018'].includes(id) ? 3 : 12 } })) }] }),
}))

for (const mode of ['ready', 'empty', 'denied'] as const) test(`Bolt dashboard: ${mode}`, async ({ page }, testInfo) => {
  const attachments = new Map<string, string>()
  let removals = 0
  let denyRemoval = true
  let deny = mode === 'denied'
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const reads: { table: string; report?: string | null }[] = []
  await page.route('https://sample.supabase.co/**', async route => {
    const request = route.request(), uri = new URL(request.url()), table = uri.pathname.split('/').pop()!
    if (uri.pathname.includes('/storage/v1/')) {
      const path = decodeURIComponent(uri.pathname)
      if (path.includes('/object/list/')) {
        const prefix = request.postDataJSON().prefix
        await route.fulfill({ json: [...attachments.keys()].filter(key => key.startsWith(prefix + '/')).map(key => ({ id: key, name: key.slice(prefix.length + 1), created_at: '2026-11-20', metadata: { mimetype: 'image/png' } })) })
      } else if (path.includes('/object/sign/') && request.method() === 'POST') {
        await route.fulfill({ json: { signedURL: '/object/sign/weekly-report-appendix/test.png?token=test' } })
      } else if (request.method() === 'DELETE') {
        removals++
        if (denyRemoval) {
          denyRemoval = false
          await route.fulfill({ status: 403, json: { statusCode: '403', error: 'Forbidden', message: 'Deletion denied' } })
        } else {
          const keys = request.postDataJSON().prefixes as string[]
          keys.forEach(key => attachments.delete(key))
          await route.fulfill({ json: keys.map(name => ({ name })) })
        }
      } else if (request.method() === 'GET') {
        await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6k9sAAAAASUVORK5CYII=', 'base64') })
      } else {
        const key = path.split('/object/weekly-report-appendix/')[1]
        if (key.includes('Rejected.png')) { await route.fulfill({ status: 403, json: { statusCode: '403', error: 'Forbidden', message: 'Upload rejected' } }); return }
        attachments.set(key, key)
        await route.fulfill({ json: { Key: key } })
      }
      return
    }
    let data: unknown = []
    if (table === 'dbp6_0000_projectdata') data = request.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'other_project' }
    if (table.startsWith('dbp6_0008_dashboard')) {
      expect(request.method()).toBe('GET')
      expect(request.headers()['accept-profile']).toBe('other_project')
      reads.push({ table, report: uri.searchParams.get('report_id') })
      if (table !== 'dbp6_0008_dashboard_designs') expect(uri.searchParams.get('project_id')).toBe('eq.P2')
      if (deny) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied for table dbp6_0008_dashboard_structures' }) })
        return
      }
      if (table === 'dbp6_0008_dashboard_structures') {
        data = mode === 'empty' ? [] : [{ ...structures[0], structure_id: 's56-obsolete', is_approved: false, created_at: '2026-11-28T04:00:00Z' }, ...structures]
        if (uri.searchParams.has('structure_id')) data = structures.filter(row => `eq.${row.structure_id}` === uri.searchParams.get('structure_id'))
      }
      if (table === 'dbp6_0008_dashboard_designs') {
        const id = uri.searchParams.get('design_id')!.slice(3)
        data = [{ id: 1, design_id: id, design_name: 'Bolt test theme', design_version: id, design_specification: JSON.stringify({ color_tokens: { primary: { hex: id === 'd56' ? '#5741DF' : '#087F5B' }, text_primary: { hex: '#24252D' }, text_secondary: { hex: '#666675' } } }) }]
      }
      if (table === 'dbp6_0008_dashboard_widgets') {
        expect(uri.searchParams.has('structure_id')).toBe(false)
        expect(['eq.r56', 'eq.r55']).toContain(uri.searchParams.get('report_id'))
        const week = uri.searchParams.get('report_id') === 'eq.r56' ? 56 : 55
        const widgets = [
          { widget_id: 'WGT-002', widget_type: 'kpi_group', widget_title: 'Progress summary', content: { kpis: [{ key: 'cumulative_actual_progress', label: 'Overall actual progress', value: week, unit: '%' }] } },
          { widget_id: 'WGT-008', widget_type: 'line_chart', widget_title: 'Progress trend', content: { category_field: 'date', series: [{ name: 'Actual', value_field: 'actual', color_token: 'primary' }], data: [{ date: '2026-10-01', actual: 20 }, { date: '2026-10-12', actual: week }] } },
          { widget_id: 'WGT-NEW', widget_type: 'future_widget', widget_title: 'Future data', content: {} },
        ]
        for (const id of ['WGT-025', 'WGT-027']) widgets.push({ widget_id: id, widget_type: 'hierarchical_table', widget_title: `Hierarchy ${id}`, content: {
          columns: [{ key: 'label', label: 'Discipline' }, { key: 'count', label: 'Count', alignment: 'right' }],
          hierarchy: { row_id_field: 'code', parent_id_field: 'parent', level_field: 'depth', default_expand_level: 1 },
          [id === 'WGT-025' ? 'data' : 'items']: [
            { code: 'root', parent: null, depth: 0, label: 'Engineering', count: 10 },
            { code: 'child', parent: 'root', depth: 1, label: 'Civil', count: 7 },
            { code: 'leaf', parent: 'child', depth: 2, label: `Drawings ${week}`, count: 0 },
          ],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-WIDE', widget_type: 'data_table', widget_title: 'Wide print table', content: {
          columns: Array.from({ length: 10 }, (_, index) => ({ key: `column${index}`, label: `Column ${index}` })),
          rows: Array.from({ length: 35 }, (_, row) => Object.fromEntries(Array.from({ length: 10 }, (_, col) => [`column${col}`, `R${row}-C${col}-longvalue`]))),
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-038', widget_type: 'grouped_bar_chart', widget_title: 'KPI selection', content: {
          category_field: 'kpi_key', series: [{ name: 'Actual', value_field: 'actual' }],
          data: ['Concrete', 'Drainage', 'Plumbing'].map(kpi => ({ kpi_key: kpi, kpi_label: kpi, actual: 10 })),
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-007', widget_type: 'narrative_summary', widget_title: 'Weekly narrative', content: {
          sections: [{ title: 'Achievements', bullets: [{ activity: `Concrete pour week ${week}`, verified_achievement: 'Completed slab pour' }] }],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-021', widget_type: 'exception_table', widget_title: 'Key risks', content: {
          columns: [{ key: 'activity_name' }, { key: 'exception_type' }, { key: 'exception_severity' }],
          rows: [{ activity_id: 'A1', activity_name: 'Cladding procurement', exception_type: 'Late delivery', exception_severity: 'high' }],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-032', widget_type: 'grouped_bar_chart', widget_title: 'Manpower comparison', content: {
          data: [{ resource_name: 'Steel fixers', planned_manpower: 25, actual_manpower: 20 }],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-014', widget_type: 'trade_schedule_gantt', widget_title: 'Trade schedule width check', content: {
          time_axis: { start: '2026-01-01', end: '2026-12-31' },
          data: [{ row_id: 'ST', trade_code: 'ST', trade_label: 'Structural Works', planned_start: '2026-01-01', planned_finish: '2026-12-31' }],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-018', widget_type: 'lookahead_table', widget_title: 'Lookahead width check', content: {
          columns: [{ key: 'activity_id', label: 'Activity ID' }, { key: 'activity_name', label: 'Activity Name' }],
          rows: [{ activity_id: 'A1', activity_name: 'Upcoming work' }],
        } } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-020', widget_type: 'data_table', widget_title: 'Trade progress by level', content: {
          columns: [{ key: 'activity_name', label: 'Activity' }, { key: 'level:L1', label: 'Level 1', data_type: 'percentage', value_source: 'progress_by_level', level_code: 'L1' }],
          rows: [{ row_id: 'single', activity_name: 'Single-floor lift installation', trade_label: 'Conveying', progress_by_level: { L1: { planned_percent: 100, actual_percent: 0 } } }, { row_id: 'all', activity_name: 'Project-wide activity', trade_label: 'General', progress_by_level: { All: { planned_percent: 50, actual_percent: 0 } } }, { row_id: 'a', activity_name: 'Install blockwork', trade_label: 'Blockwork', progress_by_level: { L1: { planned_percent: 60, actual_percent: 45 }, L2: { planned_percent: 0, actual_percent: 0 } } }],
        } } as typeof widgets[number])
        for (const id of ['WGT-006', 'WGT-034', 'WGT-035', 'WGT-045', 'WGT-047']) widgets.push({ widget_id: id, widget_type: 'kpi_group', widget_title: `Hidden ${id}`, content: {} } as typeof widgets[number])
        for (const id of ['WGT-011', 'WGT-012', 'WGT-036', 'WGT-037']) widgets.push({ widget_id: id, widget_type: 'kpi_group', widget_title: `Hidden ${id}`, content: {} } as typeof widgets[number])
        widgets.push({ widget_id: 'WGT-026', widget_type: 'line_chart', widget_title: 'Engineering weekly trend', content: {
          category_field: 'period_end', series: [{ name: 'Materials', value_field: 'materials' }],
          data: [
            { period_end: '2026-09-01', materials: null },
            { period_end: '2026-09-08', materials: 10 },
            { period_end: '2026-09-15', materials: null },
            { period_end: '2026-09-22', materials: 20 },
          ],
        } } as typeof widgets[number])
        data = widgets.map((widget, index) => ({ ...widget, id: index, widget_record_id: `w${week}-${index}`, structure_id: index < 2 ? `s${week}` : `s${week}-previous`, report_id: `r${week}`, project_id: 'P2', page_id: index < 2 ? `overview-${week}` : `previous-layout-${week}`, widget_order: index, widget_ast: JSON.stringify({ type: widget.widget_type, title: widget.widget_title, content: widget.content }) }))
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto(mode === 'denied' ? url.replace('tab=online_weekly_dashboard', 'tab=bolt_weekly_dashboard') : url)
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Bolt Weekly Dashboard', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Online Weekly Dashboard', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Hide navigation', exact: true }).click()
  if (mode === 'empty') {
    await expect(page.getByRole('heading', { name: 'No weekly dashboards available' })).toBeVisible()
  } else {
    if (mode === 'denied') {
      await expect(page.getByRole('heading', { name: 'Dashboard unavailable' })).toBeVisible()
      await expect(page.getByText(/permission denied for table/)).toBeVisible()
      deny = false
      await page.getByRole('button', { name: 'Try again' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Construction Intelligence Dashboard' })).toBeVisible()
    await expect(page.getByText('Overall actual progress', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Select reporting week').locator('option')).toHaveCount(2)
    await expect(page.getByLabel('Select reporting week')).toHaveValue('s56')
    await expect(page.getByText('Widgets without a matching section:', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Weekly narrative' })).toContainText(`Concrete pour week 56`)
    await expect(page.getByRole('region', { name: 'Key risks' })).toContainText('Cladding procurement')
    await expect(page.getByRole('img', { name: 'Steel fixers: planned 25.000, actual 20.000' })).toBeVisible()
    for (const id of ['WGT-006', 'WGT-034', 'WGT-035', 'WGT-045', 'WGT-047']) await expect(page.getByRole('region', { name: `Hidden ${id}` })).toHaveCount(0)
    for (const title of ['Trade schedule width check', 'Lookahead width check']) {
      const widthRatio = await page.getByRole('region', { name: title, exact: true }).evaluate(card =>
        card.getBoundingClientRect().width / card.closest('.bolt-widget-grid')!.getBoundingClientRect().width)
      expect(widthRatio).toBeGreaterThan(0.98)
    }
    const levelProgress = page.getByRole('region', { name: 'Trade progress by level' })
    await expect(levelProgress).toContainText('45.0%')
    await levelProgress.getByRole('button', { name: 'Planned %', exact: true }).click()
    await expect(levelProgress).toContainText('60.0%')
    await expect(levelProgress).not.toContainText('Single-floor lift installation')
    await expect(levelProgress).not.toContainText('Project-wide activity')
    await expect(levelProgress).not.toContainText('Conveying')
    const trend = page.getByRole('img', { name: 'Materials weekly submission trend', exact: true })
    await expect(trend).toContainText('2026-09-08')
    await expect(trend).toContainText('2026-09-22')
    await expect(trend).not.toContainText('2026-09-15')
    await expect(page.locator('.bolt-dashboard')).toHaveCSS('--dt-primary', '#5741DF')
    await expect(page.getByRole('region', { name: 'Progress trend', exact: true }).locator('svg path')).not.toHaveCount(0)
    await expect(page.getByText('Widget type "future_widget" is not yet supported')).toBeVisible()
    for (const id of ['WGT-025', 'WGT-027']) {
      const hierarchy = page.getByRole('region', { name: `Hierarchy ${id}`, exact: true })
      await expect(hierarchy.getByText('Civil', { exact: true })).toBeVisible()
      await expect(hierarchy.getByText('Drawings 56', { exact: true })).toBeHidden()
      await hierarchy.getByRole('button', { name: 'Expand Civil', exact: true }).click()
      await expect(hierarchy.getByText('Drawings 56', { exact: true })).toBeVisible()
      await hierarchy.getByRole('button', { name: 'Collapse Engineering', exact: true }).click()
      await expect(hierarchy.getByText('Civil', { exact: true })).toBeHidden()
      await hierarchy.getByRole('button', { name: 'Expand Engineering', exact: true }).click()
      await expect(hierarchy.getByText('Drawings 56', { exact: true })).toBeVisible()
    }
    const selection = page.getByRole('region', { name: 'KPI selection', exact: true })
    await selection.getByRole('button', { name: 'Clear all', exact: true }).click()
    await expect(selection.getByRole('button', { name: 'Concrete', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await selection.getByRole('button', { name: 'Concrete', exact: true }).click()
    await selection.getByRole('button', { name: 'Plumbing', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Dashboard sections' }).getByRole('button').last()).toHaveText('Appendix')
    await expect(page.getByRole('heading', { name: 'Appendix', exact: true })).toBeVisible()
    await page.getByLabel('Attach drawing file').setInputFiles({ name: 'Foundation.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6k9sAAAAASUVORK5CYII=', 'base64') })
    await expect(page.getByRole('img', { name: 'Foundation.png' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('img', { name: 'Foundation.png' })).toBeVisible()
    expect([...attachments.keys()][0]).toContain('other_project/P2/week-56/2026-10-12/')
    await page.getByRole('button', { name: 'Remove attachment', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(removals).toBe(0)
    await expect(page.getByRole('img', { name: 'Foundation.png' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove attachment', exact: true }).click()
    await page.getByRole('button', { name: 'Remove permanently', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Deletion denied')
    await expect(page.getByRole('img', { name: 'Foundation.png' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove attachment', exact: true }).click()
    await page.getByRole('button', { name: 'Remove permanently', exact: true }).click()
    await expect(page.getByText('No drawings attached for this reporting week yet.')).toBeVisible()
    expect(attachments.size).toBe(0)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6k9sAAAAASUVORK5CYII=', 'base64')
    await page.getByLabel('Attach drawing file').setInputFiles([
      { name: 'SectionA.png', mimeType: 'image/png', buffer: png },
      { name: 'Unsupported.dwg', mimeType: 'application/octet-stream', buffer: png },
      { name: 'Rejected.png', mimeType: 'image/png', buffer: png },
      { name: 'SectionB.png', mimeType: 'image/png', buffer: png },
    ])
    await expect(page.getByText('2 attached · 2 failed', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Unsupported.dwg')
    await expect(page.getByRole('alert')).toContainText('Rejected.png: Upload rejected')
    expect(attachments.size).toBe(2)
    await page.reload()
    await expect(page.getByRole('button', { name: 'SectionA.png', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SectionB.png', exact: true })).toBeVisible()
    await page.getByLabel('Select reporting week').selectOption('s55')
    await expect(page.getByText('No drawings attached for this reporting week yet.')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Foundation.png' })).toHaveCount(0)
    await expect(selection.getByRole('button', { name: 'Concrete', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(selection.getByRole('button', { name: 'Drainage', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(selection.getByRole('button', { name: 'Plumbing', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Construction Intelligence Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Executive overview 55' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Executive overview 56' })).toHaveCount(0)
    await expect(page.locator('.bolt-dashboard')).toHaveCSS('--dt-primary', '#087F5B')
    for (const id of ['WGT-011', 'WGT-012', 'WGT-036', 'WGT-037']) await expect(page.getByRole('region', { name: `Hidden ${id}` })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Hierarchy WGT-025' }).getByText('Drawings 55', { exact: true })).toBeHidden()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('region', { name: 'Hierarchy WGT-025' }).getByText('Drawings 55', { exact: true })).toBeVisible()
    await expect(page.locator('.bolt-print-context').first()).toContainText('Executive overview 55')
    await expect(page.getByRole('navigation', { name: 'Dashboard sections' })).toBeHidden()
    const wide = page.getByRole('region', { name: 'Wide print table', exact: true })
    await expect(wide.locator('xpath=..')).toHaveCSS('page', 'online-landscape')
    await expect(page.getByRole('region', { name: 'Hierarchy WGT-025' }).locator('xpath=..')).toHaveCSS('page', 'online-portrait')
    await expect(page.locator('.bolt-dashboard > header')).toBeHidden()
    const clipped = await wide.locator('table').evaluate(table => table.scrollWidth > table.clientWidth + 2)
    expect(clipped).toBe(false)
    if (mode === 'ready') {
      const path = testInfo.outputPath('bolt-report.pdf')
      await page.pdf({ path, preferCSSPageSize: true, printBackground: true })
      const orientations: boolean[] = []
      const parsePdf = createRequire(import.meta.url)('pdf-parse')
      const pdf = await parsePdf(readFileSync(path), { pagerender: async (pdfPage: any) => {
        const content = await pdfPage.getTextContent()
        orientations.push(pdfPage.view[2] > pdfPage.view[3])
        for (const item of content.items) expect(item.transform[4] + item.width).toBeLessThan(pdfPage.view[2] - 10)
        return content.items.map((item: any) => item.str).join(' ')
      } })
      expect(orientations).toContain(true)
      expect(orientations).toContain(false)
      expect(pdf.text).toContain('Column 9')
      expect(pdf.text).toContain('R34-C9')
      expect(pdf.text).not.toContain('Single-floor lift installation')
      expect(pdf.text).not.toContain('Project-wide activity')
    }
    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: 'Executive overview 55' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show navigation', exact: true })).toBeVisible()
    if (mode === 'ready') await page.screenshot({ path: testInfo.outputPath('bolt-mobile.png'), fullPage: true })
    expect(reads.some(read => read.table.endsWith('_widgets') && read.report === 'eq.r55')).toBe(true)
  }
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Weekly Report', exact: true }).click()
  await expect(page).toHaveURL(/tab=weekly_report/)
  await expect(page.locator('html')).not.toHaveClass(/bolt-dashboard-printing/)
  expect(errors).toEqual([])
})
