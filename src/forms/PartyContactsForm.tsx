import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { PartyContacts } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface PartyContactsFormData {
  address1_companyname: string
  primarycontact_firstname: string
  primarycontact_lastname: string
  jobtitle: string
  emailaddress1: string
  address1_telephone1: string
  mobile_num: string
  address1_line1: string
  address1_city: string
  address1_country: string
  address1_postalcode: string
  websiteurl: string
  party_type: string
  statuscode: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'address1_companyname' | 'primarycontact_lastname' | 'address1_city' | 'party_type'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

type EditValues = {
  company: string; firstname: string; lastname: string; jobtitle: string
  email: string; phone: string; city: string; partytype: string
}

export function PartyContactsForm() {
  const [data, setData] = useState<PartyContacts[]>([])
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
  const [editValues, setEditValues] = useState<EditValues>({ company: '', firstname: '', lastname: '', jobtitle: '', email: '', phone: '', city: '', partytype: '' })
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PartyContactsFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase.from('dbp6_0100_partycontacts').select('*').order('address1_companyname', { ascending: true })
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
        item.address1_companyname?.toLowerCase().includes(term) ||
        item.primarycontact_firstname?.toLowerCase().includes(term) ||
        item.primarycontact_lastname?.toLowerCase().includes(term) ||
        item.emailaddress1?.toLowerCase().includes(term) ||
        item.address1_city?.toLowerCase().includes(term) ||
        item.party_type?.toLowerCase().includes(term)
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

  const set = (k: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement>) => setEditValues(p => ({ ...p, [k]: e.target.value }))

  const startEdit = (record: PartyContacts) => {
    setEditingId(record.companycontactid)
    setEditValues({
      company: record.address1_companyname || '',
      firstname: record.primarycontact_firstname || '',
      lastname: record.primarycontact_lastname || '',
      jobtitle: record.jobtitle || '',
      email: record.emailaddress1 || '',
      phone: record.address1_telephone1 || record.mobile_num || '',
      city: record.address1_city || '',
      partytype: record.party_type || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('dbp6_0100_partycontacts').update({
      address1_companyname: editValues.company || null,
      primarycontact_firstname: editValues.firstname || null,
      primarycontact_lastname: editValues.lastname || null,
      jobtitle: editValues.jobtitle || null,
      emailaddress1: editValues.email || null,
      address1_telephone1: editValues.phone || null,
      address1_city: editValues.city || null,
      party_type: editValues.partytype || null,
    } as never).eq('companycontactid', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.companycontactid === editingId ? {
        ...r,
        address1_companyname: editValues.company || null,
        primarycontact_firstname: editValues.firstname || null,
        primarycontact_lastname: editValues.lastname || null,
        jobtitle: editValues.jobtitle || null,
        emailaddress1: editValues.email || null,
        address1_telephone1: editValues.phone || null,
        address1_city: editValues.city || null,
        party_type: editValues.partytype || null,
      } : r))
      showSuccess('Record updated'); setEditingId(null)
    }
    setSaving(false)
  }

  const onSubmit = async (formData: PartyContactsFormData) => {
    setSaving(true)
    const { error } = await supabase.from('dbp6_0100_partycontacts').insert({
      address1_companyname: formData.address1_companyname || null,
      primarycontact_firstname: formData.primarycontact_firstname || null,
      primarycontact_lastname: formData.primarycontact_lastname || null,
      jobtitle: formData.jobtitle || null,
      emailaddress1: formData.emailaddress1 || null,
      address1_telephone1: formData.address1_telephone1 || null,
      mobile_num: formData.mobile_num || null,
      address1_line1: formData.address1_line1 || null,
      address1_city: formData.address1_city || null,
      address1_country: formData.address1_country || null,
      address1_postalcode: formData.address1_postalcode || null,
      websiteurl: formData.websiteurl || null,
      party_type: formData.party_type || null,
      statuscode: formData.statuscode || null,
    } as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('dbp6_0100_partycontacts').delete().eq('companycontactid', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.companycontactid !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by company, name, city..." />
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
                  <th className="px-3 py-3 text-left w-44">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('address1_companyname')}>Company<SortIcon field="address1_companyname" /></div>
                  </th>
                  <th className="px-3 py-3 text-left w-36">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('primarycontact_lastname')}>Contact<SortIcon field="primarycontact_lastname" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Job Title</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Email</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Phone</th>
                  <th className="px-3 py-3 text-left w-28">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('address1_city')}>City<SortIcon field="address1_city" /></div>
                  </th>
                  <th className="px-3 py-3 text-left w-28">
                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap" onClick={() => handleSort('party_type')}>Type<SortIcon field="party_type" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => {
                  const isEditing = editingId === record.companycontactid
                  return (
                    <tr key={record.companycontactid} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5 min-w-[140px]"><input value={editValues.company} onChange={set('company')} className={inputCls} placeholder="Company" /></td>
                          <td className="px-2 py-1.5 min-w-[140px]">
                            <div className="flex gap-1">
                              <input value={editValues.firstname} onChange={set('firstname')} className={inputCls} placeholder="First" />
                              <input value={editValues.lastname} onChange={set('lastname')} className={inputCls} placeholder="Last" />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input value={editValues.jobtitle} onChange={set('jobtitle')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[140px]"><input type="email" value={editValues.email} onChange={set('email')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input value={editValues.phone} onChange={set('phone')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[90px]"><input value={editValues.city} onChange={set('city')} className={inputCls} /></td>
                          <td className="px-2 py-1.5 min-w-[90px]"><input value={editValues.partytype} onChange={set('partytype')} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null) }} className={inputCls} /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={handleSaveEdit} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                              <button onClick={() => setEditingId(null)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-sm font-medium text-gray-900"><div className="w-44 truncate" title={record.address1_companyname || ''}>{record.address1_companyname || '-'}</div></td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{[record.primarycontact_firstname, record.primarycontact_lastname].filter(Boolean).join(' ') || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">{record.jobtitle || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-blue-600 whitespace-nowrap">{record.emailaddress1 || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.address1_telephone1 || record.mobile_num || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.address1_city || '-'}</td>
                          <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.party_type || '-'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                              <button onClick={() => setDeleteConfirm(record.companycontactid)} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Party Contact">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Company Name" type="text" {...register('address1_companyname')} error={errors.address1_companyname?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name" type="text" {...register('primarycontact_firstname')} error={errors.primarycontact_firstname?.message} />
            <FormField label="Last Name" type="text" {...register('primarycontact_lastname')} error={errors.primarycontact_lastname?.message} />
          </div>
          <FormField label="Job Title" type="text" {...register('jobtitle')} error={errors.jobtitle?.message} />
          <FormField label="Email" type="email" {...register('emailaddress1')} error={errors.emailaddress1?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Telephone" type="text" {...register('address1_telephone1')} error={errors.address1_telephone1?.message} />
            <FormField label="Mobile" type="text" {...register('mobile_num')} error={errors.mobile_num?.message} />
          </div>
          <FormField label="Address" type="text" {...register('address1_line1')} error={errors.address1_line1?.message} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City" type="text" {...register('address1_city')} error={errors.address1_city?.message} />
            <FormField label="Country" type="text" {...register('address1_country')} error={errors.address1_country?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Postal Code" type="text" {...register('address1_postalcode')} error={errors.address1_postalcode?.message} />
            <FormField label="Website" type="text" {...register('websiteurl')} error={errors.websiteurl?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Party Type" type="text" {...register('party_type')} error={errors.party_type?.message} />
            <FormField label="Status" type="text" {...register('statuscode')} error={errors.statuscode?.message} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteConfirm} title="Delete Contact" message="Permanently delete this contact?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="You have unsaved changes. Discard them?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
    </div>
  )
}
