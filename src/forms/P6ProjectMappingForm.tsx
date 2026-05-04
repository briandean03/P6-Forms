import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { P6ProjectMapping } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface FormData {
  dgt_projectid: string
  p6_project_code: string
}

interface EditValues {
  dgt_projectid: string
  p6_project_code: string
}

const ITEMS_PER_PAGE = 15
const inputCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

export function P6ProjectMappingForm() {
  const [data, setData] = useState<P6ProjectMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({ dgt_projectid: '', p6_project_code: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('p6_project_mapping')
      .select('*')
      .order('dgt_projectid', { ascending: true })
    if (error) { showError('Failed to fetch data: ' + error.message) }
    else { setData(records as P6ProjectMapping[] | null || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const term = searchTerm.toLowerCase()
    return data.filter(item =>
      item.dgt_projectid?.toLowerCase().includes(term) ||
      item.p6_project_code?.toLowerCase().includes(term)
    )
  }, [data, searchTerm])

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const startEdit = (record: P6ProjectMapping) => {
    setEditingId(record.id)
    setEditValues({ dgt_projectid: record.dgt_projectid, p6_project_code: record.p6_project_code })
  }

  const handleSaveEdit = async () => {
    if (editingId == null) return
    setSaving(true)
    const { error } = await supabase
      .from('p6_project_mapping')
      .update({ dgt_projectid: editValues.dgt_projectid, p6_project_code: editValues.p6_project_code } as never)
      .eq('id', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.id === editingId ? { ...r, ...editValues } : r))
      showSuccess('Mapping updated')
      setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: FormData) => {
    setSaving(true)
    const { error } = await supabase
      .from('p6_project_mapping')
      .insert({ dgt_projectid: formData.dgt_projectid, p6_project_code: formData.p6_project_code } as never)
    if (error) { showError('Failed to create: ' + error.message) }
    else { showSuccess('Mapping created'); setIsModalOpen(false); reset(); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    const { error } = await supabase.from('p6_project_mapping').delete().eq('id', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(r => r.id !== id)); showSuccess('Mapping deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  const ev = (field: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditValues(p => ({ ...p, [field]: e.target.value }))

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Project ID or P6 Code..." />
        </div>
        <button
          onClick={() => { reset(); setIsModalOpen(true) }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Mapping
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{filteredData.length}</span> mapping{filteredData.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Internal Project ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">P6 Project Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">No mappings found</td></tr>
                ) : paginatedData.map(record => (
                  <tr key={record.id} className={editingId === record.id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    {editingId === record.id ? (
                      <>
                        <td className="px-3 py-1.5"><input value={editValues.dgt_projectid} onChange={ev('dgt_projectid')} className={inputCls} /></td>
                        <td className="px-3 py-1.5"><input value={editValues.p6_project_code} onChange={ev('p6_project_code')} className={inputCls} /></td>
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
                        <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 whitespace-nowrap">{record.dgt_projectid}</td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">{record.p6_project_code}</td>
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

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Add Project Mapping">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Internal Project ID (dgt_projectid) *" type="text" {...register('dgt_projectid', { required: 'Project ID is required' })} error={errors.dgt_projectid?.message} placeholder="e.g. UD-41" />
          <FormField label="P6 Project Code *" type="text" {...register('p6_project_code', { required: 'P6 Project Code is required' })} error={errors.p6_project_code?.message} placeholder="e.g. 41.UDM-RCV R3-UP-021" />
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={deleteConfirm != null} title="Delete Mapping" message="Delete this project mapping?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm != null && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="Discard unsaved changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this mapping?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
