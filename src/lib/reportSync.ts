export const REPORT_WEBHOOKS = [
  { id: '149', label: 'Calculations', url: 'https://pmc2p2c.app.n8n.cloud/webhook/5de723d8-6d7e-4439-aa88-2a13a1a45536' },
  { id: '152', label: 'Independent data sources', url: 'https://pmc2p2c.app.n8n.cloud/webhook/d5182053-5237-4c1a-acb2-3719de3b9d59' },
  { id: '151', label: 'Widget generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/c89518bf-c14f-4c4a-8711-1d506c39600c' },
  { id: '150', label: 'WR sections generator', url: 'https://pmc2p2c.app.n8n.cloud/webhook/912a4eb3-39cf-4f60-8a33-426406bee45c' },
] as const

export type SyncReport = { report_id: string; updated_at: string | null }
type StepStatus = 'loading' | 'accepted' | 'waiting' | 'error'

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
  onStep: (id: string, status: StepStatus) => void
  fetchRequest?: typeof fetch
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}) {
  const { schema, projectId, signal, readReport, onStep } = options
  if (!schema || schema === 'public' || !projectId) throw new Error('Select a project with its own schema before generating reports.')
  const request = options.fetchRequest ?? fetch
  const wait = options.wait ?? pause
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
      const response = await request(step.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_parameters: parameters }),
        signal,
      })
      if (response.status !== 200 && response.status !== 202) {
        const body = (await response.text()).slice(0, 4000)
        console.error(`[report sync] Webhook ${step.id} rejected`, { status: response.status, response: body })
        throw new Error(`Webhook ${step.id} (${step.label}) returned HTTP ${response.status}; expected 200 or 202.`)
      }
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
