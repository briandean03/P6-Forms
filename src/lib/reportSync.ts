export const REPORT_WEBHOOKS = [
  { id: '149', label: 'Calculations', url: 'https://pmc2p2c.app.n8n.cloud/webhook/5de723d8-6d7e-4439-aa88-2a13a1a45536' },
  { id: '152', label: 'Independent data sources', url: 'https://pmc2p2c.app.n8n.cloud/webhook/d5182053-5237-4c1a-acb2-3719de3b9d59' },
  { id: '151', label: 'Widget generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/c89518bf-c14f-4c4a-8711-1d506c39600c' },
  { id: '150', label: 'WR sections generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/912a4eb3-39cf-4f60-8a33-426406bee45c' },
] as const

export type SyncReport = { report_id: string; updated_at: string | null }

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

export async function runReportSync(options: {
  schema: string
  projectId: string
  signal: AbortSignal
  readReport: () => Promise<SyncReport | null>
  onStep: (id: string, status: StepStatus) => void
  // Called with the job_id returned by the edge function so the caller can
  // subscribe to Realtime updates on dbp6_0008_report_jobs.
  onJobCreated?: (jobId: string) => void
  // Testability overrides
  fetchRequest?: typeof fetch
  edgeFunctionUrl?: string
  waitMs?: number  // poll interval for webhook 149; defaults to 3000
}): Promise<{ reportId: string; jobId: string }> {
  const { schema, projectId, signal, readReport, onStep } = options
  if (!schema || schema === 'public' || !projectId)
    throw new Error('Select a project with its own schema before generating reports.')

  const request = options.fetchRequest ?? fetch
  const edgeFunctionUrl =
    options.edgeFunctionUrl ??
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoke-webhook-151`

  let step: typeof REPORT_WEBHOOKS[number] = REPORT_WEBHOOKS[0]
  let reportId: string | undefined
  let jobId: string | undefined

  try {
    onStep(step.id, 'loading')
    // Snapshot first: never pass an old report to later steps just because 149
    // accepted the request. updated_at is maintained by the calculations table.
    const before = await readReport()

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
        const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY
        if (anonKey) headers['Authorization'] = `Bearer ${anonKey}`
      }

      const response = await request(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ flow_parameters: parameters }),
        signal,
      })
      if (response.status !== 202) {
        const body = (await response.text()).slice(0, 4000)
        console.error(`[report sync] Webhook ${step.id} rejected`, { status: response.status, response: body })
        throw new Error(`Webhook ${step.id} (${step.label}) returned HTTP ${response.status}; expected 202.`)
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
          await new Promise<void>(resolve => setTimeout(resolve, options.waitMs ?? 3000))
        }
        if (!reportId) throw new Error('Calculations were accepted, but no new or updated report became visible for this project and week within two minutes. Check workflow 149 and SELECT access/RLS on weekly_reports_calculations. Later webhooks were not called.')
      }

      // ── Webhook 151: hand off to server-side orchestration ────────────────────────
      // The edge function inserts a lock row and a job row, dispatches n8n in the
      // background, and returns { request_id, job_id } immediately. pg_cron handles
      // the readiness polling and webhook 150 dispatch server-side.
      if (step.id === '151') {
        let requestId151: string | undefined
        let jobId151: string | undefined
        try {
          const responseBody = await response.json() as { request_id?: string; job_id?: string }
          requestId151 = responseBody.request_id
          jobId151 = responseBody.job_id
        } catch { /* non-JSON 202 response */ }
        if (!requestId151)
          throw new Error('Edge function (invoke-webhook-151) did not return a request_id in the response body.')
        if (!jobId151)
          throw new Error('Edge function (invoke-webhook-151) did not return a job_id in the response body.')

        jobId = jobId151
        options.onJobCreated?.(jobId151)
        // No polling loop. pg_cron picks up the job row and drives 151→150 server-side.
        // Webhook 150 will NOT be dispatched by this function — break out of the loop.
        onStep(step.id, 'accepted')
        break
      }

      onStep(step.id, 'accepted')
    }
    return { reportId: reportId!, jobId: jobId! }
  } catch (error) {
    if (!signal.aborted) {
      onStep(step.id, 'error')
      console.error(`[report sync] Stopped at webhook ${step.id} (${step.label})`, error)
    }
    throw error
  }
}
