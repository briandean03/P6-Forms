import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { Engineering, Type, Discipline } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ColumnFilter } from '@/components/ColumnFilter'
import { DateColumnFilter } from '@/components/DateColumnFilter'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsvControls } from '@/components/CsvControls'
import { exportToCsv } from '@/utils/csv'

interface EngineeringFormData {
  dgt_dbp6bd00projectdataid: string
  // Fields for creating new records
  dgt_dtfid: string
  dgt_transmittalref: string
  dgt_transmittalsubject: string
  dgt_discipline: string
  dgt_plannedsubmissiondate: string
  dgt_plannedapprovaldate: string
  dgt_transmittaltype: string
  is_long_lead: boolean
  // Fields editable for both create and edit
  dgt_actualsubmissiondate: string
  dgt_actualreturndate: string
  dgt_revision: string
  dgt_status: string
}

const ITEMS_PER_PAGE = 15

type SortField = 'dgt_dtfid' | 'dgt_transmittalref' | 'dgt_transmittalsubject' | 'dgt_discipline' | 'dgt_transmittaltype' | 'dgt_actualsubmissiondate' | 'dgt_actualreturndate' | 'dgt_revision' | 'dgt_status'
type SortDirection = 'asc' | 'desc'



export function EngineeringForm({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Engineering[]>([])
  const [types, setTypes] = useState<Type[]>([])
  const [projects, setProjects] = useState<{ dgt_dbp6bd00projectdataid: string; dgt_projectname: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ actualsubmissiondate: '', actualreturndate: '', revision: '', status: '' })
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showTypeLegend, setShowTypeLegend] = useState(false)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [showDisciplineLegend, setShowDisciplineLegend] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  // Column filters
  const [filters, setFilters] = useState({
    dgt_dtfid: '',
    dgt_transmittalref: '',
    dgt_discipline: '',
    dgt_transmittaltype: '',
    dgt_actualsubmissiondate: '',
    dgt_actualreturndate: '',
    dgt_revision: '',
    dgt_status: '',
  })
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const updateFilter = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1)
  }

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<EngineeringFormData>()

  const handleCancelModal = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      setIsModalOpen(false)
    }
  }

  const fetchTypes = async () => {
    const { data: typeRecords, error } = await supabase
      .from('dbp6_0019_type')
      .select('*')
      .order('type_name', { ascending: true })

    if (error) {
      showError('Failed to fetch types: ' + error.message)
      console.error('Error fetching types:', error)
    } else {
      console.log('Fetched types:', typeRecords)
      setTypes(typeRecords || [])
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
      .from('dbp6_000401_engineering')
      .select('*')
      .eq('dgt_dbp6bd00projectdataid', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      showError('Failed to fetch data: ' + error.message)
    } else {
      setData(records || [])
    }
    setLoading(false)
  }

  const fetchDisciplines = async () => {
    const { data: records } = await supabase.from('dbp6_0018_discipline').select('id, discipline_code, discipline_name').order('discipline_code', { ascending: true })
    setDisciplines(records || [])
  }

  useEffect(() => {
    fetchTypes()
    fetchData()
    fetchProjects()
    fetchDisciplines()
  }, [projectId])

  const filteredAndSortedData = useMemo(() => {
    let result = data

    // Text search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.dgt_dtfid?.toLowerCase().includes(term) ||
          item.dgt_transmittalref?.toLowerCase().includes(term) ||
          item.dgt_transmittalsubject?.toLowerCase().includes(term) ||
          item.dgt_discipline?.toString().includes(term)
      )
    }

    // Column filters
    if (filters.dgt_dtfid) {
      result = result.filter((item) => item.dgt_dtfid === filters.dgt_dtfid)
    }
    if (filters.dgt_transmittalref) {
      result = result.filter((item) => item.dgt_transmittalref === filters.dgt_transmittalref)
    }
    if (filters.dgt_discipline) {
      if (filters.dgt_discipline === 'BLANK') {
        result = result.filter((item) => item.dgt_discipline === null || item.dgt_discipline === undefined)
      } else {
        result = result.filter((item) => item.dgt_discipline?.toString() === filters.dgt_discipline)
      }
    }
    if (filters.dgt_transmittaltype) {
      if (filters.dgt_transmittaltype === 'BLANK') {
        result = result.filter((item) => item.dgt_transmittaltype === null || item.dgt_transmittaltype === undefined)
      } else {
        result = result.filter((item) => item.dgt_transmittaltype?.toString() === filters.dgt_transmittaltype)
      }
    }
    if (filters.dgt_actualsubmissiondate) {
      if (filters.dgt_actualsubmissiondate === 'BLANK') {
        result = result.filter((item) => !item.dgt_actualsubmissiondate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_actualsubmissiondate) return false
          const date = new Date(item.dgt_actualsubmissiondate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_actualsubmissiondate
        })
      }
    }
    if (filters.dgt_actualreturndate) {
      if (filters.dgt_actualreturndate === 'BLANK') {
        result = result.filter((item) => !item.dgt_actualreturndate)
      } else {
        // Filter by month/year (format: YYYY-MM)
        result = result.filter((item) => {
          if (!item.dgt_actualreturndate) return false
          const date = new Date(item.dgt_actualreturndate)
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return monthYear === filters.dgt_actualreturndate
        })
      }
    }
    if (filters.dgt_revision) {
      result = result.filter((item) => item.dgt_revision?.toString() === filters.dgt_revision)
    }
    if (filters.dgt_status) {
      result = result.filter((item) => item.dgt_status === filters.dgt_status)
    }

    // Sort
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
  }, [data, searchTerm, filters, sortField, sortDirection])

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
    reset({
      dgt_dtfid: '',
      dgt_transmittalref: '',
      dgt_transmittalsubject: '',
      dgt_discipline: '',
      dgt_plannedsubmissiondate: '',
      dgt_plannedapprovaldate: '',
      dgt_transmittaltype: '',
      is_long_lead: false,
      dgt_actualsubmissiondate: '',
      dgt_actualreturndate: '',
      dgt_revision: '',
      dgt_status: '',
    })
    setValue('dgt_dbp6bd00projectdataid', projectId)
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: EngineeringFormData) => {
    setSaving(true)

    const insertData = {
      dgt_dbp6bd00projectdataid: formData.dgt_dbp6bd00projectdataid,
      dgt_dtfid: formData.dgt_dtfid || null,
      dgt_transmittalref: formData.dgt_transmittalref || null,
      dgt_transmittalsubject: formData.dgt_transmittalsubject || null,
      dgt_discipline: formData.dgt_discipline ? parseInt(formData.dgt_discipline) : null,
      dgt_plannedsubmissiondate: formData.dgt_plannedsubmissiondate || null,
      dgt_plannedapprovaldate: formData.dgt_plannedapprovaldate || null,
      dgt_transmittaltype: formData.dgt_transmittaltype ? parseInt(formData.dgt_transmittaltype) : null,
      is_long_lead: formData.is_long_lead,
      dgt_actualsubmissiondate: formData.dgt_actualsubmissiondate || null,
      dgt_actualreturndate: formData.dgt_actualreturndate || null,
      dgt_revision: formData.dgt_revision ? parseInt(formData.dgt_revision) : null,
      dgt_status: formData.dgt_status || null,
    }

    const { error } = await supabase.from('dbp6_000401_engineering').insert(insertData as never)

    if (error) {
      showError('Failed to create record: ' + error.message)
    } else {
      showSuccess('Record created successfully')
      setIsModalOpen(false)
      fetchData()
    }

    setSaving(false)
  }

  const inputCls = 'w-full px-1.5 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
  }

  const getTypeName = (typeCode: number | null) => {
    if (!typeCode) return '-'
    const type = types.find((t) => t.type_code === typeCode)
    if (!type) {
      console.log('Type not found for code:', typeCode, 'Available types:', types)
    }
    return type?.type_name || `Code: ${typeCode}`
  }

  const getProjectName = (id: string | null) => {
    if (!id) return '-'
    const project = projects.find((p) => p.dgt_dbp6bd00projectdataid === id)
    return project?.dgt_projectname || id
  }

  const startEdit = (record: Engineering) => {
    setEditingId(record.dgt_dbp6bd041engineeringid)
    setEditValues({
      actualsubmissiondate: record.dgt_actualsubmissiondate ? record.dgt_actualsubmissiondate.split('T')[0] : '',
      actualreturndate: record.dgt_actualreturndate ? record.dgt_actualreturndate.split('T')[0] : '',
      revision: record.dgt_revision != null ? String(record.dgt_revision) : '',
      status: record.dgt_status || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const { error } = await supabase.from('dbp6_000401_engineering').update({
      dgt_actualsubmissiondate: editValues.actualsubmissiondate || null,
      dgt_actualreturndate: editValues.actualreturndate || null,
      dgt_revision: editValues.revision ? parseInt(editValues.revision) : null,
      dgt_status: editValues.status || null,
    } as never).eq('dgt_dbp6bd041engineeringid', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.dgt_dbp6bd041engineeringid === editingId ? {
        ...r,
        dgt_actualsubmissiondate: editValues.actualsubmissiondate || null,
        dgt_actualreturndate: editValues.actualreturndate || null,
        dgt_revision: editValues.revision ? parseInt(editValues.revision) : null,
        dgt_status: editValues.status || null,
      } : r))
      showSuccess('Record updated'); setEditingId(null)
    }
  }

  const handleDelete = async (recordId: string) => {
    setDeleting(true)
    const { error } = await supabase
      .from('dbp6_000401_engineering')
      .delete()
      .eq('dgt_dbp6bd041engineeringid', recordId)

    if (error) {
      showError('Failed to delete record: ' + error.message)
    } else {
      setData((prev) => prev.filter((item) => item.dgt_dbp6bd041engineeringid !== recordId))
      showSuccess('Record deleted successfully')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const handleExport = () => {
  const headers = [
    'dgt_dtfid', 
    'dgt_transmittalref', 
    'dgt_transmittalsubject', 
    'dgt_discipline', 
    'dgt_transmittaltype', 
    'dgt_actualsubmissiondate', 
    'dgt_actualreturndate', 
    'dgt_revision', 
    'dgt_status', 
    'is_long_lead', 
    'importsequencenumber'
  ]

  const rows = data.map(r => [
    r.dgt_dtfid, 
    r.dgt_transmittalref, 
    r.dgt_transmittalsubject, 
    r.dgt_discipline, 
    r.dgt_transmittaltype, 
    r.dgt_actualsubmissiondate, 
    r.dgt_actualreturndate, 
    r.dgt_revision, 
    r.dgt_status, 
    String(r.is_long_lead), // Convert boolean to string here
    r.importsequencenumber
  ])

  exportToCsv('engineering-transmittals', headers, rows)
}

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.dgt_dtfid)
      .map(({ dgt_dtfid, dgt_transmittalref, dgt_transmittalsubject, dgt_discipline, dgt_transmittaltype, dgt_actualsubmissiondate, dgt_actualreturndate, dgt_revision, dgt_status, is_long_lead, importsequencenumber }) => ({
        dgt_dbp6bd00projectdataid: projectId,
        dgt_dtfid,
        dgt_transmittalref,
        dgt_transmittalsubject,
        dgt_discipline: Number(dgt_discipline) || null,
        dgt_transmittaltype: Number(dgt_transmittaltype) || null,
        dgt_actualsubmissiondate: dgt_actualsubmissiondate || null,
        dgt_actualreturndate: dgt_actualreturndate || null,
        dgt_revision: Number(dgt_revision) || null,
        dgt_status,
        is_long_lead: is_long_lead === 'true',
        importsequencenumber: importsequencenumber || null,
      }))
    if (inserts.length === 0) { showError('No valid rows to import'); return }
    const { error } = await supabase.from('dbp6_000401_engineering').insert(inserts as never)
    if (error) { showError('Import failed: ' + error.message) }
    else { showSuccess(`${inserts.length} records imported`); fetchData() }
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

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-full sm:w-72">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by DTF ID, Ref, Subject..."
            />
          </div>
          {(Object.values(filters).some(v => v !== '') || sortField !== null) && (
            <button
              onClick={() => {
                setFilters({
                  dgt_dtfid: '',
                  dgt_transmittalref: '',
                  dgt_discipline: '',
                  dgt_transmittaltype: '',
                  dgt_actualsubmissiondate: '',
                  dgt_actualreturndate: '',
                  dgt_revision: '',
                  dgt_status: '',
                })
                setSortField(null)
                setSortDirection('asc')
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700 transition-colors whitespace-nowrap shadow-sm"
              title="Clear all filters and sorting"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-800 rounded">
                {Object.values(filters).filter(v => v !== '').length + (sortField !== null ? 1 : 0)}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowTypeLegend(!showTypeLegend)}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
            title="Show type code reference"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Type Legend
          </button>
          <button
            onClick={() => setShowDisciplineLegend(!showDisciplineLegend)}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
            title="Show discipline code reference"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Discipline Legend
          </button>
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
            Create New
          </button>
        </div>
      </div>

      {showTypeLegend && types.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Transmittal Type Reference</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {types.map((type) => (
              <div key={type.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                  {type.type_code}
                </span>
                <span className="text-gray-700">{type.type_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTypeLegend && types.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">No types found in the database. Please add types to the type table.</p>
        </div>
      )}

      {showDisciplineLegend && disciplines.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Discipline Reference</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {disciplines.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">
                  {d.discipline_code}
                </span>
                <span className="text-gray-700">{d.discipline_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showDisciplineLegend && disciplines.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">No disciplines found. Please add disciplines to the discipline table.</p>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {/* Results count */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
              {(Object.values(filters).some(v => v !== '') || searchTerm) && (
                <span className="ml-1 text-gray-500">
                  (filtered from {data.length} total)
                </span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left align-top w-36">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
                      Project
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_dtfid')}
                    >
                      DTF ID
                      <SortIcon field="dgt_dtfid" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_dtfid" value={filters.dgt_dtfid} onChange={(v) => updateFilter('dgt_dtfid', v)} label="DTF ID" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-36">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittalref')}
                    >
                      Trans. Ref
                      <SortIcon field="dgt_transmittalref" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_transmittalref" value={filters.dgt_transmittalref} onChange={(v) => updateFilter('dgt_transmittalref', v)} label="Trans. Ref" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittalsubject')}
                    >
                      Subject
                      <SortIcon field="dgt_transmittalsubject" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_discipline')}
                    >
                      Disc.
                      <SortIcon field="dgt_discipline" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_discipline" value={filters.dgt_discipline} onChange={(v) => updateFilter('dgt_discipline', v)} label="Discipline" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-24">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_transmittaltype')}
                    >
                      Type
                      <SortIcon field="dgt_transmittaltype" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_transmittaltype" value={filters.dgt_transmittaltype} onChange={(v) => updateFilter('dgt_transmittaltype', v)} label="Type" formatValue={(v) => getTypeName(Number(v))} />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualsubmissiondate')}
                    >
                      Submission
                      <SortIcon field="dgt_actualsubmissiondate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_actualsubmissiondate" value={filters.dgt_actualsubmissiondate} onChange={(v) => updateFilter('dgt_actualsubmissiondate', v)} label="Submission" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-32">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_actualreturndate')}
                    >
                      Return
                      <SortIcon field="dgt_actualreturndate" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <DateColumnFilter data={data} field="dgt_actualreturndate" value={filters.dgt_actualreturndate} onChange={(v) => updateFilter('dgt_actualreturndate', v)} label="Return" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-20">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_revision')}
                    >
                      Rev
                      <SortIcon field="dgt_revision" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_revision" value={filters.dgt_revision} onChange={(v) => updateFilter('dgt_revision', v)} label="Revision" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top w-28">
                    <div
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => handleSort('dgt_status')}
                    >
                      Status
                      <SortIcon field="dgt_status" />
                    </div>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <ColumnFilter data={data} field="dgt_status" value={filters.dgt_status} onChange={(v) => updateFilter('dgt_status', v)} label="Status" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left align-top text-xs font-medium text-gray-600 uppercase tracking-wide w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => {
                    const isEditing = editingId === record.dgt_dbp6bd041engineeringid
                    return (
                      <tr key={record.dgt_dbp6bd041engineeringid} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2.5 text-sm text-gray-900">
                          <div className="whitespace-nowrap font-medium" title={getProjectName(record.dgt_dbp6bd00projectdataid)}>
                            {getProjectName(record.dgt_dbp6bd00projectdataid)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">
                          <div className="whitespace-nowrap" title={record.dgt_dtfid || '-'}>{record.dgt_dtfid || '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">
                          <div className="whitespace-nowrap" title={record.dgt_transmittalref || '-'}>{record.dgt_transmittalref || '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">
                          <div className="whitespace-nowrap" title={record.dgt_transmittalsubject || '-'}>{record.dgt_transmittalsubject || '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">{record.dgt_discipline || '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">{getTypeName(record.dgt_transmittaltype)}</td>
                        {isEditing ? (
                          <>
                            <td className="px-2 py-1.5"><input type="date" value={editValues.actualsubmissiondate} onChange={e => setEditValues(p => ({ ...p, actualsubmissiondate: e.target.value }))} className={inputCls} /></td>
                            <td className="px-2 py-1.5"><input type="date" value={editValues.actualreturndate} onChange={e => setEditValues(p => ({ ...p, actualreturndate: e.target.value }))} className={inputCls} /></td>
                            <td className="px-2 py-1.5"><input type="number" value={editValues.revision} onChange={e => setEditValues(p => ({ ...p, revision: e.target.value }))} className={inputCls} /></td>
                            <td className="px-2 py-1.5">
                              <select value={editValues.status} onChange={e => setEditValues(p => ({ ...p, status: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') setShowSaveConfirm(true); if (e.key === 'Escape') setShowEditCancelConfirm(true) }} className={inputCls}>
                                <option value="">-</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                                <option value="UR">UR</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setShowSaveConfirm(true)} className="p-1 text-green-600 rounded" title="Save"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></button>
                                <button onClick={() => setShowEditCancelConfirm(true)} className="p-1 text-red-500 rounded" title="Cancel"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_actualsubmissiondate)}</td>
                            <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{formatDate(record.dgt_actualreturndate)}</td>
                            <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">{record.dgt_revision ?? '-'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                record.dgt_status === 'A' ? 'bg-green-100 text-green-800'
                                : record.dgt_status === 'B' ? 'bg-sky-100 text-sky-800'
                                : record.dgt_status === 'C' ? 'bg-red-100 text-red-700'
                                : record.dgt_status === 'D' ? 'bg-red-200 text-red-900'
                                : record.dgt_status === 'UR' ? 'bg-yellow-100 text-yellow-800'
                                : record.dgt_status === 'E' ? 'bg-gray-200 text-gray-700'
                                : 'bg-gray-100 text-gray-800'
                              }`}>{record.dgt_status || '-'}</span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <button onClick={() => startEdit(record)} className="p-1 text-blue-500 rounded" title="Edit"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                <button onClick={() => setDeleteConfirm(record.dgt_dbp6bd041engineeringid)} className="p-1 text-red-500 rounded" title="Delete"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </div>
                            </td>
                          </>
                        )}
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
        title="Create Engineering Record"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Project <span className="text-red-500">*</span>
            </label>
            <select
              {...register('dgt_dbp6bd00projectdataid', { required: 'Project is required' })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Project --</option>
              {projects.map((p) => (
                <option key={p.dgt_dbp6bd00projectdataid} value={p.dgt_dbp6bd00projectdataid}>
                  {p.dgt_projectname || p.dgt_dbp6bd00projectdataid}
                </option>
              ))}
            </select>
            {errors.dgt_dbp6bd00projectdataid && (
              <p className="text-xs text-red-500">{errors.dgt_dbp6bd00projectdataid.message}</p>
            )}
          </div>

          <FormField
            label="DTF ID"
            type="text"
            {...register('dgt_dtfid')}
            error={errors.dgt_dtfid?.message}
          />

          <FormField
            label="Transmittal Reference"
            type="text"
            {...register('dgt_transmittalref')}
            error={errors.dgt_transmittalref?.message}
          />

          <FormField
            label="Subject"
            type="text"
            {...register('dgt_transmittalsubject')}
            error={errors.dgt_transmittalsubject?.message}
          />

          <FormField
            label="Discipline"
            type="number"
            {...register('dgt_discipline', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_discipline?.message}
          />

          <div>
            <label htmlFor="dgt_transmittaltype" className="block text-sm font-medium text-gray-700 mb-1">
              Transmittal Type
            </label>
            <select
              id="dgt_transmittaltype"
              {...register('dgt_transmittaltype')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select type...</option>
              {types.map((type) => (
                <option key={type.id} value={type.type_code ?? ''}>
                  {type.type_code} - {type.type_name}
                </option>
              ))}
            </select>
            {errors.dgt_transmittaltype?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.dgt_transmittaltype.message}</p>
            )}
            {types.length === 0 && (
              <p className="mt-1 text-sm text-yellow-600">No types available. Please add types to the type table.</p>
            )}
          </div>

          <FormField
            label="Planned Submission Date"
            type="date"
            {...register('dgt_plannedsubmissiondate')}
            error={errors.dgt_plannedsubmissiondate?.message}
          />

          <FormField
            label="Planned Approval Date"
            type="date"
            {...register('dgt_plannedapprovaldate')}
            error={errors.dgt_plannedapprovaldate?.message}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_long_lead"
              {...register('is_long_lead')}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_long_lead" className="text-sm font-medium text-gray-700">
              Long Lead Item
            </label>
          </div>

          <FormField
            label="Actual Submission Date"
            type="date"
            {...register('dgt_actualsubmissiondate')}
            error={errors.dgt_actualsubmissiondate?.message}
          />

          <FormField
            label="Actual Return Date"
            type="date"
            {...register('dgt_actualreturndate')}
            error={errors.dgt_actualreturndate?.message}
          />

          <FormField
            label="Revision"
            type="number"
            {...register('dgt_revision', {
              validate: (value) =>
                !value || !isNaN(Number(value)) || 'Must be a valid number',
            })}
            error={errors.dgt_revision?.message}
          />

          <div>
            <label htmlFor="dgt_status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="dgt_status"
              {...register('dgt_status')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select status...</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="E">E</option>
              <option value="UR">UR</option>
            </select>
            {errors.dgt_status?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.dgt_status.message}</p>
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
                'Save'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Record"
        message="Are you sure you want to delete this record? This action cannot be undone."
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
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this record?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
