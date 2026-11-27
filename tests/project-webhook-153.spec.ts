import { test, expect } from '@playwright/test'

for (const hasReport of [true, false]) test(`webhook 153 keeps schema and current report ID: report ${hasReport ? 'present' : 'missing'}`, async ({ page }) => {
  const project = { dgt_dbp6bd00projectdataid: 'project-153', dgt_projectid: 'P2', dgt_projectname: 'Webhook Test', dgt_current_weeknum: 56 }
  const calls: unknown[] = []
  let lookup = false
  await page.route('https://sample.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').pop()
    let data: unknown = []
    if (table === 'dbp6_0000_projectdata') data = request.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_0008_weekly_reports_calculations') {
      expect(request.headers()['accept-profile']).toBe('test_schema')
      expect(url.searchParams.get('project_id')).toBe('eq.P2')
      expect(url.searchParams.get('week_num')).toBe('eq.56')
      expect(url.searchParams.get('report_type')).toBe('eq.Weekly Progress Report')
      expect(url.searchParams.get('order')).toBe('updated_at.desc')
      lookup = true
      data = hasReport ? { report_id: 'report-56' } : null
    }
    await route.fulfill({ json: data })
  })
  await page.route('https://pmc2p2c.app.n8n.cloud/**', async route => {
    expect(route.request().method()).toBe('POST')
    expect(new URL(route.request().url()).search).toBe('')
    calls.push(route.request().postDataJSON())
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/?view=app&project=project-153&schema=test_schema&tab=projectdata')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const webhook = page.locator('div').filter({ has: page.getByText('Webhook 153', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Run', exact: true }) }).last()
  await webhook.getByRole('button', { name: 'Run', exact: true }).click()
  if (hasReport) {
    await expect(webhook.getByRole('button', { name: 'Success', exact: true })).toBeVisible()
    expect(calls).toEqual([{ flow_parameters: { schema: 'test_schema', project_id: 'P2', report_id: 'report-56' } }])
  } else {
    await expect(webhook.getByRole('button', { name: 'Failed: Retry', exact: true })).toBeVisible()
    expect(calls).toEqual([])
  }
  expect(lookup).toBe(true)
})
