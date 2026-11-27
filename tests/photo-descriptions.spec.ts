import { test, expect } from '@playwright/test'

test('photo descriptions save per upload, persist, edit and clear without changing other metadata', async ({ page }) => {
  const project = { dgt_dbp6bd00projectdataid: 'photo-project', dgt_projectid: 'P2', dgt_projectname: 'Photo Test' }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6k9sAAAAASUVORK5CYII=', 'base64')
  const rows: any[] = []
  const writes: any[] = []
  let rejectUpdate = false
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://photos.blob.core.windows.net/**', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 201, headers: { etag: '"test"', 'last-modified': 'Fri, 27 Nov 2026 00:00:00 GMT', 'x-ms-request-id': 'test' } })
    else await route.fulfill({ contentType: 'image/png', body: png })
  })
  await page.route('https://sample.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop()
    let data: any = []
    if (table === 'dbp6_0000_projectdata') data = req.headers().accept?.includes('object') ? project : [project]
    if (table === 'p6_project_mapping') data = { schema_name: 'test_schema' }
    if (table === 'p6forms_photoupload') {
      if (req.method() === 'GET') {
        expect(req.headers()['accept-profile']).toBe('test_schema')
        expect(url.searchParams.get('imageurl')).toBe('like.%/photo-project/%')
        data = rows
      } else if (req.method() === 'POST') {
        expect(req.headers()['content-profile']).toBe('test_schema')
        const payload = req.postDataJSON()
        writes.push(payload)
        rows.push({ ...payload, id: `photo-${rows.length + 1}` })
        await route.fulfill({ status: 201, json: null })
        return
      } else if (req.method() === 'PATCH') {
        expect(req.headers()['content-profile']).toBe('test_schema')
        expect(Object.keys(req.postDataJSON())).toEqual(['description'])
        if (rejectUpdate) {
          rejectUpdate = false
          await route.fulfill({ status: 403, json: { message: 'Permission denied' } })
          return
        }
        const row = rows.find(row => `eq.${row.id}` === url.searchParams.get('id'))
        Object.assign(row, req.postDataJSON())
        data = { id: row.id, description: row.description }
      }
    }
    await route.fulfill({ json: data })
  })
  await page.goto('/?view=app&project=photo-project&schema=test_schema&tab=photos')
  await page.getByLabel('Choose photos').setInputFiles([
    { name: 'slab.png', mimeType: 'image/png', buffer: png },
    { name: 'facade.png', mimeType: 'image/png', buffer: png },
  ])
  await page.getByLabel('Description for slab.png (optional)').fill('  Level 12 slab completed  ')
  await page.getByLabel('Description for facade.png (optional)').fill('  East elevation cladding  ')
  await page.getByLabel('Photo Date', { exact: true }).fill('2026-11-27')
  await page.getByRole('button', { name: 'Upload 2 photos', exact: true }).click()
  await expect(page.getByText('2 photos uploaded successfully', { exact: true })).toBeVisible()
  expect(writes.map(row => row.description)).toEqual(['Level 12 slab completed', 'East elevation cladding'])
  expect(writes.map(row => row.serialnumber)).toEqual(['1', '2'])
  expect(writes.every(row => row.dgt_projectid === 'photo-project')).toBe(true)
  await page.reload()
  await expect(page.getByText('Level 12 slab completed', { exact: true })).toBeVisible()
  await expect(page.getByText('East elevation cladding', { exact: true })).toBeVisible()
  await page.getByRole('img', { name: '2026-11-27.png', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: 'Photo preview' })).toContainText('Level 12 slab completed')
  await page.getByRole('button', { name: 'Close photo preview' }).click()

  await page.getByRole('button', { name: 'Edit description', exact: true }).first().click()
  await page.getByLabel('Photo description', { exact: true }).fill('West elevation updated')
  rejectUpdate = true
  await page.getByRole('button', { name: 'Save description', exact: true }).click()
  await expect(page.getByText('Failed to save photo description', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Photo description', { exact: true })).toHaveValue('West elevation updated')
  expect(rows[0].description).toBe('Level 12 slab completed')
  await page.getByRole('button', { name: 'Save description', exact: true }).click()
  await expect(page.getByText('West elevation updated', { exact: true })).toBeVisible()
  expect(rows[0].filename).toBe('2026-11-27.png')
  await page.reload()
  await expect(page.getByText('West elevation updated', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit description', exact: true }).first().click()
  await page.getByLabel('Photo description', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Save description', exact: true }).click()
  await expect(page.getByText('West elevation updated', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add description', exact: true })).toBeVisible()
  expect(rows[0].description).toBeNull()
  expect(errors).toEqual([])
})
