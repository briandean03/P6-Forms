export const REPORT_WEBHOOKS = [
  { id: '149', label: 'Calculations', url: 'https://pmc2p2c.app.n8n.cloud/webhook/5de723d8-6d7e-4439-aa88-2a13a1a45536' },
  { id: '152', label: 'Independent data sources', url: 'https://pmc2p2c.app.n8n.cloud/webhook/d5182053-5237-4c1a-acb2-3719de3b9d59' },
  { id: '151', label: 'Widget generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/c89518bf-c14f-4c4a-8711-1d506c39600c' },
  { id: '150', label: 'WR sections generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/912a4eb3-39cf-4f60-8a33-426406bee45c' },
] as const

export type SyncReport = { report_id: string; updated_at: string | null }

// Widget row returned during the step-151 polling loop.
export type SyncWidget = {
  widget_id: string
  processing_status: string
  updated_at: string
  widget_ast: unknown   // raw column value — may arrive as a JSON-encoded string from Supabase
}

// Structure row returned during the step-151 polling loop.
// expectedWidgetIds must be extracted from structure_plan.pages[].widgets[].widget_id
// by the caller (ProjectDataForm) before returning this object.
export type SyncStructure = {
  structure_id: string
  a3_layout: unknown   // raw column value — may arrive as a JSON-encoded string from Supabase
  updated_at: string
  expectedWidgetIds: string[]
}

export type Webhook151Baselines = {
  widgets: SyncWidget[]
  structure: SyncStructure | null
}

type StepStatus = 'loading' | 'accepted' | 'waiting' | 'error'

