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

interface AppliedFilters {
  activityId: string
  weekNum: string
}

export function DynamicActualDataForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
  const [data, setData] = useState<DynamicActualData[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Pending filter inputs (not yet applied)
  const [activityInput, setActivityInput] = useState('')
  const [weekNumInput, setWeekNumInput] = useState('')

  // Applied filters (sent to Supabase)
  const [applied, setApplied] = useState<AppliedFilters>({ activityId: '', weekNum: '' })

  // Sort (applied immediately on header click)
  const [sortField, setSortField] = useState<SortField>('dgt_activityid')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { notification, hideNotification, showError } = useNotification()

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const hasActiveFilters = applied.activityId || applied.weekNum

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      const from = (currentPage - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const supabase = schemaClient(schemaName)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('progress_latest_week')
        .select('*', { count: 'exact' })
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(from, to)

      if (applied.activityId.trim()) {
        query = query.ilike('dgt_activityid', `%${applied.activityId.trim()}%`)
      }
      if (applied.weekNum.trim()) {
        query = query.eq('dgt_weeknum', parseInt(applied.weekNum))
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
    setApplied({ activityId: activityInput, weekNum: weekNumInput })
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setActivityInput('')
    setWeekNumInput('')
    setApplied({ activityId: '', weekNum: '' })
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

          {/* Week # */}
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-600 mb-1">Week #</label>
            <input
              type="number"
              value={weekNumInput}
              onChange={e => setWeekNumInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 42"
              min="1"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
            {applied.weekNum && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                Week #: <span className="font-medium">{applied.weekNum}</span>
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
                  <SortableHeader field="dgt_projectid" label="Project ID" className="text-left" />
                  <SortableHeader field="dgt_weeknum" label="Week #" className="text-center" />
                  <SortableHeader field="dgt_datadate" label="Data Date" className="text-left" />
                  <SortableHeader field="dgt_actualstart" label="Actual Start" className="text-left" />
                  <SortableHeader field="dgt_actualfinish" label="Actual Finish" className="text-left" />
                  <SortableHeader field="dgt_pctcomplete" label="% Complete" className="text-left" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  data.map(record => (
                    <tr key={record.dgt_dbp6bd06dynamicactualdataid} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs text-gray-900 font-mono whitespace-nowrap">
                        {record.dgt_activityid || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {record.dgt_projectid || '-'}
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
                              style={{
                                width: `${Math.min(record.dgt_pctcomplete || 0, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 font-mono">
                            {formatPct(record.dgt_pctcomplete)}
                          </span>
                        </div>
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
