import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { ActualResources, Discipline } from '@/types/database'
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
}

const ITEMS_PER_PAGE = 15

type EditableField = 'dgt_resourcecount'

type EditingCell = {
  recordId: string
  field: EditableField
} | null

type SortField = 'resource_name' | 'dgt_resourcediscipline' | 'dgt_resourcetype' | 'dgt_resourcecount' | 'dgt_sequential'
type SortDirection = 'asc' | 'desc'

export function ActualResourcesForm({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ActualResources[]>([])
  const [projects, setProjects] = useState<{ dgt_dbp6bd00projectdataid: string; dgt_projectname: string | null }[]>([])
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
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [showDisciplineLegend, setShowDisciplineLegend] = useState(false)
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

  const fetchProjects = async () => {
    const { data: projectRecords } = await supabase
      .from('dbp6_0000_projectdata')
      .select('dgt_dbp6bd00projectdataid, dgt_projectname')
      .order('dgt_projectname', { ascending: true })
    setProjects(projectRecords || [])
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

  useEffect(() => {
    fetchData()
    fetchProjects()
    fetchDisciplines()
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
    })
    setValue('dgt_dbp6bd00projectdataid', projectId)
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: ActualResourcesFormData) => {
    setSaving(true)

    const insertData = {
      dgt_dbp6bd00projectdataid: formData.dgt_dbp6bd00projectdataid,
      resource_name: formData.resource_name || null,
      dgt_resourcecount: formData.dgt_resourcecount
        ? parseInt(formData.dgt_resourcecount)
        : null,
      dgt_resourcediscipline: formData.dgt_resourcediscipline
        ? parseInt(formData.dgt_resourcediscipline)
        : null,
      dgt_resourcetype: formData.dgt_resourcetype
        ? parseInt(formData.dgt_resourcetype)
        : null,
      dgt_sequential: formData.dgt_sequential
        ? parseInt(formData.dgt_sequential)
        : null,
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

  const startEditing = (
    recordId: string,
    field: EditableField,
    currentValue: number | null
  ) => {
    setEditingCell({ recordId, field })
    setCellValue(currentValue?.toString() || '')
  }

  const cancelEditing = () => {
    setEditingCell(null)
    setCellValue('')
  }

  const saveInlineEdit = async (recordId: string, field: EditableField) => {
    const updateValue: number | null = cellValue ? parseInt(cellValue) : null
    const updatePayload: Record<string, number | null> = { [field]: updateValue }

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

  const getProjectName = (id: string | null) => {
    if (!id) return '-'
    const project = projects.find((p) => p.dgt_dbp6bd00projectdataid === id)
    return project?.dgt_projectname || id
  }

  const handleExport = () => {
    const headers = ['resource_name', 'dgt_resourcediscipline', 'dgt_resourcetype', 'dgt_resourcecount', 'dgt_sequential']
    const rows = data.map(r => [r.resource_name, r.dgt_resourcediscipline, r.dgt_resourcetype, r.dgt_resourcecount, r.dgt_sequential])
    exportToCsv('actual-resources', headers, rows)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.resource_name)
      .map(({ resource_name, dgt_resourcediscipline, dgt_resourcetype, dgt_resourcecount, dgt_sequential }) => ({
        dgt_dbp6bd00projectdataid: projectId,
        resource_name: resource_name || null,
        dgt_resourcediscipline: Number(dgt_resourcediscipline) || null,
        dgt_resourcetype: Number(dgt_resourcetype) || null,
        dgt_resourcecount: Number(dgt_resourcecount) || null,
        dgt_sequential: Number(dgt_sequential) || null,
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
                  <th className="px-2 py-1.5 text-left align-top w-36">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Project
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
                      <ColumnFilter data={data} field="dgt_resourcediscipline" value={filters.dgt_resourcediscipline} onChange={(v) => updateFilter('dgt_resourcediscipline', v)} label="Discipline" />
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
                      <ColumnFilter data={data} field="dgt_resourcetype" value={filters.dgt_resourcetype} onChange={(v) => updateFilter('dgt_resourcetype', v)} label="Type" />
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
                  <th className="px-2 py-1.5 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-xs text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.dgt_dbp6ud0501actualresourcesid} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-xs text-gray-900 whitespace-nowrap sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-200">
                        {record.resource_name || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        <div
                          className="whitespace-nowrap font-medium"
                          title={getProjectName(record.dgt_dbp6bd00projectdataid)}
                        >
                          {getProjectName(record.dgt_dbp6bd00projectdataid)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        {record.dgt_resourcediscipline || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        {record.dgt_resourcetype || '-'}
                      </td>
                      {/* Count - Editable */}
                      <td className="px-2 py-1.5 text-xs">
                        {editingCell?.recordId === record.dgt_dbp6ud0501actualresourcesid && editingCell?.field === 'dgt_resourcecount' ? (
                          <input
                            type="number"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6ud0501actualresourcesid, 'dgt_resourcecount')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6ud0501actualresourcesid, 'dgt_resourcecount')}
                            className="w-16 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6ud0501actualresourcesid, 'dgt_resourcecount', record.dgt_resourcecount)}
                            className="inline-flex items-center gap-1 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-pointer hover:bg-blue-50 group"
                            title="Click to edit"
                          >
                            {record.dgt_resourcecount ?? '-'}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900">
                        {record.dgt_sequential || '-'}
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => setDeleteConfirm(record.dgt_dbp6ud0501actualresourcesid)}
                          className="p-1 text-red-500 rounded"
                          title="Delete record"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
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
        onClose={handleCancelModal}
        title="Create Actual Resources Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Project <span className="text-red-500">*</span>
            </label>
            <select
              {...register('dgt_dbp6bd00projectdataid', { required: 'Project is required' })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Project --</option>
              {projects.map((p) => (
                <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>
                  {p.dgt_projectname || p.dgt_dbp6bd00projectdataid}
                </option>
              ))}
            </select>
            {errors.dgt_dbp6bd00projectdataid && (
              <p className="text-xs text-red-500">{errors.dgt_dbp6bd00projectdataid.message}</p>
            )}
          </div>

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

          <FormField
            label="Resource Type"
            type="number"
            {...register('dgt_resourcetype', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_resourcetype?.message}
          />

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
