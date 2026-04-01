import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { Payments } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface PaymentsFormData {
  dbp6bd0003paymentsid: string
  dgt_dbp6bd00projectdataid: string
  dgt_iparef: string
  dgt_ipaamount: string
  dgt_ipaamount_base: string
  dgt_ipcamount: string
  dgt_ipcamount_base: string
  dgt_paymentreceivedamount: string
  dgt_paymentreceivedamount_base: string
  dgt_paymentreceiveddate: string
  dgt_datesubmitted: string
  dgt_dateapproved: string
  statuscode: string
  statecode: string
  exchangerate: string
  transactioncurrencyid: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'dgt_iparef' | 'dgt_datesubmitted' | 'dgt_dateapproved' | 'statuscode'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'
const selectCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white'

const formatDate = (v: string | null) => v ? new Date(v).toLocaleDateString() : '-'
const fmtAmt = (v: number | null) => v != null ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'

type EditValues = {
  projectid: string; iparef: string; ipaamount: string; ipcamount: string
  receivedamount: string; receiveddate: string; datesubmitted: string; dateapproved: string; statuscode: string
}

export function PaymentsForm() {
  const [data, setData] = useState<Payments[]>([])
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
  const [editValues, setEditValues] = useState<EditValues>({ projectid: '', iparef: '', ipaamount: '', ipcamount: '', receivedamount: '', receiveddate: '', datesubmitted: '', dateapproved: '', statuscode: '' })
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PaymentsFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchProjects = async () => {
    const { data: records } = await supabase.from('dbp6_0000_projectdata').select('dgt_dbp6bd00projectdataid, dgt_projectname').order('dgt_projectname', { ascending: true })
    setProjects(records || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase.from('dbp6_0009_payments').select('*').order('dgt_datesubmitted', { ascending: false })
    if (error) { showError('Failed to fetch data: ' + error.message) } else { setData(records || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData(); fetchProjects() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const getProjectName = (id: string | null) => {
    if (!id) return '-'
    return projects.find(p => p.dgt_dbp6bd00projectdataid === id)?.dgt_projectname || id
  }

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.dgt_iparef?.toLowerCase().includes(term) ||
        item.dbp6bd0003paymentsid?.toLowerCase().includes(term) ||
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

  const set = (k: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement>) => setEditValues(p => ({ ...p, [k]: e.target.value }))

  const startEdit = (record: Payments) => {
    setEditingId(record.dbp6bd0003paymentsid)
    setEditValues({
      projectid: record.dgt_dbp6bd00projectdataid || '',
      iparef: record.dgt_iparef || '',
      ipaamount: record.dgt_ipaamount != null ? String(record.dgt_ipaamount) : '',
      ipcamount: record.dgt_ipcamount != null ? String(record.dgt_ipcamount) : '',
      receivedamount: record.dgt_paymentreceivedamount != null ? String(record.dgt_paymentreceivedamount) : '',
      receiveddate: record.dgt_paymentreceiveddate ? record.dgt_paymentreceiveddate.split('T')[0] : '',
      datesubmitted: record.dgt_datesubmitted ? record.dgt_datesubmitted.split('T')[0] : '',
      dateapproved: record.dgt_dateapproved ? record.dgt_dateapproved.split('T')[0] : '',
      statuscode: record.statuscode != null ? String(record.statuscode) : '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('dbp6_0009_payments').update({
      dgt_dbp6bd00projectdataid: editValues.projectid || null,
      dgt_iparef: editValues.iparef || null,
      dgt_ipaamount: editValues.ipaamount ? parseFloat(editValues.ipaamount) : null,
      dgt_ipcamount: editValues.ipcamount ? parseFloat(editValues.ipcamount) : null,
      dgt_paymentreceivedamount: editValues.receivedamount ? parseFloat(editValues.receivedamount) : null,
      dgt_paymentreceiveddate: editValues.receiveddate || null,
      dgt_datesubmitted: editValues.datesubmitted || null,
      dgt_dateapproved: editValues.dateapproved || null,
      statuscode: editValues.statuscode ? parseInt(editValues.statuscode) : null,
    } as never).eq('dbp6bd0003paymentsid', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.dbp6bd0003paymentsid === editingId ? {
        ...r,
        dgt_dbp6bd00projectdataid: editValues.projectid || null,
        dgt_iparef: editValues.iparef || null,
        dgt_ipaamount: editValues.ipaamount ? parseFloat(editValues.ipaamount) : null,
        dgt_ipcamount: editValues.ipcamount ? parseFloat(editValues.ipcamount) : null,
        dgt_paymentreceivedamount: editValues.receivedamount ? parseFloat(editValues.receivedamount) : null,
        dgt_paymentreceiveddate: editValues.receiveddate || null,
        dgt_datesubmitted: editValues.datesubmitted || null,
        dgt_dateapproved: editValues.dateapproved || null,
        statuscode: editValues.statuscode ? parseInt(editValues.statuscode) : null,
      } : r))
      showSuccess('Record updated'); setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: PaymentsFormData) => {
    setSaving(true)
    const { error } = await supabase.from('dbp6_0009_payments').insert({
      dbp6bd0003paymentsid: formData.dbp6bd0003paymentsid,
      dgt_dbp6bd00projectdataid: formData.dgt_dbp6bd00projectdataid || null,
      dgt_iparef: formData.dgt_iparef || null,
      dgt_ipaamount: formData.dgt_ipaamount ? parseFloat(formData.dgt_ipaamount) : null,
      dgt_ipaamount_base: formData.dgt_ipaamount_base ? parseFloat(formData.dgt_ipaamount_base) : null,
      dgt_ipcamount: formData.dgt_ipcamount ? parseFloat(formData.dgt_ipcamount) : null,
      dgt_ipcamount_base: formData.dgt_ipcamount_base ? parseFloat(formData.dgt_ipcamount_base) : null,
      dgt_paymentreceivedamount: formData.dgt_paymentreceivedamount ? parseFloat(formData.dgt_paymentreceivedamount) : null,
      dgt_paymentreceivedamount_base: formData.dgt_paymentreceivedamount_base ? parseFloat(formData.dgt_paymentreceivedamount_base) : null,
      dgt_paymentreceiveddate: formData.dgt_paymentreceiveddate || null,
      dgt_datesubmitted: formData.dgt_datesubmitted || null,
      dgt_dateapproved: formData.dgt_dateapproved || null,
      statuscode: formData.statuscode ? parseInt(formData.statuscode) : null,
      statecode: formData.statecode || null,
      exchangerate: formData.exchangerate ? parseInt(formData.exchangerate) : null,
      transactioncurrencyid: formData.transactioncurrencyid || null,
    } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_0009_payments').delete().eq('dbp6bd0003paymentsid', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.dbp6bd0003paymentsid !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by IPA ref, payment ID..." />
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
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap w-36">Project</th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('dgt_iparef')}>IPA Ref<SortIcon field="dgt_iparef" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">IPA Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">IPC Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Received Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">Received Date</th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('dgt_datesubmitted')}>Submitted<SortIcon field="dgt_datesubmitted" /></div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('dgt_dateapproved')}>Approved<SortIcon field="dgt_dateapproved" /></div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('statuscode')}>Status<SortIcon field="statuscode" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => {
                  const isEditing = editingId === record.dbp6bd0003paymentsid
                  return (
                    <tr key={record.dbp6bd0003paymentsid} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5 min-w-[130px]">
                            <select value={editValues.projectid} onChange={e => setEditValues(p => ({ ...p, projectid: e.target.value }))} className={selectCls}>
                              <option value="">-- No Project --</option>
                              {projects.map(p => <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>{p.dgt_projectname || p.dgt_dbp6bd00projectdataid}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.iparef} onChange={set('iparef')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input type="number" value={editValues.ipaamount} onChange={set('ipaamount')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input type="number" value={editValues.ipcamount} onChange={set('ipcamount')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input type="number" value={editValues.receivedamount} onChange={set('receivedamount')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input type="date" value={editValues.receiveddate} onChange={set('receiveddate')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input type="date" value={editValues.datesubmitted} onChange={set('datesubmitted')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input type="date" value={editValues.dateapproved} onChange={set('dateapproved')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[70px]"><input type="number" value={editValues.statuscode} onChange={set('statuscode')} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null) }} className={inputCls} /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={handleSaveEdit} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                              <button onClick={() => setEditingId(null)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-sm text-gray-900"><div className="w-36 truncate" title={getProjectName(record.dgt_dbp6bd00projectdataid ?? null)}>{getProjectName(record.dgt_dbp6bd00projectdataid ?? null)}</div></td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.dgt_iparef || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-right">{fmtAmt(record.dgt_ipaamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-right">{fmtAmt(record.dgt_ipcamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-right">{fmtAmt(record.dgt_paymentreceivedamount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_paymentreceiveddate)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_datesubmitted)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_dateapproved)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.statuscode ?? '-'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                              <button onClick={() => setDeleteConfirm(record.dbp6bd0003paymentsid)} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Payment">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Payment ID" type="text" {...register('dbp6bd0003paymentsid', { required: 'Payment ID is required' })} error={errors.dbp6bd0003paymentsid?.message} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select {...register('dgt_dbp6bd00projectdataid')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select Project --</option>
              {projects.map(p => <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>{p.dgt_projectname || p.dgt_dbp6bd00projectdataid}</option>)}
            </select>
          </div>
          <FormField label="IPA Reference" type="text" {...register('dgt_iparef')} error={errors.dgt_iparef?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="IPA Amount" type="number" {...register('dgt_ipaamount')} error={errors.dgt_ipaamount?.message} />
            <FormField label="IPA Amount (Base)" type="number" {...register('dgt_ipaamount_base')} error={errors.dgt_ipaamount_base?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="IPC Amount" type="number" {...register('dgt_ipcamount')} error={errors.dgt_ipcamount?.message} />
            <FormField label="IPC Amount (Base)" type="number" {...register('dgt_ipcamount_base')} error={errors.dgt_ipcamount_base?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Payment Received Amt" type="number" {...register('dgt_paymentreceivedamount')} error={errors.dgt_paymentreceivedamount?.message} />
            <FormField label="Payment Received (Base)" type="number" {...register('dgt_paymentreceivedamount_base')} error={errors.dgt_paymentreceivedamount_base?.message} />
          </div>
          <FormField label="Payment Received Date" type="date" {...register('dgt_paymentreceiveddate')} error={errors.dgt_paymentreceiveddate?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date Submitted" type="date" {...register('dgt_datesubmitted')} error={errors.dgt_datesubmitted?.message} />
            <FormField label="Date Approved" type="date" {...register('dgt_dateapproved')} error={errors.dgt_dateapproved?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Status Code" type="number" {...register('statuscode')} error={errors.statuscode?.message} />
            <FormField label="State Code" type="text" {...register('statecode')} error={errors.statecode?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Exchange Rate" type="number" {...register('exchangerate')} error={errors.exchangerate?.message} />
            <FormField label="Currency ID" type="text" {...register('transactioncurrencyid')} error={errors.transactioncurrencyid?.message} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteConfirm} title="Delete Payment" message="Permanently delete this payment record? This cannot be undone." confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="You have unsaved changes. Discard them?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
    </div>
  )
}
