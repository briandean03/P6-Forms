import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { Variations } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface VariationsFormData {
  dgt_projectid: string
  dgt_voref: string
  dgt_voappliedamount: string
  dgt_voapprovedamount: string
  dgt_voreceivedamount: string
  dgt_voreceiveddate: string
  dgt_datesubmitted: string
  dgt_dateapproved: string
  statuscode: string
  exchangerate: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'dgt_voref' | 'dgt_projectid' | 'dgt_datesubmitted' | 'dgt_dateapproved' | 'statuscode'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

type EditValues = {
  projectid: string; voref: string; appliedamt: string; approvedamt: string
  receivedamt: string; receiveddate: string; datesubmitted: string; dateapproved: string; statuscode: string
}

export function VariationsForm() {
  const [data, setData] = useState<Variations[]>([])
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
  const [editValues, setEditValues] = useState<EditValues>({ projectid: '', voref: '', appliedamt: '', approvedamt: '', receivedamt: '', receiveddate: '', datesubmitted: '', dateapproved: '', statuscode: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<VariationsFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_0010_variations').select('*').order('dgt_dbp6bd0004variationsid', { ascending: false })
    if (error) { showError('Failed to fetch data: ' + error.message) } else { setData(records || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.dgt_voref?.toLowerCase().includes(term) ||
        item.dgt_projectid?.toLowerCase().includes(term) ||
        item.statuscode?.toString().includes(term)
      )
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]; const bVal = b[sortField]
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1
        if (typeof aVal === 'string' && typeof bVal === 'string')
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        return sortDirection === 'asc' ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1)
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

  const formatDate = (v: string | null) => v ? new Date(v).toLocaleDateString() : '-'
  const fmt = (v: string | null) => v || '-'
  const set = (k: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement>) => setEditValues(p => ({ ...p, [k]: e.target.value }))

  const startEdit = (record: Variations) => {
    setEditingId(record.dgt_dbp6bd0004variationsid)
    setEditValues({
      projectid: record.dgt_projectid || '',
      voref: record.dgt_voref || '',
      appliedamt: record.dgt_voappliedamount || '',
      approvedamt: record.dgt_voapprovedamount || '',
      receivedamt: record.dgt_voreceivedamount || '',
      receiveddate: record.dgt_voreceiveddate || '',
      datesubmitted: record.dgt_datesubmitted ? record.dgt_datesubmitted.split('T')[0] : '',
      dateapproved: record.dgt_dateapproved ? record.dgt_dateapproved.split('T')[0] : '',
      statuscode: record.statuscode != null ? String(record.statuscode) : '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('dbp6_0010_variations').update({
      dgt_projectid: editValues.projectid || null,
      dgt_voref: editValues.voref || null,
      dgt_voappliedamount: editValues.appliedamt || null,
      dgt_voapprovedamount: editValues.approvedamt || null,
      dgt_voreceivedamount: editValues.receivedamt || null,
      dgt_voreceiveddate: editValues.receiveddate || null,
      dgt_datesubmitted: editValues.datesubmitted || null,
      dgt_dateapproved: editValues.dateapproved || null,
      statuscode: editValues.statuscode ? parseInt(editValues.statuscode) : null,
    } as never).eq('dgt_dbp6bd0004variationsid', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.dgt_dbp6bd0004variationsid === editingId ? {
        ...r,
        dgt_projectid: editValues.projectid || null,
        dgt_voref: editValues.voref || null,
        dgt_voappliedamount: editValues.appliedamt || null,
        dgt_voapprovedamount: editValues.approvedamt || null,
        dgt_voreceivedamount: editValues.receivedamt || null,
        dgt_voreceiveddate: editValues.receiveddate || null,
        dgt_datesubmitted: editValues.datesubmitted || null,
        dgt_dateapproved: editValues.dateapproved || null,
        statuscode: editValues.statuscode ? parseInt(editValues.statuscode) : null,
      } : r))
      showSuccess('Record updated'); setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: VariationsFormData) => {
    setSaving(true)
    const { error } = await supabase.from('dbp6_0010_variations').insert({
      dgt_projectid: formData.dgt_projectid || null,
      dgt_voref: formData.dgt_voref || null,
      dgt_voappliedamount: formData.dgt_voappliedamount || null,
      dgt_voapprovedamount: formData.dgt_voapprovedamount || null,
      dgt_voreceivedamount: formData.dgt_voreceivedamount || null,
      dgt_voreceiveddate: formData.dgt_voreceiveddate || null,
      dgt_datesubmitted: formData.dgt_datesubmitted || null,
      dgt_dateapproved: formData.dgt_dateapproved || null,
      statuscode: formData.statuscode ? parseInt(formData.statuscode) : null,
      exchangerate: formData.exchangerate || null,
    } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_0010_variations').delete().eq('dgt_dbp6bd0004variationsid', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.dgt_dbp6bd0004variationsid !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  const colHeaders: [SortField, string][] = [
    ['dgt_projectid', 'Project ID'], ['dgt_voref', 'VO Ref'],
    ['dgt_datesubmitted', 'Submitted'], ['dgt_dateapproved', 'Approved'], ['statuscode', 'Status'],
  ]

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by VO Ref, Project ID..." />
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
                  {colHeaders.map(([field, label]) => (
                    <th key={field} className="px-3 py-3 text-left">
                      <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort(field)}>
                        {label}<SortIcon field={field} />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Applied Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Approved Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Received Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Received Date</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => {
                  const isEditing = editingId === record.dgt_dbp6bd0004variationsid
                  return (
                    <tr key={record.dgt_dbp6bd0004variationsid} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.projectid} onChange={set('projectid')} className={inputCls} placeholder="Project ID" /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.voref} onChange={set('voref')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input type="date" value={editValues.datesubmitted} onChange={set('datesubmitted')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input type="date" value={editValues.dateapproved} onChange={set('dateapproved')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[70px]"><input type="number" value={editValues.statuscode} onChange={set('statuscode')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.appliedamt} onChange={set('appliedamt')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.approvedamt} onChange={set('approvedamt')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.receivedamt} onChange={set('receivedamt')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input value={editValues.receiveddate} onChange={set('receiveddate')} onKeyDown={e => { if (e.key === 'Enter') setShowSaveConfirm(true); if (e.key === 'Escape') setShowEditCancelConfirm(true) }} className={inputCls} placeholder="YYYY-MM-DD" /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setShowSaveConfirm(true)} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                              <button onClick={() => setShowEditCancelConfirm(true)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_projectid)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_voref)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_datesubmitted)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_dateapproved)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.statuscode ?? '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_voappliedamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_voapprovedamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_voreceivedamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{fmt(record.dgt_voreceiveddate)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                              <button onClick={() => setDeleteConfirm(record.dgt_dbp6bd0004variationsid)} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredAndSortedData.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Variation">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Project ID" type="text" {...register('dgt_projectid')} error={errors.dgt_projectid?.message} />
          <FormField label="VO Reference" type="text" {...register('dgt_voref')} error={errors.dgt_voref?.message} />
          <FormField label="Applied Amount" type="text" {...register('dgt_voappliedamount')} error={errors.dgt_voappliedamount?.message} />
          <FormField label="Approved Amount" type="text" {...register('dgt_voapprovedamount')} error={errors.dgt_voapprovedamount?.message} />
          <FormField label="Received Amount" type="text" {...register('dgt_voreceivedamount')} error={errors.dgt_voreceivedamount?.message} />
          <FormField label="Received Date" type="text" placeholder="e.g. 2024-01-15" {...register('dgt_voreceiveddate')} error={errors.dgt_voreceiveddate?.message} />
          <FormField label="Date Submitted" type="date" {...register('dgt_datesubmitted')} error={errors.dgt_datesubmitted?.message} />
          <FormField label="Date Approved" type="date" {...register('dgt_dateapproved')} error={errors.dgt_dateapproved?.message} />
          <FormField label="Status Code" type="number" {...register('statuscode')} error={errors.statuscode?.message} />
          <FormField label="Exchange Rate" type="text" {...register('exchangerate')} error={errors.exchangerate?.message} />
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteConfirm} title="Delete Record" message="Permanently delete this variation? This cannot be undone." confirmLabel="Delete" loading={deleting}
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
