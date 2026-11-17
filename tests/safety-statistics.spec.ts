import { test, expect } from '@playwright/test'
import { parseSafetyNumber } from '../src/lib/safetyStatistics'

test('parses pasted report numbers without converting blanks into zero', () => {
  for (const [raw, expected] of [['69,946', 69946], ['00', 0], ['07', 7], ['-', null], ['', null]] as const) expect(parseSafetyNumber(raw)).toBe(expected)
  for (const raw of ['-2', 'abc', 'Infinity']) expect(() => parseSafetyNumber(raw)).toThrow('non-negative')
})

test('saves metric lines before submit, resumes drafts, and reads trigger output', async ({ page }) => {
  const calls: { table: string; method: string; body: any }[] = []
  const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P2', dgt_projectname: 'Test Project' }
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto(`/?view=app&project=${project.dgt_dbp6bd00projectdataid}&schema=test_schema&tab=safetystatistics`)
  await page.getByRole('button', { name: 'Start new report' }).click()
  await expect(page.getByText('Default contractor', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Contractor name')).toHaveValue('Default contractor')
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
