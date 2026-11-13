import { useCallback, useEffect, useRef, useState } from 'react'
import { ReportDashboardForm } from '@/forms/ReportDashboardForm'
import { WeeklyReportForm } from '@/forms/WeeklyReportForm'
import { REPORT_WEBHOOKS, runReportSync } from '@/lib/reportSync'
import { calculationForWeek, diagnostics, differences, HISTORY_KEY, inspect, loadHistory, projects, projectWeek, reports, snapshot, TABLES } from './data'
import type { Event, Project, Report, Row, Run, Scope, Snapshot } from './data'

const views = ['Webhook console', 'Database outputs', 'Online Weekly Dashboard', 'Weekly Report', 'Weekly Dashboard', 'Run history'] as const
type View = typeof views[number]
type Action = 'sequence' | typeof REPORT_WEBHOOKS[number]['id']
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
const input = 'rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900'
const json = (value: unknown) => JSON.stringify(value, null, 2)
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoke-webhook-151`
const endpointDefaults = Object.fromEntries(REPORT_WEBHOOKS.map(step => [step.id, step.id === '151' ? edgeUrl : String(import.meta.env[`VITE_STAGING_WEBHOOK_${step.id}_URL`] || step.url)]))

function exportJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([json(value)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function JsonPanel({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{json(value)}</pre>
}

export default function StagingWorkspace() {
  const [projectList, setProjectList] = useState<Project[]>([])
  const [projectKey, setProjectKey] = useState('')
  const [reportList, setReportList] = useState<Report[]>([])
  const [reportId, setReportId] = useState('')
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [view, setView] = useState<View>('Webhook console')
  const [data, setData] = useState<Snapshot | null>(null)
  const [baseline, setBaseline] = useState<Snapshot | null>(null)
  const [monitor, setMonitor] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageWarning, setStorageWarning] = useState('')
  const [history, setHistory] = useState<Run[]>(loadHistory)
  const [steps, setSteps] = useState<Record<string, string>>({})
  const [review, setReview] = useState<Action | null>(null)
  const [endpoints, setEndpoints] = useState<Record<string, string>>(endpointDefaults)
  const [inspection, setInspection] = useState<unknown>(null)
  const [inspecting, setInspecting] = useState(false)
  const [renderVersion, setRenderVersion] = useState(0)
  const running = useRef(false)
  const refreshing = useRef('')
  const activeScope = useRef('')
  const mounted = useRef(true)
  const project = projectList.find(p => `${p.schema}:${p.id}` === projectKey)
  const report = reportList.find(r => r.report_id === reportId)
  const scope: Scope = { schema: project?.schema || '', projectId: project?.projectId || '', reportId }
  const scopeKey = json(scope)
  activeScope.current = scopeKey
  const locked = busy || review !== null
  const canCall149 = currentWeek != null && (!report || report.week_num === currentWeek)

  useEffect(() => {
    mounted.current = true
    let cancelled = false
    projects().then(p => { if (!cancelled) setProjectList(p) }).catch(e => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true; mounted.current = false }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20))) }
    catch { setStorageWarning('Local history could not be saved. Export the run before closing this page.') }
  }, [history])

  useEffect(() => {
    let cancelled = false
    setReportList([]); setReportId(''); setCurrentWeek(null); setData(null); setBaseline(null); setInspection(null); setMonitor(false); setSteps({}); setError('')
    if (!project) return
    setContextLoading(true)
    Promise.all([reports(project), projectWeek(project)]).then(([list, week]) => {
      if (cancelled) return
      setReportList(list); setCurrentWeek(week)
      // If this week's report does not exist, keep a deliberate "current week" target.
      setReportId(list.find(r => r.week_num === week)?.report_id || '')
    }).catch(e => { if (!cancelled) setError(errorMessage(e)) }).finally(() => { if (!cancelled) setContextLoading(false) })
    return () => { cancelled = true }
  // Project objects are stable entries in projectList.
  }, [project])

  const refresh = useCallback(async () => {
    const key = scopeKey
    if (!scope.schema || !scope.projectId || refreshing.current === key) return
    refreshing.current = key; setReading(true)
    try {
      const next = await snapshot(JSON.parse(key) as Scope)
      if (mounted.current && activeScope.current === key) setData(next)
    } catch (e) { if (mounted.current && activeScope.current === key) setError(errorMessage(e)) }
    finally {
      if (refreshing.current === key) refreshing.current = ''
      if (mounted.current && activeScope.current === key) setReading(false)
    }
  }, [scopeKey, scope.schema, scope.projectId])
  useEffect(() => {
    setData(null); setBaseline(null); setInspection(null)
    void refresh()
  }, [refresh])
  useEffect(() => {
    if (!monitor) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => { await refresh(); if (!stopped) timer = setTimeout(tick, 5000) }
    timer = setTimeout(tick, 5000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [monitor, refresh])

  const reloadWeeks = async () => {
    if (!project || busy) return
    const capturedKey = scopeKey
    setContextLoading(true)
    try {
      const [list, week] = await Promise.all([reports(project), projectWeek(project)])
      if (activeScope.current !== capturedKey) return
      setReportList(list); setCurrentWeek(week)
      if (!reportId) setReportId(list.find(r => r.week_num === week)?.report_id || '')
    } catch (e) { if (activeScope.current === capturedKey) setError(errorMessage(e)) }
    finally { if (mounted.current) setContextLoading(false) }
  }

  const patchRun = (id: string, patch: Partial<Run>) => setHistory(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const execute = async (action: Action) => {
    if (running.current || !project || contextLoading) return
    setReview(null)
    if ((action === '149' || action === 'sequence') && !canCall149) { setError('149 runs the current project week. Select the current week first.'); return }
    if (action !== '149' && action !== 'sequence' && !reportId) { setError('Select a calculation report first.'); return }
    running.current = true; setBusy(true); setError(''); setSteps({})
    const capturedProject = project
    const capturedScope = { ...scope }
    const capturedEndpoints = { ...endpoints }
    const id = crypto.randomUUID()
    const started = new Date().toISOString()
    const events: Event[] = []
    setHistory(prev => [{ id, scope: capturedScope, label: action === 'sequence' ? 'Full sequence' : `Webhook ${action}`, started, state: 'Running', events: [] }, ...prev].slice(0, 20))
    let resultingReportId = capturedScope.reportId
    let serverJobId: string | undefined
    // Log payloads and responses, never authorization headers or keys.
    const recordedFetch: typeof fetch = async (resource, init) => {
      const original = String(resource)
      const step = original === edgeUrl ? '151' : REPORT_WEBHOOKS.find(w => w.url === original)?.id
      const destination = step ? capturedEndpoints[step] : original
      const target = new URL(destination)
      if (target.protocol !== 'https:') throw new Error('Webhook URLs must use HTTPS.')
      if (step === '151' && destination !== edgeUrl) throw new Error('151 must use the configured Supabase Edge Function.')
      const event: Event = { step: step || action, url: destination, payload: typeof init?.body === 'string' ? JSON.parse(init.body) : null, started: new Date().toISOString(), durationMs: 0 }
      const time = performance.now()
      try {
        const response = await fetch(destination, init)
        event.status = response.status
        event.response = (await response.clone().text()).slice(0, 8000)
        return response
      } catch (e) { event.error = `${errorMessage(e)}. Dispatch outcome may be unknown; no automatic retry.`; throw e }
      finally {
        event.durationMs = Math.round(performance.now() - time); events.push(event)
        if (mounted.current) patchRun(id, { events: [...events] })
      }
    }
    try {
      if (action === '149' || action === 'sequence') {
        const liveWeek = await projectWeek(capturedProject)
        if (liveWeek !== currentWeek) throw new Error('The project current week changed. Reselect the project before dispatching 149.')
      }
      const before = await snapshot(capturedScope)
      patchRun(id, { before }); setBaseline(before)
      if (action === 'sequence') {
        const result = await runReportSync({ schema: project.schema, projectId: project.projectId,
          signal: new AbortController().signal,
          readReport: () => calculationForWeek(capturedProject, currentWeek!),
          onStep: (step, status) => { if (mounted.current) setSteps(prev => ({ ...prev, [step]: status })) },
          onJobCreated: jobId => { serverJobId = jobId; patchRun(id, { jobId }) },
          fetchRequest: recordedFetch,
        })
        resultingReportId = result.reportId
      } else {
        const parameters: Record<string, string> = { schema: project.schema, project_id: project.projectId }
        if (action !== '149') parameters.report_id = reportId
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (action === '151') headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        const originalUrl = action === '151' ? edgeUrl : REPORT_WEBHOOKS.find(w => w.id === action)!.url
        setSteps({ [action]: 'loading' })
        const response = await recordedFetch(originalUrl, { method: 'POST', headers, body: JSON.stringify({ flow_parameters: parameters }) })
        if (response.status !== 200 && response.status !== 202) throw new Error(`Webhook ${action}: HTTP ${response.status}. See response in run history. Do not retry without reviewing its outcome.`)
        if (action === '151') {
          const body = await response.json() as { job_id?: string }
          serverJobId = body.job_id
          if (!serverJobId) throw new Error('151 accepted without a job ID. Inspect the response before retrying.')
        }
        setSteps({ [action]: 'accepted' })
      }
      const list = await reports(capturedProject)
      if (action === '149') resultingReportId = list.find(r => r.week_num === currentWeek)?.report_id || resultingReportId
      if (mounted.current) { setReportList(list); setReportId(resultingReportId); setMonitor(true) }
      const after = await snapshot({ ...capturedScope, reportId: resultingReportId })
      if (mounted.current) {
        setData(after)
        patchRun(id, { scope: { ...capturedScope, reportId: resultingReportId }, state: serverJobId ? 'Handed off to server: outputs not confirmed' : 'HTTP accepted: outputs not confirmed', after, jobId: serverJobId, finished: new Date().toISOString() })
      }
    } catch (e) {
      if (mounted.current) { setError(errorMessage(e)); patchRun(id, { state: 'Stopped: review dispatch and outputs', error: errorMessage(e), finished: new Date().toISOString() }) }
    } finally { running.current = false; if (mounted.current) setBusy(false) }
  }

  const inspectRow = async (key: keyof typeof TABLES, row: Row) => {
    const captured = scopeKey
    setInspecting(true); setInspection(null)
    try {
      const full = await inspect(scope, key, row)
      if (activeScope.current === captured) setInspection(full)
    } catch (e) { if (activeScope.current === captured) setError(errorMessage(e)) }
    finally { if (mounted.current) setInspecting(false) }
  }
  const changedWeek = (value: string) => { setReportId(value); setMonitor(false); setSteps({}); setError(''); setRenderVersion(v => v + 1) }
  const preview = (step: string) => ({ flow_parameters: { schema: scope.schema, project_id: scope.projectId, ...(step !== '149' ? { report_id: reportId || '(resolved after 149)' } : {}) } })

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <div className="no-print sticky top-0 z-20 border-b border-amber-300 bg-amber-100 px-5 py-3 text-sm font-semibold">
      STAGING FRONTEND: connected to the same live Supabase database and schemas. Webhook calls change real data.
    </div>
    <header className="no-print mx-auto max-w-screen-2xl space-y-4 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">P6 functional workspace</p><h1 className="text-2xl font-bold">Reports and workflow diagnostics</h1></div><span className="rounded-full bg-white px-3 py-1 text-xs">{String(import.meta.env.VITE_SUPABASE_URL || 'Supabase URL not configured').replace(/^https?:\/\//, '')}</span></div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold">Project / schema<select className={input} value={projectKey} disabled={locked} onChange={e => setProjectKey(e.target.value)}><option value="">Select a project</option>{projectList.map(p => <option key={`${p.schema}:${p.id}`} value={`${p.schema}:${p.id}`}>{p.name} : {p.schema}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Reporting week<select className={input} value={reportId} disabled={locked || contextLoading || !project} onChange={e => changedWeek(e.target.value)}><option value="">Current project week {currentWeek ?? '?'} : no report selected</option>{reportList.map(r => <option key={r.report_id} value={r.report_id}>Week {r.week_num ?? '?'} : {r.data_date || 'No date'}</option>)}</select></label>
        <button className={button} disabled={locked || contextLoading || !project} onClick={() => void reloadWeeks()}>Reload weeks</button>
        <button className={button} disabled={reading || !project} onClick={() => void refresh()}>{reading ? 'Reading outputs…' : 'Refresh outputs'}</button>
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={monitor} disabled={!project} onChange={e => setMonitor(e.target.checked)} />Monitor every 5 seconds</label>
      </div>
      {project && <div className="break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">Schema: {scope.schema} | Project: {scope.projectId} | Selected week: {report?.week_num ?? currentWeek ?? '?'} | Current project week: {currentWeek ?? '?'}<br />Report ID: {reportId || 'Not selected / not generated'}<br />Design IDs: {data?.tables.designs?.rows.map(r => `${r.design_id} (approved: ${r.is_approved})`).join(', ') || 'Not loaded'}<br />Structure IDs: {data?.tables.structures?.rows.map(r => r.structure_id).join(', ') || 'Not loaded'}</div>}
      {(error || storageWarning) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{storageWarning && <p>{storageWarning}</p>}</div>}
      <nav className="flex flex-wrap gap-2" aria-label="Staging workspace">{views.map(v => <button key={v} className={`${button} ${view === v ? '!border-indigo-600 !bg-indigo-600 !text-white' : ''}`} onClick={() => { setView(v); setInspection(null) }}>{v}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-screen-2xl space-y-5 px-5 pb-10">
      {view === 'Webhook console' && <>
        <section className="space-y-4 rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Run workflows</h2><p className="text-sm text-slate-500">149 → 149B → 152 → 151. The server controls 150 after 151. HTTP acceptance is separate from output completion.</p></div><button className={`${button} !bg-indigo-600 !text-white`} disabled={locked || !project || contextLoading || !canCall149} onClick={() => setReview('sequence')}>Review full sequence</button></div>
        {!canCall149 && <p className="text-sm text-amber-800">149 and the full sequence operate on current project week {currentWeek ?? '?'}, not a historical week selected here.</p>}
        {REPORT_WEBHOOKS.map(step => <div key={step.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{step.id}: {step.label} <span className="text-xs font-normal text-indigo-600">{steps[step.id] || 'Not called from this page'}</span></h3><button className={button} disabled={locked || contextLoading || !project || (step.id === '149' ? !canCall149 : !reportId)} onClick={() => setReview(step.id)}>Review call</button></div><label className="block text-xs">{step.id === '151' ? 'Existing Supabase proxy endpoint' : 'Webhook endpoint'}<input className={`${input} mt-1 w-full font-mono text-xs`} value={endpoints[step.id]} readOnly={step.id === '151'} disabled={locked} onChange={e => setEndpoints(prev => ({ ...prev, [step.id]: e.target.value }))} /></label></div>)}
        <p className="text-xs text-slate-500">Individual calls bypass sequence prerequisites. A 151 call may cause the existing server processor to dispatch 150 automatically. Monitoring and refresh never dispatch webhooks. Stopping monitoring does not stop n8n.</p></section>
        {data && <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 font-bold">Output diagnostics</h2><p className="mb-3 text-xs text-slate-500">Observed at {data.at}. These checks inspect visible rows and metadata; they do not prove n8n execution completion or validate every AST.</p><ul className="list-disc space-y-2 pl-5 text-sm">{diagnostics(data).map((message, i) => <li key={i}>{message}</li>)}</ul></section>}
      </>}
      {view === 'Database outputs' && <>
        <section className="flex flex-wrap gap-3 rounded-xl border bg-white p-4"><button className={button} disabled={!data || reading} onClick={() => setBaseline(data)}>Capture comparison baseline</button><button className={button} disabled={!data} onClick={() => exportJson('p6-output-snapshot.json', data)}>Export snapshot</button><span className="self-center text-xs text-slate-500">Metadata only. Use Inspect to fetch a full JSON record on demand.</span></section>
        {baseline && data && <section className="rounded-xl border bg-white p-4"><h2 className="mb-2 font-bold">Metadata changes since {baseline.at}</h2>{differences(baseline, data).map((text, i) => <p className="text-sm" key={i}>{text}</p>)}</section>}
        {!reportId && <p>Select a calculation report to inspect its outputs.</p>}
        {data && Object.entries(data.tables).map(([key, bucket]) => <section className="rounded-xl border bg-white p-4" key={key}><h2 className="mb-2 font-bold">{key}: {bucket.rows.length} visible rows</h2>{bucket.error ? <p className="text-sm text-red-700">{bucket.error}. Check SELECT access/RLS or schema exposure; no data is fabricated.</p> : <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Identifier</th><th>Status / approval</th><th>Updated</th><th>Record</th></tr></thead><tbody>{bucket.rows.map((row, i) => <tr className="border-t" key={String(row.id ?? row.job_id ?? row.request_id ?? i)}><td className="break-all p-2">{String(row.widget_id ?? row.section_id ?? row.design_id ?? row.structure_id ?? row.job_id ?? row.request_id ?? row.report_id)}</td><td>{String(row.processing_status ?? row.status ?? row.report_status ?? `approved: ${row.is_approved ?? '?'}`)}</td><td>{String(row.updated_at ?? row.created_at ?? '')}</td><td><button className={button} disabled={inspecting} onClick={() => void inspectRow(key as keyof typeof TABLES, row)}>Inspect</button></td></tr>)}</tbody></table></div>}</section>)}
        {inspecting && <p>Loading full record…</p>}{inspection !== null && <section className="space-y-2"><button className={button} onClick={() => exportJson('p6-inspected-record.json', inspection)}>Export full record</button><JsonPanel value={inspection} /></section>}
      </>}
      {(['Online Weekly Dashboard', 'Weekly Report', 'Weekly Dashboard'] as View[]).includes(view) && <>
        <div className="no-print flex items-center gap-3"><button className={button} onClick={() => setRenderVersion(v => v + 1)}>Reload report view</button><span className="text-xs text-slate-500">Uses the existing renderer, pinned to the selected report.</span></div>
        {project && reportId ? view === 'Weekly Report' ? <WeeklyReportForm key={`${scopeKey}:${renderVersion}`} projectId={project.id} projectTextId={project.projectId} schemaName={project.schema} targetReportId={reportId} /> : <ReportDashboardForm key={`${view}:${scopeKey}:${renderVersion}`} projectId={project.id} projectTextId={project.projectId} schemaName={project.schema} a3Mode={view === 'Weekly Dashboard'} targetReportId={reportId} /> : <p>Select a project and an existing report first.</p>}
      </>}
      {view === 'Run history' && <>
        <div className="flex flex-wrap items-center gap-3"><button className={button} onClick={() => exportJson('p6-staging-run-history.json', history)}>Export run history</button><button className={button} disabled={busy} onClick={() => { if (window.confirm('Clear browser-local history? Database rows and workflows will not change.')) setHistory([]) }}>Clear local history</button><p className="text-xs text-slate-500">Last 20 calls/sequences, stored in this browser. Exports may contain project data. Reload never retries a call.</p></div>
        {!history.length && <p>No calls recorded in this browser yet.</p>}
        {history.map(run => <details className="rounded-xl border bg-white p-4" key={run.id} open={busy && run.state === 'Running'}><summary className="cursor-pointer text-sm font-semibold">{run.started}: {run.label}: {run.state}</summary><div className="mt-3 space-y-3"><p className="break-all text-xs">{run.scope.schema} / {run.scope.projectId} / {run.scope.reportId || 'Report not yet resolved'}{run.jobId && ` / Job ${run.jobId}`}</p>{run.error && <p className="text-sm text-red-700">{run.error}</p>}{run.events.map((event, i) => <details className="rounded-lg border p-3 text-xs" key={i}><summary className="cursor-pointer">{event.step}: HTTP {event.status ?? 'unknown'}: {event.durationMs} ms</summary><JsonPanel value={event} /></details>)}{run.before && run.after && <div className="text-xs">{differences(run.before, run.after).map((line, i) => <p key={i}>{line}</p>)}</div>}<button className={button} onClick={() => exportJson(`p6-run-${run.id}.json`, run)}>Export this run</button></div></details>)}
      </>}
    </main>
    {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-5" role="dialog" aria-modal="true" aria-labelledby="dispatch-title"><section className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto rounded-xl bg-white p-6"><h2 id="dispatch-title" className="text-xl font-bold">Review live webhook dispatch</h2><p className="text-sm">This writes to your existing database. Ensure another execution for this report is not already running. Closing this page or pausing monitoring will not cancel an accepted workflow.</p><p className="text-sm font-semibold">{project?.name} / {scope.schema} / Week {report?.week_num ?? currentWeek}</p>{(review === 'sequence' ? REPORT_WEBHOOKS.filter(s => s.id !== '150') : REPORT_WEBHOOKS.filter(s => s.id === review)).map(step => <div key={step.id}><p className="mb-1 break-all text-xs">POST {endpoints[step.id]}</p><JsonPanel value={preview(step.id)} /></div>)}{review === 'sequence' && <p className="text-sm">Later payloads use the report ID returned by the calculation lookup. Webhook 150 is delegated to the existing database processor.</p>}<div className="flex justify-end gap-3"><button className={button} onClick={() => setReview(null)}>Cancel</button><button className={`${button} !bg-indigo-600 !text-white`} onClick={() => { if (review) void execute(review) }}>Send {review === 'sequence' ? 'sequence' : review} once</button></div></section></div>}
  </div>
}
