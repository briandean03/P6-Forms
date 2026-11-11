import { test, expect } from '@playwright/test'
import { REPORT_WEBHOOKS, runReportSync, type SyncReport, type SyncWidget, type SyncStructure } from '../src/lib/reportSync'
import { readAppLocation } from '../src/lib/appNavigation'

// ── Shared test data ──────────────────────────────────────────────────────────

const old = { report_id: 'r54', updated_at: '2026-01-01' }
const fresh = { ...old, updated_at: '2026-01-02' }

// Edge function URLs used instead of direct n8n calls for webhook 151
const EDGE_FN_URL = 'https://example.supabase.co/functions/v1/invoke-webhook-151'
const RELEASE_FN_URL = 'https://example.supabase.co/functions/v1/release-webhook-151-lock'

// Default "ready" widget — baseline updated_at differs from 'ts-old' so it counts as fresh
const READY_WIDGET: SyncWidget = {
  widget_id: 'W1',
  processing_status: 'validated',
  updated_at: 'ts-new',
  widget_ast: { x: 1 },
}

// Default "ready" structure — updated_at differs from baseline, report_id matches
const READY_STRUCTURE: SyncStructure = {
  structure_id: 's1',
  a3_layout: { dashboard_context: { report_id: 'r54' } },
  updated_at: 'ts-new',
  expectedWidgetIds: ['W1'],
}

// Baseline snapshots representing pre-dispatch state (used by beforeStep151)
const BASELINE_WIDGET: SyncWidget = {
  widget_id: 'W1',
  processing_status: 'pending',
  updated_at: 'ts-old',
  widget_ast: null,
}
const BASELINE_STRUCTURE: SyncStructure = {
  structure_id: 's1',
  a3_layout: null,
  updated_at: 'ts-old',
  expectedWidgetIds: ['W1'],
}

// ── Fixture factory ───────────────────────────────────────────────────────────

function fixture(status = 202) {
  const calls: { url: URL; init?: RequestInit }[] = []
  const statuses: string[] = []
  const progressMessages: string[] = []
  const controller = new AbortController()
  let reads = 0
  let lockReleased = false
  return {
    calls, statuses, progressMessages, controller,
    get lockReleased() { return lockReleased },
    options: {
      schema: 'other_project', projectId: 'P2', signal: controller.signal,
      readReport: async (): Promise<SyncReport | null> => reads++ === 0 ? old : fresh,
      onStep: (id: string, state: string) => { statuses.push(`${id}:${state}`) },
      onProgress: (_id: string, detail: string) => { progressMessages.push(detail) },
      wait: async () => {},
      edgeFunctionUrl: EDGE_FN_URL,
      // fetchRequest returns JSON body for the edge function call (which needs request_id),
      // and plain text for all other webhook calls.
      fetchRequest: (async (url, init) => {
        calls.push({ url: new URL(String(url)), init })
        const isEdgeFn = String(url) === EDGE_FN_URL
        const body = isEdgeFn ? JSON.stringify({ request_id: 'req-1' }) : 'result'
        return new Response(body, { status })
      }) as typeof fetch,
      // Webhook 151 callbacks: defaults return "already ready" state so existing tests pass.
      readWidgets: async (): Promise<SyncWidget[]> => [READY_WIDGET],
      readStructure: async (): Promise<SyncStructure> => READY_STRUCTURE,
      beforeStep151: async () => ({
        widgets: [BASELINE_WIDGET],
        structure: BASELINE_STRUCTURE,
      }),
      releaseLock: async (_requestId: string) => { lockReleased = true },
    },
  }
}

// ── Existing tests (maintained) ───────────────────────────────────────────────

test('restores the project, tab and schema from a section deep link', () => {
  expect(readAppLocation(new URL('https://example.com/?view=app&project=uuid&schema=other&tab=weekly_report&report=r54#section-SEC-012'), ['dashboard', 'weekly_report'])).toEqual({ view: 'app', activeTab: 'weekly_report', selectedProjectId: 'uuid', selectedSchemaName: 'other' })
  expect(readAppLocation(new URL('https://example.com/'), ['dashboard']).view).toBe('home')
})

test('posts sequentially in 149/152/151(edge fn)/150 order with the n8n flow_parameters JSON body', async () => {
  const f = fixture()
  expect(await runReportSync(f.options)).toBe('r54')
  // Webhook 151 goes to the edge function URL, not the n8n URL
  expect(f.calls[0].url.toString()).toBe(REPORT_WEBHOOKS[0].url)
  expect(f.calls[1].url.toString()).toBe(REPORT_WEBHOOKS[1].url)
  expect(f.calls[2].url.toString()).toBe(EDGE_FN_URL)
  expect(f.calls[3].url.toString()).toBe(REPORT_WEBHOOKS[3].url)
  for (const [index, call] of f.calls.entries()) {
    expect(call.init?.method).toBe('POST')
    expect(call.url.search).toBe('')
    expect(JSON.parse(String(call.init?.body))).toEqual({ flow_parameters: {
      schema: 'other_project', project_id: 'P2', ...(index ? { report_id: 'r54' } : {}),
    } })
  }
  // Calls 0, 1, 3 (non-151) have no Authorization header
  expect((f.calls[0].init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined()
  expect((f.calls[1].init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined()
  expect((f.calls[3].init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined()
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
    return new Response(isEdgeFn ? JSON.stringify({ request_id: 'req-1' }) : '', { status: 202 })
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
<<<<<<< HEAD
=======

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
    const isEdgeFn = String(url) === EDGE_FN_URL
    const body = isEdgeFn ? JSON.stringify({ request_id: 'req-1' }) : ''
    return new Response(body, { status: f.calls.length % 2 ? 200 : 202 })
  }) as typeof fetch
  expect(await runReportSync(f.options)).toBe('r54')
  expect(f.calls).toHaveLength(4)
})

// ── New tests for webhook 151 edge-function path ──────────────────────────────

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
    // Edge function returns 202 but no JSON body
    if (String(url) === EDGE_FN_URL) return new Response('accepted', { status: 202 })
    return new Response('result', { status: 202 })
  }) as typeof fetch
  await expect(runReportSync(f.options)).rejects.toThrow('did not return a request_id')
})

