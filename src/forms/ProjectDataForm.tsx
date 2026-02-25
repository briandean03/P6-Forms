import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { ProjectData } from '../types/database'
import { useNotification } from '../hooks/useNotification'
import { Modal } from '../components/Modal'
import { FormField } from '../components/FormField'
import { SearchFilter } from '../components/SearchFilter'
import { Pagination } from '../components/Pagination'
import { LoadingSpinner } from '../components/LoadingSpinner'

type EditableField = Exclude<keyof ProjectData, 'dgt_dbp6bd00projectdataid'>

interface ProjectDataFormData {
  dgt_projectname: string
  dgt_projectid: string
  project_id: string
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
  importsequencenumber: string
  statuscode: string
  statecode: string
  versionnumber: string
  timezoneruleversionnumber: string
  utcconversiontimezonecode: string
  owningbusinessunit: string
}

type SortField = keyof ProjectData
type SortDirection = 'asc' | 'desc'

type EditingCell = {
  recordId: string
  field: EditableField
} | null

const DATE_FIELDS = new Set([
  'dgt_projectstartdate',
  'dgt_projectenddate',
  'dgt_reportingstartingdate',
  'dgt_datadate',
])
const NUMBER_FIELDS = new Set(['dgt_contractvalue', 'dgt_weeknum', 'statuscode', 'versionnumber'])

// All columns except the sticky-first (dgt_projectname) and sticky-last (Actions)
const SCROLLABLE_COLUMNS: { field: keyof ProjectData }[] = [
  { field: 'dgt_projectid' },
  { field: 'project_id' },
  { field: 'dgt_employersname' },
  { field: 'dgt_contractorsname' },
  { field: 'dgt_consultantsname' },
  { field: 'dgt_pmcsname' },
  { field: 'dgt_location' },
  { field: 'dgt_contractvalue' },
  { field: 'dgt_projectstartdate' },
  { field: 'dgt_projectenddate' },
  { field: 'dgt_reportingstartingdate' },
  { field: 'dgt_datadate' },
  { field: 'dgt_elapsedduration' },
  { field: 'dgt_eotawarded' },
  { field: 'dgt_weeknum' },
  { field: 'importsequencenumber' },
  { field: 'statuscode' },
  { field: 'statecode' },
  { field: 'versionnumber' },
  { field: 'timezoneruleversionnumber' },
  { field: 'utcconversiontimezonecode' },
  { field: 'owningbusinessunit' },
]

const formatHeader = (field: string) =>
  field.startsWith('dgt_') ? field.slice(4) : field

