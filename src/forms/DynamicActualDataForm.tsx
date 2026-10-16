import { useState, useEffect } from 'react'
import { schemaClient } from '@/lib/supabase'
import type { DynamicActualData } from '@/types/database'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'

const PAGE_SIZE = 50

type SortField =
  | 'dgt_activityid'
  | 'dgt_projectid'
  | 'dgt_weeknum'
  | 'dgt_datadate'
  | 'dgt_actualstart'
  | 'dgt_actualfinish'
  | 'dgt_pctcomplete'
  | 'total_float'
  | 'remaining_duration'

interface AppliedFilters {
  activityId: string
}

export function DynamicActualDataForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
  const [data, setData] = useState<DynamicActualData[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [latestWeekNum, setLatestWeekNum] = useState<number | null>(null)

  // Pending filter input (not yet applied)
  const [activityInput, setActivityInput] = useState('')

  // Applied filters (sent to Supabase)
  const [applied, setApplied] = useState<AppliedFilters>({ activityId: '' })

  // Sort (applied immediately on header click)
  const [sortField, setSortField] = useState<SortField>('dgt_activityid')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { notification, hideNotification, showError } = useNotification()

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const hasActiveFilters = !!applied.activityId

  const latestDataDate = data[0]?.dgt_datadate ?? null

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      const supabase = schemaClient(schemaName)

      // Step 1: get the max week number for this project
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: maxRow, error: maxError } = await (supabase as any)
        .from('dbp6_0006_progressdata')
        .select('dgt_weeknum')
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .order('dgt_weeknum', { ascending: false })
        .limit(1)
        .single()

      if (cancelled) return

      if (maxError || !maxRow) {
        showError('Failed to determine latest week: ' + (maxError?.message ?? 'no data'))
        setLoading(false)
        return
      }

      const maxWeek: number = maxRow.dgt_weeknum
      setLatestWeekNum(maxWeek)

      // Step 2: fetch paginated data filtered to that week
      const from = (currentPage - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('dbp6_0006_progressdata')
        .select('*', { count: 'exact' })
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .eq('dgt_weeknum', maxWeek)
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(from, to)

      if (applied.activityId.trim()) {
        query = query.ilike('dgt_activityid', `%${applied.activityId.trim()}%`)
      }

      const { data: records, count, error } = await query

      if (cancelled) return

      if (error) {
        showError('Failed to fetch data: ' + error.message)
      } else {
        setData(records || [])
        setTotalCount(count ?? 0)
      }
      setLoading(false)
    }

    fetchData()
    return () => { cancelled = true }
  }, [projectId, schemaName, currentPage, applied, sortField, sortDir])

  const applyFilters = () => {
    setApplied({ activityId: activityInput })
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setActivityInput('')
    setApplied({ activityId: '' })
    setCurrentPage(1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyFilters()
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setCurrentPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDir === 'asc' ? (
      <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const SortableHeader = ({
    field,
    label,
    className = '',
  }: {
    field: SortField
    label: string
    className?: string
  }) => (
    <th
      className={`px-3 py-2 text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </div>
    </th>
  )

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString()
  }

  const formatPct = (v: number | null) => {
    if (v === null || v === undefined) return '-'
    return `${v.toFixed(1)}%`
  }

  const getProgressColor = (v: number | null) => {
    if (v === null || v === undefined) return 'bg-gray-200'
    if (v >= 100) return 'bg-green-500'
    if (v >= 75) return 'bg-blue-500'
    if (v >= 50) return 'bg-yellow-400'
    if (v >= 25) return 'bg-orange-400'
    return 'bg-red-400'
  }

  const getCriticalBadge = (val: string | null) => {
    if (!val || val === '0' || val.toLowerCase() === 'false' || val.toLowerCase() === 'no') return null
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
        Critical
      </span>
    )
  }

  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-4">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      {/* Latest week banner */}
      {!loading && (latestWeekNum !== null || latestDataDate !== null) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-blue-800">
            Showing <span className="font-semibold">latest week</span>
            {latestWeekNum !== null && (
              <> &mdash; Week <span className="font-semibold">{latestWeekNum}</span></>
            )}
            {latestDataDate !== null && (
              <span className="text-blue-600 ml-1">(Data Date: {formatDate(latestDataDate)})</span>
            )}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {/* Activity ID */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Activity ID</label>
            <div className="relative">
              <input
                type="text"
                value={activityInput}
                onChange={e => setActivityInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pb-0.5">
            <button
              onClick={applyFilters}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
            {applied.activityId && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                Activity ID: <span className="font-medium">{applied.activityId}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
          {/* Results info */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{totalCount.toLocaleString()}</span>{' '}
              record{totalCount !== 1 ? 's' : ''}
              {hasActiveFilters && <span className="ml-1 text-gray-400">(filtered)</span>}
            </span>
            <span className="text-sm text-gray-500">
              Sorted by{' '}
              <span className="font-medium text-gray-700">{sortField.replace('dgt_', '')}</span>{' '}
              <span className="text-gray-400">({sortDir})</span>
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <SortableHeader field="dgt_activityid" label="Activity ID" className="text-left" />
                  <SortableHeader field="dgt_weeknum" label="Week #" className="text-center" />
                  <SortableHeader field="dgt_datadate" label="Data Date" className="text-left" />
                  <SortableHeader field="dgt_actualstart" label="Actual Start" className="text-left" />
                  <SortableHeader field="dgt_actualfinish" label="Actual Finish" className="text-left" />
                  <SortableHeader field="dgt_pctcomplete" label="% Complete" className="text-left" />
                  <SortableHeader field="remaining_duration" label="Rem. Dur." className="text-center" />
                  <SortableHeader field="total_float" label="Total Float" className="text-center" />
                  <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap text-center">Free Float</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap text-center">Critical</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap text-center">Longest Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  data.map(record => (
                    <tr key={record.dgt_dbp6bd06dynamicactualdataid} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs text-gray-900 font-mono whitespace-nowrap">
                        {record.dgt_activityid || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 text-center">
                        {record.dgt_weeknum ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {formatDate(record.dgt_datadate)}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {formatDate(record.dgt_actualstart)}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {formatDate(record.dgt_actualfinish)}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5 shrink-0">
                            <div
                              className={`h-1.5 rounded-full ${getProgressColor(record.dgt_pctcomplete)}`}
                              style={{ width: `${Math.min(record.dgt_pctcomplete || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 font-mono">
                            {formatPct(record.dgt_pctcomplete)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 text-center font-mono">
                        {record.remaining_duration ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 text-center font-mono">
                        {record.total_float ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 text-center font-mono">
                        {record.free_float ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-center">
                        {getCriticalBadge(record.is_critical) ?? (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-center">
                        {record.is_longest_path && record.is_longest_path !== '0' && record.is_longest_path.toLowerCase() !== 'false' && record.is_longest_path.toLowerCase() !== 'no' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            LP
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Showing{' '}
              <span className="font-semibold text-gray-900">{rangeStart.toLocaleString()}</span>
              {' – '}
              <span className="font-semibold text-gray-900">{rangeEnd.toLocaleString()}</span>
              {' of '}
              <span className="font-semibold text-gray-900">{totalCount.toLocaleString()}</span>
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