test('polls readWidgets and readStructure until all expected widgets are freshly validated and layout is ready', async () => {
  const f = fixture()
  let widgetCalls = 0
  let structureCalls = 0
  // First 2 polls return unready state; 3rd returns ready
  f.options.readWidgets = async () => {
    widgetCalls++
    return widgetCalls < 3
      ? [{ ...BASELINE_WIDGET }]  // same updated_at as baseline → not fresh
      : [READY_WIDGET]
  }
  f.options.readStructure = async () => {
    structureCalls++
    return structureCalls < 3
      ? { ...BASELINE_STRUCTURE }  // no a3_layout, old timestamp
      : READY_STRUCTURE
  }
  await runReportSync(f.options)
  expect(widgetCalls).toBeGreaterThanOrEqual(3)
  expect(structureCalls).toBeGreaterThanOrEqual(3)
  expect(f.statuses).toContain('151:waiting')
  expect(f.statuses).toContain('151:accepted')
  expect(f.calls).toHaveLength(4)
})

test('a widget with matching updated_at as baseline does not count as freshly generated', async () => {
  const f = fixture()
  let attempt = 0
  f.options.readWidgets = async () => {
    attempt++
    // Widget exists and is validated but updated_at never changes from baseline
    return [{ widget_id: 'W1', processing_status: 'validated', updated_at: 'ts-old', widget_ast: { x: 1 } }]
  }
  f.options.readStructure = async () => READY_STRUCTURE  // layout is always ready
  await expect(runReportSync(f.options)).rejects.toThrow('Readiness could not be confirmed')
  expect(attempt).toBe(200)  // exhausted all polls
  expect(f.statuses.at(-1)).toBe('151:error')
})

test('a widget with an empty widget_ast does not count as usable', async () => {
  const f = fixture()
  f.options.readWidgets = async () => [
    { widget_id: 'W1', processing_status: 'validated', updated_at: 'ts-new', widget_ast: {} },
  ]
  f.options.readStructure = async () => READY_STRUCTURE
  await expect(runReportSync(f.options)).rejects.toThrow('Readiness could not be confirmed')
})

test('a structure a3_layout with dashboard_context.report_id not matching does not satisfy layout readiness', async () => {
  const f = fixture()
  f.options.readStructure = async () => ({
    structure_id: 's1',
    a3_layout: { dashboard_context: { report_id: 'different-report-id' } },
    updated_at: 'ts-new',
    expectedWidgetIds: ['W1'],
  })
  await expect(runReportSync(f.options)).rejects.toThrow('Readiness could not be confirmed')
})

test('structure with no expectedWidgetIds throws immediately without polling', async () => {
  const f = fixture()
  f.options.readStructure = async () => ({
    structure_id: 's1',
    a3_layout: { dashboard_context: { report_id: 'r54' } },
    updated_at: 'ts-new',
    expectedWidgetIds: [],  // empty — no widgets expected
  })
  await expect(runReportSync(f.options)).rejects.toThrow('no expected widgets in its structure_plan')
})

test('releaseLock is called after confirmed readiness', async () => {
  const f = fixture()
  expect(f.lockReleased).toBe(false)
  await runReportSync(f.options)
  expect(f.lockReleased).toBe(true)
})

test('releaseLock is called even when polling times out', async () => {
  const f = fixture()
  let lockReleased = false
  f.options.releaseLock = async () => { lockReleased = true }
  f.options.readWidgets = async () => []  // never any widgets — will time out
  f.options.readStructure = async () => READY_STRUCTURE
  await expect(runReportSync(f.options)).rejects.toThrow('Readiness could not be confirmed')
  expect(lockReleased).toBe(true)
})

test('releaseLock is called when the signal is aborted during polling', async () => {
  const f = fixture()
  let lockReleased = false
  f.options.releaseLock = async () => { lockReleased = true }
  let callCount = 0
  f.options.readWidgets = async () => {
    callCount++
    if (callCount === 2) f.controller.abort()
    return []
  }
  f.options.readStructure = async () => READY_STRUCTURE
  await expect(runReportSync(f.options)).rejects.toThrow()
  expect(lockReleased).toBe(true)
})

test('onProgress receives progress messages during polling', async () => {
  const f = fixture()
  let widgetCalls = 0
  f.options.readWidgets = async () => {
    widgetCalls++
    return widgetCalls < 3 ? [] : [READY_WIDGET]
  }
  f.options.readStructure = async () => widgetCalls < 3 ? BASELINE_STRUCTURE : READY_STRUCTURE
  await runReportSync(f.options)
  // At least one progress message should mention "0 of 1" and one should mention "A3 layout ready"
  expect(f.progressMessages.some(m => m.includes('of 1'))).toBe(true)
})

test('webhook 150 is not called if webhook 151 readiness times out', async () => {
  const f = fixture()
  f.options.readWidgets = async () => []
  f.options.readStructure = async () => READY_STRUCTURE
  await expect(runReportSync(f.options)).rejects.toThrow('Readiness could not be confirmed')
  // Should have 3 calls: 149, 152, edge-fn-151 — but NOT 150
  expect(f.calls).toHaveLength(3)
  expect(f.calls[2].url.toString()).toBe(EDGE_FN_URL)
})
>>>>>>> 034abb1 (create functions and architecutre to know when the webhook ends)
