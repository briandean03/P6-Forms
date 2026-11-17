import { useEffect, useMemo, useState } from 'react'
import { schemaClient } from '@/lib/supabase'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useNotification } from '@/hooks/useNotification'
import { safetyCategories, periodFields, statusFields, metricId, parseSafetyNumber, metricWarning, type SafetyMetric, type MetricValues } from '@/lib/safetyStatistics'

const PROJECT = 'dbp6_0000_projectdata'
const HEADER = 'dbp6_0009_safety_stat_inputs'
const LINES = 'dbp6_0009_safety_stat_input_lines'
const CATALOGUE = 'dbp6_0009_safety_metric_catalogue'
const OUTPUT = 'dbp6_0009_safety_statistics'
const headerFields = [['report_no', 'Report no.'], ['project_no', 'Project no.'], ['source_reference', 'Source reference'], ['revision', 'Revision'], ['contractor_name', 'Contractor name'], ['prepared_by', 'Prepared by'], ['reviewed_by', 'Reviewed by'], ['source_file_name', 'Source file name']] as const
type Header = { id: string; project_id: string; data_date: string; week_num: number; status: 'draft' | 'submitted'; submitted_at: string | null; created_at: string } & Record<typeof headerFields[number][0], string | null>
type Line = { category: string; metric_key: string } & Partial<Record<typeof periodFields[number] | typeof statusFields[number], number | null>>
type StatisticsHistory = { statistics_id: string; project_id: string; data_date: string; week_num: number | null; source_reference: string | null; prepared_by: string | null; processing_status: string; is_approved: boolean; created_at: string; updated_at: string }
type Output = { report_id?: string | null; statistics: unknown; data_quality?: unknown }
const inputClass = 'w-full border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100'

