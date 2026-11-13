import { schemaClient, supabase } from '@/lib/supabase'
import type { P6ProjectMapping, ProjectData } from '@/types/database'

export type Row = Record<string, unknown>
export type Scope = { schema: string; projectId: string; reportId: string }
export type Bucket = { rows: Row[]; error?: string }
export type Snapshot = { at: string; scope: Scope; tables: Record<string, Bucket> }
export type Project = { id: string; name: string; projectId: string; schema: string }
export type Report = { report_id: string; week_num: number | null; data_date: string | null; updated_at: string | null }
export type Event = { step: string; url: string; payload: unknown; started: string; durationMs: number; status?: number; response?: string; error?: string }
export type Run = { id: string; scope: Scope; label: string; started: string; finished?: string; state: string; events: Event[]; before?: Snapshot; after?: Snapshot; jobId?: string; error?: string }

export const HISTORY_KEY = 'p6-staging-history-v1'
export function loadHistory(): Run[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is Run => !!r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.events) && !!r.scope)
      .slice(0, 20).map(r => r.state === 'Running' ? { ...r, state: 'Interrupted: outcome unknown' } : r)
  } catch { return [] }
}

// The existing generated Database type covers public tables only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (schema: string): any => schemaClient(schema)

export async function projects(): Promise<Project[]> {
  const [p, m] = await Promise.all([
    supabase.from('dbp6_0000_projectdata').select('dgt_dbp6bd00projectdataid,dgt_projectid,dgt_projectname'),
    db('public').from('p6_project_mapping').select('dgt_projectid,schema_name'),
  ])
  if (p.error || m.error) throw new Error(p.error?.message || m.error?.message)
  const projectRows = (p.data ?? []) as ProjectData[]
  const mappings = (m.data ?? []) as P6ProjectMapping[]
  return projectRows.flatMap(row => {
    const schemas = [...new Set(mappings.filter(x => x.dgt_projectid === row.dgt_projectid).map(x => x.schema_name).filter(Boolean))]
    return schemas.filter(schema => schema !== 'public').map(schema => ({
      id: row.dgt_dbp6bd00projectdataid, name: row.dgt_projectname || row.dgt_projectid || 'Unnamed project',
      projectId: row.dgt_projectid || '', schema: String(schema),
    }))
  }).filter(p => p.projectId).sort((a, b) => a.name.localeCompare(b.name))
}

export async function projectWeek(project: Project): Promise<number | null> {
  let result = await db(project.schema).from('dbp6_0000_projectdata').select('dgt_current_weeknum')
    .eq('dgt_dbp6bd00projectdataid', project.id).maybeSingle()
  if (!result.error && !result.data) result = await db(project.schema).from('dbp6_0000_projectdata').select('dgt_current_weeknum').eq('dgt_projectid', project.projectId).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data?.dgt_current_weeknum == null ? null : Number(result.data.dgt_current_weeknum)
}

async function rows(schema: string, table: string, select: string, scope: Scope, reportScoped = true): Promise<Bucket> {
  try {
    const output: Row[] = []
    for (let offset = 0; offset < 10000; offset += 500) {
      let query = db(schema).from(table).select(select).eq('project_id', scope.projectId)
      if (schema === 'public') query = query.eq('schema_name', scope.schema)
      if (reportScoped) query = query.eq('report_id', scope.reportId)
      query = query.order(schema === 'public' ? 'created_at' : 'id', { ascending: true })
      const { data, error } = await query.range(offset, offset + 499)
      if (error) throw new Error(error.message)
      output.push(...(data ?? []))
      if ((data ?? []).length < 500) return { rows: output }
    }
    throw new Error('More than 10,000 rows: narrow this selection. Results were not truncated silently.')
  } catch (error) { return { rows: [], error: error instanceof Error ? error.message : String(error) } }
}

export async function reports(project: Project): Promise<Report[]> {
  const result = await rows(project.schema, 'dbp6_0008_weekly_reports_calculations', 'id,report_id,week_num,data_date,updated_at,report_type', { schema: project.schema, projectId: project.projectId, reportId: '' }, false)
  if (result.error) throw new Error(result.error)
  return result.rows.filter(r => String(r.report_type).replace(/[^a-z0-9]/gi, '').toLowerCase() === 'weeklyprogressreport')
    .map(r => r as unknown as Report).sort((a, b) => (b.week_num ?? -1) - (a.week_num ?? -1))
}

export const TABLES = {
  calculations: 'dbp6_0008_weekly_reports_calculations', designs: 'dbp6_0008_weekly_report_design',
  structures: 'dbp6_0008_dashboard_structures', widgets: 'dbp6_0008_dashboard_widgets',
  sections: 'dbp6_0008_weekly_report_sections', jobs: 'dbp6_0008_report_jobs', requests: 'dbp6_0008_widget_generation_requests',
} as const

