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

interface AocFormData {
  project_id: string
  description: string
}

const ITEMS_PER_PAGE = 15

type SortField = 'aoc_number' | 'description' | 'project_id' | 'created_at'
type SortDirection = 'asc' | 'desc'

export function AreasOfConcernForm() {
  const [data, setData] = useState<AreaOfConcern[]>([])
  const [projects, setProjects] = useState<{ dgt_dbp6bd00projectdataid: string; dgt_projectname: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const {
    register,
    handleSubmit,
    reset,
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
      .select('dgt_dbp6bd00projectdataid, dgt_projectname')
      .order('dgt_projectname', { ascending: true })
    setProjects(projectRecords || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('areas_of_concern')
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
    fetchProjects()
  }, [])

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
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: AocFormData) => {
    // Check for duplicate: same description + project already open
    const normalized = formData.description.trim().toLowerCase()
    const duplicate = data.find(
      (item) =>
        item.project_id === formData.project_id &&
        item.description?.trim().toLowerCase() === normalized
    )

    if (duplicate) {
      showError(
        `This area of concern already exists and is open (${duplicate.aoc_number}). It must be resolved (deleted) before adding it again.`
      )
      return
    }

    setSaving(true)

    const { error } = await supabase.from('areas_of_concern').insert({
      project_id: formData.project_id || null,
      description: formData.description.trim(),
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

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase
      .from('areas_of_concern')
      .delete()
      .eq('id', id)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.id !== id))
      showSuccess('Area of concern resolved and removed')
    }
    setDeleting(false)
    setDeleteConfirm(null)
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
          All listed items are <strong>open</strong> areas of concern. Once an issue is resolved, delete the record. You cannot add a duplicate concern while it remains open.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by AOC number, description..."
          />
        </div>
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

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> open area{filteredAndSortedData.length !== 1 ? 's' : ''} of concern
              {searchTerm && (
                <span className="ml-1 text-gray-500">(filtered from {data.length} total)</span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
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
                  <th className="px-3 py-3 text-left w-28">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Status
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left w-24">
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
                      No open areas of concern
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                        {record.aoc_number}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">
                        <div className="w-40 truncate" title={getProjectName(record.project_id)}>
                          {getProjectName(record.project_id)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-900 max-w-md break-words">
                        {record.description || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(record.created_at)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Open
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => setDeleteConfirm(record.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                          title="Mark as resolved and remove"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Resolve
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

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancelModal}
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
                'Add'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Resolve Area of Concern"
        message="Mark this area of concern as resolved? It will be permanently removed from the list."
        confirmLabel="Resolve & Remove"
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
