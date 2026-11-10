import { test, expect } from '@playwright/test'
import { REPORT_WEBHOOKS, runReportSync, type SyncReport } from '../src/lib/reportSync'
import { readAppLocation } from '../src/lib/appNavigation'

const old = { report_id: 'r54', updated_at: '2026-01-01' }
const fresh = { ...old, updated_at: '2026-01-02' }
function fixture(status = 202) {
  const calls: { url: URL; init?: RequestInit }[] = []
  const statuses: string[] = []
  const controller = new AbortController()
  let reads = 0
  return {
    calls, statuses, controller,
    options: {
      schema: 'other_project', projectId: 'P2', signal: controller.signal,
      readReport: async (): Promise<SyncReport | null> => reads++ === 0 ? old : fresh,
      onStep: (id: string, state: string) => { statuses.push(`${id}:${state}`) },
      wait: async () => {},
      fetchRequest: (async (url, init) => {
        calls.push({ url: new URL(String(url)), init })
        return new Response('result', { status })
      }) as typeof fetch,
    },
  }
}

test('restores the project, tab and schema from a section deep link', () => {
  expect(readAppLocation(new URL('https://example.com/?view=app&project=uuid&schema=other&tab=weekly_report&report=r54#section-SEC-012'), ['dashboard', 'weekly_report'])).toEqual({ view: 'app', activeTab: 'weekly_report', selectedProjectId: 'uuid', selectedSchemaName: 'other' })
  expect(readAppLocation(new URL('https://example.com/'), ['dashboard']).view).toBe('home')
})

test('posts sequentially in 149/152/151/150 order with the n8n flow_parameters JSON body', async () => {
  const f = fixture()
  expect(await runReportSync(f.options)).toBe('r54')
  expect(f.calls.map(call => call.url.pathname)).toEqual(REPORT_WEBHOOKS.map(step => new URL(step.url).pathname))
  for (const [index, call] of f.calls.entries()) {
    expect(call.init?.method).toBe('POST')
    expect(call.init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(call.url.search).toBe('')
    expect(JSON.parse(String(call.init?.body))).toEqual({ flow_parameters: {
      schema: 'other_project', project_id: 'P2', ...(index ? { report_id: 'r54' } : {}),
    } })
  }
})

for (const status of [204, 400, 500]) test(`stops at an unsupported response (${status})`, async () => {
  const f = fixture(status)
  if (status === 204) f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    return new Response(null, { status })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('expected 200 or 202')
  expect(f.calls).toHaveLength(1)
  expect(f.statuses.at(-1)).toBe('149:error')
})

test('does not start a later workflow before the earlier request has resolved', async () => {
  const f = fixture()
  let release!: (response: Response) => void
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    if (f.calls.length === 1) return new Promise<Response>(resolve => { release = resolve })
    return new Response('', { status: 202 })
  }) as typeof fetch
  const run = runReportSync(f.options)
  await expect.poll(() => f.calls.length).toBe(1)
  expect(f.statuses).not.toContain('152:loading')
  release(new Response('', { status: 202 }))
  await run
  expect(f.calls).toHaveLength(4)
})

test('does not pass an old report ID downstream if calculations never update', async () => {
  const f = fixture()
  f.options.readReport = async () => old
  await expect(runReportSync(f.options)).rejects.toThrow('no new or updated report')
  expect(f.calls).toHaveLength(1)
})

test('stops at the failing later webhook and surfaces its identity', async () => {
  const f = fixture()
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    return new Response('workflow failed', { status: f.calls.length === 3 ? 503 : 202 })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('151 (Widget generator)')
  expect(f.calls).toHaveLength(3)
  expect(f.statuses.at(-1)).toBe('151:error')
})

test('honours cancellation and metadata errors before calling later workflows', async () => {
  const f = fixture()
  f.options.readReport = async () => { f.controller.abort(); return fresh }
  await expect(runReportSync(f.options)).rejects.toThrow()
  expect(f.calls).toHaveLength(0)
  const failed = fixture()
  failed.options.readReport = async () => { throw new Error('permission denied') }
  await expect(runReportSync(failed.options)).rejects.toThrow('permission denied')
  expect(failed.calls).toHaveLength(0)
})

for (const status of [200, 202]) test(`accepts HTTP ${status} for every report webhook`, async () => {
  const f = fixture(status)
  expect(await runReportSync(f.options)).toBe('r54')
  expect(f.calls).toHaveLength(4)
  expect(f.statuses.filter(state => state.endsWith(':accepted'))).toEqual(['149:accepted', '152:accepted', '151:accepted', '150:accepted'])
})

test('accepts a mix of 200 and 202 responses with empty bodies', async () => {
  const f = fixture()
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    return new Response('', { status: f.calls.length % 2 ? 200 : 202 })
  }) as typeof fetch
  expect(await runReportSync(f.options)).toBe('r54')
  expect(f.calls).toHaveLength(4)
})