export function SafetyStatisticsForm({ projectTextId, schemaName }: { projectTextId: string; schemaName: string }) {
  // These project tables are not yet included in the generated Database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = useMemo(() => schemaClient(schemaName) as any, [schemaName])
  const [catalogue, setCatalogue] = useState<SafetyMetric[]>([])
  const [history, setHistory] = useState<StatisticsHistory[]>([])
  const [inputReports, setInputReports] = useState<Header[]>([])
  const [historyOutput, setHistoryOutput] = useState<(StatisticsHistory & Output) | null>(null)
  const [header, setHeader] = useState<Header | null>(null)
  const [values, setValues] = useState<Record<string, MetricValues>>({})
  const [output, setOutput] = useState<Output | null>(null)
  const [outputMissing, setOutputMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [currentProject, setCurrentProject] = useState<{ week: number; dataDate: string } | null>(null)
  const [discardReport, setDiscardReport] = useState<Header | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const { notification, showSuccess, hideNotification } = useNotification()

  // Keep database messages intact; add the exact table when grants are missing.
  async function checked<T>(table: string, request: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
    const result = await request
    if (result.error) throw new Error(result.error.message + (/permission|row.level security|42501/i.test(result.error.message + result.error.code) ? ` — Check grants/RLS on ${schemaName}.${table}.` : ''))
    return result.data
  }
  const fail = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))
  async function loadHistory() {
    const rows = await checked<Header[]>(HEADER, db.from(HEADER).select('*').eq('project_id', projectTextId).order('created_at', { ascending: false }))
    setInputReports(rows ?? [])
    const statistics = await checked<StatisticsHistory[]>(OUTPUT, db.from(OUTPUT).select('statistics_id,project_id,data_date,week_num,source_reference,prepared_by,processing_status,is_approved,created_at,updated_at').eq('project_id', projectTextId).order('data_date', { ascending: false }))
    setHistory(statistics ?? [])
  }
  async function findWeekReport(week: number) {
    return checked<Header | null>(HEADER, db.from(HEADER).select('*').eq('project_id', projectTextId).eq('week_num', week).order('created_at', { ascending: false }).limit(1).maybeSingle())
  }
  async function showCurrentWeek() {
    if (!currentProject) return
    const report = await findWeekReport(currentProject.week)
    if (report) await openReport(report)
    else { setHeader(null); setValues({}); setDirty(false); setOutput(null); setOutputMissing(false) }
  }
  async function startReport() {
    if (!currentProject) return
    const result = await db.from(HEADER).insert({ project_id: projectTextId, status: 'draft' }).select().single()
    if (result.error?.code === '23505') {
      const existing = await findWeekReport(currentProject.week)
      if (!existing) throw new Error('A report already exists for this data date, but no report was found for the current week. Refresh the project reporting settings and try again.')
      await openReport(existing)
    } else {
      const created = await checked<Header>(HEADER, Promise.resolve(result))
      await openReport(created)
    }
    await loadHistory()
  }
  async function readOutput(report: Header) {
    setOutput(null); setOutputMissing(false)
    const result = await checked<Output | null>(OUTPUT, db.from(OUTPUT).select('*').eq('project_id', report.project_id).eq('data_date', report.data_date).maybeSingle())
    setOutput(result); setOutputMissing(!result)
  }
  async function openReport(report: Header, metrics = catalogue) {
    const lines = await checked<Line[]>(LINES, db.from(LINES).select('*').eq('input_id', report.id))
    const next: Record<string, MetricValues> = {}
    if (report.status === 'draft') {
      for (const metric of metrics) {
        const fields = metric.kind === 'period' ? periodFields : statusFields
        next[metricId(metric)] = Object.fromEntries(fields.map(field => [field, '0']))
      }
    }
    for (const line of lines ?? []) next[metricId(line)] = Object.fromEntries([...periodFields, ...statusFields].map(field => [field, line[field] == null ? '' : String(line[field])]))
    setHeader(report); setValues(next); setDirty(report.status === 'draft' && metrics.some(metric => !(lines ?? []).some(line => metricId(line) === metricId(metric)))); setOutput(null); setOutputMissing(false)
    if (report.status === 'submitted') await readOutput(report)
  }
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        const project = await checked<{ dgt_current_weeknum: number | null; dgt_datadate: string | null } | null>(PROJECT, db.from(PROJECT).select('dgt_current_weeknum,dgt_datadate').eq('dgt_projectid', projectTextId).maybeSingle())
        if (!active) return
        if (project?.dgt_current_weeknum == null || !project.dgt_datadate) throw new Error('Set the current week and data date in project data before starting a safety report.')
        setCurrentProject({ week: project.dgt_current_weeknum, dataDate: project.dgt_datadate })
        const metrics = await checked<SafetyMetric[]>(CATALOGUE, db.from(CATALOGUE).select('*').order('sort_order'))
        if (!active) return
        setCatalogue(metrics ?? [])
        await loadHistory()
        if (!active) return
        const report = await findWeekReport(project.dgt_current_weeknum)
        if (!active) return
        if (report) await openReport(report, metrics ?? [])
        if (active) setReady(true)
      } catch (reason) { if (active) fail(reason) }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [db, projectTextId])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = '' } }
    const leave = (event: Event) => { if ((dirty || busy) && !window.confirm(busy ? 'A report operation is in progress. Leave this page?' : 'Discard unsaved Safety Statistics changes?')) event.preventDefault() }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('app:before-navigate', leave)
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('app:before-navigate', leave) }
  }, [dirty, busy])
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError('')
    try { await operation() } catch (reason) { fail(reason) } finally { setBusy(false) }
  }
  const fieldsFor = (metric: SafetyMetric) => metric.kind === 'period' ? periodFields : statusFields
  let invalid = false
  let emptyCount = 0
  for (const metric of catalogue) {
    try { if (fieldsFor(metric).map(field => parseSafetyNumber(values[metricId(metric)]?.[field] ?? '')).every(value => value === null)) emptyCount++ }
    catch { invalid = true }
  }
  async function save(submit: boolean) {
    if (!header || invalid || header.status !== 'draft') return
    const editable = Object.fromEntries(headerFields.map(([field]) => [field, header[field] || null]))
    await checked(HEADER, db.from(HEADER).update(editable).eq('id', header.id).eq('status', 'draft'))
    const nonEmpty: object[] = []
    const cleared: SafetyMetric[] = []
    for (const metric of catalogue) {
      const fields = fieldsFor(metric)
      const numbers = fields.map(field => parseSafetyNumber(values[metricId(metric)]?.[field] ?? ''))
      if (numbers.every(value => value === null)) { cleared.push(metric); continue }
      nonEmpty.push({ input_id: header.id, category: metric.category, metric_key: metric.metric_key,
        ...Object.fromEntries([...periodFields, ...statusFields].map(field => [field, null])),
        ...Object.fromEntries(fields.map((field, index) => [field, numbers[index]])) })
    }
    if (nonEmpty.length) await checked(LINES, db.from(LINES).upsert(nonEmpty, { onConflict: 'input_id,category,metric_key' }))
    for (const metric of cleared) await checked(LINES, db.from(LINES).delete().eq('input_id', header.id).eq('category', metric.category).eq('metric_key', metric.metric_key))
    setDirty(false)
    if (submit) {
      const submitted = await checked<Header>(HEADER, db.from(HEADER).update({ status: 'submitted' }).eq('id', header.id).eq('status', 'draft').select().single())
      setHeader(submitted)
      showSuccess('Safety Statistics submitted successfully')
      await readOutput(submitted)
    } else showSuccess('Draft saved')
    await loadHistory()
  }
  const olderDrafts = currentProject ? inputReports.filter(report => report.status === 'draft' && report.week_num < currentProject.week) : []
  const readOnly = busy || header?.status === 'submitted'
  if (loading) return <LoadingSpinner />
  return <div className="space-y-6">
    {notification && <Notification {...notification} onClose={hideNotification} />}
    <h2 className="text-xl font-semibold text-gray-900">Safety Statistics</h2>
    {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800 whitespace-pre-wrap">{error}</div>}
    {currentProject && <p className="text-sm text-gray-600">Current project week: {currentProject.week} · Data date (UTC): {new Date(currentProject.dataDate).toISOString().slice(0, 10)}</p>}
    {!!olderDrafts.length && <section className="rounded border border-amber-300 bg-amber-50 p-4 overflow-x-auto">
      <h3 className="font-semibold text-amber-900">Unsubmitted drafts from earlier weeks</h3>
      <table className="w-full text-sm"><thead><tr>{['Week', 'Report no.', 'Prepared by', 'Created at', 'Actions'].map(label => <th key={label} className="text-left p-2">{label}</th>)}</tr></thead>
        <tbody>{olderDrafts.map(report => <tr key={report.id} className="border-t border-amber-200">
          {[report.week_num, report.report_no, report.prepared_by, report.created_at].map((value, index) => <td className="p-2" key={index}>{value ?? '—'}</td>)}
          <td className="p-2 space-x-3"><button className="text-blue-700 underline" disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) void run(() => openReport(report)) }}>Open</button><button className="text-red-700 underline" disabled={busy} onClick={() => setDiscardReport(report)}>Discard</button></td>
        </tr>)}</tbody></table>
    </section>}
    {header && currentProject && header.week_num !== currentProject.week && <button className="text-blue-700 underline" disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) void run(showCurrentWeek) }}>Return to current week {currentProject.week}</button>}
    {!catalogue.length && <p>No safety metrics available. Check the catalogue before starting a report.</p>}
    {!header ? <button disabled={busy || !ready || !projectTextId || !catalogue.length} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" onClick={() => void run(startReport)}>Start new report for week {currentProject?.week}</button> : <>
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <p>Data date: <strong>{header.data_date ?? '—'}</strong> · Week: <strong>{header.week_num ?? '—'}</strong> · Status: <strong>{header.status}</strong>{dirty && ' · Unsaved changes'}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{headerFields.map(([field, label]) => <label key={field} className="text-sm text-gray-700">{label}<input className={inputClass} disabled={readOnly} value={header[field] ?? ''} onChange={event => { setHeader({ ...header, [field]: event.target.value }); setDirty(true) }} /></label>)}</div>
      </div>
      {safetyCategories.map(([category, heading]) => {
        const metrics = catalogue.filter(metric => metric.category === category)
        return <section key={category} className="bg-white border border-gray-300 rounded overflow-x-auto"><h3 className="bg-gray-100 px-3 py-2 font-semibold">{heading}</h3>
          {(['period', 'status'] as const).map(kind => {
            const rows = metrics.filter(metric => metric.kind === kind)
            if (!rows.length) return null
            const labels = kind === 'period' ? ['Month', 'Year To Date', 'From Job Inception'] : ['Open', 'Closed', 'Total']
            return <table key={kind} className="w-full text-sm border-collapse min-w-[650px]"><thead><tr>{['Doc no.', 'Metric', ...labels].map(label => <th key={label} className="border border-gray-300 p-2 text-left">{label}</th>)}</tr></thead><tbody>{rows.map(metric => <tr key={metricId(metric)}><td className="border p-2">{metric.doc_no}</td><td className="border p-2">{metric.label}{metricWarning(metric, values[metricId(metric)] ?? {}) && <p className="text-amber-700 text-xs" role="status">{metricWarning(metric, values[metricId(metric)] ?? {})}</p>}</td>{fieldsFor(metric).map((field, index) => {
              const raw = values[metricId(metric)]?.[field] ?? ''
              let message = ''; try { parseSafetyNumber(raw) } catch { message = 'Enter a non-negative number, or leave empty.' }
              return <td key={field} className="border p-2"><input type="text" inputMode="decimal" aria-label={`${metric.label} ${labels[index]}`} aria-invalid={!!message} className={inputClass} disabled={readOnly} value={raw} onChange={event => { setValues(previous => ({ ...previous, [metricId(metric)]: { ...previous[metricId(metric)], [field]: event.target.value.replace(/,/g, '') } })); setDirty(true) }} />{message && <p className="text-red-700 text-xs">{message}</p>}</td>
            })}</tr>)}</tbody></table>
          })}
        </section>
      })}
      <div className="flex gap-3 items-center">
        {header.status === 'draft' ? <><button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50" disabled={busy || invalid || !catalogue.length} onClick={() => void run(() => save(false))}>Save draft</button><button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={busy || invalid || !catalogue.length} onClick={() => emptyCount ? setConfirmSubmit(true) : void run(() => save(true))}>Submit</button></> : <><button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50" disabled={busy} onClick={() => void run(async () => {
          const draft = await checked<Header>(HEADER, db.from(HEADER).update({ status: 'draft' }).eq('id', header.id).select().single())
          setHeader(draft); setOutput(null); setOutputMissing(false); await loadHistory()
        })}>Edit</button><span className="text-sm text-amber-800">Re-submitting overwrites the output row.</span></>}
        {busy && <span role="status">Saving…</span>}
      </div>
      {output && <section className="bg-green-50 border border-green-200 rounded p-4 space-y-3"><h3 className="font-semibold">Submitted statistics</h3><p>Report: {output.report_id || 'not linked to a dashboard report yet'}</p><details><summary className="cursor-pointer">Statistics JSON</summary><pre className="overflow-auto text-xs p-3">{JSON.stringify(output.statistics, null, 2)}</pre></details><h4 className="font-semibold">Data quality warnings</h4>{renderQuality(output.data_quality)}</section>}
      {outputMissing && <p role="status">Submitted, but no matching statistics output row was returned.</p>}
    </>}
    <section className="bg-white rounded-lg border p-4 overflow-x-auto">
      <h3 className="font-semibold mb-3">Report history</h3>
      <table className="w-full text-sm"><thead><tr>{['Data date', 'Week', 'Source reference', 'Prepared by', 'Processing status', 'Approved', 'Updated at', ''].map((label, index) => <th className="text-left p-2" key={index}>{label}</th>)}</tr></thead>
        <tbody>{history.map(report => <tr key={report.statistics_id} className="border-t hover:bg-gray-50">
          {[report.data_date, report.week_num, report.source_reference, report.prepared_by, report.processing_status, report.is_approved ? 'Yes' : 'No', report.updated_at].map((value, index) => <td className="p-2" key={index}>{value ?? '—'}</td>)}
          <td><button className="text-blue-700 underline" disabled={busy} onClick={() => void run(async () => {
            const record = await checked<StatisticsHistory & Output>(OUTPUT, db.from(OUTPUT).select('*').eq('project_id', projectTextId).eq('statistics_id', report.statistics_id).single())
            setHistoryOutput(record)
          })}>Open report</button></td>
        </tr>)}</tbody>
      </table>{!history.length && <p className="text-gray-500">No previous statistics records.</p>}
    </section>
    <Modal isOpen={!!historyOutput} onClose={() => setHistoryOutput(null)} title="Safety statistics record">
      {historyOutput && <div className="space-y-3">
        <p className="text-sm text-gray-500">Read-only statistics output</p>
        <dl className="text-sm space-y-1">{[
          ['Data date', historyOutput.data_date], ['Week', historyOutput.week_num], ['Source reference', historyOutput.source_reference],
          ['Prepared by', historyOutput.prepared_by], ['Processing status', historyOutput.processing_status],
          ['Approved', historyOutput.is_approved ? 'Yes' : 'No'], ['Updated at', historyOutput.updated_at],
          ['Report', historyOutput.report_id || 'not linked to a dashboard report yet'],
        ].map(([label, value]) => <div key={label}><dt className="inline font-semibold">{label}: </dt><dd className="inline">{value ?? '—'}</dd></div>)}</dl>
        <details><summary className="cursor-pointer">Statistics JSON</summary><pre className="overflow-auto text-xs p-3">{JSON.stringify(historyOutput.statistics, null, 2)}</pre></details>
        <h4 className="font-semibold">Data quality warnings</h4>{renderQuality(historyOutput.data_quality)}
        <button className="px-4 py-2 border rounded-lg" onClick={() => setHistoryOutput(null)}>Close</button>
      </div>}
    </Modal>
    <ConfirmDialog isOpen={!!discardReport} title="Discard draft?" message={`Delete the draft for week ${discardReport?.week_num} and all its metric lines? This cannot be undone.`} confirmLabel="Discard draft" loading={busy} onCancel={() => { if (!busy) setDiscardReport(null) }} onConfirm={() => {
      if (!discardReport) return
      const report = discardReport
      if (dirty && header?.id === report.id && !window.confirm('Discard unsaved changes and delete this draft?')) return
      void run(async () => {
        await checked(HEADER, db.from(HEADER).delete().eq('id', report.id).eq('project_id', projectTextId).eq('status', 'draft').select('id').single())
        setDiscardReport(null)
        await loadHistory()
        if (header?.id === report.id) await showCurrentWeek()
        showSuccess('Draft discarded')
      })
    }} />
    <ConfirmDialog isOpen={confirmSubmit} title="Submit with empty metrics?" message={`${emptyCount} metrics are still empty. Empty values are stored as null, not zero. Submit anyway?`} variant="warning" confirmLabel="Submit anyway" cancelLabel="Go back" onCancel={() => setConfirmSubmit(false)} onConfirm={() => { setConfirmSubmit(false); void run(() => save(true)) }} />
  </div>
}

function renderQuality(quality: unknown) {
  const warnings = Array.isArray(quality) ? quality : quality && typeof quality === 'object' && 'warnings' in quality ? (quality as { warnings: unknown }).warnings : null
  if (!Array.isArray(warnings)) return <pre className="text-xs whitespace-pre-wrap">{quality ? JSON.stringify(quality, null, 2) : 'No warnings.'}</pre>
  if (!warnings.length) return <p>No warnings.</p>
  return <ul className="list-disc pl-5">{warnings.map((warning, index) => <li key={index}>{typeof warning === 'object' && warning !== null ? <><strong>{String(warning.severity ?? 'warning')}: </strong>{String(warning.message ?? JSON.stringify(warning))}</> : String(warning)}</li>)}</ul>
}
