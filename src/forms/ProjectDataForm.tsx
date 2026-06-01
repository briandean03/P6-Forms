import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { schemaClient } from '../lib/supabase'
import { ProjectData } from '../types/database'
import { useNotification } from '../hooks/useNotification'
import { Notification } from '../components/Notification'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormField } from '../components/FormField'
import { SearchFilter } from '../components/SearchFilter'
import { Pagination } from '../components/Pagination'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { CsvControls } from '../components/CsvControls'
import { exportToCsv } from '../utils/csv'

type EditableField = Exclude<keyof ProjectData, 'dgt_dbp6bd00projectdataid'>

interface ProjectDataFormData {
  dgt_projectname: string
  dgt_projectid: string
  dgt_employersname: string
  dgt_contractorsname: string
  dgt_consultantsname: string
  dgt_pmcsname: string
  dgt_location: string
  dgt_contractvalue: string
  dgt_projectstartdate: string
  dgt_projectenddate: string
  dgt_reportingstartingdate: string
  dgt_datadate: string
  dgt_elapsedduration: string
  dgt_eotawarded: string
  dgt_weeknum: string
  timezoneruleversionnumber: string
  utcconversiontimezonecode: string
  owningbusinessunit: string
}

type EditingCell = {
  recordId: string
  field: EditableField
} | null

type WebhookStatus = 'idle' | 'loading' | 'success' | 'error'

const WEBHOOKS = [
  { id: '51', label: 'Webhook 51', url: 'https://pmc2p2c.app.n8n.cloud/webhook/70203aa4-fa3c-4a68-a9c4-5454b3ea8dec' },
  { id: '52', label: 'Webhook 52', url: 'https://pmc2p2c.app.n8n.cloud/webhook/ec7b88dc-e7f3-44df-8fde-4c9beaa14ba8' },
  { id: '53', label: 'Webhook 53', url: 'https://pmc2p2c.app.n8n.cloud/webhook/ec7b88dc-e7f3-44df-8fde-4c9beaa14ba8' },
  { id: '55', label: 'Webhook 55', url: 'https://pmc2p2c.app.n8n.cloud/webhook/95f75293-0ad2-49e4-b7d1-b75abd0803ba' },
] as const

const DATE_FIELDS = new Set([
  'dgt_projectstartdate',
  'dgt_projectenddate',
  'dgt_reportingstartingdate',
  'dgt_datadate',
])
const NUMBER_FIELDS = new Set(['dgt_contractvalue', 'dgt_weeknum'])
const NON_EDITABLE_FIELDS = new Set(['dgt_weeknum'])

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs font-medium text-gray-500 w-36 shrink-0 pt-1 leading-tight">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</p>
  )
}