export async function snapshot(scope: Scope): Promise<Snapshot> {
  if (!scope.reportId) return { at: new Date().toISOString(), scope, tables: {} }
  const columns: Record<keyof typeof TABLES, string> = {
    calculations: 'id,report_id,project_id,week_num,data_date,report_type,report_status,created_at,updated_at',
    designs: 'id,design_id,report_id,project_id,is_approved,is_active,created_at,updated_at,identity:design_specification->report_identity,section_plan:design_specification->section_design_mapping',
    structures: 'id,structure_id,report_id,project_id,week_num,data_date,is_approved,processing_status,created_at,updated_at,structure_plan,layout_context:a3_layout->dashboard_context',
    widgets: 'id,widget_id,structure_id,report_id,project_id,widget_title,processing_status,data_status,created_at,updated_at',
    sections: 'id,section_id,report_id,project_id,title,week_num,data_date,processing_status,created_at,updated_at',
    jobs: '*', requests: '*',
  }
  const results = await Promise.all(Object.entries(TABLES).map(async ([key, table]) => [key, await rows(
    key === 'jobs' || key === 'requests' ? 'public' : scope.schema, table, columns[key as keyof typeof TABLES], scope,
  )] as const))
  return { at: new Date().toISOString(), scope: { ...scope }, tables: Object.fromEntries(results) }
}

export async function inspect(scope: Scope, key: keyof typeof TABLES, row: Row): Promise<unknown> {
  const isPublic = key === 'jobs' || key === 'requests'
  const id = key === 'jobs' ? 'job_id' : key === 'requests' ? 'request_id' : 'id'
  let query = db(isPublic ? 'public' : scope.schema).from(TABLES[key]).select('*')
    .eq(id, row[id]).eq('project_id', scope.projectId).eq('report_id', scope.reportId)
  if (isPublic) query = query.eq('schema_name', scope.schema)
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data
}

const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
export function diagnostics(s: Snapshot): string[] {
  const t = s.tables
  if (!s.scope.reportId) return ['No calculation report selected. Generate the current week or select an existing report.']
  const messages = Object.entries(t).flatMap(([key, value]) => value.error ? [`${key}: query failed: ${value.error}. Empty results are not proof of missing data.`] : [])
  const calculation = t.calculations?.rows[0]
  const designs = t.designs?.rows.filter(r => r.is_approved === true && r.is_active === true) ?? []
  if (!t.designs?.error && designs.length !== 1) messages.push(`Expected one approved active report-bound design; found ${designs.length}.`)
  for (const d of designs) {
    const identity = object(d.identity)
    if (identity.report_id !== s.scope.reportId || identity.project_id !== s.scope.projectId || identity.week_num !== calculation?.week_num || identity.data_date !== calculation?.data_date) messages.push(`Design ${d.design_id}: reporting identity differs from the calculation row.`)
  }
  const structures = (t.structures?.rows ?? []).filter(r => r.is_approved === true).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id))
  if (!t.structures?.error && structures.length !== 1) messages.push(`Approved dashboard structures for this report: ${structures.length}.`)
  const structure = structures[0]
  const plan = object(structure?.structure_plan)
  const expected = new Set<string>()
  for (const page of Array.isArray(plan.pages) ? plan.pages : []) {
    const widgets = object(page).widgets
    for (const widget of Array.isArray(widgets) ? widgets : []) {
      const id = object(widget).widget_id
      if (typeof id === 'string') expected.add(id)
    }
  }
  const jobs = [...(t.jobs?.rows ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const latest = jobs[0]
  const missing = [...expected].filter(id => !(t.widgets?.rows ?? []).some(w => w.widget_id === id && w.structure_id === structure?.structure_id && w.processing_status === 'validated' && (!latest || Date.parse(String(w.updated_at)) > Date.parse(String(latest.created_at)))))
  if (!t.widgets?.error && missing.length) messages.push(`Widgets missing, unvalidated or not updated after the latest job started (${missing.length}/${expected.size}): ${missing.join(', ')}.`)
  if (object(structure?.layout_context).report_id !== s.scope.reportId) messages.push('A3 layout does not identify the selected report.')
  if (!t.sections?.error && !t.sections?.rows.length) messages.push('No weekly-report sections visible for this report.')
  if (latest) {
    messages.push(`Latest server job: ${latest.status}. ${latest.progress ?? ''}`)
    if (latest.error_message) messages.push(`Server error: ${latest.error_message}`)
    if (latest.status === 'completed') messages.push('A completed job may mean webhook 150 was only queued. Confirm fresh section output; this panel does not infer workflow completion from that status.')
  }
  return messages
}

export function differences(before: Snapshot, after: Snapshot): string[] {
  if (JSON.stringify(before.scope) !== JSON.stringify(after.scope)) return ['Scope changed: these snapshots cannot be compared as the same report.']
  return Object.keys(TABLES).flatMap(key => {
    const b = before.tables[key], a = after.tables[key]
    if (a?.error || b?.error) return [`${key}: comparison unavailable because a query failed.`]
    const identity = (r: Row) => String(r.id ?? r.job_id ?? r.request_id)
    const previous = new Map((b?.rows ?? []).map(r => [identity(r), JSON.stringify(r)]))
    const current = new Map((a?.rows ?? []).map(r => [identity(r), JSON.stringify(r)]))
    const added = [...current.keys()].filter(id => !previous.has(id))
    const changed = [...current.keys()].filter(id => previous.has(id) && previous.get(id) !== current.get(id))
    const removed = [...previous.keys()].filter(id => !current.has(id))
    return [`${key}: ${added.length} added, ${changed.length} metadata changed, ${removed.length} no longer visible.`, ...(changed.length ? [`Changed ${key} row IDs: ${changed.join(', ')}`] : [])]
  })
}

export async function calculationForWeek(project: Project, week: number): Promise<Report | null> {
  const { data, error } = await db(project.schema).from('dbp6_0008_weekly_reports_calculations')
    .select('report_id,week_num,data_date,updated_at').eq('project_id', project.projectId)
    .eq('week_num', week).eq('report_type', 'Weekly Progress Report')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}
