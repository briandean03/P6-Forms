import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { schemaClient } from '@/lib/supabase'
import type { ActualResources, Discipline, Type } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsvControls } from '@/components/CsvControls'
import { exportToCsv } from '@/utils/csv'

interface ActualResourcesFormData {
  dgt_dbp6bd00projectdataid: string
  resource_name: string
  dgt_resourcecount: string
  dgt_resourcediscipline: string
  dgt_resourcetype: string
  dgt_sequential: string
  resource_code: string
  date: string
  dgt_projectid: string
  owningbusinessunit: string
}

interface EditValues {
  resource_name: string
  dgt_dbp6bd00projectdataid: string
  dgt_resourcediscipline: string
  dgt_resourcetype: string
  dgt_resourcecount: string
  dgt_sequential: string
  resource_code: string
  date: string
  dgt_projectid: string
  owningbusinessunit: string
}

const ITEMS_PER_PAGE = 15

type SortField = 'resource_name' | 'dgt_resourcediscipline' | 'dgt_resourcetype' | 'dgt_resourcecount' | 'dgt_sequential'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-1 py-0.5 text-xs border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500'

export function ActualResourcesForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
  const supabase = schemaClient(schemaName)
  const [data, setData] = useState<ActualResources[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({
    resource_name: '',
    dgt_dbp6bd00projectdataid: '',
    dgt_resourcediscipline: '',
    dgt_resourcetype: '',
    dgt_resourcecount: '',
    dgt_sequential: '',
    resource_code: '',
    date: '',
    dgt_projectid: '',
    owningbusinessunit: '',
  })
  const [savingRow, setSavingRow] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [types, setTypes] = useState<Type[]>([])
  const [showDisciplineLegend, setShowDisciplineLegend] = useState(false)
  const [showTypeLegend, setShowTypeLegend] = useState(false)
  // Column filters
  const [filters, setFilters] = useState({
    resource_name: '',
    dgt_resourcediscipline: '',
    dgt_resourcetype: '',
    dgt_resourcecount: '',
    dgt_sequential: '',
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
    setValue,
    formState: { errors, isDirty },
  } = useForm<ActualResourcesFormData>()

  const handleCancelModal = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      setIsModalOpen(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_000501_actualresources')
      .select('*')
      .eq('dgt_dbp6bd00projectdataid', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      showError('Failed to fetch data: ' + error.message)
    } else {
      setData(records || [])
    }
    setLoading(false)
  }

  const fetchDisciplines = async () => {
    const { data: records } = await supabase.from('dbp6_0018_discipline').select('id, discipline_code, discipline_name').order('discipline_code', { ascending: true })
    setDisciplines(records || [])
  }

  const fetchTypes = async () => {
    const { data: records } = await supabase.from('dbp6_0019_type').select('id, type_code, type_name').order('type_code', { ascending: true })
    setTypes(records || [])
  }

  useEffect(() => {
    fetchData()
    fetchDisciplines()
    fetchTypes()
  }, [projectId])

  const filteredAndSortedData = useMemo(() => {
    let result = data

    // Text search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.resource_name?.toLowerCase().includes(term) ||
          item.dgt_resourcediscipline?.toString().includes(term) ||
          item.dgt_resourcetype?.toString().includes(term)
      )
    }

    // Column filters
    if (filters.resource_name) {
      result = result.filter((item) => item.resource_name === filters.resource_name)
    }
    if (filters.dgt_resourcediscipline) {
      result = result.filter((item) => item.dgt_resourcediscipline?.toString() === filters.dgt_resourcediscipline)
    }
    if (filters.dgt_resourcetype) {
      result = result.filter((item) => item.dgt_resourcetype?.toString() === filters.dgt_resourcetype)
    }
    if (filters.dgt_resourcecount) {
      result = result.filter((item) => item.dgt_resourcecount?.toString() === filters.dgt_resourcecount)
    }
    if (filters.dgt_sequential) {
      result = result.filter((item) => item.dgt_sequential?.toString() === filters.dgt_sequential)
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
  }, [data, searchTerm, filters, sortField, sortDirection])

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

  const getDisciplineName = (code: number | null) => {
    if (code == null) return '-'
    return disciplines.find(d => d.discipline_code === code)?.discipline_name || `Code: ${code}`
  }
  const getTypeName = (code: number | null) => {
    if (code == null) return '-'
    return types.find(t => t.type_code === code)?.type_name || `Code: ${code}`
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
      resource_name: '',
      dgt_resourcecount: '',
      dgt_resourcediscipline: '',
      dgt_resourcetype: '',
      dgt_sequential: '',
      resource_code: '',
      date: '',
      dgt_projectid: '',
      owningbusinessunit: '',
    })
    setValue('dgt_dbp6bd00projectdataid', projectId)
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: ActualResourcesFormData) => {
    setSaving(true)

    const insertData = {
      dgt_dbp6bd00projectdataid: formData.dgt_dbp6bd00projectdataid,
      resource_name: formData.resource_name || null,
      dgt_resourcecount: formData.dgt_resourcecount ? parseInt(formData.dgt_resourcecount) : null,
      dgt_resourcediscipline: formData.dgt_resourcediscipline ? parseInt(formData.dgt_resourcediscipline) : null,
      dgt_resourcetype: formData.dgt_resourcetype ? parseInt(formData.dgt_resourcetype) : null,
      dgt_sequential: formData.dgt_sequential ? parseInt(formData.dgt_sequential) : null,
      resource_code: formData.resource_code || null,
      date: formData.date || null,
      dgt_projectid: formData.dgt_projectid || null,
      owningbusinessunit: formData.owningbusinessunit || null,
    }

    const { error } = await supabase.from('dbp6_000501_actualresources').insert(insertData as never)

    if (error) {
      showError('Failed to create record: ' + error.message)
    } else {
      showSuccess('Record created successfully')
      setIsModalOpen(false)
      fetchData()
    }

    setSaving(false)
  }

  const startEdit = (record: ActualResources) => {
    setEditingRowId(record.dgt_dbp6ud0501actualresourcesid)
    setEditValues({
      resource_name: record.resource_name ?? '',
      dgt_dbp6bd00projectdataid: record.dgt_dbp6bd00projectdataid ?? '',
      dgt_resourcediscipline: record.dgt_resourcediscipline?.toString() ?? '',
      dgt_resourcetype: record.dgt_resourcetype?.toString() ?? '',
      dgt_resourcecount: record.dgt_resourcecount?.toString() ?? '',
      dgt_sequential: record.dgt_sequential?.toString() ?? '',
      resource_code: record.resource_code ?? '',
      date: record.date ?? '',
      dgt_projectid: record.dgt_projectid ?? '',
      owningbusinessunit: record.owningbusinessunit ?? '',
    })
  }

  const cancelEdit = () => {
    setEditingRowId(null)
  }

  const saveEdit = async (recordId: string) => {
    setSavingRow(true)
    const updatePayload = {
      resource_name: editValues.resource_name || null,
      dgt_dbp6bd00projectdataid: editValues.dgt_dbp6bd00projectdataid || null,
      dgt_resourcediscipline: editValues.dgt_resourcediscipline ? parseInt(editValues.dgt_resourcediscipline) : null,
      dgt_resourcetype: editValues.dgt_resourcetype ? parseInt(editValues.dgt_resourcetype) : null,
      dgt_resourcecount: editValues.dgt_resourcecount ? parseInt(editValues.dgt_resourcecount) : null,
      dgt_sequential: editValues.dgt_sequential ? parseInt(editValues.dgt_sequential) : null,
      resource_code: editValues.resource_code || null,
      date: editValues.date || null,
      dgt_projectid: editValues.dgt_projectid || null,
      owningbusinessunit: editValues.owningbusinessunit || null,
    }

    const { error } = await supabase
      .from('dbp6_000501_actualresources')
      .update(updatePayload as never)
      .eq('dgt_dbp6ud0501actualresourcesid', recordId)

    if (error) {
      showError('Failed to update: ' + error.message)
    } else {
      setData((prev) =>
        prev.map((item) =>
          item.dgt_dbp6ud0501actualresourcesid === recordId
            ? { ...item, ...updatePayload }
            : item
        )
      )
      showSuccess('Updated successfully')
      setEditingRowId(null)
    }
    setSavingRow(false)
  }

  const handleDelete = async (recordId: string) => {
    setDeleting(true)
    const { error } = await supabase
      .from('dbp6_000501_actualresources')
      .delete()
      .eq('dgt_dbp6ud0501actualresourcesid', recordId)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.dgt_dbp6ud0501actualresourcesid !== recordId))
      showSuccess('Record deleted successfully')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const handleExport = () => {
    const headers = ['resource_name', 'dgt_resourcediscipline', 'dgt_resourcetype', 'dgt_resourcecount', 'dgt_sequential', 'resource_code', 'date', 'dgt_projectid', 'owningbusinessunit']
    const rows = data.map(r => [r.resource_name, r.dgt_resourcediscipline, r.dgt_resourcetype, r.dgt_resourcecount, r.dgt_sequential, r.resource_code, r.date, r.dgt_projectid, r.owningbusinessunit])
    exportToCsv('actual-resources', headers, rows)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.resource_name)
      .map(({ resource_name, dgt_resourcediscipline, dgt_resourcetype, dgt_resourcecount, dgt_sequential, resource_code, date, dgt_projectid, owningbusinessunit }) => ({
        dgt_dbp6bd00projectdataid: projectId,
        resource_name: resource_name || null,
        dgt_resourcediscipline: Number(dgt_resourcediscipline) || null,
        dgt_resourcetype: Number(dgt_resourcetype) || null,
        dgt_resourcecount: Number(dgt_resourcecount) || null,
        dgt_sequential: Number(dgt_sequential) || null,
        resource_code: resource_code || null,
        date: date || null,
        dgt_projectid: dgt_projectid || null,
        owningbusinessunit: owningbusinessunit || null,
      }))
    if (inserts.length === 0) { showError('No valid rows to import'); return }
    const { error } = await supabase.from('dbp6_000501_actualresources').insert(inserts as never)
    if (error) { showError('Import failed: ' + error.message) }
    else { showSuccess(`${inserts.length} records imported`); fetchData() }
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
          {(Object.values(filters).some(v => v !== '') || sortField !== null) && (
            <button
              onClick={() => {
                setFilters({
                  resource_name: '',
                  dgt_resourcediscipline: '',
                  dgt_resourcetype: '',
                  dgt_resourcecount: '',
                  dgt_sequential: '',
                })
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
                {Object.values(filters).filter(v => v !== '').length + (sortField !== null ? 1 : 0)}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowDisciplineLegend(!showDisciplineLegend)}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
            title="Show discipline code reference"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Discipline Legend
          </button>
          <button
            onClick={() => setShowTypeLegend(!showTypeLegend)}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
            title="Show type code reference"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Type Legend
          </button>
        </div>
        <div className="flex items-center gap-2">
          <CsvControls onExport={handleExport} onImport={handleImport} />
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
      </div>

      {showDisciplineLegend && disciplines.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Discipline Reference</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {disciplines.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">
                  {d.discipline_code}
                </span>
                <span className="text-gray-700">{d.discipline_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showDisciplineLegend && disciplines.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">No disciplines found. Please add disciplines to the discipline table.</p>
        </div>
      )}

      {showTypeLegend && types.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Type Reference</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {types.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                  {t.type_code}
                </span>
                <span className="text-gray-700">{t.type_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showTypeLegend && types.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">No types found. Please add types to the type table.</p>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
          {/* Results count */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
              {(Object.values(filters).some(v => v !== '') || searchTerm) && (
                <span className="ml-1 text-gray-500">
                  (filtered from {data.length} total)
                </span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-1.5 text-left align-top sticky left-0 bg-gray-50 z-10 border-r border-gray-300">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('resource_name')}
                    >
                      Resource Name
                      <SortIcon field="resource_name" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="resource_name" value={filters.resource_name} onChange={(v) => updateFilter('resource_name', v)} label="Resource Name" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcediscipline')}
                    >
                      Discipline
                      <SortIcon field="dgt_resourcediscipline" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcediscipline" value={filters.dgt_resourcediscipline} onChange={(v) => updateFilter('dgt_resourcediscipline', v)} label="Discipline" formatValue={(v) => getDisciplineName(Number(v))} />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-20">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcetype')}
                    >
                      Type
                      <SortIcon field="dgt_resourcetype" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcetype" value={filters.dgt_resourcetype} onChange={(v) => updateFilter('dgt_resourcetype', v)} label="Type" formatValue={(v) => getTypeName(Number(v))} />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-20">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcecount')}
                    >
                      Count
                      <SortIcon field="dgt_resourcecount" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcecount" value={filters.dgt_resourcecount} onChange={(v) => updateFilter('dgt_resourcecount', v)} label="Count" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_sequential')}
                    >
                      Sequential
                      <SortIcon field="dgt_sequential" />
                    </div>
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_sequential" value={filters.dgt_sequential} onChange={(v) => updateFilter('dgt_sequential', v)} label="Sequential" />
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Resource Code
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-28">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Date
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top w-32">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Business Unit
                    </div>
                  </th>
                  <th className="px-2 py-1.5 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-24">
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
                  paginatedData.map((record) => {
                    const isEditing = editingRowId === record.dgt_dbp6ud0501actualresourcesid
                    return (
                      <tr key={record.dgt_dbp6ud0501actualresourcesid} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                        {/* Resource Name */}
                        <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap sticky left-0 border-r border-gray-200" style={{ backgroundColor: isEditing ? '#eff6ff' : 'white' }}>
                          {isEditing ? (
                            <input type="text" value={editValues.resource_name} onChange={e => setEditValues(p => ({ ...p, resource_name: e.target.value }))} className={inputCls} />
                          ) : (
                            record.resource_name || '-'
                          )}
                        </td>
                        {/* Discipline */}
                        <td className="px-2 py-1.5 text-xs text-gray-900">
                          {isEditing ? (
                            <input type="number" value={editValues.dgt_resourcediscipline} onChange={e => setEditValues(p => ({ ...p, dgt_resourcediscipline: e.target.value }))} className={inputCls} />
                          ) : (
                            getDisciplineName(record.dgt_resourcediscipline)
                          )}
                        </td>
                        {/* Type */}
                        <td className="px-2 py-1.5 text-xs text-gray-900">
                          {isEditing ? (
                            <select value={editValues.dgt_resourcetype} onChange={e => setEditValues(p => ({ ...p, dgt_resourcetype: e.target.value }))} className={inputCls}>
                              <option value="">-</option>
                              {types.map((t) => (
                                <option key={t.id} value={t.type_code ?? ''}>{t.type_code} - {t.type_name}</option>
                              ))}
                            </select>
                          ) : (
                            getTypeName(record.dgt_resourcetype)
                          )}
                        </td>
                        {/* Count */}
                        <td className="px-2 py-1.5 text-xs text-gray-900">
                          {isEditing ? (
                            <input type="number" value={editValues.dgt_resourcecount} onChange={e => setEditValues(p => ({ ...p, dgt_resourcecount: e.target.value }))} className={inputCls} />
                          ) : (
                            record.dgt_resourcecount ?? '-'
                          )}
                        </td>
                        {/* Sequential */}
                        <td className="px-2 py-1.5 text-xs text-gray-900">
                          {isEditing ? (
                            <input type="number" value={editValues.dgt_sequential} onChange={e => setEditValues(p => ({ ...p, dgt_sequential: e.target.value }))} className={inputCls} />
                          ) : (
                            record.dgt_sequential ?? '-'
                          )}
                        </td>
                        {/* Resource Code */}
                        <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.resource_code} onChange={e => setEditValues(p => ({ ...p, resource_code: e.target.value }))} className={inputCls} />
                          ) : (
                            record.resource_code || '-'
                          )}
                        </td>
                        {/* Date */}
                        <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                          {isEditing ? (
                            <input type="date" value={editValues.date} onChange={e => setEditValues(p => ({ ...p, date: e.target.value }))} className={inputCls} />
                          ) : (
                            record.date || '-'
                          )}
                        </td>
                        {/* Business Unit */}
                        <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap">
                          {isEditing ? (
                            <input type="text" value={editValues.owningbusinessunit} onChange={e => setEditValues(p => ({ ...p, owningbusinessunit: e.target.value }))} className={inputCls} />
                          ) : (
                            record.owningbusinessunit || '-'
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-2 py-1.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => saveEdit(record.dgt_dbp6ud0501actualresourcesid)}
                                disabled={savingRow}
                                className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {savingRow ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(record)}
                                className="p-1 text-blue-500 rounded hover:bg-blue-50"
                                title="Edit record"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(record.dgt_dbp6ud0501actualresourcesid)}
                                className="p-1 text-red-500 rounded hover:bg-red-50"
                                title="Delete record"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
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
        onClose={handleCancelModal}
        title="Create Actual Resources Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Resource Name"
            type="text"
            {...register('resource_name')}
            error={errors.resource_name?.message}
          />

          <FormField
            label="Discipline"
            type="number"
            {...register('dgt_resourcediscipline', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_resourcediscipline?.message}
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Resource Type</label>
            <select
              {...register('dgt_resourcetype')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Type --</option>
              {types.map((t) => (
                <option key={t.id} value={t.type_code ?? ''}>{t.type_code} - {t.type_name}</option>
              ))}
            </select>
          </div>

          <FormField
            label="Resource Count"
            type="number"
            {...register('dgt_resourcecount', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_resourcecount?.message}
          />

          <FormField
            label="Sequential"
            type="number"
            {...register('dgt_sequential', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_sequential?.message}
          />

          <FormField
            label="Resource Code"
            type="text"
            {...register('resource_code')}
            error={errors.resource_code?.message}
          />

          <FormField
            label="Date"
            type="date"
            {...register('date')}
            error={errors.date?.message}
          />

          <FormField
            label="Project ID"
            type="text"
            {...register('dgt_projectid')}
            error={errors.dgt_projectid?.message}
          />

          <FormField
            label="Business Unit"
            type="text"
            {...register('owningbusinessunit')}
            error={errors.owningbusinessunit?.message}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancelModal}
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

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Record"
        message="Are you sure you want to delete this record? This action cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard Changes"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  )
}
