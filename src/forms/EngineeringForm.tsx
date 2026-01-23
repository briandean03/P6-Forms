import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { Engineering } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'
import { DateColumnFilter } from '@/components/DateColumnFilter'

interface EngineeringFormData {
  // Fields for creating new records
  dgt_dtfid: string
  dgt_transmittalref: string
  dgt_transmittalsubject: string
  dgt_discipline: string
  dgt_plannedsubmissiondate: string
  dgt_plannedapprovaldate: string
  dgt_transmittaltype: string
  is_long_lead: boolean
  // Fields editable for both create and edit
  dgt_actualsubmissiondate: string
  dgt_actualreturndate: string
  dgt_revision: string
  dgt_status: string
}

const ITEMS_PER_PAGE = 15

type EditableField = 'dgt_actualsubmissiondate' | 'dgt_actualreturndate' | 'dgt_revision' | 'dgt_status'

type EditingCell = {
  recordId: string
  field: EditableField
} | null

type SortField = 'dgt_dtfid' | 'dgt_transmittalref' | 'dgt_transmittalsubject' | 'dgt_discipline' | 'dgt_transmittaltype' | 'dgt_actualsubmissiondate' | 'dgt_actualreturndate' | 'dgt_revision' | 'dgt_status'
type SortDirection = 'asc' | 'desc'



