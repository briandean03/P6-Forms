import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { Subtrades } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface SubtradesFormData {
  dgt_dbp6bd00projectdataid: string
  dgt_subtradecode: string
  dgt_subtradename: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'dgt_dbp6bd014subtradeid' | 'dgt_subtradecode' | 'dgt_subtradename'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'
const selectCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white'

export function SubtradesForm() {
  const [data, setData] = useState<Subtrades[]>([])
  const [projects, setProjects] = useState<{ dgt_dbp6bd00projectdataid: string; dgt_projectname: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ subtradecode: '', subtradename: '', projectid: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<SubtradesFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchProjects = async () => {
    const { data: records } = await supabase.from('dbp6_0000_projectdata').select('dgt_dbp6bd00projectdataid, dgt_projectname').order('dgt_projectname', { ascending: true })
    setProjects(records || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase.from('dbp6_0016_subtrades').select('*').order('dgt_dbp6bd014subtradeid', { ascending: true })
    if (error) { showError('Failed to fetch data: ' + error.message) } else { setData(records || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData(); fetchProjects() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.dgt_dbp6bd014subtradeid?.toLowerCase().includes(term) ||
        item.dgt_subtradecode?.toLowerCase().includes(term) ||
        item.dgt_subtradename?.toLowerCase().includes(term)
      )
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]; const bVal = b[sortField]
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1
        return sortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
      })
    }
    return result
  }, [data, searchTerm, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDirection('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    return sortDirection === 'asc'
      ? <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  }

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredAndSortedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const getProjectName = (id: string | null) => {
    if (!id) return '-'
    return projects.find(p => p.dgt_dbp6bd00projectdataid === id)?.dgt_projectname || id
  }

  const startEdit = (record: Subtrades) => {
    setEditingId(record.dgt_dbp6bd014subtradeid)
    setEditValues({
      subtradecode: record.dgt_subtradecode || '',
      subtradename: record.dgt_subtradename || '',
      projectid: record.dgt_dbp6bd00projectdataid || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('dbp6_0016_subtrades').update({
      dgt_subtradecode: editValues.subtradecode || null,
      dgt_subtradename: editValues.subtradename || null,
      dgt_dbp6bd00projectdataid: editValues.projectid || null,
    } as never).eq('dgt_dbp6bd014subtradeid', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.dgt_dbp6bd014subtradeid === editingId
        ? { ...r, dgt_subtradecode: editValues.subtradecode || null, dgt_subtradename: editValues.subtradename || null, dgt_dbp6bd00projectdataid: editValues.projectid || null }
        : r))
      showSuccess('Record updated'); setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: SubtradesFormData) => {
    setSaving(true)
    const { error } = await supabase.from('dbp6_0016_subtrades').insert({
      dgt_subtradecode: formData.dgt_subtradecode || null,
      dgt_subtradename: formData.dgt_subtradename || null,
      dgt_dbp6bd00projectdataid: formData.dgt_dbp6bd00projectdataid || null,
    } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_0016_subtrades').delete().eq('dgt_dbp6bd014subtradeid', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.dgt_dbp6bd014subtradeid !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Subtrade ID, Code, Name..." />
        </div>
        <button onClick={() => { reset({}); setIsModalOpen(true) }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create New
        </button>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-40">Project</th>
                  {(['dgt_dbp6bd014subtradeid', 'dgt_subtradecode', 'dgt_subtradename'] as SortField[]).map(field => (
                    <th key={field} className="px-3 py-3 text-left">
                      <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort(field)}>
                        {field === 'dgt_dbp6bd014subtradeid' ? 'Subtrade ID' : field === 'dgt_subtradecode' ? 'Code' : 'Name'}<SortIcon field={field} />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => (
                  <tr key={record.dgt_dbp6bd014subtradeid} className={editingId === record.dgt_dbp6bd014subtradeid ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    {editingId === record.dgt_dbp6bd014subtradeid ? (
                      <>
                        <td className="px-2 py-1.5">
                          <select value={editValues.projectid} onChange={e => setEditValues(p => ({ ...p, projectid: e.target.value }))} className={selectCls}>
                            <option value="">-- No Project --</option>
                            {projects.map(p => <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>{p.dgt_projectname || p.dgt_dbp6bd00projectdataid}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-500 whitespace-nowrap">{record.dgt_dbp6bd014subtradeid}</td>
                        <td className="px-2 py-1.5"><input value={editValues.subtradecode} onChange={e => setEditValues(p => ({ ...p, subtradecode: e.target.value }))} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={editValues.subtradename} onChange={e => setEditValues(p => ({ ...p, subtradename: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') setShowSaveConfirm(true); if (e.key === 'Escape') setShowEditCancelConfirm(true) }} className={inputCls} /></td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setShowSaveConfirm(true)} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                            <button onClick={() => setShowEditCancelConfirm(true)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-sm text-gray-900"><div className="w-40 truncate" title={getProjectName(record.dgt_dbp6bd00projectdataid)}>{getProjectName(record.dgt_dbp6bd00projectdataid)}</div></td>
                        <td className="px-3 py-2.5 text-sm font-mono text-gray-900 whitespace-nowrap">{record.dgt_dbp6bd014subtradeid}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.dgt_subtradecode || '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">{record.dgt_subtradename || '-'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={() => setDeleteConfirm(record.dgt_dbp6bd014subtradeid)} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Subtrade">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select {...register('dgt_dbp6bd00projectdataid')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select Project --</option>
              {projects.map(p => <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>{p.dgt_projectname || p.dgt_dbp6bd00projectdataid}</option>)}
            </select>
          </div>
          <FormField label="Subtrade Code" type="text" {...register('dgt_subtradecode')} error={errors.dgt_subtradecode?.message} />
          <FormField label="Subtrade Name" type="text" {...register('dgt_subtradename')} error={errors.dgt_subtradename?.message} />
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteConfirm} title="Delete Record" message="Permanently delete this subtrade?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="You have unsaved changes. Discard them?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this record?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
