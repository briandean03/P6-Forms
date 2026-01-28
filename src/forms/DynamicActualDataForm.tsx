import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { DynamicActualData } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'

interface DynamicActualDataWithFilters extends DynamicActualData {
  zone_code: string | null
  level_code: string | null
  trade_code: string | null
  dgt_activityname: string | null
  dgt_plannedearlystart: string | null
  dgt_plannedearlyfinish: string | null
}

interface DynamicActualDataFormData {
  dgt_activityid: string
  dgt_projectid: string
  dgt_actualstart: string
  dgt_actualfinish: string
  dgt_pctcomplete: string
}

const ITEMS_PER_PAGE = 15

type EditableField = 'dgt_actualstart' | 'dgt_actualfinish' | 'dgt_pctcomplete'

type EditingCell = {
  recordId: string
  field: EditableField
} | null

type SortField = 'dgt_activityid' | 'dgt_activityname' | 'dgt_projectid' | 'dgt_plannedearlystart' | 'dgt_plannedearlyfinish' | 'dgt_actualstart' | 'dgt_actualfinish' | 'dgt_pctcomplete'
type SortDirection = 'asc' | 'desc'

export function DynamicActualDataForm() {
  const [data, setData] = useState<DynamicActualDataWithFilters[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [cellValue, setCellValue] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Column filters
  const [filters, setFilters] = useState({
    dgt_activityid: '',
    dgt_activityname: '',
    dgt_projectid: '',
    dgt_plannedearlystart: '',
    dgt_plannedearlyfinish: '',
    dgt_actualstart: '',
    dgt_actualfinish: '',
    dgt_pctcomplete: '',
  })
  // Lookup filters from baseline table
  const [lookupFilters, setLookupFilters] = useState({
    zone_code: '',
    level_code: '',
    trade_code: '',
  })
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const updateFilter = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1)
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DynamicActualDataFormData>()

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('v_dynamic_actuals_with_filters')
      .select('*')
      .order('dgt_dbp6bd06dynamicactualdataid', { ascending: false })

    if (error) {
      showError('Failed to fetch data: ' + error.message)
    } else {
      setData(records || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Extract unique filter values from data
  const filterOptions = useMemo(() => {
    const uniqueZones = new Set<string>()
    const uniqueLevels = new Set<string>()
    const uniqueTrades = new Set<string>()

    data.forEach((item) => {
      if (item.zone_code) uniqueZones.add(item.zone_code)
      if (item.level_code) uniqueLevels.add(item.level_code)
      if (item.trade_code) uniqueTrades.add(item.trade_code)
    })

    return {
      zones: Array.from(uniqueZones).sort(),
      levels: Array.from(uniqueLevels).sort(),
      trades: Array.from(uniqueTrades).sort(),
    }
  }, [data])

  // Extract unique month/year combinations for date filters
  const dateFilterOptions = useMemo(() => {
    const getMonthYearKey = (dateString: string | null) => {
      if (!dateString) return null
      const date = new Date(dateString)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    const plannedStartMonths = new Set<string>()
    const plannedFinishMonths = new Set<string>()
    const actualStartMonths = new Set<string>()
    const actualFinishMonths = new Set<string>()

    data.forEach((item) => {
      const psKey = getMonthYearKey(item.dgt_plannedearlystart)
      const pfKey = getMonthYearKey(item.dgt_plannedearlyfinish)
      const asKey = getMonthYearKey(item.dgt_actualstart)
      const afKey = getMonthYearKey(item.dgt_actualfinish)

      if (psKey) plannedStartMonths.add(psKey)
      if (pfKey) plannedFinishMonths.add(pfKey)
      if (asKey) actualStartMonths.add(asKey)
      if (afKey) actualFinishMonths.add(afKey)
    })

    const formatMonthYear = (key: string) => {
      const [year, month] = key.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }

    return {
      plannedStart: Array.from(plannedStartMonths).sort().map(key => ({ key, label: formatMonthYear(key) })),
      plannedFinish: Array.from(plannedFinishMonths).sort().map(key => ({ key, label: formatMonthYear(key) })),
      actualStart: Array.from(actualStartMonths).sort().map(key => ({ key, label: formatMonthYear(key) })),
      actualFinish: Array.from(actualFinishMonths).sort().map(key => ({ key, label: formatMonthYear(key) })),
    }
  }, [data])

  const updateLookupFilter = (field: keyof typeof lookupFilters, value: string) => {
    setLookupFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1)
  }

  const filteredAndSortedData = useMemo(() => {
    let result = data

    // Text search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.dgt_activityid?.toLowerCase().includes(term) ||
          item.dgt_projectid?.toLowerCase().includes(term)
      )
    }

    // Lookup filters (Zone, Level, Trade)
    if (lookupFilters.zone_code) {
      result = result.filter((item) => item.zone_code === lookupFilters.zone_code)
    }
    if (lookupFilters.level_code) {
      result = result.filter((item) => item.level_code === lookupFilters.level_code)
    }
    if (lookupFilters.trade_code) {
      result = result.filter((item) => item.trade_code === lookupFilters.trade_code)
    }

    // Column filters
    if (filters.dgt_activityid) {
      result = result.filter((item) => item.dgt_activityid === filters.dgt_activityid)
    }
    if (filters.dgt_activityname) {
      result = result.filter((item) => item.dgt_activityname === filters.dgt_activityname)
    }
    if (filters.dgt_projectid) {
      result = result.filter((item) => item.dgt_projectid === filters.dgt_projectid)
    }
    // Date filters - compare by month/year using YYYY-MM format
    if (filters.dgt_plannedearlystart) {
      result = result.filter((item) => {
        if (!item.dgt_plannedearlystart) return false
        const itemDate = new Date(item.dgt_plannedearlystart)
        const itemKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`
        return itemKey === filters.dgt_plannedearlystart
      })
    }
    if (filters.dgt_plannedearlyfinish) {
      result = result.filter((item) => {
        if (!item.dgt_plannedearlyfinish) return false
        const itemDate = new Date(item.dgt_plannedearlyfinish)
        const itemKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`
        return itemKey === filters.dgt_plannedearlyfinish
      })
    }
    if (filters.dgt_actualstart) {
      result = result.filter((item) => {
        if (!item.dgt_actualstart) return false
        const itemDate = new Date(item.dgt_actualstart)
        const itemKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`
        return itemKey === filters.dgt_actualstart
      })
    }
    if (filters.dgt_actualfinish) {
      result = result.filter((item) => {
        if (!item.dgt_actualfinish) return false
        const itemDate = new Date(item.dgt_actualfinish)
        const itemKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`
        return itemKey === filters.dgt_actualfinish
      })
    }

    // Sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]

        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, searchTerm, filters, lookupFilters, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const openCreateModal = () => {
    reset({
      dgt_activityid: '',
      dgt_projectid: '',
      dgt_actualstart: '',
      dgt_actualfinish: '',
      dgt_pctcomplete: '',
    })
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: DynamicActualDataFormData) => {
    setSaving(true)

    const insertData = {
      dgt_activityid: formData.dgt_activityid || null,
      dgt_projectid: formData.dgt_projectid || null,
      dgt_actualstart: formData.dgt_actualstart || null,
      dgt_actualfinish: formData.dgt_actualfinish || null,
      dgt_pctcomplete: formData.dgt_pctcomplete
        ? parseFloat(formData.dgt_pctcomplete)
        : null,
    }

    const { error } = await supabase.from('dgt_dbp6bd06dynamicactualdata').insert(insertData as never)

    if (error) {
      showError('Failed to create record: ' + error.message)
    } else {
      showSuccess('Record created successfully')
      setIsModalOpen(false)
      fetchData()
    }

    setSaving(false)
  }

  const startEditing = (
    recordId: string,
    field: EditableField,
    currentValue: string | number | null
  ) => {
    setEditingCell({ recordId, field })
    if (field === 'dgt_actualstart' || field === 'dgt_actualfinish') {
      setCellValue(currentValue ? new Date(currentValue as string).toISOString().slice(0, 16) : '')
    } else {
      setCellValue(currentValue?.toString() || '')
    }
  }

  const cancelEditing = () => {
    setEditingCell(null)
    setCellValue('')
  }

  const saveInlineEdit = async (recordId: string, field: EditableField) => {
    let updateValue: string | number | null = cellValue || null

    if (field === 'dgt_pctcomplete' && cellValue) {
      updateValue = parseFloat(cellValue)
    }

    const updatePayload: Record<string, string | number | null> = { [field]: updateValue }

    const { error } = await supabase
      .from('dgt_dbp6bd06dynamicactualdata')
      .update(updatePayload as never)
      .eq('dgt_dbp6bd06dynamicactualdataid', recordId)

    if (error) {
      showError('Failed to update: ' + error.message)
    } else {
      setData((prev) =>
        prev.map((item) =>
          item.dgt_dbp6bd06dynamicactualdataid === recordId
            ? { ...item, [field]: updateValue }
            : item
        )
      )
      showSuccess('Updated successfully')
    }
    setEditingCell(null)
    setCellValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, recordId: string, field: EditableField) => {
    if (e.key === 'Enter') {
      saveInlineEdit(recordId, field)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const handleDelete = async (recordId: string) => {
    setDeleting(true)
    const { error } = await supabase
      .from('dgt_dbp6bd06dynamicactualdata')
      .delete()
      .eq('dgt_dbp6bd06dynamicactualdataid', recordId)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.dgt_dbp6bd06dynamicactualdataid !== recordId))
      showSuccess('Record deleted successfully')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
  }

  const formatPercentage = (value: number | null) => {
    if (value === null || value === undefined) return '-'
    return `${(value * 100).toFixed(1)}%`
  }

  const getProgressColor = (value: number | null) => {
    if (value === null || value === undefined) return 'bg-gray-200'
    const percentage = value * 100
    if (percentage >= 100) return 'bg-green-500'
    if (percentage >= 75) return 'bg-blue-500'
    if (percentage >= 50) return 'bg-yellow-400'
    if (percentage >= 25) return 'bg-orange-400'
    return 'bg-red-400'
  }

  return (
    <div className="space-y-4">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-full sm:w-64">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search records..."
            />
          </div>
          {(Object.values(filters).some(v => v !== '') ||
            Object.values(lookupFilters).some(v => v !== '') ||
            sortField !== null) && (
            <button
              onClick={() => {
                setFilters({
                  dgt_activityid: '',
                  dgt_activityname: '',
                  dgt_plannedearlystart: '',
                  dgt_plannedearlyfinish: '',
                  dgt_projectid: '',
                  dgt_actualstart: '',
                  dgt_actualfinish: '',
                  dgt_pctcomplete: '',
                })
                setLookupFilters({ zone_code: '', level_code: '', trade_code: '' })
                setSortField(null)
                setSortDirection('asc')
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap shadow-sm"
              title="Clear all filters and sorting"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-800 rounded">
                {Object.values(filters).filter(v => v !== '').length +
                 Object.values(lookupFilters).filter(v => v !== '').length +
                 (sortField !== null ? 1 : 0)}
              </span>
            </button>
          )}
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Record
        </button>
      </div>

      {/* Lookup Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm font-medium text-gray-600">Filter by:</span>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Zone</label>
            <select
              value={lookupFilters.zone_code}
              onChange={(e) => updateLookupFilter('zone_code', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {filterOptions.zones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Level</label>
            <select
              value={lookupFilters.level_code}
              onChange={(e) => updateLookupFilter('level_code', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {filterOptions.levels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Trade</label>
            <select
              value={lookupFilters.trade_code}
              onChange={(e) => updateLookupFilter('trade_code', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {filterOptions.trades.map((trade) => (
                <option key={trade} value={trade}>{trade}</option>
              ))}
            </select>
          </div>
          {(lookupFilters.zone_code || lookupFilters.level_code || lookupFilters.trade_code) && (
            <button
              onClick={() => setLookupFilters({ zone_code: '', level_code: '', trade_code: '' })}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
          {/* Results count */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
              {(Object.values(filters).some(v => v !== '') ||
                Object.values(lookupFilters).some(v => v !== '') ||
                searchTerm) && (
                <span className="ml-1 text-gray-500">
                  (filtered from {data.length} total)
                </span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-1.5 text-left align-top sticky left-0 bg-gray-50 z-10 border-r border-gray-300">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_activityid')}
                    >
                      Activity ID
                      <SortIcon field="dgt_activityid" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_activityid" value={filters.dgt_activityid} onChange={(v) => updateFilter('dgt_activityid', v)} label="Activity ID" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top max-w-xs">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_activityname')}
                    >
                      Activity Name
                      <SortIcon field="dgt_activityname" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_activityname" value={filters.dgt_activityname} onChange={(v) => updateFilter('dgt_activityname', v)} label="Activity Name" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_plannedearlystart')}
                    >
                      Planned Start
                      <SortIcon field="dgt_plannedearlystart" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={filters.dgt_plannedearlystart}
                        onChange={(e) => updateFilter('dgt_plannedearlystart', e.target.value)}
                        className="w-full px-2 py-1 text-xs font-normal text-gray-700 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">All</option>
                        {dateFilterOptions.plannedStart.map(({ key, label }) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_plannedearlyfinish')}
                    >
                      Planned Finish
                      <SortIcon field="dgt_plannedearlyfinish" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={filters.dgt_plannedearlyfinish}
                        onChange={(e) => updateFilter('dgt_plannedearlyfinish', e.target.value)}
                        className="w-full px-2 py-1 text-xs font-normal text-gray-700 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">All</option>
                        {dateFilterOptions.plannedFinish.map(({ key, label }) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_projectid')}
                    >
                      Project ID
                      <SortIcon field="dgt_projectid" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_projectid" value={filters.dgt_projectid} onChange={(v) => updateFilter('dgt_projectid', v)} label="Project ID" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualstart')}
                    >
                      Actual Start
                      <SortIcon field="dgt_actualstart" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={filters.dgt_actualstart}
                        onChange={(e) => updateFilter('dgt_actualstart', e.target.value)}
                        className="w-full px-2 py-1 text-xs font-normal text-gray-700 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">All</option>
                        {dateFilterOptions.actualStart.map(({ key, label }) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualfinish')}
                    >
                      Actual Finish
                      <SortIcon field="dgt_actualfinish" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={filters.dgt_actualfinish}
                        onChange={(e) => updateFilter('dgt_actualfinish', e.target.value)}
                        className="w-full px-2 py-1 text-xs font-normal text-gray-700 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      >
                        <option value="">All</option>
                        {dateFilterOptions.actualFinish.map(({ key, label }) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_pctcomplete')}
                    >
                      % Complete
                      <SortIcon field="dgt_pctcomplete" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-xs text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.dgt_dbp6bd06dynamicactualdataid} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-xs text-gray-900 truncate font-mono sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-200">
                        {record.dgt_activityid || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900 truncate max-w-xs">
                        {record.dgt_activityname || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                        {formatDate(record.dgt_plannedearlystart)}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                        {formatDate(record.dgt_plannedearlyfinish)}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900 truncate">
                        {record.dgt_projectid || '-'}
                      </td>
                      {/* Actual Start - Editable */}
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        {editingCell?.recordId === record.dgt_dbp6bd06dynamicactualdataid && editingCell?.field === 'dgt_actualstart' ? (
                          <input
                            type="datetime-local"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualstart')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualstart')}
                            className="w-full px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualstart', record.dgt_actualstart)}
                            className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded inline-flex items-center gap-1 group"
                            title="Click to edit"
                          >
                            {formatDate(record.dgt_actualstart)}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      {/* Actual Finish - Editable */}
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        {editingCell?.recordId === record.dgt_dbp6bd06dynamicactualdataid && editingCell?.field === 'dgt_actualfinish' ? (
                          <input
                            type="datetime-local"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualfinish')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualfinish')}
                            className="w-full px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_actualfinish', record.dgt_actualfinish)}
                            className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded inline-flex items-center gap-1 group"
                            title="Click to edit"
                          >
                            {formatDate(record.dgt_actualfinish)}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      {/* % Complete - Editable */}
                      <td className="px-2 py-1.5 text-xs">
                        {editingCell?.recordId === record.dgt_dbp6bd06dynamicactualdataid && editingCell?.field === 'dgt_pctcomplete' ? (
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_pctcomplete')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd06dynamicactualdataid, 'dgt_pctcomplete')}
                            className="w-16 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => startEditing(record.dgt_dbp6bd06dynamicactualdataid, 'dgt_pctcomplete', record.dgt_pctcomplete)}
                            className="flex items-center gap-2 cursor-pointer hover:bg-blue-50 px-1 py-1 rounded group"
                            title="Click to edit"
                          >
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${getProgressColor(record.dgt_pctcomplete)}`}
                                style={{
                                  width: `${Math.min((record.dgt_pctcomplete || 0) * 100, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-600 font-mono">
                              {formatPercentage(record.dgt_pctcomplete)}
                            </span>
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-1.5">
                        {deleteConfirm === record.dgt_dbp6bd06dynamicactualdataid ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(record.dgt_dbp6bd06dynamicactualdataid)}
                              disabled={deleting}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {deleting ? '...' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(record.dgt_dbp6bd06dynamicactualdataid)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete record"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredAndSortedData.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Dynamic Actual Data Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Activity ID"
            type="text"
            {...register('dgt_activityid')}
            error={errors.dgt_activityid?.message}
          />

          <FormField
            label="Project ID"
            type="text"
            {...register('dgt_projectid')}
            error={errors.dgt_projectid?.message}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Actual Start"
              type="datetime-local"
              {...register('dgt_actualstart')}
              error={errors.dgt_actualstart?.message}
            />

            <FormField
              label="Actual Finish"
              type="datetime-local"
              {...register('dgt_actualfinish')}
              error={errors.dgt_actualfinish?.message}
            />
          </div>

          <FormField
            label="Percent Complete"
            type="number"
            step="0.1"
            min="0"
            max="100"
            {...register('dgt_pctcomplete', {
              validate: (value) => {
                if (!value) return true
                const num = parseFloat(value)
                if (isNaN(num)) return 'Must be a valid number'
                if (num < 0 || num > 100) return 'Must be between 0 and 100'
                return true
              },
            })}
            error={errors.dgt_pctcomplete?.message}
            helpText="Enter a value between 0 and 100"
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
