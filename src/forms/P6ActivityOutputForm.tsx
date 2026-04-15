import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { P6ActivityOutput } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface P6ActivityOutputFormData {
  project_code: string
  activity_id: string
  field_name: string
  field_value: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'project_code' | 'activity_id' | 'field_name' | 'field_value' | 'last_updated'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

export function P6ActivityOutputForm() {
  const [data, setData] = useState<P6ActivityOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState({ project_code: '', activity_id: '', field_name: '', field_value: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<P6ActivityOutputFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('p6_activity_output')
      .select('*')
      .order('project_code', { ascending: true })
    if (error) { showError('Failed to fetch data: ' + error.message) }
    else { setData(records as P6ActivityOutput[] | null || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.project_code?.toLowerCase().includes(term) ||
        item.activity_id?.toLowerCase().includes(term) ||
        item.field_name?.toLowerCase().includes(term) ||
        item.field_value?.toLowerCase().includes(term)
      )
    }
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
  }, [data, searchTerm, sortField, sortDirection])

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

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    try {
      return new Date(d).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return d }
  }

  const startEdit = (record: P6ActivityOutput) => {
    setEditingId(record.id)
    setEditValues({
      project_code: record.project_code || '',
      activity_id: record.activity_id || '',
      field_name: record.field_name || '',
      field_value: record.field_value || '',
    })
  }

  const handleSaveEdit = async () => {
    if (editingId == null) return
    setSaving(true)
    const { error } = await supabase
      .from('p6_activity_output')
      .update({
        project_code: editValues.project_code,
        activity_id: editValues.activity_id || null,
        field_name: editValues.field_name,
        field_value: editValues.field_value || null,
      } as never)
      .eq('id', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.id === editingId
        ? { ...r, project_code: editValues.project_code, activity_id: editValues.activity_id || null, field_name: editValues.field_name, field_value: editValues.field_value || null }
        : r))
      showSuccess('Record updated')
      setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: P6ActivityOutputFormData) => {
    setSaving(true)
    const { error } = await supabase
      .from('p6_activity_output')
      .insert({
        project_code: formData.project_code,
        activity_id: formData.activity_id || null,
        field_name: formData.field_name,
        field_value: formData.field_value || null,
      } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    const { error } = await supabase.from('p6_activity_output').delete().eq('id', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.id !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  const colHeaders: { key: SortField; label: string }[] = [
    { key: 'project_code', label: 'Project Code' },
    { key: 'activity_id', label: 'Activity ID' },
    { key: 'field_name', label: 'Field Name' },
    { key: 'field_value', label: 'Value' },
    { key: 'last_updated', label: 'Last Updated' },
  ]

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Project Code, Activity ID, Field..." />
        </div>
        <button
          onClick={() => { reset(); setIsModalOpen(true) }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create New
        </button>
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
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => (
                  <tr key={record.id} className={editingId === record.id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    {editingId === record.id ? (
                      <>
                        <td className="px-2 py-1.5"><input value={editValues.project_code} onChange={e => setEditValues(p => ({ ...p, project_code: e.target.value }))} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={editValues.activity_id} onChange={e => setEditValues(p => ({ ...p, activity_id: e.target.value }))} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={editValues.field_name} onChange={e => setEditValues(p => ({ ...p, field_name: e.target.value }))} className={inputCls} /></td>
                        <td className="px-2 py-1.5">
                          <input
                            value={editValues.field_value}
                            onChange={e => setEditValues(p => ({ ...p, field_value: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') setShowSaveConfirm(true); if (e.key === 'Escape') setShowEditCancelConfirm(true) }}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDate(record.last_updated)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setShowSaveConfirm(true)} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={() => setShowEditCancelConfirm(true)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-sm font-mono text-gray-900 whitespace-nowrap">{record.project_code}</td>
                        <td className="px-3 py-2.5 text-sm font-mono text-gray-700 whitespace-nowrap">{record.activity_id || '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.field_name}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-700">{record.field_value || '-'}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDate(record.last_updated)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-blue-500 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setDeleteConfirm(record.id)} title="Delete" className="p-1 text-red-500 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredAndSortedData.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Activity Output">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Project Code *" type="text" {...register('project_code', { required: 'Project Code is required' })} error={errors.project_code?.message} />
          <FormField label="Activity ID" type="text" {...register('activity_id')} error={errors.activity_id?.message} />
          <FormField label="Field Name *" type="text" {...register('field_name', { required: 'Field Name is required' })} error={errors.field_name?.message} />
          <FormField label="Field Value" type="text" {...register('field_value')} error={errors.field_value?.message} />
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={deleteConfirm != null} title="Delete Record" message="Permanently delete this record?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm != null && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="You have unsaved changes. Discard them?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this record?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