export function ProjectDataForm() {
  const [data, setData] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [cellValue, setCellValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchTerm, setSearchTerm] = useState('')

  const { showSuccess, showError } = useNotification()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectDataFormData>()

  const ITEMS_PER_PAGE = 15

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: records, error } = await supabase
        .from('dbp6_bd00projectdata')
        .select('*')
        .order('dgt_dbp6bd00projectdataid', { ascending: false })

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

  const formatCellValue = (field: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '-'
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
      } else if (NUMBER_FIELDS.has(key)) {
        insertData[key] = parseInt(val) || null
      } else {
        insertData[key] = val
      }
    }

    try {
      const { error } = await supabase.from('dbp6_bd00projectdata').insert(insertData as never)
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
    if (DATE_FIELDS.has(field)) {
      setCellValue(
        currentValue ? new Date(currentValue as string).toISOString().slice(0, 10) : ''
      )
    } else {
      setCellValue(currentValue?.toString() || '')
    }
  }

  const saveInlineEdit = async (recordId: string, field: EditableField) => {
    let updateValue: string | number | null = cellValue || null
    if (NUMBER_FIELDS.has(field) && cellValue) {
      updateValue = parseInt(cellValue) || null
    }

    try {
      const { error } = await supabase
        .from('dbp6_bd00projectdata')
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
        .from('dbp6_bd00projectdata')
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
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

    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, searchTerm, sortField, sortDirection])

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredAndSortedData.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredAndSortedData, currentPage])

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)

  const renderCell = (record: ProjectData, field: keyof ProjectData) => {
    const isEditing =
      editingCell?.recordId === record.dgt_dbp6bd00projectdataid &&
      editingCell?.field === field
    const rawValue = record[field]
    const inputType = getInputType(field)

    return isEditing ? (
      <input
        type={inputType}
        value={cellValue}
        onChange={(e) => setCellValue(e.target.value)}
        onBlur={() => saveInlineEdit(record.dgt_dbp6bd00projectdataid, field as EditableField)}
        onKeyDown={(e) =>
          handleKeyDown(e, record.dgt_dbp6bd00projectdataid, field as EditableField)
        }
        className={`px-1 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          inputType === 'date' ? 'w-32' : inputType === 'number' ? 'w-20' : 'w-28'
        }`}
        autoFocus
      />
    ) : (
      <span
        onClick={() =>
          startEditing(
            record.dgt_dbp6bd00projectdataid,
            field as EditableField,
            rawValue as string | number | null
          )
        }
        className="cursor-pointer hover:bg-blue-50 px-1 py-1 rounded block min-w-[40px] whitespace-nowrap"
        title="Click to edit"
      >
        {formatCellValue(field, rawValue as string | number | null)}
      </span>
    )
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Project Data</h2>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Post Project
        </button>
      </div>

      <div className="space-y-3 bg-white p-4 rounded-lg shadow-sm">
        <SearchFilter
          placeholder="Search by project name, ID, employer or location..."
          value={searchTerm}
          onChange={setSearchTerm}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSearchTerm('')
              setCurrentPage(1)
            }}
            className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
          >
            Clear Filter
          </button>
          <span className="text-sm text-gray-600">
            {filteredAndSortedData.length} of {data.length} records
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300">
              {/* Sticky first column */}
              <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left border-r border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                <button
                  onClick={() => handleSort('dgt_projectname')}
                  className="font-semibold text-gray-700 hover:text-gray-900 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  {formatHeader('dgt_projectname')}
                  {sortField === 'dgt_projectname' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>

              {/* Scrollable columns */}
              {SCROLLABLE_COLUMNS.map(({ field }) => (
                <th key={field} className="px-3 py-2 text-left">
                  <button
                    onClick={() => handleSort(field)}
                    className="font-semibold text-gray-700 hover:text-gray-900 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                  >
                    {formatHeader(field)}
                    {sortField === field && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
              ))}

              {/* Sticky last column */}
              <th className="sticky right-0 z-20 bg-gray-50 px-3 py-2 text-left border-l border-gray-300 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] whitespace-nowrap font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((record) => (
              <tr
                key={record.dgt_dbp6bd00projectdataid}
                className="group border-b border-gray-200 hover:bg-gray-50"
              >
                {/* Sticky first column */}
                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-2 text-xs border-r border-gray-200 shadow-[2px_0_4px_rgba(0,0,0,0.06)] font-medium text-gray-900">
                  {renderCell(record, 'dgt_projectname')}
                </td>

                {/* Scrollable columns */}
                {SCROLLABLE_COLUMNS.map(({ field }) => (
                  <td key={field} className="px-3 py-2 text-xs text-gray-700">
                    {renderCell(record, field)}
                  </td>
                ))}

                {/* Sticky last column */}
                <td className="sticky right-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-2 text-xs border-l border-gray-200 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] whitespace-nowrap">
                  <button
                    onClick={() => setDeleteConfirm(record.dgt_dbp6bd00projectdataid)}
                    className="text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedData.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            {data.length === 0
              ? 'No projects found. Create one by clicking "Post Project".'
              : 'No matching records.'}
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredAndSortedData.length}
        itemsPerPage={ITEMS_PER_PAGE}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Confirm Delete"
        >
          <p className="mb-4 text-gray-700">Are you sure you want to delete this project?</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-400"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="projectname"
              type="text"
              {...register('dgt_projectname', { required: 'Required' })}
              error={errors.dgt_projectname?.message}
            />
            <FormField
              label="projectid"
              type="text"
              {...register('dgt_projectid', { required: 'Required' })}
              error={errors.dgt_projectid?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="project_id" type="text" {...register('project_id')} />
            <FormField label="employersname" type="text" {...register('dgt_employersname')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="contractorsname"
              type="text"
              {...register('dgt_contractorsname')}
            />
            <FormField
              label="consultantsname"
              type="text"
              {...register('dgt_consultantsname')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="pmcsname" type="text" {...register('dgt_pmcsname')} />
            <FormField label="location" type="text" {...register('dgt_location')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="contractvalue"
              type="number"
              {...register('dgt_contractvalue')}
            />
            <FormField label="weeknum" type="number" {...register('dgt_weeknum')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="projectstartdate"
              type="date"
              {...register('dgt_projectstartdate')}
            />
            <FormField
              label="projectenddate"
              type="date"
              {...register('dgt_projectenddate')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="reportingstartingdate"
              type="date"
              {...register('dgt_reportingstartingdate')}
            />
            <FormField label="datadate" type="date" {...register('dgt_datadate')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="elapsedduration"
              type="text"
              {...register('dgt_elapsedduration')}
            />
            <FormField label="eotawarded" type="text" {...register('dgt_eotawarded')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="importsequencenumber"
              type="text"
              {...register('importsequencenumber')}
            />
            <FormField label="statuscode" type="number" {...register('statuscode')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="statecode" type="text" {...register('statecode')} />
            <FormField label="versionnumber" type="number" {...register('versionnumber')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="timezoneruleversionnumber"
              type="text"
              {...register('timezoneruleversionnumber')}
            />
            <FormField
              label="utcconversiontimezonecode"
              type="text"
              {...register('utcconversiontimezonecode')}
            />
          </div>

          <FormField
            label="owningbusinessunit"
            type="text"
            {...register('owningbusinessunit')}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
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
    </div>
  )
}