export function EngineeringForm() {
  const [data, setData] = useState<Engineering[]>([])
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
    dgt_dtfid: '',
    dgt_transmittalref: '',
    dgt_discipline: '',
    dgt_transmittaltype: '',
    dgt_actualsubmissiondate: '',
    dgt_actualreturndate: '',
    dgt_revision: '',
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
  } = useForm<EngineeringFormData>()

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_bd041engineering')
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
          item.dgt_dtfid?.toLowerCase().includes(term) ||
          item.dgt_transmittalref?.toLowerCase().includes(term) ||
          item.dgt_transmittalsubject?.toLowerCase().includes(term) ||
          item.dgt_discipline?.toString().includes(term)
      )
    }

    // Column filters
    if (filters.dgt_dtfid) {
      result = result.filter((item) => item.dgt_dtfid === filters.dgt_dtfid)
    }
    if (filters.dgt_transmittalref) {
      result = result.filter((item) => item.dgt_transmittalref === filters.dgt_transmittalref)
    }
    if (filters.dgt_discipline) {
      if (filters.dgt_discipline === 'BLANK') {
        result = result.filter((item) => item.dgt_discipline === null || item.dgt_discipline === undefined)
      } else {
        result = result.filter((item) => item.dgt_discipline?.toString() === filters.dgt_discipline)
      }
    }
    if (filters.dgt_transmittaltype) {
      if (filters.dgt_transmittaltype === 'BLANK') {
        result = result.filter((item) => item.dgt_transmittaltype === null || item.dgt_transmittaltype === undefined)
      } else {
        result = result.filter((item) => item.dgt_transmittaltype?.toString() === filters.dgt_transmittaltype)
      }
    }
    if (filters.dgt_actualsubmissiondate) {
      if (filters.dgt_actualsubmissiondate === 'BLANK') {
        result = result.filter((item) => !item.dgt_actualsubmissiondate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_actualsubmissiondate) return false
          const date = new Date(item.dgt_actualsubmissiondate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_actualsubmissiondate
        })
      }
    }
    if (filters.dgt_actualreturndate) {
      if (filters.dgt_actualreturndate === 'BLANK') {
        result = result.filter((item) => !item.dgt_actualreturndate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_actualreturndate) return false
          const date = new Date(item.dgt_actualreturndate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_actualreturndate
        })
      }
    }
    if (filters.dgt_revision) {
      result = result.filter((item) => item.dgt_revision?.toString() === filters.dgt_revision)
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
      dgt_dtfid: '',
      dgt_transmittalref: '',
      dgt_transmittalsubject: '',
      dgt_discipline: '',
      dgt_plannedsubmissiondate: '',
      dgt_plannedapprovaldate: '',
      dgt_transmittaltype: '',
      is_long_lead: false,
      dgt_actualsubmissiondate: '',
      dgt_actualreturndate: '',
      dgt_revision: '',
      dgt_status: '',
    })
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: EngineeringFormData) => {
    setSaving(true)

    const insertData = {
      dgt_dtfid: formData.dgt_dtfid || null,
      dgt_transmittalref: formData.dgt_transmittalref || null,
      dgt_transmittalsubject: formData.dgt_transmittalsubject || null,
      dgt_discipline: formData.dgt_discipline ? parseInt(formData.dgt_discipline) : null,
      dgt_plannedsubmissiondate: formData.dgt_plannedsubmissiondate || null,
      dgt_plannedapprovaldate: formData.dgt_plannedapprovaldate || null,
      dgt_transmittaltype: formData.dgt_transmittaltype ? parseInt(formData.dgt_transmittaltype) : null,
      is_long_lead: formData.is_long_lead,
      dgt_actualsubmissiondate: formData.dgt_actualsubmissiondate || null,
      dgt_actualreturndate: formData.dgt_actualreturndate || null,
      dgt_revision: formData.dgt_revision ? parseInt(formData.dgt_revision) : null,
      dgt_status: formData.dgt_status || null,
    }

    const { error } = await supabase.from('dbp6_bd041engineering').insert(insertData as never)

    if (error) {
      showError('Failed to create record: ' + error.message)
    } else {
      showSuccess('Record created successfully')
      setIsModalOpen(false)
      fetchData()
    }

    setSaving(false)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
  }

  const startEditing = (
    recordId: string,
    field: EditableField,
    currentValue: string | number | null
  ) => {
    setEditingCell({ recordId, field })
    if (field === 'dgt_actualsubmissiondate' || field === 'dgt_actualreturndate') {
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

    if (field === 'dgt_revision' && cellValue) {
      updateValue = parseInt(cellValue)
    }

    const updatePayload: Record<string, string | number | null> = { [field]: updateValue }

    const { error } = await supabase
      .from('dbp6_bd041engineering')
      .update(updatePayload as never)
      .eq('dgt_dbp6bd041engineeringid', recordId)

    if (error) {
      showError('Failed to update: ' + error.message)
    } else {
      // Update local data
      setData((prev) =>
        prev.map((item) =>
          item.dgt_dbp6bd041engineeringid === recordId
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
      .from('dbp6_bd041engineering')
      .delete()
      .eq('dgt_dbp6bd041engineeringid', recordId)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.dgt_dbp6bd041engineeringid !== recordId))
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

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-full sm:w-72">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by DTF ID, Ref, Subject..."
            />
          </div>
          {(Object.values(filters).some(v => v !== '') || sortField !== null) && (
            <button
              onClick={() => {
                setFilters({
                  dgt_dtfid: '',
                  dgt_transmittalref: '',
                  dgt_discipline: '',
                  dgt_transmittaltype: '',
                  dgt_actualsubmissiondate: '',
                  dgt_actualreturndate: '',
                  dgt_revision: '',
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
            <table className="w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_dtfid')}
                    >
                      DTF ID
                      <SortIcon field="dgt_dtfid" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_dtfid" value={filters.dgt_dtfid} onChange={(v) => updateFilter('dgt_dtfid', v)} label="DTF ID" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-36">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittalref')}
                    >
                      Trans. Ref
                      <SortIcon field="dgt_transmittalref" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_transmittalref" value={filters.dgt_transmittalref} onChange={(v) => updateFilter('dgt_transmittalref', v)} label="Trans. Ref" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittalsubject')}
                    >
                      Subject
                      <SortIcon field="dgt_transmittalsubject" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_discipline')}
                    >
                      Disc.
                      <SortIcon field="dgt_discipline" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_discipline" value={filters.dgt_discipline} onChange={(v) => updateFilter('dgt_discipline', v)} label="Discipline" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittaltype')}
                    >
                      Type
                      <SortIcon field="dgt_transmittaltype" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_transmittaltype" value={filters.dgt_transmittaltype} onChange={(v) => updateFilter('dgt_transmittaltype', v)} label="Type" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualsubmissiondate')}
                    >
                      Submission
                      <SortIcon field="dgt_actualsubmissiondate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_actualsubmissiondate" value={filters.dgt_actualsubmissiondate} onChange={(v) => updateFilter('dgt_actualsubmissiondate', v)} label="Submission" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualreturndate')}
                    >
                      Return
                      <SortIcon field="dgt_actualreturndate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_actualreturndate" value={filters.dgt_actualreturndate} onChange={(v) => updateFilter('dgt_actualreturndate', v)} label="Return" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-20">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_revision')}
                    >
                      Rev
                      <SortIcon field="dgt_revision" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_revision" value={filters.dgt_revision} onChange={(v) => updateFilter('dgt_revision', v)} label="Revision" />
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
                    <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.dgt_dbp6bd041engineeringid} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-sm text-gray-900 truncate">
                        {record.dgt_dtfid || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_transmittalref || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900 truncate">
                        {record.dgt_transmittalsubject || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_discipline || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {record.dgt_transmittaltype || '-'}
                      </td>
                      {/* Actual Submission Date - Editable */}
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {editingCell?.recordId === record.dgt_dbp6bd041engineeringid && editingCell?.field === 'dgt_actualsubmissiondate' ? (
                          <input
                            type="datetime-local"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd041engineeringid, 'dgt_actualsubmissiondate')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd041engineeringid, 'dgt_actualsubmissiondate')}
                            className="w-36 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd041engineeringid, 'dgt_actualsubmissiondate', record.dgt_actualsubmissiondate)}
                            className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded inline-flex items-center gap-1 group"
                            title="Click to edit"
                          >
                            {formatDate(record.dgt_actualsubmissiondate)}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      {/* Actual Return Date - Editable */}
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {editingCell?.recordId === record.dgt_dbp6bd041engineeringid && editingCell?.field === 'dgt_actualreturndate' ? (
                          <input
                            type="datetime-local"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd041engineeringid, 'dgt_actualreturndate')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd041engineeringid, 'dgt_actualreturndate')}
                            className="w-36 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd041engineeringid, 'dgt_actualreturndate', record.dgt_actualreturndate)}
                            className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded inline-flex items-center gap-1 group"
                            title="Click to edit"
                          >
                            {formatDate(record.dgt_actualreturndate)}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      {/* Revision - Editable */}
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        {editingCell?.recordId === record.dgt_dbp6bd041engineeringid && editingCell?.field === 'dgt_revision' ? (
                          <input
                            type="number"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd041engineeringid, 'dgt_revision')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd041engineeringid, 'dgt_revision')}
                            className="w-14 px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd041engineeringid, 'dgt_revision', record.dgt_revision)}
                            className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded inline-flex items-center gap-1 group"
                            title="Click to edit"
                          >
                            {record.dgt_revision ?? '-'}
                            <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                        )}
                      </td>
                      {/* Status - Editable */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {editingCell?.recordId === record.dgt_dbp6bd041engineeringid && editingCell?.field === 'dgt_status' ? (
                          <input
                            type="text"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value.toUpperCase())}
                            onBlur={() => saveInlineEdit(record.dgt_dbp6bd041engineeringid, 'dgt_status')}
                            onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd041engineeringid, 'dgt_status')}
                            className="w-16 px-2 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                            autoFocus
                            placeholder="A/B/C/D/UR/E"
                          />
                        ) : (
                          <span
                            onClick={() => startEditing(record.dgt_dbp6bd041engineeringid, 'dgt_status', record.dgt_status)}
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer hover:opacity-80 ${
                              record.dgt_status === 'A'
                                ? 'bg-green-100 text-green-800'
                                : record.dgt_status === 'B'
                                ? 'bg-orange-100 text-orange-800'
                                : record.dgt_status === 'C'
                                ? 'bg-red-100 text-red-700'
                                : record.dgt_status === 'D'
                                ? 'bg-red-200 text-red-900'
                                : record.dgt_status === 'UR'
                                ? 'bg-yellow-100 text-yellow-800'
                                : record.dgt_status === 'E'
                                ? 'bg-gray-200 text-gray-700'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {record.dgt_status || '-'}
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        {deleteConfirm === record.dgt_dbp6bd041engineeringid ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(record.dgt_dbp6bd041engineeringid)}
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
                            onClick={() => setDeleteConfirm(record.dgt_dbp6bd041engineeringid)}
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
        title="Create Engineering Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="DTF ID"
            type="text"
            {...register('dgt_dtfid')}
            error={errors.dgt_dtfid?.message}
          />

          <FormField
            label="Transmittal Reference"
            type="text"
            {...register('dgt_transmittalref')}
            error={errors.dgt_transmittalref?.message}
          />

          <FormField
            label="Subject"
            type="text"
            {...register('dgt_transmittalsubject')}
            error={errors.dgt_transmittalsubject?.message}
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
            label="Transmittal Type"
            type="number"
            {...register('dgt_transmittaltype', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_transmittaltype?.message}
          />

          <FormField
            label="Planned Submission Date"
            type="datetime-local"
            {...register('dgt_plannedsubmissiondate')}
            error={errors.dgt_plannedsubmissiondate?.message}
          />

          <FormField
            label="Planned Approval Date"
            type="datetime-local"
            {...register('dgt_plannedapprovaldate')}
            error={errors.dgt_plannedapprovaldate?.message}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_long_lead"
              {...register('is_long_lead')}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_long_lead" className="text-sm font-medium text-gray-700">
              Long Lead Item
            </label>
          </div>

          <FormField
            label="Actual Submission Date"
            type="datetime-local"
            {...register('dgt_actualsubmissiondate')}
            error={errors.dgt_actualsubmissiondate?.message}
          />

          <FormField
            label="Actual Return Date"
            type="datetime-local"
            {...register('dgt_actualreturndate')}
            error={errors.dgt_actualreturndate?.message}
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

          <FormField
            label="Status"
            type="text"
            {...register('dgt_status')}
            error={errors.dgt_status?.message}
          />

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
