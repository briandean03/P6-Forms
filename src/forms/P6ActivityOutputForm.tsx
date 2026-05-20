import { useState, useEffect, useMemo } from 'react'
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
  const supabase = schemaClient(schemaName)
  const [data, setData] = useState<P6ActivityOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [wbsFilter, setWbsFilter] = useState('')
  const [activityTypeFilter, setActivityTypeFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { notification, hideNotification, showError } = useNotification()

  const fetchData = async () => {
    setLoading(true)
    const PAGE_SIZE = 1000
    let allRecords: P6ActivityOutput[] = []
    let from = 0
    while (true) {
      let query = supabase
        .from('p6_activity_output_flat')
        .select('*')
        .order('activity_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (projectTextId) query = query.eq('project_code', projectTextId)
      const { data: records, error } = await query
      if (error) { showError('Failed to fetch data: ' + error.message); break }
      allRecords = allRecords.concat((records as P6ActivityOutput[] | null) || [])
      if (!records || records.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    setData(allRecords)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [projectTextId, schemaName])
  useEffect(() => { setCurrentPage(1) }, [searchTerm, statusFilter, wbsFilter, activityTypeFilter])

  const statusOptions = useMemo(() =>
    [...new Set(data.map(r => r.status).filter(Boolean))].sort() as string[]
  , [data])

  const wbsOptions = useMemo(() =>
    [...new Set(data.map(r => r.wbs_code).filter(Boolean))].sort() as string[]
  , [data])

  const activityTypeOptions = useMemo(() =>
    [...new Set(data.map(r => r.activity_type).filter(Boolean))].sort() as string[]
  , [data])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.activity_id?.toLowerCase().includes(term) ||
        item.activity_name?.toLowerCase().includes(term) ||
        item.status?.toLowerCase().includes(term) ||
        item.wbs_code?.toLowerCase().includes(term)
      )
    }
    if (statusFilter) result = result.filter(item => item.status === statusFilter)
    if (wbsFilter) result = result.filter(item => item.wbs_code === wbsFilter)
    if (activityTypeFilter) result = result.filter(item => item.activity_type === activityTypeFilter)
    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]; const bVal = b[sortField]
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1
        return sortDirection === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal))
      })
    }
    return result
  }, [data, searchTerm, statusFilter, wbsFilter, activityTypeFilter, sortField, sortDirection])

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

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

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
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
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
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => (
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
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredAndSortedData.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}
    </div>
  )
}
