import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { schemaClient } from '@/lib/supabase'
import type { Payments } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsvControls } from '@/components/CsvControls'
import { exportToCsv } from '@/utils/csv'

interface PaymentsFormData {
  ref: string
  payment_date: string
  month_no: string
  ipa_amount: string
  ipc_amount: string
  status: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'ref' | 'payment_date' | 'month_no' | 'status'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

const formatDate = (v: string | null) => v ? new Date(v).toLocaleDateString() : '-'
const fmtAmt = (v: number | null) => v != null ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'

type EditValues = {
  ref: string
  payment_date: string
  month_no: string
  ipa_amount: string
  ipc_amount: string
  status: string
}

export function PaymentsForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
  const supabase = schemaClient(schemaName)
  const [data, setData] = useState<Payments[]>([])
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
  const [editValues, setEditValues] = useState<EditValues>({ ref: '', payment_date: '', month_no: '', ipa_amount: '', ipc_amount: '', status: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PaymentsFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('dbp6_0009_payments')
      .select('*')
      .eq('dgt_dbp6bd00projectdataid', projectId)
      .order('payment_date', { ascending: false })
    if (error) { showError('Failed to fetch data: ' + error.message) } else { setData(records || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [projectId])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.ref?.toLowerCase().includes(term) ||
        item.status?.toLowerCase().includes(term) ||
        item.month_no?.toString().includes(term)
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
    setEditingId(record.id)
    setEditValues({
      ref: record.ref || '',
      payment_date: record.payment_date ? record.payment_date.split('T')[0] : '',
      month_no: record.month_no != null ? String(record.month_no) : '',
      ipa_amount: record.ipa_amount != null ? String(record.ipa_amount) : '',
      ipc_amount: record.ipc_amount != null ? String(record.ipc_amount) : '',
      status: record.status || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('dbp6_0009_payments').update({
      ref: editValues.ref || null,
      payment_date: editValues.payment_date || null,
      month_no: editValues.month_no ? parseInt(editValues.month_no) : null,
      ipa_amount: editValues.ipa_amount ? parseFloat(editValues.ipa_amount) : null,
      ipc_amount: editValues.ipc_amount ? parseFloat(editValues.ipc_amount) : null,
      status: editValues.status || null,
    } as never).eq('id', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.id === editingId ? {
        ...r,
        ref: editValues.ref || null,
        payment_date: editValues.payment_date || null,
        month_no: editValues.month_no ? parseInt(editValues.month_no) : null,
        ipa_amount: editValues.ipa_amount ? parseFloat(editValues.ipa_amount) : null,
        ipc_amount: editValues.ipc_amount ? parseFloat(editValues.ipc_amount) : null,
        status: editValues.status || null,
      } : r))
      showSuccess('Record updated'); setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: PaymentsFormData) => {
    setSaving(true)
    const { error } = await supabase.from('dbp6_0009_payments').insert({
      dgt_dbp6bd00projectdataid: projectId || null,
      ref: formData.ref || null,
      payment_date: formData.payment_date || null,
      month_no: formData.month_no ? parseInt(formData.month_no) : null,
      ipa_amount: formData.ipa_amount ? parseFloat(formData.ipa_amount) : null,
      ipc_amount: formData.ipc_amount ? parseFloat(formData.ipc_amount) : null,
      status: formData.status || null,
    } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_0009_payments').delete().eq('id', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.id !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  const handleExport = () => {
    const headers = ['ref', 'payment_date', 'month_no', 'ipa_amount', 'ipc_amount', 'status']
    const rows = data.map(r => [r.ref, r.payment_date, r.month_no, r.ipa_amount, r.ipc_amount, r.status])
    exportToCsv('payments', headers, rows)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.ref)
      .map(({ ref, payment_date, month_no, ipa_amount, ipc_amount, status }) => ({
        dgt_dbp6bd00projectdataid: projectId,
        ref: ref || null,
        payment_date: payment_date || null,
        month_no: month_no ? parseInt(month_no) : null,
        ipa_amount: ipa_amount ? parseFloat(ipa_amount) : null,
        ipc_amount: ipc_amount ? parseFloat(ipc_amount) : null,
        status: status || null,
      }))
    if (inserts.length === 0) { showError('No valid rows to import'); return }
    const { error } = await supabase.from('dbp6_0009_payments').upsert(inserts as never[], { onConflict: 'ref' })
    if (error) { showError('Import failed: ' + error.message) }
    else { showSuccess(`${inserts.length} records imported`); fetchData() }
  }

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by ref, status, month..." />
        </div>
        <div className="flex items-center gap-2">
          <CsvControls onExport={handleExport} onImport={handleImport} />
          <button onClick={() => { reset({}); setIsModalOpen(true) }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create New
          </button>
        </div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('ref')}>Ref<SortIcon field="ref" /></div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('payment_date')}>Payment Date<SortIcon field="payment_date" /></div>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('month_no')}>Month<SortIcon field="month_no" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">IPA Amt</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">IPC Amt</th>
                  <th className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('status')}>Status<SortIcon field="status" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => {
                  const isEditing = editingId === record.id
                  return (
                    <tr key={record.id} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.ref} onChange={set('ref')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[120px]"><input type="date" value={editValues.payment_date} onChange={set('payment_date')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[70px]"><input type="number" value={editValues.month_no} onChange={set('month_no')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input type="number" value={editValues.ipa_amount} onChange={set('ipa_amount')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input type="number" value={editValues.ipc_amount} onChange={set('ipc_amount')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.status} onChange={set('status')} onKeyDown={e => { if (e.key === 'Enter') setShowSaveConfirm(true); if (e.key === 'Escape') setShowEditCancelConfirm(true) }} className={inputCls} /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setShowSaveConfirm(true)} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                              <button onClick={() => setShowEditCancelConfirm(true)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.ref || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.payment_date)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-center">{record.month_no ?? '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-right">{fmtAmt(record.ipa_amount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap text-right">{fmtAmt(record.ipc_amount)}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.status || '-'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-blue-500 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                              <button onClick={() => setDeleteConfirm(record.id)} title="Delete" className="p-1 text-red-500 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
          <FormField label="Ref" type="text" {...register('ref')} error={errors.ref?.message} />
          <FormField label="Payment Date" type="date" {...register('payment_date')} error={errors.payment_date?.message} />
          <FormField label="Month No" type="number" {...register('month_no')} error={errors.month_no?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="IPA Amount" type="number" {...register('ipa_amount')} error={errors.ipa_amount?.message} />
            <FormField label="IPC Amount" type="number" {...register('ipc_amount')} error={errors.ipc_amount?.message} />
          </div>
          <FormField label="Status" type="text" {...register('status')} error={errors.status?.message} />
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
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this record?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