// Safely decodes a JSON column that may arrive as a plain object, a JSON string,
// or a double-encoded JSON string from Supabase.
export function parseJsonField(raw: unknown): unknown {
  if (raw == null || (typeof raw === 'object' && !Array.isArray(raw))) return raw
  if (typeof raw === 'string') {
    try {
      const once = JSON.parse(raw)
      return typeof once === 'string' ? JSON.parse(once) : once
    } catch { return null }
  }
  return null
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function runReportSync(options: {
  schema: string
  projectId: string
  signal: AbortSignal
  readReport: () => Promise<SyncReport | null>
  // Required for step 151 — called at polling time to read current widget rows.
  readWidgets: (reportId: string) => Promise<SyncWidget[]>
  // Required for step 151 — called at polling time to read current structure row.
  // Must return expectedWidgetIds parsed from structure_plan.
  readStructure: (reportId: string) => Promise<SyncStructure | null>
  // Required for step 151 — called immediately before dispatching 151 to capture baselines.
  beforeStep151: (reportId: string) => Promise<Webhook151Baselines>
  // Required for step 151 — called in all exit paths to release the in-flight lock.
  releaseLock: (requestId: string) => Promise<void>
  onStep: (id: string, status: StepStatus) => void
  // Optional: receives human-readable progress strings during step-151 polling.
  onProgress?: (id: string, detail: string) => void
  // Testability overrides
  fetchRequest?: typeof fetch
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  edgeFunctionUrl?: string
}) {
  const { schema, projectId, signal, readReport, onStep } = options
  if (!schema || schema === 'public' || !projectId)
    throw new Error('Select a project with its own schema before generating reports.')

  const request = options.fetchRequest ?? fetch
  const wait = options.wait ?? pause
  const edgeFunctionUrl =
    options.edgeFunctionUrl ??
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoke-webhook-151`

  let step: typeof REPORT_WEBHOOKS[number] = REPORT_WEBHOOKS[0]
  try {
    onStep(step.id, 'loading')
    // Snapshot first: never pass an old report to later steps just because 149
    // accepted the request. updated_at is maintained by the calculations table.
    const before = await readReport()
    let reportId: string | undefined

    for (step of REPORT_WEBHOOKS) {
      signal.throwIfAborted()
      onStep(step.id, 'loading')

      // n8n reads these fields from $json.body.flow_parameters.
      const parameters: Record<string, string> = { schema, project_id: projectId }
      if (step.id !== '149') {
        if (!reportId) throw new Error('No calculation report ID is available.')
        parameters.report_id = reportId
      }

      // Webhook 151 is routed to the Supabase Edge Function proxy to avoid
      // the Cloudflare 524 timeout that occurs when calling n8n directly.
      const targetUrl = step.id === '151' ? edgeFunctionUrl : step.url

      // The edge function requires an Authorization header (Supabase anon key).
      // Other webhooks (149, 152, 150) go directly to n8n and need no auth header.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (step.id === '151') {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        if (anonKey) headers['Authorization'] = `Bearer ${anonKey}`
      }

      const response = await request(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ flow_parameters: parameters }),
        signal,
      })
      if (response.status !== 200 && response.status !== 202) {
        const body = (await response.text()).slice(0, 4000)
        console.error(`[report sync] Webhook ${step.id} rejected`, { status: response.status, response: body })
        throw new Error(`Webhook ${step.id} (${step.label}) returned HTTP ${response.status}; expected 200 or 202.`)
      }

      // ── Webhook 149: poll until a new/updated calculation report appears ──────────
      if (step.id === '149') {
        onStep(step.id, 'waiting')
        for (let attempt = 0; attempt < 40; attempt++) {
          signal.throwIfAborted()
          const report = await readReport()
          if (report && (!before || report.report_id !== before.report_id || report.updated_at !== before.updated_at)) {
            reportId = report.report_id
            break
          }
          await wait(3000, signal)
        }
        if (!reportId) throw new Error('Calculations were accepted, but no new or updated report became visible for this project and week within two minutes. Check workflow 149 and SELECT access/RLS on weekly_reports_calculations. Later webhooks were not called.')
      }

      // ── Webhook 151: poll until all expected widget outputs and A3 layout are ready ─
      if (step.id === '151') {
        // Verify all required callbacks were supplied — fail immediately if not.
        if (!options.readWidgets || !options.readStructure || !options.beforeStep151 || !options.releaseLock)
          throw new Error('readWidgets, readStructure, beforeStep151, and releaseLock are required for step 151.')

        // Extract the request_id the edge function returned in the 202 body.
        let requestId151: string | undefined
        try {
          const responseBody = await response.json() as { request_id?: string }
          requestId151 = responseBody.request_id
        } catch {
          // Non-JSON 202 response — cannot track the lock
        }
        if (!requestId151)
          throw new Error('Edge function (invoke-webhook-151) did not return a request_id in the response body.')

        // Capture baseline state immediately before polling begins.
        const baselines = await options.beforeStep151(reportId!)
        const beforeWidgetMap = new Map(baselines.widgets.map(w => [w.widget_id, w.updated_at]))
        const beforeStructureUpdatedAt = baselines.structure?.updated_at ?? null

        onStep(step.id, 'waiting')

        // 200 polls × 3 s = 10 minutes maximum wait.
        const POLL_ATTEMPTS = 200
        let confirmed = false
        let lastDetail = ''

        try {
          for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
            signal.throwIfAborted()

            // Re-evaluate both widgets and structure together on every poll.
            // Do not permanently latch partial readiness from an earlier iteration.
            const [currentWidgets, currentStructure] = await Promise.all([
              options.readWidgets(reportId!),
              options.readStructure(reportId!),
            ])

            // ── Widget readiness ────────────────────────────────────────────────
            // Expected widget IDs come from structure_plan.pages[].widgets[].widget_id,
            // already resolved and returned in SyncStructure.expectedWidgetIds by the caller.
            if (!currentStructure || currentStructure.expectedWidgetIds.length === 0) {
              throw new Error(
                'Readiness could not be confirmed: the approved structure for this report ' +
                'has no expected widgets in its structure_plan.'
              )
            }
            const expectedIds = new Set(currentStructure.expectedWidgetIds)

            // Build a deduplicated map: widget_id → best row (prefer validated + fresh)
            // to guard against a repeated update to one widget inflating the count.
            const freshValidatedIds = new Set<string>()
            for (const w of currentWidgets) {
              if (!expectedIds.has(w.widget_id)) continue
              if (w.processing_status !== 'validated') continue
              // Must be freshly written since the baseline — same updated_at means no new generation.
              if (w.updated_at === beforeWidgetMap.get(w.widget_id)) continue
              // widget_ast must be a usable non-empty object.
              const ast = parseJsonField(w.widget_ast)
              if (ast == null || typeof ast !== 'object' || Array.isArray(ast)) continue
              if (Object.keys(ast as object).length === 0) continue
              freshValidatedIds.add(w.widget_id)
            }
            const widgetsDone = freshValidatedIds.size === expectedIds.size

            // ── A3 layout readiness ─────────────────────────────────────────────
            // The layout must be:
            //   1. Non-null and parseable.
            //   2. dashboard_context.report_id must match the current reportId (proves it was
            //      written for this run, not carried over from a previous one).
            //   3. The structure's updated_at must have changed since the baseline (fresh write).
            const rawLayout = parseJsonField(currentStructure.a3_layout)
            const layout = rawLayout as Record<string, unknown> | null
            const ctx = layout?.dashboard_context as Record<string, unknown> | undefined
            const layoutMatchesReport = typeof ctx?.report_id === 'string' && ctx.report_id === reportId
            const layoutIsFresh =
              currentStructure.updated_at !== beforeStructureUpdatedAt
            const layoutDone = layout != null && layoutMatchesReport && layoutIsFresh

            // ── Progress update ─────────────────────────────────────────────────
            const detail =
              `Widget outputs ready: ${freshValidatedIds.size} of ${expectedIds.size}` +
              (layoutDone ? '; A3 layout ready.' : '; waiting for A3 layout.')
            if (detail !== lastDetail) {
              options.onProgress?.(step.id, detail)
              lastDetail = detail
            }

            if (widgetsDone && layoutDone) {
              confirmed = true
              break
            }

            await wait(3000, signal)
          }
        } finally {
          // Release the in-flight lock in ALL exit paths: confirmed, timed out, aborted, or error.
          await options.releaseLock(requestId151).catch(err =>
            console.error('[report sync] Failed to release webhook 151 lock', requestId151, err))
        }

        if (!confirmed) {
          throw new Error(
            'Readiness could not be confirmed: the required widget outputs ' +
            '(processing_status = validated, fresh updated_at, non-empty widget_ast) ' +
            'and/or the structure a3_layout (dashboard_context.report_id matching and ' +
            'updated_at fresher than baseline) did not appear within ten minutes. ' +
            'Check workflow 151 and SELECT access/RLS on ' +
            'dbp6_0008_dashboard_widgets and dbp6_0008_dashboard_structures. ' +
            'Webhook 150 was not called.'
          )
        }
      }

      onStep(step.id, 'accepted')
    }
    return reportId!
  } catch (error) {
    if (!signal.aborted) {
      onStep(step.id, 'error')
      console.error(`[report sync] Stopped at webhook ${step.id} (${step.label})`, error)
    }
    throw error
  }
}
