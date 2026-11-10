import { test, expect } from '@playwright/test'

const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P2', dgt_projectname: 'Test Project', dgt_current_weeknum: 54, dgt_datadate: '2026-09-27' }
const sections = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, report_id: 'r54', project_id: 'P2', week_num: 54, data_date: '2026-09-27',
  section_id: `SEC-${String(i + 1).padStart(3, '0')}`, section_order: i + 1, title: `Report section ${i + 1}`,
  type: 'section', section_ast: { blocks: [{ type: 'paragraph', content: { text: 'Report content. '.repeat(50) } }] },
}))

test.beforeEach(async ({ page }) => {
  await page.route('https://sample.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    let data: unknown = []
    if (table === 'dbp6_0000_projectdata') data = request.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0008_weekly_report_sections') data = sections
    if (table === 'dbp6_0008_weekly_reports_calculations') data = [{ ...sections[0], report_type: 'Weekly Progress Report', updated_at: '2026-01-01' }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
})

test('section clicks replace history; Back/Forward and refresh restore the project/report', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Project', exact: true }).click()
  await page.getByRole('button', { name: 'Weekly Report', exact: true }).click()
  await expect(page.locator('#section-SEC-012')).toBeVisible()
  const before = await page.evaluate(() => history.length)
  await page.locator('a[href="#section-SEC-012"]').first().click()
  await expect(page).toHaveURL(/#section-SEC-012$/)
  await page.locator('a[href="#section-SEC-011"]').first().click()
  expect(await page.evaluate(() => history.length)).toBe(before)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dashboard/)
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.locator('.weekly-report-themed')).toHaveCount(0)
  await page.goForward()
  await expect(page).toHaveURL(/#section-SEC-011$/)
  await expect(page.locator('#section-SEC-011')).toBeVisible()
  await page.reload()
  await expect(page.locator('#section-SEC-011')).toBeVisible()
  await expect.poll(async () => page.locator('#section-SEC-011').evaluate(el => {
    const main = document.querySelector('main')!
    return Math.abs(el.getBoundingClientRect().top - main.getBoundingClientRect().top)
  })).toBeLessThan(15)
  await page.goBack()
  await expect(page).toHaveURL(/tab=dashboard/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Open Project', exact: true })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('')
  expect(errors).toEqual([])
})

test('sync sequence disables duplicates and stops visibly at a rejected webhook', async ({ page }) => {
  const requests: { url: string; body: Record<string, unknown> }[] = []
  let updated = false
  await page.route('https://sample.supabase.co/rest/v1/dbp6_0008_weekly_reports_calculations**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ report_id: 'r54', updated_at: updated ? '2026-01-02' : '2026-01-01' }),
  }))
  await page.route('https://pmc2p2c.app.n8n.cloud/**', async route => {
    requests.push({ url: route.request().url(), body: route.request().postDataJSON() })
    if (requests.length === 1) updated = true
    await new Promise(resolve => setTimeout(resolve, 150))
    await route.fulfill({ status: requests.length === 2 ? 500 : 202, body: 'test response' })
  })
  await page.goto(`/?view=app&project=${project.dgt_dbp6bd00projectdataid}&schema=test_schema&tab=projectdata`)
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const run = page.getByRole('button', { name: 'Run report sequence', exact: true })
  await run.click()
  await expect(page.getByRole('button', { name: 'Running report sequence…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Run', exact: true }).first()).toBeDisabled()
  await expect(page.getByText('Webhook 152 (Independent data sources) returned HTTP 500; expected 200 or 202.', { exact: true })).toBeVisible()
  await expect(run).toBeEnabled()
  expect(requests).toHaveLength(2)
  expect(requests[1].body).toEqual({ flow_parameters: { schema: 'test_schema', project_id: 'P2', report_id: 'r54' } })
})