export function ProjectDataForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
  const supabase = schemaClient(schemaName)
  const [data, setData] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [webhookModal, setWebhookModal] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<Record<string, WebhookStatus>>({
    '51': 'idle', '52': 'idle', '53': 'idle', '55': 'idle',
  })
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [cellValue, setCellValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')

  const { notification, hideNotification, showSuccess, showError } = useNotification()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProjectDataFormData>()

  const watchedStartDate = watch('dgt_projectstartdate')

  const ITEMS_PER_PAGE = 15

  const handleCancelModal = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      setIsModalOpen(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('dbp6_0000_projectdata')
        .select('*')
        .order('dgt_dbp6bd00projectdataid', { ascending: false })

      if (projectId) {
        query = query.eq('dgt_dbp6bd00projectdataid', projectId)
      }

      const { data: records, error } = await query

      if (error) {
        showError('Failed to fetch data: ' + error.message)
      } else {
        setData(records || [])
      }
    } catch (err) {
      showError('Failed to fetch data: ' + String(err))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getInputType = (field: string): 'text' | 'date' | 'number' => {
    if (DATE_FIELDS.has(field)) return 'date'
    if (NUMBER_FIELDS.has(field)) return 'number'
    return 'text'
  }

  // dgt_datadate helpers — stores previous day at 23:00 UTC so P6 reads 07:00 GST
  const encodeDataDate = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day - 1, 23, 0, 0)).toISOString()
  }
  const decodeDataDate = (stored: string): string => {
    const d = new Date(stored)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
      .toISOString().slice(0, 10)
  }

  const formatCellValue = (field: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '-'
    if (field === 'dgt_datadate') return new Date(decodeDataDate(value as string)).toLocaleDateString()
    if (DATE_FIELDS.has(field)) return new Date(value as string).toLocaleDateString()
    return String(value)
  }

  const openCreateModal = () => {
    reset()
    setIsModalOpen(true)
  }

  const onSubmit = async (formData: ProjectDataFormData) => {
    setSaving(true)
    const insertData: Record<string, string | number | null> = {}
    for (const key of Object.keys(formData) as (keyof ProjectDataFormData)[]) {
      const val = formData[key]
      if (!val) {
        insertData[key] = null
      } else if (key === 'dgt_datadate') {
        insertData[key] = encodeDataDate(val)
      } else if (NUMBER_FIELDS.has(key)) {
        insertData[key] = parseInt(val) || null
      } else {
        insertData[key] = val
      }
    }

    try {
      const { error } = await supabase.from('dbp6_0000_projectdata').insert(insertData as never)
      if (error) {
        showError('Failed to create record: ' + error.message)
      } else {
        showSuccess('Project posted successfully')
        setIsModalOpen(false)
        fetchData()
      }
    } catch (err) {
      showError('Failed to create record: ' + String(err))
    }
    setSaving(false)
  }

  const startEditing = (
    recordId: string,
    field: EditableField,
    currentValue: string | number | null | undefined
  ) => {
    setEditingCell({ recordId, field })
    if (field === 'dgt_datadate') {
      setCellValue(currentValue ? decodeDataDate(currentValue as string) : '')
    } else if (DATE_FIELDS.has(field)) {
      setCellValue(
        currentValue ? new Date(currentValue as string).toISOString().slice(0, 10) : ''
      )
    } else {
      setCellValue(currentValue?.toString() || '')
    }
  }

  const saveInlineEdit = async (recordId: string, field: EditableField) => {
    let updateValue: string | number | null = cellValue || null
    if (field === 'dgt_datadate' && cellValue) {
      updateValue = encodeDataDate(cellValue)
    } else if (NUMBER_FIELDS.has(field) && cellValue) {
      updateValue = parseInt(cellValue) || null
    }

    try {
      const { error } = await supabase
        .from('dbp6_0000_projectdata')
        .update({ [field]: updateValue } as never)
        .eq('dgt_dbp6bd00projectdataid', recordId)

      if (error) {
        showError('Failed to update: ' + error.message)
      } else {
        setData((prev) =>
          prev.map((item) =>
            item.dgt_dbp6bd00projectdataid === recordId ? { ...item, [field]: updateValue } : item
          )
        )
        showSuccess('Updated successfully')
      }
    } catch (err) {
      showError('Failed to update: ' + String(err))
    }
    setEditingCell(null)
    setCellValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, recordId: string, field: EditableField) => {
    if (e.key === 'Enter') saveInlineEdit(recordId, field)
    else if (e.key === 'Escape') {
      setEditingCell(null)
      setCellValue('')
    }
  }

  const handleDelete = async (recordId: string) => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('dbp6_0000_projectdata')
        .delete()
        .eq('dgt_dbp6bd00projectdataid', recordId)

      if (error) {
        showError('Failed to delete: ' + error.message)
      } else {
        setData((prev) => prev.filter((item) => item.dgt_dbp6bd00projectdataid !== recordId))
        showSuccess('Project deleted successfully')
      }
    } catch (err) {
      showError('Failed to delete: ' + String(err))
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const triggerWebhook = async (id: string, url: string) => {
    setWebhookStatus(prev => ({ ...prev, [id]: 'loading' }))
    try {
      await fetch(url, { method: 'GET' })
      setWebhookStatus(prev => ({ ...prev, [id]: 'success' }))
    } catch {
      setWebhookStatus(prev => ({ ...prev, [id]: 'error' }))
    }
  }

  const filteredAndSortedData = useMemo(() => {
    let result = data

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.dgt_projectname?.toLowerCase().includes(term) ||
          item.dgt_projectid?.toLowerCase().includes(term) ||
          item.project_id?.toLowerCase().includes(term) ||
          item.dgt_employersname?.toLowerCase().includes(term) ||
          item.dgt_location?.toLowerCase().includes(term)
      )
    }

    return result
  }, [data, searchTerm])

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredAndSortedData.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredAndSortedData, currentPage])

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)

  // Renders an inline-editable cell for the vertical layout
  const renderCell = (record: ProjectData, field: keyof ProjectData) => {
    const isEditing =
      editingCell?.recordId === record.dgt_dbp6bd00projectdataid &&
      editingCell?.field === field
    const rawValue = record[field]

    // Read-only fields
    if (NON_EDITABLE_FIELDS.has(field)) {
      return (
        <span className="text-sm text-gray-800 px-1">
          {formatCellValue(field, rawValue as string | number | null)}
        </span>
      )
    }

    // Data date — calendar restricted to weekly intervals from project start date
    if (field === 'dgt_datadate') {
      const startDate = record.dgt_projectstartdate
        ? new Date(record.dgt_projectstartdate).toISOString().slice(0, 10)
        : undefined

      return isEditing ? (
        <input
          type="date"
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value)}
          onBlur={() => saveInlineEdit(record.dgt_dbp6bd00projectdataid, 'dgt_datadate')}
          onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd00projectdataid, 'dgt_datadate')}
          min={startDate}
          className="px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => startEditing(record.dgt_dbp6bd00projectdataid, 'dgt_datadate', rawValue as string | null)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-blue-50 group text-left"
          title="Click to select data date"
        >
          <span className="text-sm text-gray-800">
            {formatCellValue(field, rawValue as string | null)}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      )
    }

    const inputType = getInputType(field)

    return isEditing ? (
      <input
        type={inputType}
        value={cellValue}
        onChange={(e) => setCellValue(e.target.value)}
        onBlur={() => saveInlineEdit(record.dgt_dbp6bd00projectdataid, field as EditableField)}
        onKeyDown={(e) => handleKeyDown(e, record.dgt_dbp6bd00projectdataid, field as EditableField)}
        className={`px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          inputType === 'date' ? 'w-36' : inputType === 'number' ? 'w-28' : 'w-full max-w-sm'
        }`}
        autoFocus
      />
    ) : (
      <button
        type="button"
        onClick={() => startEditing(record.dgt_dbp6bd00projectdataid, field as EditableField, rawValue as string | number | null)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-blue-50 group text-left"
        title="Click to edit"
      >
        <span className="text-sm text-gray-800">
          {formatCellValue(field, rawValue as string | number | null)}
        </span>
        <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    )
  }

  const handleExport = () => {
    const headers = ['dgt_projectname', 'dgt_projectid', 'dgt_employersname', 'dgt_contractorsname', 'dgt_consultantsname', 'dgt_pmcsname', 'dgt_location', 'dgt_contractvalue', 'dgt_projectstartdate', 'dgt_projectenddate', 'dgt_reportingstartingdate', 'dgt_elapsedduration', 'dgt_eotawarded']
    const rows = data.map(r => [r.dgt_projectname, r.dgt_projectid, r.dgt_employersname, r.dgt_contractorsname, r.dgt_consultantsname, r.dgt_pmcsname, r.dgt_location, r.dgt_contractvalue, r.dgt_projectstartdate, r.dgt_projectenddate, r.dgt_reportingstartingdate, r.dgt_elapsedduration, r.dgt_eotawarded])
    exportToCsv('project-data', headers, rows)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) { showError('No data found in CSV'); return }
    const inserts = rows
      .filter(r => r.dgt_projectname)
      .map(({ dgt_projectname, dgt_projectid, dgt_employersname, dgt_contractorsname, dgt_consultantsname, dgt_pmcsname, dgt_location, dgt_contractvalue, dgt_projectstartdate, dgt_projectenddate, dgt_reportingstartingdate, dgt_elapsedduration, dgt_eotawarded }) => ({
        dgt_projectname: dgt_projectname || null,
        dgt_projectid: dgt_projectid || null,
        dgt_employersname: dgt_employersname || null,
        dgt_contractorsname: dgt_contractorsname || null,
        dgt_consultantsname: dgt_consultantsname || null,
        dgt_pmcsname: dgt_pmcsname || null,
        dgt_location: dgt_location || null,
        dgt_contractvalue: Number(dgt_contractvalue) || null,
        dgt_projectstartdate: dgt_projectstartdate || null,
        dgt_projectenddate: dgt_projectenddate || null,
        dgt_reportingstartingdate: dgt_reportingstartingdate || null,
        dgt_elapsedduration: dgt_elapsedduration || null,
        dgt_eotawarded: dgt_eotawarded || null,
      }))
    if (inserts.length === 0) { showError('No valid rows to import'); return }
    const { error } = await supabase.from('dbp6_0000_projectdata').insert(inserts as never)
    if (error) { showError('Import failed: ' + error.message) }
    else { showSuccess(`${inserts.length} records imported`); fetchData() }
  }

  if (loading) return <LoadingSpinner />

  const anyWebhookLoading = Object.values(webhookStatus).some(s => s === 'loading')

  return (
    <div className="space-y-4">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}

      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Project Data</h2>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              setWebhookStatus({ '51': 'idle', '52': 'idle', '53': 'idle', '55': 'idle' })
              setWebhookModal(true)
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync
          </button>
          <CsvControls onExport={handleExport} onImport={handleImport} />
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            Post Project
          </button>
        </div>
      </div>

      {/* Search / filter bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
        <div className="flex-1">
          <SearchFilter
            placeholder="Search by project name, ID, employer or location..."
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => { setSearchTerm(''); setCurrentPage(1) }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
          >
            Clear
          </button>
        )}
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filteredAndSortedData.length} of {data.length} record{data.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Vertical project cards */}
      {paginatedData.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-12 text-center text-gray-500">
          {data.length === 0
            ? 'No projects found. Create one by clicking "Post Project".'
            : 'No matching records.'}
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedData.map((record) => (
            <div
              key={record.dgt_dbp6bd00projectdataid}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">
                    {record.dgt_projectname || 'Unnamed Project'}
                  </h3>
                  {record.dgt_projectid && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                      {record.dgt_projectid}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setDeleteConfirm(record.dgt_dbp6bd00projectdataid)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Card body — two-column sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

                {/* Left column */}
                <div className="divide-y divide-gray-100">
                  {/* Project Info */}
                  <div className="px-5 py-4">
                    <SectionHeading>Project Info</SectionHeading>
                    <div className="space-y-0.5">
                      <FieldRow label="Project Name">{renderCell(record, 'dgt_projectname')}</FieldRow>
                      <FieldRow label="Project ID">{renderCell(record, 'dgt_projectid')}</FieldRow>
                      <FieldRow label="Internal ID">
                        <span className="text-sm text-gray-800 px-1">{record.project_id || '-'}</span>
                      </FieldRow>
                      <FieldRow label="P6 Code">{renderCell(record, 'current_p6_project_code')}</FieldRow>
                      <FieldRow label="Location">{renderCell(record, 'dgt_location')}</FieldRow>
                    </div>
                  </div>

                  {/* Parties */}
                  <div className="px-5 py-4">
                    <SectionHeading>Parties</SectionHeading>
                    <div className="space-y-0.5">
                      <FieldRow label="Employer">{renderCell(record, 'dgt_employersname')}</FieldRow>
                      <FieldRow label="Contractor">{renderCell(record, 'dgt_contractorsname')}</FieldRow>
                      <FieldRow label="Consultant">{renderCell(record, 'dgt_consultantsname')}</FieldRow>
                      <FieldRow label="PMCS">{renderCell(record, 'dgt_pmcsname')}</FieldRow>
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div className="divide-y divide-gray-100">
                  {/* Dates */}
                  <div className="px-5 py-4">
                    <SectionHeading>Dates</SectionHeading>
                    <div className="space-y-0.5">
                      <FieldRow label="Start Date">{renderCell(record, 'dgt_projectstartdate')}</FieldRow>
                      <FieldRow label="End Date">{renderCell(record, 'dgt_projectenddate')}</FieldRow>
                      <FieldRow label="Reporting Start">{renderCell(record, 'dgt_reportingstartingdate')}</FieldRow>
                      <FieldRow label="Data Date">{renderCell(record, 'dgt_datadate')}</FieldRow>
                      <FieldRow label="Week #">{renderCell(record, 'dgt_weeknum')}</FieldRow>
                    </div>
                  </div>

                  {/* Contract */}
                  <div className="px-5 py-4">
                    <SectionHeading>Contract</SectionHeading>
                    <div className="space-y-0.5">
                      <FieldRow label="Contract Value">{renderCell(record, 'dgt_contractvalue')}</FieldRow>
                      <FieldRow label="Elapsed Duration">{renderCell(record, 'dgt_elapsedduration')}</FieldRow>
                      <FieldRow label="EOT Awarded">{renderCell(record, 'dgt_eotawarded')}</FieldRow>
                    </div>
                  </div>

                  {/* System */}
                  <div className="px-5 py-4">
                    <SectionHeading>System</SectionHeading>
                    <div className="space-y-0.5">
                      <FieldRow label="Owning Unit">{renderCell(record, 'owningbusinessunit')}</FieldRow>
                      <FieldRow label="Timezone Rule">{renderCell(record, 'timezoneruleversionnumber')}</FieldRow>
                      <FieldRow label="UTC Conversion">{renderCell(record, 'utcconversiontimezonecode')}</FieldRow>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredAndSortedData.length}
        itemsPerPage={ITEMS_PER_PAGE}
      />

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Create Project Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create New Project">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Project Name"
              type="text"
              {...register('dgt_projectname', { required: 'Required' })}
              error={errors.dgt_projectname?.message}
            />
            <FormField
              label="Project ID"
              type="text"
              {...register('dgt_projectid', { required: 'Required' })}
              error={errors.dgt_projectid?.message}
            />
          </div>

          <FormField label="Employer's Name" type="text" {...register('dgt_employersname')} />

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contractor's Name" type="text" {...register('dgt_contractorsname')} />
            <FormField label="Consultant's Name" type="text" {...register('dgt_consultantsname')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="PMCS Name" type="text" {...register('dgt_pmcsname')} />
            <FormField label="Location" type="text" {...register('dgt_location')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contract Value" type="number" {...register('dgt_contractvalue')} />
            <FormField label="Week Number" type="number" {...register('dgt_weeknum')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Project Start Date" type="date" {...register('dgt_projectstartdate')} />
            <FormField label="Project End Date" type="date" {...register('dgt_projectenddate')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Reporting Start Date" type="date" {...register('dgt_reportingstartingdate')} />

            {/* Data Date — calendar starting from project start date */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Data Date</label>
              <input
                type="date"
                min={watchedStartDate || undefined}
                {...register('dgt_datadate')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.dgt_datadate && (
                <p className="text-xs text-red-500">{errors.dgt_datadate.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Elapsed Duration" type="text" {...register('dgt_elapsedduration')} />
            <FormField label="EOT Awarded" type="text" {...register('dgt_eotawarded')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Timezone Rule Version" type="text" {...register('timezoneruleversionnumber')} />
            <FormField label="UTC Conversion Timezone" type="text" {...register('utcconversiontimezonecode')} />
          </div>

          <FormField label="Owning Business Unit" type="text" {...register('owningbusinessunit')} />

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancelModal}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
            >
              {saving ? 'Posting...' : 'Post Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Webhook Sync Modal */}
      <Modal isOpen={webhookModal} onClose={() => setWebhookModal(false)} title="Sync / Update Webhooks">
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-500 mb-4">Trigger an n8n workflow to sync project data.</p>
          {WEBHOOKS.map(({ id, label, url }) => {
            const status = webhookStatus[id]
            return (
              <div key={id} className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <button
                  onClick={() => triggerWebhook(id, url)}
                  disabled={anyWebhookLoading}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed ${
                    status === 'success' ? 'bg-green-100 text-green-700 border border-green-300' :
                    status === 'error'   ? 'bg-red-100 text-red-700 border border-red-300' :
                    status === 'loading' ? 'bg-gray-100 text-gray-400 border border-gray-200' :
                    'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {status === 'loading' && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {status === 'success' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {status === 'error'   && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                  {status === 'idle' ? 'Run' : status === 'loading' ? 'Running…' : status === 'success' ? 'Success' : 'Failed — Retry'}
                </button>
              </div>
            )
          })}
        </div>
      </Modal>

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
