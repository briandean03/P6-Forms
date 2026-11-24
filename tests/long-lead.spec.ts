import { test, expect } from '@playwright/test'

for (const mode of ['ready', 'denied'] as const) test(`long-lead form: ${mode}`, async ({ page }) => {
  const project = { dgt_dbp6bd00projectdataid: 'project-uuid', dgt_projectid: 'P2', dgt_projectname: 'Test Project', dgt_current_weeknum: 56 }
  const engineering = [
    { dgt_transmittalref: 'MS-054', dgt_revision: 0, dgt_transmittalsubject: 'Material 054', is_long_lead: true },
    { dgt_transmittalref: 'MS-054', dgt_revision: 2, dgt_transmittalsubject: 'Material 054 revised', is_long_lead: true },
    { dgt_transmittalref: 'MS-NULL', dgt_revision: null, dgt_transmittalsubject: 'Unspecified revision material', is_long_lead: false },
  ]
  let records: any[] = [{ id: 'existing', transmittal_ref: 'MS-054', engineering_revision: 2, week_num: 55, order_planned_date: '2026-08-04', first_delivery_planned_date: '2026-08-15', order_placed_date: null, delivered_date: null, supplier_name: null, procurement_tracker_status: null, lpo_number: null, created_at: '2026-11-23' }]
  const writes: { method: string; payload: any }[] = []
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()!
    let data: any = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'dbp6_000401_engineering_history') {
      expect(req.headers()['accept-profile']).toBe('test_schema')
      expect(url.searchParams.get('dgt_projectid')).toBe('eq.P2')
      data = engineering
    }
    if (table === 'dbp6_000401_longlead') {
      if (mode === 'denied') {
        await route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied for table dbp6_000401_longlead' } }); return
      }
      const method = req.method()
      expect(req.headers()[method === 'GET' ? 'accept-profile' : 'content-profile']).toBe('test_schema')
      if (method === 'GET') { expect(url.searchParams.get('transmittal_ref')).toContain('MS-054'); data = records }
      else {
        const payload = req.postDataJSON(); writes.push({ method, payload })
        if (method === 'POST') { const record = { ...payload, id: `new-${writes.length}`, created_at: '2026-11-24' }; records.push(record); data = { id: record.id } }
        if (method === 'PATCH') {
          expect(url.searchParams.get('id')).toBe('eq.existing')
          records = records.map(record => record.id === 'existing' ? { ...record, ...payload } : record); data = { id: 'existing' }
        }
        if (method === 'DELETE') { records = records.filter(record => record.id !== 'existing'); data = { id: 'existing' } }
      }
    }
    await route.fulfill({ json: data })
  })
  await page.goto('/?view=app&project=project-uuid&schema=test_schema&tab=longlead')
  if (mode === 'denied') {
    await expect(page.getByRole('alert')).toContainText('test_schema.dbp6_000401_longlead: permission denied')
    await expect(page.getByRole('button', { name: 'Add long-lead item', exact: true })).toBeDisabled()
    expect(writes).toHaveLength(0); return
  }
  await page.getByRole('button', { name: 'Add long-lead item', exact: true }).click()
  await page.getByLabel('Transmittal reference', { exact: true }).selectOption('MS-054')
  await expect(page.getByLabel('Engineering revision', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('Week number', { exact: true })).toHaveValue('56')
  await page.getByLabel('Engineering revision', { exact: true }).selectOption('0')
  await page.getByLabel('LPO number', { exact: true }).fill('0')
  await page.getByLabel('Supplier name', { exact: true }).fill('Supplier One')
  await page.getByLabel('First delivery planned date', { exact: true }).fill('2026-12-01')
  await page.getByRole('button', { name: 'Create item', exact: true }).click()
  await expect(page.getByText('Long-lead item added', { exact: true })).toBeVisible()
  expect(writes[0].payload).toMatchObject({ transmittal_ref: 'MS-054', engineering_revision: 0, lpo_number: 0, week_num: 56, supplier_name: 'Supplier One', first_delivery_planned_date: '2026-12-01', delivered_date: null })
  await page.getByRole('button', { name: 'Add long-lead item', exact: true }).click()
  await page.getByLabel('Transmittal reference', { exact: true }).selectOption('MS-NULL')
  await expect(page.getByLabel('Engineering revision', { exact: true })).toHaveValue('')
  await page.getByLabel('LPO number', { exact: true }).fill('1.5')
  await expect(page.getByRole('button', { name: 'Create item', exact: true })).toBeDisabled()
  await page.getByLabel('LPO number', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Create item', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create item', exact: true })).toHaveCount(0)
  expect(writes[1].payload).toMatchObject({ transmittal_ref: 'MS-NULL', engineering_revision: null, lpo_number: null })
  await page.getByLabel('Reporting week', { exact: true }).selectOption('55')
  await page.getByRole('button', { name: 'Edit MS-054', exact: true }).click()
  await page.getByLabel('Delivered date', { exact: true }).fill('2026-11-24')
  await page.getByLabel('Procurement tracker status', { exact: true }).fill('Delivered')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Long-lead item updated', { exact: true })).toBeVisible()
  expect(writes[2].payload).toMatchObject({ engineering_revision: 2, delivered_date: '2026-11-24', procurement_tracker_status: 'Delivered', order_planned_date: '2026-08-04' })
  await page.getByRole('button', { name: 'Edit MS-054', exact: true }).last().click()
  await page.getByLabel('Supplier name', { exact: true }).fill('Not saved')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Your changes to this long-lead item have not been saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  expect(writes).toHaveLength(3)
  await page.getByLabel('Reporting week', { exact: true }).selectOption('55')
  await page.getByRole('button', { name: 'Delete MS-054', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toHaveLength(3)
  await page.getByRole('button', { name: 'Delete MS-054', exact: true }).click()
  await page.getByRole('button', { name: 'Delete item', exact: true }).click()
  await expect(page.getByText('Long-lead item deleted', { exact: true })).toBeVisible()
  expect(writes[3].method).toBe('DELETE')
})
