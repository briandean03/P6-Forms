import { test, expect } from '@playwright/test'
import { REPORT_WEBHOOKS, runReportSync, type SyncReport } from '../src/lib/reportSync'
import { readAppLocation } from '../src/lib/appNavigation'

// ── Shared test data ──────────────────────────────────────────────────────────

const old = { report_id: 'r54', updated_at: '2026-01-01' }
const fresh = { ...old, updated_at: '2026-01-02' }

// Edge function URL used instead of direct n8n call for webhook 151
const EDGE_FN_URL = 'https://example.supabase.co/functions/v1/invoke-webhook-151'

// ── Fixture factory ───────────────────────────────────────────────────────────

function fixture(status = 202) {
  const calls: { url: URL; init?: RequestInit }[] = []
  const statuses: string[] = []
  const controller = new AbortController()
  let reads = 0
  let jobIdReceived: string | undefined
  return {
    calls, statuses, controller,
    get jobIdReceived() { return jobIdReceived },
    options: {
      schema: 'other_project', projectId: 'P2', signal: controller.signal,
      readReport: async (): Promise<SyncReport | null> => reads++ === 0 ? old : fresh,
      onStep: (id: string, state: string) => { statuses.push(`${id}:${state}`) },
      onJobCreated: (jobId: string) => { jobIdReceived = jobId },
      edgeFunctionUrl: EDGE_FN_URL,
      // fetchRequest returns JSON body for the edge function call (which needs request_id + job_id),
      // and plain text for all other webhook calls.
      fetchRequest: (async (url, init) => {
        calls.push({ url: new URL(String(url)), init })
        const isEdgeFn = String(url) === EDGE_FN_URL
        const body = isEdgeFn ? JSON.stringify({ request_id: 'req-1', job_id: 'job-1' }) : 'result'
        return new Response(body, { status })
      }) as typeof fetch,
    },
  }
}

// ── Existing tests (maintained) ───────────────────────────────────────────────

test('restores the project, tab and schema from a section deep link', () => {
  expect(readAppLocation(new URL('https://example.com/?view=app&project=uuid&schema=other&tab=weekly_report&report=r54#section-SEC-012'), ['dashboard', 'weekly_report'])).toEqual({ view: 'app', activeTab: 'weekly_report', selectedProjectId: 'uuid', selectedSchemaName: 'other' })
  expect(readAppLocation(new URL('https://example.com/'), ['dashboard']).view).toBe('home')
})

test('posts sequentially in 149/152/151(edge fn) order and returns reportId + jobId', async () => {
  const f = fixture()
  expect(await runReportSync(f.options)).toEqual({ reportId: 'r54', jobId: 'job-1' })
  // Webhook 151 goes to the edge function URL, not the n8n URL.
  // Webhook 150 is NOT dispatched by the browser — pg_cron handles it server-side.
  expect(f.calls).toHaveLength(3)
  expect(f.calls[0].url.toString()).toBe(REPORT_WEBHOOKS[0].url)
  expect(f.calls[1].url.toString()).toBe(REPORT_WEBHOOKS[1].url)
  expect(f.calls[2].url.toString()).toBe(EDGE_FN_URL)
  for (const [index, call] of f.calls.entries()) {
    expect(call.init?.method).toBe('POST')
    expect(call.url.search).toBe('')
    expect(JSON.parse(String(call.init?.body))).toEqual({ flow_parameters: {
      schema: 'other_project', project_id: 'P2', ...(index ? { report_id: 'r54' } : {}),
    } })
  }
  // Calls 0, 1 (non-151) have no Authorization header
  expect((f.calls[0].init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined()
  expect((f.calls[1].init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined()
})

for (const status of [204, 400, 500]) test(`stops at a non-202 response (${status})`, async () => {
  const f = fixture(status)
  if (status === 204) f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    return new Response(null, { status })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('expected 202')
  expect(f.calls).toHaveLength(1)
  expect(f.statuses.at(-1)).toBe('149:error')
})

test('does not start a later workflow before the earlier request has resolved', async () => {
  const f = fixture()
  let release!: (response: Response) => void
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    if (f.calls.length === 1) return new Promise<Response>(resolve => { release = resolve })
    const isEdgeFn = String(url) === EDGE_FN_URL
    return new Response(isEdgeFn ? JSON.stringify({ request_id: 'req-1', job_id: 'job-1' }) : '', { status: 202 })
  }) as typeof fetch
  const run = runReportSync(f.options)
  await expect.poll(() => f.calls.length).toBe(1)
  expect(f.statuses).not.toContain('152:loading')
  release(new Response('', { status: 202 }))
  await run
  expect(f.calls).toHaveLength(3)   // 149, 152, edge-fn-151 — 150 is server-side
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

// ── Webhook 151 edge-function path ────────────────────────────────────────────

test('webhook 151 is sent to the edge function URL, not the n8n webhook URL', async () => {
  const f = fixture()
  await runReportSync(f.options)
  expect(f.calls[2].url.toString()).toBe(EDGE_FN_URL)
  expect(f.calls[2].url.toString()).not.toBe(REPORT_WEBHOOKS[2].url)
})

test('throws if edge function does not return a request_id', async () => {
  const f = fixture()
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    if (String(url) === EDGE_FN_URL) return new Response('accepted', { status: 202 })
    return new Response('result', { status: 202 })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('did not return a request_id')
})

test('throws if edge function does not return a job_id', async () => {
  const f = fixture()
  f.options.fetchRequest = (async (url, init) => {
    f.calls.push({ url: new URL(String(url)), init })
    // Returns request_id but no job_id
    if (String(url) === EDGE_FN_URL) return new Response(JSON.stringify({ request_id: 'req-1' }), { status: 202 })
    return new Response('result', { status: 202 })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('did not return a job_id')
})

test('onJobCreated is called with the job_id from the edge function response', async () => {
  const f = fixture()
  expect(f.jobIdReceived).toBeUndefined()
  await runReportSync(f.options)
  expect(f.jobIdReceived).toBe('job-1')
})

test('step 151 is marked accepted immediately after the edge function responds — no waiting', async () => {
  const f = fixture()
  await runReportSync(f.options)
  // 151 must be accepted; there must be no 'waiting' state for 151 (polling loop is gone)
  expect(f.statuses).toContain('151:accepted')
  expect(f.statuses).not.toContain('151:waiting')
})

test('step 150 is not dispatched by the browser — pg_cron handles it server-side', async () => {
  const f = fixture()
  await runReportSync(f.options)
  // Only 3 calls: 149, 152, edge-fn-151. 150 is NOT called by runReportSync.
  expect(f.calls).toHaveLength(3)
  const urls = f.calls.map(c => c.url.toString())
  expect(urls).not.toContain(REPORT_WEBHOOKS[3].url)
})
