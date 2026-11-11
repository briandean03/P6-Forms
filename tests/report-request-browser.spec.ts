import { test, expect } from '@playwright/test'

test('Supabase request demo submits once and recovers the status after refresh', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const submissions: Record<string, string>[] = []
  let directWebhookCalls = 0
  await page.route('https://pmc2p2c.app.n8n.cloud/**', route => { directWebhookCalls++; return route.abort() })
  await page.route('https://sample.supabase.co/**', route => {
    const request = route.request(), url = new URL(request.url())
    let result: unknown = []
    if (url.pathname.endsWith('dbp6_0000_projectdata')) {
      const project = { dgt_dbp6bd00projectdataid: '00000000-0000-0000-0000-000000000001', dgt_projectid: 'P1', dgt_projectname: 'Demo Project' }
      result = request.headers().accept?.includes('object') ? project : [project]
    }
    if (url.pathname.endsWith('dbp6_weekly_report_request')) {
      submissions.push(request.postDataJSON())
      result = { request_id: submissions[0].p_request_id, status: 'queued' }
    }
    if (url.pathname.endsWith('dbp6_weekly_report_request_status')) {
      expect(request.postDataJSON().p_access_token).toBe(submissions[0].p_access_token)
      result = { request_id: submissions[0].p_request_id, status: 'accepted', report_ready: false }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('/?view=app&project=00000000-0000-0000-0000-000000000001&schema=other_project&tab=projectdata')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await page.getByRole('button', { name: 'Request calculations', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Report readiness has not been checked')
  expect(submissions).toHaveLength(1)
  expect(submissions[0].p_schema).toBe('other_project')
  expect(submissions[0].p_project_id).toBe('P1')
  expect(submissions[0].p_request_id).not.toBe(submissions[0].p_access_token)
  await page.reload()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await page.getByRole('button', { name: 'Check status', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Request accepted')
  expect(submissions).toHaveLength(1)
  expect(directWebhookCalls).toBe(0)
  expect(errors).toEqual([])
})
