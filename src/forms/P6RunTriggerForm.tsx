import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { P6RunTrigger } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface FormData {
  project_code: string
  triggered: string
  status: string
}

interface EditValues {
  project_code: string
  triggered: string
  triggered_at: string
  completed_at: string
  status: string
}

const ITEMS_PER_PAGE = 15
const inputCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

const formatDateTime = (d: string | null) => {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return d }
}

const toDateTimeLocal = (d: string | null) => {
  if (!d) return ''
  try { return new Date(d).toISOString().slice(0, 16) } catch { return '' }
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
}

export function P6RunTriggerForm() {
  const [data, setData] = useState<P6RunTrigger[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({
    project_code: '', triggered: 'false', triggered_at: '', completed_at: '', status: 'idle',
  })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    defaultValues: { triggered: 'false', status: 'idle' },
  })

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('p6_run_trigger')
      .select('*')
      .order('project_code', { ascending: true })
    if (error) { showError('Failed to fetch data: ' + error.message) }
    else { setData(records as P6RunTrigger[] | null || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const term = searchTerm.toLowerCase()
    return data.filter(item =>
      item.project_code?.toLowerCase().includes(term) ||
      item.status?.toLowerCase().includes(term)
    )
  }, [data, searchTerm])

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const startEdit = (record: P6RunTrigger) => {
    setEditingId(record.id)
    setEditValues({
      project_code: record.project_code,
      triggered: record.triggered ? 'true' : 'false',
      triggered_at: toDateTimeLocal(record.triggered_at),
      completed_at: toDateTimeLocal(record.completed_at),
      status: record.status ?? 'idle',
    })
  }

  const handleSaveEdit = async () => {
    if (editingId == null) return
    setSaving(true)
    const { error } = await supabase
      .from('p6_run_trigger')
      .update({
        project_code: editValues.project_code,
        triggered: editValues.triggered === 'true',
        triggered_at: editValues.triggered_at || null,
        completed_at: editValues.completed_at || null,
        status: editValues.status || 'idle',
      } as never)
      .eq('id', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.id === editingId ? {
        ...r,
        project_code: editValues.project_code,
        triggered: editValues.triggered === 'true',
        triggered_at: editValues.triggered_at || null,
        completed_at: editValues.completed_at || null,
        status: editValues.status || 'idle',
      } : r))
      showSuccess('Record updated')
      setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: FormData) => {
    setSaving(true)
    const { error } = await supabase
      .from('p6_run_trigger')
      .insert({
        project_code: formData.project_code,
        triggered: formData.triggered === 'true',
        status: formData.status || 'idle',
      } as never)
    if (error) { showError('Failed to create: ' + error.message) }
    else { showSuccess('Record created'); setIsModalOpen(false); reset(); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    const { error } = await supabase.from('p6_run_trigger').delete().eq('id', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(r => r.id !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  const ev = (field: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditValues(p => ({ ...p, [field]: e.target.value }))

  const statusOptions = ['idle', 'pending', 'running', 'completed', 'failed']

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Project Code or Status..." />
        </div>
        <button
          onClick={() => { reset({ triggered: 'false', status: 'idle' }); setIsModalOpen(true) }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Entry
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{filteredData.length}</span> entr{filteredData.length !== 1 ? 'ies' : 'y'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Project Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Triggered</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Triggered At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Completed At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No entries found</td></tr>
                ) : paginatedData.map(record => (
                  <tr key={record.id} className={editingId === record.id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    {editingId === record.id ? (
                      <>
                        <td className="px-3 py-1.5"><input value={editValues.project_code} onChange={ev('project_code')} className={inputCls} /></td>
                        <td className="px-3 py-1.5">
                          <select value={editValues.status} onChange={ev('status')} className={inputCls}>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={editValues.triggered} onChange={ev('triggered')} className={inputCls}>
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5"><input type="datetime-local" value={editValues.triggered_at} onChange={ev('triggered_at')} className={inputCls} /></td>
                        <td className="px-3 py-1.5"><input type="datetime-local" value={editValues.completed_at} onChange={ev('completed_at')} className={inputCls} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setShowSaveConfirm(true)} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={() => setShowEditCancelConfirm(true)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 whitespace-nowrap">{record.project_code}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[record.status ?? 'idle'] ?? 'bg-gray-100 text-gray-600'}`}>
                            {record.status ?? 'idle'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${record.triggered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {record.triggered ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDateTime(record.triggered_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDateTime(record.completed_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-blue-500 rounded hover:bg-blue-50">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setDeleteConfirm(record.id)} title="Delete" className="p-1 text-red-500 rounded hover:bg-red-50">
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
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredData.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Add Run Trigger Entry">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Project Code *" type="text" {...register('project_code', { required: 'Project Code is required' })} error={errors.project_code?.message} placeholder="e.g. 41.UDM-RCV R3-UP-021" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select {...register('status')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['idle', 'pending', 'running', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Triggered</label>
              <select {...register('triggered')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={deleteConfirm != null} title="Delete Entry" message="Delete this run trigger entry?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm != null && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="Discard unsaved changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this entry?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
