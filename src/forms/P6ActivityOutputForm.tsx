import { useState, useEffect } from 'react'
import { schemaClient } from '@/lib/supabase'
import type { P6ActivityOutput } from '@/types/database'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'

const ITEMS_PER_PAGE = 15
type SortField = 'activity_id' | 'activity_name' | 'status' | 'duration_pct_complete' | 'actual_start' | 'actual_finish' | 'early_start' | 'early_finish' | 'total_float'
type SortDirection = 'asc' | 'desc'

const formatDate = (d: string | null) => {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

const statusBadge = (status: string | null) => {
  if (!status) return <span className="text-gray-400">-</span>
  const cls =
    status === 'Completed' ? 'bg-green-100 text-green-700' :
    status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
    status === 'Not Started' ? 'bg-gray-100 text-gray-500' :
    'bg-amber-100 text-amber-700'
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
}

const selectCls = 'h-8 px-2 text-xs border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400'

export function P6ActivityOutputForm({ projectTextId, schemaName }: { projectTextId: string; schemaName: string }) {
  const supabaseClient = schemaClient(schemaName)
  const [data, setData] = useState<P6ActivityOutput[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [wbsFilter, setWbsFilter] = useState('')
  const [activityTypeFilter, setActivityTypeFilter] = useState('')
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [wbsOptions, setWbsOptions] = useState<string[]>([])
  const [activityTypeOptions, setActivityTypeOptions] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('activity_id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { notification, hideNotification, showError } = useNotification()

  // Fetch distinct filter options once per project
  const fetchFilterOptions = async () => {
    if (!projectTextId) return
    const { data: rows } = await supabaseClient
      .from('p6_activity_output_flat')
      .select('status, wbs_code, activity_type')
      .eq('project_code', projectTextId)
    if (rows) {
      const r = rows as { status: string | null; wbs_code: string | null; activity_type: string | null }[]
      setStatusOptions([...new Set(r.map(x => x.status).filter(Boolean) as string[])].sort())
      setWbsOptions([...new Set(r.map(x => x.wbs_code).filter(Boolean) as string[])].sort())
      setActivityTypeOptions([...new Set(r.map(x => x.activity_type).filter(Boolean) as string[])].sort())
    }
  }

  const fetchData = async () => {
    if (!projectTextId) return
    setLoading(true)
    const from = (currentPage - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1
    let query = supabaseClient
      .from('p6_activity_output_flat')
      .select('id,project_code,activity_id,activity_name,status,wbs_code,activity_type,duration_pct_complete,actual_start,actual_finish,early_start,early_finish,total_float', { count: 'exact' })
      .eq('project_code', projectTextId)
      .order(sortField, { ascending: sortDirection === 'asc' })
      .range(from, to)
    if (debouncedSearch) {
      query = query.or(`activity_id.ilike.%${debouncedSearch}%,activity_name.ilike.%${debouncedSearch}%,wbs_code.ilike.%${debouncedSearch}%`)
    }
    if (statusFilter) query = query.eq('status', statusFilter)
    if (wbsFilter) query = query.eq('wbs_code', wbsFilter)
    if (activityTypeFilter) query = query.eq('activity_type', activityTypeFilter)
    const { data: records, count, error } = await query
    if (error) { showError('Failed to fetch data: ' + error.message) }
    else { setData((records as P6ActivityOutput[] | null) ?? []); setTotalCount(count ?? 0) }
    setLoading(false)
  }

  useEffect(() => { fetchFilterOptions() }, [projectTextId, schemaName])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, statusFilter, wbsFilter, activityTypeFilter])
  useEffect(() => {
    setStatusFilter(''); setWbsFilter(''); setActivityTypeFilter('')
    setDebouncedSearch(''); setSearchTerm('')
  }, [projectTextId])
  useEffect(() => { fetchData() }, [projectTextId, schemaName, currentPage, debouncedSearch, statusFilter, wbsFilter, activityTypeFilter, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDirection('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4M3 12h18" /></svg>
    return sortDirection === 'asc'
      ? <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  }

  const colHeaders: { key: SortField; label: string }[] = [
    { key: 'activity_id', label: 'Activity ID' },
    { key: 'activity_name', label: 'Activity Name' },
    { key: 'status', label: 'Status' },
    { key: 'duration_pct_complete', label: '% Complete' },
    { key: 'actual_start', label: 'Actual Start' },
    { key: 'actual_finish', label: 'Actual Finish' },
    { key: 'early_start', label: 'Early Start' },
    { key: 'early_finish', label: 'Early Finish' },
    { key: 'total_float', label: 'Total Float' },
  ]

  const hasActiveFilters = statusFilter || wbsFilter || activityTypeFilter

  const clearFilters = () => {
    setStatusFilter('')
    setWbsFilter('')
    setActivityTypeFilter('')
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Activity ID, Name, Status, WBS..." />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={wbsFilter} onChange={e => setWbsFilter(e.target.value)} className={selectCls}>
          <option value="">All WBS</option>
          {wbsOptions.map(w => <option key={w} value={w}>{w}</option>)}
        </select>

        <select value={activityTypeFilter} onChange={e => setActivityTypeFilter(e.target.value)} className={selectCls}>
          <option value="">All Activity Types</option>
          {activityTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="h-8 px-3 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            Clear filters
          </button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{totalCount}</span> record{totalCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {colHeaders.map(({ key, label }) => (
                    <th key={key} className="px-3 py-3 text-left">
                      <div
                        className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                        onClick={() => handleSort(key)}
                      >
                        {label}<SortIcon field={key} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : data.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-sm font-mono text-gray-900 whitespace-nowrap">{record.activity_id || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-900">{record.activity_name || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(record.status)}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                      {record.duration_pct_complete != null ? `${Math.round(parseFloat(record.duration_pct_complete) * 100)}%` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.actual_start)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.actual_finish)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.early_start)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.early_finish)}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">{record.total_float ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}
    </div>
  )
}
