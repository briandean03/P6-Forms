import { test, expect } from '@playwright/test'
import { parseSafetyNumber } from '../src/lib/safetyStatistics'

test('parses pasted report numbers without converting blanks into zero', () => {
  for (const [raw, expected] of [['69,946', 69946], ['00', 0], ['07', 7], ['-', null], ['', null]] as const) expect(parseSafetyNumber(raw)).toBe(expected)
  for (const raw of ['-2', 'abc', 'Infinity']) expect(() => parseSafetyNumber(raw)).toThrow('non-negative')
})

test('saves metric lines before submit, resumes drafts, and reads trigger output', async ({ page }) => {
  const calls: { table: string; method: string; body: any }[] = []
  const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P2', dgt_projectname: 'Test Project', dgt_current_weeknum: 54, dgt_datadate: '2026-09-27T00:00:00Z' }
  let header: any = null
  let lines: any[] = []
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()!
    const method = req.method(), body = req.postDataJSON()
    if (table.startsWith('dbp6_0009')) {
      expect(req.headers()[method === 'GET' ? 'accept-profile' : 'content-profile']).toBe('test_schema')
      calls.push({ table, method, body })
    }
    let data: any = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0009_safety_metric_catalogue') data = [
      { category: 'manpower', metric_key: 'total_manhours_worked', kind: 'period', label: 'Total manhours worked', doc_no: '1.1', sort_order: 1 },
      { category: 'inspections_observations', metric_key: 'consultant_sor', kind: 'status', label: 'Consultant SOR', doc_no: '8.1', sort_order: 2 },
      { category: 'accidents', metric_key: 'fatal', kind: 'period', label: 'Fatal', doc_no: '2.1', sort_order: 3 },
    ]
    if (table === 'dbp6_0009_safety_stat_inputs') {
      if (method === 'POST') {
        expect(body).not.toHaveProperty('data_date'); expect(body).not.toHaveProperty('week_num')
        header = { ...body, id: 'input-1', data_date: '2026-09-27', week_num: 54, contractor_name: 'Default contractor' }
      }
      if (method === 'PATCH') header = { ...header, ...body }
      data = req.headers().accept?.includes('object') ? header : header ? [header] : []
    }
    if (table === 'dbp6_0009_safety_stat_input_lines') {
      if (method === 'POST') lines = body
      data = method === 'GET' ? lines : null
    }
    if (table === 'dbp6_0009_safety_statistics') {
      expect(method).toBe('GET')
      data = { report_id: null, statistics: { manpower: { total_manhours_worked: { month: 100, ytd: 500, inception: 900 } }, inspections_observations: { consultant_sor: { open: 0, closed: 7, total: 7 } } }, data_quality: { warnings: [{ severity: 'warning', message: 'Some metrics empty' }] } }
    }
    if (table === 'dbp6_0009_safety_statistics' && url.searchParams.get('select') !== '*') data = []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto(`/?view=app&project=${project.dgt_dbp6bd00projectdataid}&schema=test_schema&tab=safetystatistics`)
  await page.getByRole('button', { name: 'Start new report for week 54' }).click()
  await expect(page.getByText('Default contractor', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Contractor name')).toHaveValue('Default contractor')
  for (const label of ['Total manhours worked Month', 'Total manhours worked Year To Date', 'Total manhours worked From Job Inception', 'Consultant SOR Open', 'Consultant SOR Closed', 'Consultant SOR Total', 'Fatal Month', 'Fatal Year To Date', 'Fatal From Job Inception']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('0')
  }
  // Users can still deliberately clear a metric and submit it as empty.
  for (const label of ['Fatal Month', 'Fatal Year To Date', 'Fatal From Job Inception']) await page.getByLabel(label, { exact: true }).fill('')
  await page.getByLabel('Total manhours worked Month', { exact: true }).fill('100')
  await page.getByLabel('Total manhours worked Year To Date').fill('-5')
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled()
  await page.getByLabel('Total manhours worked Year To Date').fill('500')
  await page.getByLabel('Total manhours worked From Job Inception').fill('900')
  await page.getByLabel('Consultant SOR Open', { exact: true }).fill('00')
  await page.getByLabel('Consultant SOR Closed').fill('07')
  await page.getByLabel('Consultant SOR Total').fill('7')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Engineering', exact: true }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: 'Safety Statistics', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Total manhours worked Month', { exact: true })).toHaveValue('100')
  // Missing draft lines default back to zero when resumed.
  await expect(page.getByLabel('Fatal Month', { exact: true })).toHaveValue('0')
  for (const label of ['Fatal Month', 'Fatal Year To Date', 'Fatal From Job Inception']) await page.getByLabel(label, { exact: true }).fill('')
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByText('1 metrics are still empty.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Submit anyway' }).click()
  await expect(page.getByRole('heading', { name: 'Submitted statistics' })).toBeVisible()
  await page.getByText('Statistics JSON', { exact: true }).click()
  await expect(page.locator('details pre')).toContainText('total_manhours_worked')
  expect(lines).toHaveLength(2)
  expect(lines[0]).toMatchObject({ month_value: 100, ytd: 500, inception: 900, open_count: null })
  expect(lines[1]).toMatchObject({ open_count: 0, closed_count: 7, total_count: 7, month_value: null })
  const submission = calls.findIndex(call => call.body?.status === 'submitted')
  expect(calls.slice(0, submission).some(call => call.table.endsWith('_input_lines') && call.method === 'POST')).toBe(true)
  expect(calls.slice(0, submission).some(call => call.table.endsWith('_input_lines') && call.method === 'DELETE')).toBe(true)
  await expect(page.getByLabel('Consultant SOR Open', { exact: true })).toBeDisabled()
  await expect(page.getByText('not linked to a dashboard report yet')).toBeVisible()
  await expect(page.getByText('warning:', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Consultant SOR Open', { exact: true })).toBeEnabled()
})

