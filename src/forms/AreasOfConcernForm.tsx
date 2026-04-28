import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { AreaOfConcern } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsvControls } from '@/components/CsvControls'
import { exportToCsv } from '@/utils/csv'

interface AocFormData {
  project_id: string
  description: string
  status: string
}

const ITEMS_PER_PAGE = 15

type SortField = 'aoc_number' | 'description' | 'project_id' | 'created_at' | 'status'
type SortDirection = 'asc' | 'desc'
        
export function AreasOfConcernForm({ projectId }: { projectId: string }) {
  const [data, setData] = useState<AreaOfConcern[]>([])
  const [projects, setProjects] = useState<{ dgt_dbp6bd00projectdataid: string; dgt_projectname: string | null; dgt_projectid: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ project_id: '', description: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AocFormData>()

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
      .select('dgt_dbp6bd00projectdataid, dgt_projectname, dgt_projectid')
      .order('dgt_projectname', { ascending: true })
    setProjects(projectRecords || [])
  }

  const getTextProjectId = (uuid: string | null) => {
    if (!uuid) return null
    return projects.find(p => p.dgt_dbp6bd00projectdataid === uuid)?.dgt_projectid ?? null
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_areas_of_concern')
      .select('*')
      .eq('project_id', projectId)
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
    fetchProjects()
  }, [projectId])

  const filteredAndSortedData = useMemo(() => {
    let result = data

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.aoc_number?.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term) ||
          item.project_id?.toLowerCase().includes(term)
      )
    }

    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]

        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, searchTerm, sortField, sortDirection])

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
    reset({ project_id: '', description: '' })
    setValue('project_id', projectId)
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: AocFormData) => {
    const selectedStatus = formData.status || 'open'
    // Only block if an OPEN record with the same description + project already exists and we're also creating as open
    if (selectedStatus === 'open') {
      const normalized = formData.description.trim().toLowerCase()
      const duplicate = data.find(
        (item) =>
          item.project_id === formData.project_id &&
          item.description?.trim().toLowerCase() === normalized &&
          item.status === 'open'
      )
      if (duplicate) {
        showError(
          `This area of concern is already open (${duplicate.aoc_number}). Close it before adding again.`
        )
        return
      }
    }

    setSaving(true)

    const { error } = await supabase.from('dbp6_areas_of_concern').insert({
      project_id: formData.project_id || null,
      dgt_projectid: getTextProjectId(formData.project_id),
      description: formData.description.trim(),
      status: selectedStatus,
    } as never)

    if (error) {
      showError('Failed to create record: ' + error.message)
    } else {
      showSuccess('Area of concern added successfully')
      setIsModalOpen(false)
      fetchData()
    }

    setSaving(false)
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open'
    setTogglingId(id)

    const { error } = await supabase
      .from('dbp6_areas_of_concern')
      .update({ status: newStatus } as never)
      .eq('id', id)

    if (error) {
      showError('Failed to update status: ' + error.message)
    } else {
      setData((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      )
      showSuccess(newStatus === 'closed' ? 'Marked as closed' : 'Reopened')
    }
    setTogglingId(null)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_areas_of_concern').delete().eq('id', id)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.id !== id))
      showSuccess('Record deleted')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const startEdit = (record: AreaOfConcern) => {
    setEditingId(record.id)
    setEditValues({
      project_id: record.project_id || '',
      description: record.description || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const { error } = await supabase
      .from('dbp6_areas_of_concern')
      .update({
        project_id: editValues.project_id || null,
        dgt_projectid: getTextProjectId(editValues.project_id),
        description: editValues.description.trim(),
      } as never)
      .eq('id', editingId)

    if (error) {
      showError('Failed to update record: ' + error.message)
    } else {
      setData((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, project_id: editValues.project_id || null, dgt_projectid: getTextProjectId(editValues.project_id), description: editValues.description.trim() }
            : item
        )
      )
      showSuccess('Record updated')
      setEditingId(null)
    }
  }

  const handleExport = () => {
    const headers = ['aoc_number', 'description', 'status', 'created_at']
    const rows = data.map(r => [r.aoc_number, r.description, r.status, r.created_at])
    exportToCsv('areas-of-concern', headers, rows)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.description)
      .map(({ aoc_number, description, status }) => ({
        project_id: projectId,
        aoc_number: aoc_number || null,
        description: description || null,
        status: status || 'open',
      }))
    if (inserts.length === 0) { showError('No valid rows to import'); return }
    const { error } = await supabase.from('dbp6_areas_of_concern').insert(inserts as never)
    if (error) { showError('Import failed: ' + error.message) }
    else { showSuccess(`${inserts.length} records imported`); fetchData() }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
  }

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return '-'
    const project = projects.find((p) => p.dgt_dbp6bd00projectdataid === projectId)
    return project?.dgt_projectname || projectId
  }

  const openCount = data.filter((d) => d.status === 'open').length
  const closedCount = data.filter((d) => d.status === 'closed').length

  return (
    <div className="space-y-4">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.194-.833-2.964 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>
          You cannot add a duplicate concern while one is already <strong>open</strong>. Click the status badge to toggle between Open and Closed.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-full sm:w-72">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by AOC number, description..."
            />
          </div>
          {/* Summary counts */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            {openCount} Open
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {closedCount} Closed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CsvControls onExport={handleExport} onImport={handleImport} />
          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Area of Concern
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
              {searchTerm && (
                <span className="ml-1 text-gray-500">(filtered from {data.length} total)</span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-3 text-left w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('aoc_number')}
                    >
                      AOC #
                      <SortIcon field="aoc_number" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left w-40">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('project_id')}
                    >
                      Project
                      <SortIcon field="project_id" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('description')}
                    >
                      Description
                      <SortIcon field="description" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('created_at')}
                    >
                      Date Added
                      <SortIcon field="created_at" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <SortIcon field="status" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left w-20">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Actions
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No areas of concern
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => {
                    const isOpen = record.status === 'open'
                    const isToggling = togglingId === record.id
                    const isEditing = editingId === record.id

                    if (isEditing) {
                      return (
                        <tr key={record.id} className="bg-amber-50">
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                            {record.aoc_number}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={editValues.project_id}
                              onChange={(e) => setEditValues((v) => ({ ...v, project_id: e.target.value }))}
                              className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="">-- None --</option>
                              {projects.map((p) => (
                                <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>
                                  {p.dgt_projectname || p.dgt_dbp6bd00projectdataid}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <textarea
                              value={editValues.description}
                              onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                              rows={2}
                              className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setShowSaveConfirm(true) }
                                if (e.key === 'Escape') setShowEditCancelConfirm(true)
                              }}
                            />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(record.created_at)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-400 italic">
                            (unchanged)
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setShowSaveConfirm(true)}
                                className="p-1 text-green-600 rounded"
                                title="Save changes"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setShowEditCancelConfirm(true)}
                                className="p-1 text-red-500 rounded"
                                title="Discard changes"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={record.id} className={`hover:bg-gray-50 ${!isOpen ? 'opacity-70' : ''}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                          {record.aoc_number}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">
                          <div className="whitespace-nowrap" title={getProjectName(record.project_id)}>
                            {getProjectName(record.project_id)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900 max-w-md break-words">
                          {record.description || '-'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(record.created_at)}
                        </td>
                        {/* Clickable status badge */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleStatus(record.id, record.status ?? 'open')}
                            disabled={isToggling}
                            title={isOpen ? 'Click to close' : 'Click to reopen'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full transition-all hover:opacity-80 disabled:opacity-50 ${
                              isOpen
                                ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                                : 'bg-green-100 text-green-800 hover:bg-green-200'
                            }`}
                          >
                            {isToggling ? (
                              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : isOpen ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            ) : (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {isOpen ? 'Open' : 'Closed'}
                          </button>
                        </td>
                        {/* Actions: Edit + Delete */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(record)}
                              className="p-1 text-blue-500 rounded"
                              title="Edit record"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(record.id)}
                              className="p-1 text-red-500 rounded"
                              title="Delete record"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
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
        title="Add Area of Concern"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Project <span className="text-red-500">*</span>
            </label>
            <select
              {...register('project_id', { required: 'Project is required' })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Project --</option>
              {projects.map((p) => (
                <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>
                  {p.dgt_projectname || p.dgt_dbp6bd00projectdataid}
                </option>
              ))}
            </select>
            {errors.project_id && (
              <p className="text-xs text-red-500">{errors.project_id.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('description', { required: 'Description is required' })}
              rows={4}
              placeholder="Describe the area of concern..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            {errors.description && (
              <p className="text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              {...register('status')}
              defaultValue="open"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancelModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
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
                'Add'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Record"
        message="Permanently delete this area of concern? This cannot be undone."
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

      <ConfirmDialog
        isOpen={showSaveConfirm}
        title="Save Changes"
        message="Save changes to this record?"
        confirmLabel="Save"
        cancelLabel="Keep Editing"
        variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showEditCancelConfirm}
        title="Discard Changes"
        message="Discard your changes?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }}
        onCancel={() => setShowEditCancelConfirm(false)}
      />
    </div>
  )
}
