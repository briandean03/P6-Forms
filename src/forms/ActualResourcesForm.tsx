import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { ActualResources } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'

interface ActualResourcesFormData {
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

export function ActualResourcesForm() {
  const [data, setData] = useState<ActualResources[]>([])
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
    formState: { errors },
  } = useForm<ActualResourcesFormData>()

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_ud0501actualresources')
      .select('*')
      .order('created_at', { ascending: false })

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
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: ActualResourcesFormData) => {
    setSaving(true)

    const insertData = {
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

    const { error } = await supabase.from('dbp6_ud0501actualresources').insert(insertData as never)

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
      .from('dbp6_ud0501actualresources')
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
      .from('dbp6_ud0501actualresources')
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
        <div className="w-full sm:w-64">
          <SearchFilter
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search records..."
          />
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

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left align-top">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('resource_name')}
                    >
                      Resource Name
                      <SortIcon field="resource_name" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="resource_name" value={filters.resource_name} onChange={(v) => updateFilter('resource_name', v)} label="Resource Name" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcediscipline')}
                    >
                      Discipline
                      <SortIcon field="dgt_resourcediscipline" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcediscipline" value={filters.dgt_resourcediscipline} onChange={(v) => updateFilter('dgt_resourcediscipline', v)} label="Discipline" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcetype')}
                    >
                      Type
                      <SortIcon field="dgt_resourcetype" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcetype" value={filters.dgt_resourcetype} onChange={(v) => updateFilter('dgt_resourcetype', v)} label="Type" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_resourcecount')}
                    >
                      Count
                      <SortIcon field="dgt_resourcecount" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_resourcecount" value={filters.dgt_resourcecount} onChange={(v) => updateFilter('dgt_resourcecount', v)} label="Count" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_sequential')}
                    >
                      Sequential
                      <SortIcon field="dgt_sequential" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_sequential" value={filters.dgt_sequential} onChange={(v) => updateFilter('dgt_sequential', v)} label="Sequential" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.dgt_dbp6ud0501actualresourcesid} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-sm text-gray-900 truncate">
                        {record.resource_name || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_resourcediscipline || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_resourcetype || '-'}
                      </td>
                      {/* Count - Editable */}
                      <td className="px-3 py-2.5 text-sm">
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
                            className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-pointer hover:bg-blue-50"
                          >
                            {record.dgt_resourcecount ?? '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_sequential || '-'}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        {deleteConfirm === record.dgt_dbp6ud0501actualresourcesid ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(record.dgt_dbp6ud0501actualresourcesid)}
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
                            onClick={() => setDeleteConfirm(record.dgt_dbp6ud0501actualresourcesid)}
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