for (const scenario of ['none', 'draft', 'submitted', 'duplicate'] as const) test(`current week lifecycle: ${scenario}`, async ({ page }) => {
  const old = { id: 'old', project_id: 'P2', week_num: 53, data_date: '2026-09-20', status: 'draft', report_no: 'OLD-53', prepared_by: 'Earlier author', created_at: '2026-09-20T00:00:00Z' }
  const current = { ...old, id: 'current', week_num: 54, data_date: '2026-09-27', report_no: 'CURRENT-54', status: scenario === 'submitted' ? 'submitted' : 'draft' }
  let reports = scenario === 'draft' || scenario === 'submitted' ? [current, old] : [old]
  let deleted = false, weekReads = 0
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()
    const project = { dgt_dbp6bd00projectdataid: 'uuid-1', dgt_projectid: 'P2', dgt_projectname: 'Test Project', dgt_current_weeknum: 54, dgt_datadate: '2026-09-27T23:00:00Z' }
    let data: any = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0009_safety_metric_catalogue') data = [{ category: 'manpower', metric_key: 'total_manhours_worked', kind: 'period', label: 'Manhours', doc_no: '1', sort_order: 1 }]
    if (table === 'dbp6_0009_safety_stat_inputs') {
      if (req.method() === 'POST') {
        expect(req.postDataJSON()).toEqual({ project_id: 'P2', status: 'draft' })
        reports = [current, old]
        if (scenario === 'duplicate') {
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint project_id_data_date' }) })
          return
        }
        data = current
      } else if (req.method() === 'DELETE') {
        expect(url.searchParams.get('id')).toBe('eq.old')
        expect(url.searchParams.get('status')).toBe('eq.draft')
        reports = reports.filter(report => report.id !== 'old'); deleted = true; data = { id: 'old' }
      } else if (url.searchParams.has('week_num')) {
        expect(url.searchParams.get('week_num')).toBe('eq.54'); weekReads++
        data = reports.find(report => report.week_num === 54) ?? null
      } else data = reports
    }
    if (table === 'dbp6_0009_safety_statistics') data = { statistics: {}, data_quality: [] }
    if (table === 'dbp6_0009_safety_statistics' && url.searchParams.get('select') !== '*') data = []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('/?view=app&project=uuid-1&schema=test_schema&tab=safetystatistics')
  const warning = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Unsubmitted drafts from earlier weeks' }) })
  await expect(warning.getByText('OLD-53')).toBeVisible()
  await expect(warning.getByText('Earlier author')).toBeVisible()
  if (scenario === 'none' || scenario === 'duplicate') {
    await expect(page.getByRole('button', { name: 'Start new report for week 54' })).toBeVisible()
    // Opening an earlier draft is explicit, never automatic.
    await warning.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByLabel('Report no.', { exact: true })).toHaveValue('OLD-53')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Return to current week 54' }).click()
    await page.getByRole('button', { name: 'Start new report for week 54' }).click()
    await expect(page.getByLabel('Report no.', { exact: true })).toHaveValue('CURRENT-54')
    await expect(page.getByRole('alert')).toHaveCount(0)
  } else {
    await expect(page.getByLabel('Report no.', { exact: true })).toHaveValue('CURRENT-54')
    if (scenario === 'submitted') {
      await expect(page.getByLabel('Report no.', { exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    } else await expect(page.getByLabel('Report no.', { exact: true })).toBeEnabled()
  }
  await warning.getByRole('button', { name: 'Discard', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(deleted).toBe(false)
  await warning.getByRole('button', { name: 'Discard', exact: true }).click()
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(warning).toHaveCount(0)
  expect(deleted).toBe(true)
  expect(weekReads).toBeGreaterThan(0)
})

test('history lists all output records, including samples without input headers', async ({ page }) => {
  const project = { dgt_dbp6bd00projectdataid: 'uuid-1', dgt_projectid: 'PRJ-ATGC-01', dgt_projectname: 'Test Project', dgt_current_weeknum: 56, dgt_datadate: '2026-10-12T00:00:00Z' }
  const records = [
    { statistics_id: 'stats-55', data_date: '2026-10-05', week_num: 55, source_reference: 'REF-55', processing_status: 'processed', is_approved: true },
    { statistics_id: 'stats-54', data_date: '2026-09-27', week_num: 54, source_reference: 'REF-54', processing_status: 'processed', is_approved: false },
    { statistics_id: 'sample-56', data_date: '2026-09-25', week_num: 56, source_reference: 'ATGC-PR-13-F02', processing_status: 'sample', is_approved: false },
  ].map(record => ({ ...record, project_id: project.dgt_projectid, prepared_by: 'Syed Hanif', updated_at: '2026-11-17T09:54:49Z', created_at: '2026-10-31T05:35:25Z', report_id: null, statistics: { manpower: { total_manhours_worked: { month: 100, ytd: 500, inception: 900 } } }, data_quality: [{ severity: 'warning', message: 'Sample record' }] }))
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()
    let data: any = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0009_safety_metric_catalogue') data = [{ category: 'manpower', metric_key: 'total_manhours_worked', kind: 'period', label: 'Manhours', doc_no: '1', sort_order: 1 }]
    if (table === 'dbp6_0009_safety_stat_inputs') data = req.headers().accept?.includes('object') ? null : []
    if (table === 'dbp6_0009_safety_statistics') {
      expect(req.method()).toBe('GET')
      expect(req.headers()['accept-profile']).toBe('test_schema')
      expect(url.searchParams.get('project_id')).toBe('eq.PRJ-ATGC-01')
      if (url.searchParams.has('statistics_id')) data = records.find(record => `eq.${record.statistics_id}` === url.searchParams.get('statistics_id'))
      else {
        expect(url.searchParams.get('order')).toBe('data_date.desc')
        expect(url.searchParams.has('is_approved')).toBe(false)
        expect(url.searchParams.has('processing_status')).toBe(false)
        data = records
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('/?view=app&project=uuid-1&schema=test_schema&tab=safetystatistics')
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Report history', exact: true }) })
  await expect(history.locator('tbody tr')).toHaveCount(3)
  await expect(history.locator('tbody tr').first()).toContainText('2026-10-05')
  const sample = history.locator('tr').filter({ hasText: 'ATGC-PR-13-F02' })
  await expect(sample).toContainText('sample')
  await sample.getByRole('button', { name: 'Open report' }).click()
  await expect(page.getByRole('heading', { name: 'Safety statistics record', exact: true })).toBeVisible()
  await expect(page.getByText('Read-only statistics output')).toBeVisible()
  await expect(page.getByText('Sample record', { exact: false })).toBeVisible()
  await page.getByText('Statistics JSON', { exact: true }).click()
  await expect(page.locator('details pre')).toContainText('total_manhours_worked')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start new report for week 56' })).toBeVisible()
})
