import { useState, useEffect, useCallback } from 'react'
import { schemaClient } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectMeta {
  dgt_projectname: string | null
  dgt_projectid: string | null
  dgt_datadate: string | null
  dgt_weeknum: number | null
  dgt_contractorsname: string | null
  dgt_employersname: string | null
  dgt_location: string | null
  dgt_projectstartdate: string | null
  dgt_projectenddate: string | null
}

interface CardData {
  total: number
  pending: number
  loading: boolean
}

interface UpdateQueueRow {
  id: string
  status: string | null
  requested_at: string | null
  completed_at: string | null
  execution_id: string | null
}

interface DashboardCards {
  engineering: CardData
  qaqc: CardData
  resources: CardData
  progress: CardData
  activities: CardData
  inspections: CardData
}

const emptyCard: CardData = { total: 0, pending: 0, loading: true }

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function isDataStale(dataDate: string | null): boolean {
  if (!dataDate) return false
  return Date.now() - new Date(dataDate).getTime() > 8 * 24 * 60 * 60 * 1000
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const cfg: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending:   'bg-yellow-100 text-yellow-700',
    running:   'bg-blue-100 text-blue-700',
    failed:    'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon, title, total, pendingLabel, pendingCount, pendingColor, onClick, loading,
}: {
  icon: React.ReactNode
  title: string
  total: number
  pendingLabel: string
  pendingCount: number
  pendingColor: string
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left w-full group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
          {icon}
        </div>
        {!loading && pendingCount > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pendingColor}`}>
            {pendingCount} {pendingLabel}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      {loading ? (
        <div className="h-7 w-12 bg-gray-100 animate-pulse rounded" />
      ) : (
        <p className="text-2xl font-bold text-gray-800">{total.toLocaleString()}</p>
      )}
      {!loading && (
        <p className="text-xs text-gray-400 mt-1">
          {pendingCount > 0
            ? <span className={`font-medium ${pendingColor.split(' ')[1]}`}>{pendingCount} {pendingLabel}</span>
            : <span className="text-green-600 font-medium">All synced</span>
          }
        </p>
      )}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ProjectDashboard({
  projectId,
  projectTextId,
  schemaName,
  onNavigate,
  onRunUpdate,
  runUpdateLoading,
}: {
  projectId: string
  projectTextId: string
  schemaName: string
  onNavigate: (tab: string) => void
  onRunUpdate: () => void
  runUpdateLoading: boolean
}) {
  const [meta, setMeta] = useState<ProjectMeta | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [cards, setCards] = useState<DashboardCards>({
    engineering: { ...emptyCard },
    qaqc: { ...emptyCard },
    resources: { ...emptyCard },
    progress: { ...emptyCard },
    activities: { ...emptyCard },
    inspections: { ...emptyCard },
  })
  const [updateQueue, setUpdateQueue] = useState<UpdateQueueRow[]>([])
  const [queueLoading, setQueueLoading] = useState(true)

  const db = schemaClient(schemaName)
  const atgcDb = schemaClient('atgc')

  // ── Fetch project meta ──────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const run = async () => {
      setMetaLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (atgcDb as any)
        .from('dbp6_0000_projectdata')
        .select('dgt_projectname, dgt_projectid, dgt_datadate, dgt_weeknum, dgt_contractorsname, dgt_employersname, dgt_location, dgt_projectstartdate, dgt_projectenddate')
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .maybeSingle()
      if (data) setMeta(data)
      setMetaLoading(false)
    }
    run()
  }, [projectId])

  // ── Fetch all card counts in parallel ──────────────────────────────────
  const fetchCards = useCallback(async () => {
    if (!projectId) return

    const setCard = (key: keyof DashboardCards, total: number, pending: number) =>
      setCards(prev => ({ ...prev, [key]: { total, pending, loading: false } }))

    const weekNum = meta?.dgt_weeknum ?? null

    await Promise.allSettled([
      // Engineering
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [{ count: total }, { count: pending }] = await Promise.all([
            (db as any).from('dbp6_000401_engineering_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId),
            (db as any).from('dbp6_000401_engineering_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId).eq('mod_id', 1),
          ])
          setCard('engineering', total ?? 0, pending ?? 0)
        } catch { setCard('engineering', 0, 0) }
      })(),

      // QAQC
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [{ count: total }, { count: pending }] = await Promise.all([
            (db as any).from('dbp6_000402_qaqc_hse_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId),
            (db as any).from('dbp6_000402_qaqc_hse_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId).eq('mod_id', 1),
          ])
          setCard('qaqc', total ?? 0, pending ?? 0)
        } catch { setCard('qaqc', 0, 0) }
      })(),

      // Actual Resources (current week)
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (db as any).from('dbp6_000501_actualresources_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId)
          if (weekNum !== null) q = q.eq('week_num', weekNum)
          const { count: total } = await q
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: pending } = await (db as any).from('dbp6_000501_actualresources_current').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId).eq('mod_id', 1)
          setCard('resources', total ?? 0, pending ?? 0)
        } catch { setCard('resources', 0, 0) }
      })(),

      // Progress Data (current week)
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (db as any).from('progress_latest_week').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId)
          if (weekNum !== null) q = q.eq('dgt_weeknum', weekNum)
          const { count: total } = await q
          setCard('progress', total ?? 0, 0)
        } catch { setCard('progress', 0, 0) }
      })(),

      // Activity Updates
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [{ count: total }, { count: pending }] = await Promise.all([
            (db as any).from('p6_activity_updates').select('*', { count: 'exact', head: true }).eq('project_code', projectTextId),
            (db as any).from('p6_activity_updates').select('*', { count: 'exact', head: true }).eq('project_code', projectTextId).eq('mrk_uptd', 1),
          ])
          setCard('activities', total ?? 0, pending ?? 0)
        } catch { setCard('activities', 0, 0) }
      })(),

      // Inspection Reports
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: total } = await (atgcDb as any).from('p6_inspection_reports').select('*', { count: 'exact', head: true }).eq('dgt_dbp6bd00projectdataid', projectId)
          setCard('inspections', total ?? 0, 0)
        } catch { setCard('inspections', 0, 0) }
      })(),
    ])
  }, [projectId, projectTextId, schemaName, meta?.dgt_weeknum])

  useEffect(() => {
    if (!metaLoading) fetchCards()
  }, [metaLoading, fetchCards])

  // ── Fetch update queue (auto-refresh every 10s) ─────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!projectTextId) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any)
        .from('p6_update_queue')
        .select('id, status, requested_at, completed_at, execution_id')
        .eq('project_code', projectTextId)
        .order('requested_at', { ascending: false })
        .limit(5)
      setUpdateQueue(data ?? [])
    } catch { /* non-fatal */ }
    setQueueLoading(false)
  }, [projectTextId, schemaName])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  const latestQueue = updateQueue[0] ?? null
  const stale = isDataStale(meta?.dgt_datadate ?? null)

  // ── Icons ────────────────────────────────────────────────────────────────
  const icons = {
    engineering: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    qaqc: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    resources: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    progress: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    activities: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
    inspections: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  }

  return (
    <div className="space-y-6">

      {/* ── Project Status Bar ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        {metaLoading ? (
          <div className="animate-pulse flex gap-6">
            <div className="h-6 w-48 bg-gray-100 rounded" />
            <div className="h-6 w-32 bg-gray-100 rounded" />
            <div className="h-6 w-32 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Project</p>
              <p className="text-base font-bold text-gray-900">{meta?.dgt_projectname ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">ID</p>
              <p className="text-sm font-mono text-gray-700">{meta?.dgt_projectid ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Week</p>
              <p className="text-sm font-bold text-gray-800">{meta?.dgt_weeknum ?? '—'}</p>
            </div>
            <div className="h-8 w-px bg-gray-200 hidden sm:block" />
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Data Date</p>
              <p className="text-sm font-medium text-gray-700">{fmtDate(meta?.dgt_datadate ?? null)}</p>
            </div>
            {stale && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Week may need updating
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => fetchCards()}
                title="Refresh dashboard"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={onRunUpdate}
                disabled={runUpdateLoading || !projectTextId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {runUpdateLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Running…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Run Update
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Project Info Chips ──────────────────────────────────────────── */}
      {!metaLoading && meta && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Client', value: meta.dgt_employersname },
            { label: 'Contractor', value: meta.dgt_contractorsname },
            { label: 'Location', value: meta.dgt_location },
            { label: 'Start', value: fmtDate(meta.dgt_projectstartdate) },
            { label: 'End', value: fmtDate(meta.dgt_projectenddate) },
          ].filter(i => i.value).map(({ label, value }) => (
            <div key={label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 shadow-sm">
              <span className="font-semibold text-gray-400">{label}:</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary Cards ───────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Module Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <SummaryCard
            icon={icons.engineering} title="Engineering"
            total={cards.engineering.total} loading={cards.engineering.loading}
            pendingLabel="pending sync" pendingCount={cards.engineering.pending}
            pendingColor="bg-orange-100 text-orange-700"
            onClick={() => onNavigate('engineering')}
          />
          <SummaryCard
            icon={icons.qaqc} title="QAQC / HSE"
            total={cards.qaqc.total} loading={cards.qaqc.loading}
            pendingLabel="pending sync" pendingCount={cards.qaqc.pending}
            pendingColor="bg-orange-100 text-orange-700"
            onClick={() => onNavigate('qaqc')}
          />
          <SummaryCard
            icon={icons.resources} title="Actual Resources"
            total={cards.resources.total} loading={cards.resources.loading}
            pendingLabel="pending sync" pendingCount={cards.resources.pending}
            pendingColor="bg-orange-100 text-orange-700"
            onClick={() => onNavigate('resources')}
          />
          <SummaryCard
            icon={icons.progress} title="Progress Data"
            total={cards.progress.total} loading={cards.progress.loading}
            pendingLabel="" pendingCount={0}
            pendingColor=""
            onClick={() => onNavigate('dynamic')}
          />
          <SummaryCard
            icon={icons.activities} title="Activity Updates"
            total={cards.activities.total} loading={cards.activities.loading}
            pendingLabel="marked for update" pendingCount={cards.activities.pending}
            pendingColor="bg-blue-100 text-blue-700"
            onClick={() => onNavigate('p6activityupdates')}
          />
          <SummaryCard
            icon={icons.inspections} title="Inspection Reports"
            total={cards.inspections.total} loading={cards.inspections.loading}
            pendingLabel="" pendingCount={0}
            pendingColor=""
            onClick={() => onNavigate('inspectionreports')}
          />
        </div>
      </div>

      {/* ── Bottom row: Update Queue + Quick Links ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* P6 Update Queue */}
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-700">P6 Update Queue</h3>
              <span className="text-xs text-gray-400">· auto-refreshes every 10s</span>
            </div>
            {latestQueue && <StatusPill status={latestQueue.status} />}
          </div>

          {queueLoading ? (
            <div className="px-5 py-4 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-gray-100 animate-pulse rounded" />)}
            </div>
          ) : updateQueue.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No update history found</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {updateQueue.map((row, i) => (
                <div key={row.id} className={`flex items-center gap-4 px-5 py-3 ${i === 0 ? '' : 'opacity-60'}`}>
                  <StatusPill status={row.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500">
                      Requested: <span className="font-medium text-gray-700">{fmtDate(row.requested_at)}</span>
                      {row.requested_at && <span className="text-gray-400 ml-1">({timeAgo(row.requested_at)})</span>}
                    </p>
                    {row.completed_at && (
                      <p className="text-xs text-gray-400">
                        Completed: <span className="font-medium">{fmtDate(row.completed_at)}</span>
                        <span className="ml-1">({timeAgo(row.completed_at)})</span>
                      </p>
                    )}
                  </div>
                  {row.execution_id && (
                    <span className="text-xs font-mono text-gray-300 truncate max-w-[100px]">{row.execution_id}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Quick Links</h3>
          </div>
          <div className="p-3 space-y-1">
            {[
              { tab: 'projectdata', label: 'Project Data', color: 'text-blue-600' },
              { tab: 'aoc', label: 'Areas of Concern', color: 'text-amber-600' },
              { tab: 'variations', label: 'Variations', color: 'text-purple-600' },
              { tab: 'payments', label: 'Payments', color: 'text-green-600' },
              { tab: 'photos', label: 'Photos', color: 'text-pink-600' },
              { tab: 'pdfupload', label: 'PDF Upload', color: 'text-indigo-600' },
              { tab: 'p6activityoutput', label: 'Activity Output', color: 'text-cyan-600' },
              { tab: 'p6projectmapping', label: 'Project Mapping', color: 'text-gray-600' },
            ].map(({ tab, label, color }) => (
              <button
                key={tab}
                onClick={() => onNavigate(tab)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <svg className={`w-3.5 h-3.5 ${color} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className={`font-medium ${color}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
