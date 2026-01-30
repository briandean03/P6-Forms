import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { QaqcHse } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'
import { DateColumnFilter } from '@/components/DateColumnFilter'

interface QaqcHseFormData {
  dgt_docid: string
  dgt_docref: string
  dgt_documentsubject: string
  dgt_discipline: string
  dgt_documenttype: string
  dgt_submissiondate: string
  dgt_responsedate: string
  dgt_revision: string
  dgt_status: string
}

const ITEMS_PER_PAGE = 15

type EditableField = 'dgt_status'

type EditingCell = {
  recordId: string
  field: EditableField
} | null

type SortField = 'dgt_docid' | 'dgt_docref' | 'dgt_documentsubject' | 'dgt_discipline' | 'dgt_documenttype' | 'dgt_submissiondate' | 'dgt_responsedate' | 'dgt_status'
type SortDirection = 'asc' | 'desc'

export function QaqcHseForm() {
  const [data, setData] = useState<QaqcHse[]>([])
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
    dgt_docid: '',
    dgt_docref: '',
    dgt_discipline: '',
    dgt_documenttype: '',
    dgt_submissiondate: '',
    dgt_responsedate: '',
    dgt_status: '',
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
  } = useForm<QaqcHseFormData>()

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_bd0402_qaqc_hse')
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
          item.dgt_docid?.toLowerCase().includes(term) ||
          item.dgt_docref?.toLowerCase().includes(term) ||
          item.dgt_documentsubject?.toLowerCase().includes(term) ||
          item.dgt_discipline?.toString().includes(term) ||
          item.dgt_documenttype?.toLowerCase().includes(term)
      )
    }

    // Column filters
    if (filters.dgt_docid) {
      result = result.filter((item) => item.dgt_docid === filters.dgt_docid)
    }
    if (filters.dgt_docref) {
      result = result.filter((item) => item.dgt_docref === filters.dgt_docref)
    }
    if (filters.dgt_discipline) {
      result = result.filter((item) => item.dgt_discipline?.toString() === filters.dgt_discipline)
    }
    if (filters.dgt_documenttype) {
      result = result.filter((item) => item.dgt_documenttype === filters.dgt_documenttype)
    }
    if (filters.dgt_submissiondate) {
      if (filters.dgt_submissiondate === 'BLANK') {
        result = result.filter((item) => !item.dgt_submissiondate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_submissiondate) return false
          const date = new Date(item.dgt_submissiondate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_submissiondate
        })
      }
    }
    if (filters.dgt_responsedate) {
      if (filters.dgt_responsedate === 'BLANK') {
        result = result.filter((item) => !item.dgt_responsedate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_responsedate) return false
          const date = new Date(item.dgt_responsedate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_responsedate
        })
      }
    }
    if (filters.dgt_status) {
      result = result.filter((item) => item.dgt_status === filters.dgt_status)
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
      dgt_docid: '',
      dgt_docref: '',
      dgt_documentsubject: '',
      dgt_discipline: '',
      dgt_documenttype: '',
      dgt_submissiondate: '',
      dgt_responsedate: '',
      dgt_revision: '',
      dgt_status: '',
    })
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: QaqcHseFormData) => {
    setSaving(true)

    const insertData = {
      dgt_docid: formData.dgt_docid || null,
      dgt_docref: formData.dgt_docref || null,
      dgt_documentsubject: formData.dgt_documentsubject || null,
      dgt_discipline: formData.dgt_discipline ? parseInt(formData.dgt_discipline) : null,
      dgt_documenttype: formData.dgt_documenttype || null,
      dgt_submissiondate: formData.dgt_submissiondate || null,
      dgt_responsedate: formData.dgt_responsedate || null,
      dgt_revision: formData.dgt_revision ? parseInt(formData.dgt_revision) : null,
      dgt_status: formData.dgt_status || null,
    }

    const { error } = await supabase.from('dbp6_bd0402_qaqc_hse').insert(insertData as never)

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
    currentValue: string | null
  ) => {
    setEditingCell({ recordId, field })
    setCellValue(currentValue || '')
  }

  const cancelEditing = () => {
    setEditingCell(null)
    setCellValue('')
  }

  const saveInlineEdit = async (recordId: string, field: EditableField) => {
    const updateValue: string | null = cellValue || null
    const updatePayload: Record<string, string | null> = { [field]: updateValue }

    const { error } = await supabase
      .from('dbp6_bd0402_qaqc_hse')
      .update(updatePayload as never)
      .eq('dgt_dbp6bd0402qaqchseid', recordId)

    if (error) {
      showError('Failed to update: ' + error.message)
    } else {
      setData((prev) =>
        prev.map((item) =>
          item.dgt_dbp6bd0402qaqchseid === recordId
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
      .from('dbp6_bd0402_qaqc_hse')
      .delete()
      .eq('dgt_dbp6bd0402qaqchseid', recordId)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.dgt_dbp6bd0402qaqchseid !== recordId))
      showSuccess('Record deleted successfully')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
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

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-full sm:w-72">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by Doc ID, Ref, Subject..."
            />
          </div>
          {(Object.values(filters).some(v => v !== '') || sortField !== null) && (
            <button
              onClick={() => {
                setFilters({
                  dgt_docid: '',
                  dgt_docref: '',
                  dgt_discipline: '',
                  dgt_documenttype: '',
                  dgt_submissiondate: '',
                  dgt_responsedate: '',
                  dgt_status: '',
                })
                setSortField(null)
                setSortDirection('asc')
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700 transition-colors whitespace-nowrap shadow-sm"
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
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create New
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_docid')}
                    >
                      Doc ID
                      <SortIcon field="dgt_docid" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_docid" value={filters.dgt_docid} onChange={(v) => updateFilter('dgt_docid', v)} label="Doc ID" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_docref')}
                    >
                      Doc Ref
                      <SortIcon field="dgt_docref" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_docref" value={filters.dgt_docref} onChange={(v) => updateFilter('dgt_docref', v)} label="Doc Ref" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_documentsubject')}
                    >
                      Subject
                      <SortIcon field="dgt_documentsubject" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_discipline')}
                    >
                      Discipline
                      <SortIcon field="dgt_discipline" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_discipline" value={filters.dgt_discipline} onChange={(v) => updateFilter('dgt_discipline', v)} label="Discipline" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_documenttype')}
                    >
                      Doc Type
                      <SortIcon field="dgt_documenttype" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_documenttype" value={filters.dgt_documenttype} onChange={(v) => updateFilter('dgt_documenttype', v)} label="Doc Type" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_submissiondate')}
                    >
                      Submission
                      <SortIcon field="dgt_submissiondate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_submissiondate" value={filters.dgt_submissiondate} onChange={(v) => updateFilter('dgt_submissiondate', v)} label="Submission" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_responsedate')}
                    >
                      Response
                      <SortIcon field="dgt_responsedate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_responsedate" value={filters.dgt_responsedate} onChange={(v) => updateFilter('dgt_responsedate', v)} label="Response" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_status')}
                    >
                      Status
                      <SortIcon field="dgt_status" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_status" value={filters.dgt_status} onChange={(v) => updateFilter('dgt_status', v)} label="Status" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.dgt_dbp6bd0402qaqchseid} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {record.dgt_docid || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {record.dgt_docref || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900 max-w-xs truncate">
                        {record.dgt_documentsubject || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {record.dgt_discipline || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {record.dgt_documenttype || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(record.dgt_submissiondate)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(record.dgt_responsedate)}
                      </td>
                      {/* Status - Editable */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {editingCell?.recordId === record.dgt_dbp6bd0402qaqchseid && editingCell?.field === 'dgt_status' ? (
                          <select
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd0402qaqchseid, 'dgt_status')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd0402qaqchseid, 'dgt_status')}
                            className="w-20 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          >
                            <option value="">-</option>
                            <option value="OPN">OPN</option>
                            <option value="CLS">CLS</option>
                            <option value="REJ">REJ</option>
                          </select>
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd0402qaqchseid, 'dgt_status', record.dgt_status)}
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer hover:opacity-80 ${
                              record.dgt_status === 'OPN'
                                ? 'bg-blue-100 text-blue-800'
                                : record.dgt_status === 'CLS'
                                ? 'bg-green-100 text-green-800'
                                : record.dgt_status === 'REJ'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {record.dgt_status || '-'}
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {deleteConfirm === record.dgt_dbp6bd0402qaqchseid ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(record.dgt_dbp6bd0402qaqchseid)}
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
                            onClick={() => setDeleteConfirm(record.dgt_dbp6bd0402qaqchseid)}
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
        title="Create QAQC/HSE Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Doc ID"
            type="text"
            {...register('dgt_docid')}
            error={errors.dgt_docid?.message}
          />

          <FormField
            label="Doc Reference"
            type="text"
            {...register('dgt_docref')}
            error={errors.dgt_docref?.message}
          />

          <FormField
            label="Document Subject"
            type="text"
            {...register('dgt_documentsubject')}
            error={errors.dgt_documentsubject?.message}
          />

          <FormField
            label="Discipline"
            type="number"
            {...register('dgt_discipline', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_discipline?.message}
          />

          <FormField
            label="Document Type"
            type="text"
            {...register('dgt_documenttype')}
            error={errors.dgt_documenttype?.message}
          />

          <FormField
            label="Submission Date"
            type="date"
            {...register('dgt_submissiondate')}
            error={errors.dgt_submissiondate?.message}
          />

          <FormField
            label="Response Date"
            type="date"
            {...register('dgt_responsedate')}
            error={errors.dgt_responsedate?.message}
          />

          <FormField
            label="Revision"
            type="number"
            {...register('dgt_revision', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_revision?.message}
          />

          <div>
            <label htmlFor="dgt_status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="dgt_status"
              {...register('dgt_status')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select status...</option>
              <option value="OPN">OPN - Open</option>
              <option value="CLS">CLS - Closed</option>
              <option value="REJ">REJ - Rejected</option>
            </select>
            {errors.dgt_status?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.dgt_status.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
