import { useState, useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import type { P6ActivityUpdate } from '@/types/database'
import { Modal } from '@/components/Modal'
import { Pagination } from '@/components/Pagination'
import { SearchFilter } from '@/components/SearchFilter'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FormField } from '@/components/FormField'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface P6ActivityUpdateFormData {
  project_code: string
  task_code: string
  status_code: string
  wbs_id: string
  task_name: string
  act_start_date: string
  act_end_date: string
  complete_pct: string
  remain_drtn_hr_cnt: string
  mrk_uptd: string
  delete_record_flag: string
  data_date: string
}

interface EditValues {
  project_code: string
  task_code: string
  status_code: string
  wbs_id: string
  task_name: string
  act_start_date: string
  act_end_date: string
  complete_pct: string
  remain_drtn_hr_cnt: string
  mrk_uptd: string
  delete_record_flag: string
  data_date: string
}

const ITEMS_PER_PAGE = 15
type SortField = 'project_code' | 'task_code' | 'task_name' | 'status_code' | 'complete_pct' | 'data_date' | 'wbs_id'
type SortDirection = 'asc' | 'desc'

const inputCls = 'w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400'

const formatDate = (d: string | null) => {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

const toDateInputValue = (d: string | null) => {
  if (!d) return ''
  try { return new Date(d).toISOString().slice(0, 10) } catch { return '' }
}

const blankEdit = (): EditValues => ({
  project_code: '', task_code: '', status_code: '', wbs_id: '', task_name: '',
  act_start_date: '', act_end_date: '', complete_pct: '',
  remain_drtn_hr_cnt: '', mrk_uptd: '0', delete_record_flag: '0', data_date: '',
})

const recordToEditValues = (r: P6ActivityUpdate): EditValues => ({
  project_code: r.project_code || '',
  task_code: r.task_code || '',
  status_code: r.status_code || '',
  wbs_id: r.wbs_id || '',
  task_name: r.task_name || '',
  act_start_date: toDateInputValue(r.act_start_date),
  act_end_date: toDateInputValue(r.act_end_date),
  complete_pct: r.complete_pct != null ? String(r.complete_pct) : '',
  remain_drtn_hr_cnt: r.remain_drtn_hr_cnt != null ? String(r.remain_drtn_hr_cnt) : '',
  mrk_uptd: r.mrk_uptd != null ? String(r.mrk_uptd) : '0',
  delete_record_flag: r.delete_record_flag != null ? String(r.delete_record_flag) : '0',
  data_date: toDateInputValue(r.data_date),
})

const editValuesToRow = (vals: EditValues) => ({
  project_code: vals.project_code,
  task_code: vals.task_code,
  status_code: vals.status_code || null,
  wbs_id: vals.wbs_id || null,
  task_name: vals.task_name || null,
  act_start_date: vals.act_start_date || null,
  act_end_date: vals.act_end_date || null,
  complete_pct: vals.complete_pct !== '' ? parseFloat(vals.complete_pct) : null,
  remain_drtn_hr_cnt: vals.remain_drtn_hr_cnt !== '' ? parseFloat(vals.remain_drtn_hr_cnt) : null,
  mrk_uptd: vals.mrk_uptd !== '' ? parseInt(vals.mrk_uptd) : 0,
  delete_record_flag: vals.delete_record_flag !== '' ? parseInt(vals.delete_record_flag) : 0,
  data_date: vals.data_date || null,
})

// Simple CSV helpers
const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

const CSV_HEADERS = ['id', 'project_code', 'task_code', 'task_name', 'status_code', 'wbs_id', 'complete_pct', 'act_start_date', 'act_end_date', 'remain_drtn_hr_cnt', 'data_date', 'mrk_uptd', 'delete_record_flag'] as const

export function P6ActivityUpdatesForm({ projectTextId }: { projectTextId: string }) {
  const [data, setData] = useState<P6ActivityUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<EditValues>(blankEdit())
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const [runUpdateLoading, setRunUpdateLoading] = useState(false)
  // Edit All mode
  const [editAllMode, setEditAllMode] = useState(false)
  const [editAllValues, setEditAllValues] = useState<Record<number, EditValues>>({})
  const [saveAllLoading, setSaveAllLoading] = useState(false)
  // CSV
  const [importLoading, setImportLoading] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const handleRunUpdate = async () => {
    setRunUpdateLoading(true)
    try {
      const response = await fetch('https://pmc2p2c.app.n8n.cloud/webhook/run-p6-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_code: projectTextId }),
      })
      if (!response.ok) throw new Error(`Server responded with ${response.status}`)
      showSuccess('P6 update triggered successfully')
    } catch (err) {
      showError('Failed to run update: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRunUpdateLoading(false)
    }
  }

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<P6ActivityUpdateFormData>()

  const handleCancelModal = () => {
    if (isDirty) { setShowDiscardConfirm(true) } else { setIsModalOpen(false) }
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('p6_activity_updates')
      .select('*')
      .order('project_code', { ascending: true })
    if (error) { showError('Failed to fetch data: ' + error.message) }
    else { setData(records as P6ActivityUpdate[] | null || []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  const filteredAndSortedData = useMemo(() => {
    let result = data
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.project_code?.toLowerCase().includes(term) ||
        item.task_code?.toLowerCase().includes(term) ||
        item.task_name?.toLowerCase().includes(term) ||
        item.status_code?.toLowerCase().includes(term) ||
        item.wbs_id?.toLowerCase().includes(term)
      )
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortField]; const bVal = b[sortField]
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
        return sortDirection === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal))
      })
    }
    return result
  }, [data, searchTerm, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDirection('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4M3 12h18" /></svg>
    return sortDirection === 'asc'
      ? <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  }

  const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Single-row editing
  const startEdit = (record: P6ActivityUpdate) => {
    setEditingId(record.id)
    setEditValues(recordToEditValues(record))
  }

  const handleSaveEdit = async () => {
    if (editingId == null) return
    setSaving(true)
    const { error } = await supabase
      .from('p6_activity_updates')
      .update(editValuesToRow(editValues) as never)
      .eq('id', editingId)
    if (error) { showError('Failed to update: ' + error.message) }
    else {
      setData(prev => prev.map(r => r.id === editingId ? { ...r, ...editValuesToRow(editValues) } : r))
      showSuccess('Record updated')
      setEditingId(null)
    }
    setSaving(false)
  }

  // Edit All mode
  const enterEditAllMode = () => {
    const vals: Record<number, EditValues> = {}
    data.forEach(r => { vals[r.id] = recordToEditValues(r) })
    setEditAllValues(vals)
    setEditingId(null)
    setEditAllMode(true)
  }

  const exitEditAllMode = () => {
    setEditAllMode(false)
    setEditAllValues({})
  }

  const evAll = (id: number, field: keyof EditValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditAllValues(p => ({ ...p, [id]: { ...p[id], [field]: e.target.value } }))

  const handleSaveAll = async () => {
    setSaveAllLoading(true)
    const upsertRows = Object.entries(editAllValues).map(([idStr, vals]) => ({
      id: parseInt(idStr),
      ...editValuesToRow(vals),
    }))
    const { error } = await supabase
      .from('p6_activity_updates')
      .upsert(upsertRows as never[], { onConflict: 'id' })
    if (error) { showError('Failed to save changes: ' + error.message) }
    else {
      showSuccess(`Saved ${upsertRows.length} records`)
      await fetchData()
      exitEditAllMode()
    }
    setSaveAllLoading(false)
  }

  const onSubmit = async (formData: P6ActivityUpdateFormData) => {
    setSaving(true)
    const { error } = await supabase
      .from('p6_activity_updates')
      .insert(editValuesToRow(formData) as never)
    if (error) { showError('Failed to create record: ' + error.message) }
    else { showSuccess('Record created successfully'); setIsModalOpen(false); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    const { error } = await supabase.from('p6_activity_updates').delete().eq('id', id)
    if (error) { showError('Failed to delete: ' + error.message) }
    else { setData(prev => prev.filter(item => item.id !== id)); showSuccess('Record deleted') }
    setDeleting(false); setDeleteConfirm(null)
  }

  // Single-row edit handler
  const ev = (field: keyof EditValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditValues(p => ({ ...p, [field]: e.target.value }))

  // CSV Export
  const handleExportCSV = () => {
    const headerRow = CSV_HEADERS.join(',')
    const rows = filteredAndSortedData.map(r =>
      CSV_HEADERS.map(h => csvEscape(r[h as keyof P6ActivityUpdate])).join(',')
    )
    const csv = [headerRow, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `p6_activity_updates_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // CSV Import
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-imported
    if (importInputRef.current) importInputRef.current.value = ''
    setImportLoading(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { showError('CSV has no data rows'); setImportLoading(false); return }
      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase())
      const toInsert: object[] = []
      const toUpdate: object[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const obj: Record<string, string> = {}
        headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim() ?? '' })
        const idVal = obj['id']
        const row = {
          project_code: obj['project_code'] || '',
          task_code: obj['task_code'] || '',
          task_name: obj['task_name'] || null,
          status_code: obj['status_code'] || null,
          wbs_id: obj['wbs_id'] || null,
          complete_pct: obj['complete_pct'] !== '' && obj['complete_pct'] != null ? parseFloat(obj['complete_pct']) : null,
          act_start_date: obj['act_start_date'] || null,
          act_end_date: obj['act_end_date'] || null,
          remain_drtn_hr_cnt: obj['remain_drtn_hr_cnt'] !== '' && obj['remain_drtn_hr_cnt'] != null ? parseFloat(obj['remain_drtn_hr_cnt']) : null,
          data_date: obj['data_date'] || null,
          mrk_uptd: obj['mrk_uptd'] !== '' && obj['mrk_uptd'] != null ? parseInt(obj['mrk_uptd']) : 0,
          delete_record_flag: obj['delete_record_flag'] !== '' && obj['delete_record_flag'] != null ? parseInt(obj['delete_record_flag']) : 0,
        }
        if (idVal && !isNaN(parseInt(idVal))) {
          toUpdate.push({ id: parseInt(idVal), ...row })
        } else {
          toInsert.push(row)
        }
      }
      let errMsg = ''
      if (toUpdate.length) {
        const { error } = await supabase.from('p6_activity_updates').upsert(toUpdate as never[], { onConflict: 'id' })
        if (error) errMsg += `Update error: ${error.message}. `
      }
      if (toInsert.length) {
        const { error } = await supabase.from('p6_activity_updates').insert(toInsert as never[])
        if (error) errMsg += `Insert error: ${error.message}.`
      }
      if (errMsg) { showError(errMsg) }
      else {
        showSuccess(`Imported ${toUpdate.length} updated + ${toInsert.length} new records`)
        fetchData()
      }
    } catch (err) {
      showError('Failed to parse CSV: ' + (err instanceof Error ? err.message : String(err)))
    }
    setImportLoading(false)
  }

  const colHeaders: { key: SortField | null; label: string }[] = [
    { key: 'project_code', label: 'Project Code' },
    { key: 'task_code', label: 'Task Code' },
    { key: 'task_name', label: 'Task Name' },
    { key: 'status_code', label: 'Status' },
    { key: 'wbs_id', label: 'WBS ID' },
    { key: 'complete_pct', label: '% Complete' },
    { key: null, label: 'Act Start' },
    { key: null, label: 'Act End' },
    { key: null, label: 'Rem. Hrs' },
    { key: 'data_date', label: 'Data Date' },
    { key: null, label: 'Mrk Upd' },
    { key: null, label: 'Del Flag' },
    { key: null, label: 'Actions' },
  ]

  return (
    <div className="space-y-4">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="w-full sm:w-72">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search by Task Code, Name, Status, WBS..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Edit All / Save All */}
          {editAllMode ? (
            <>
              <button
                onClick={handleSaveAll}
                disabled={saveAllLoading}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
              >
                {saveAllLoading ? (
                  <>
                    <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                    Save All Changes
                  </>
                )}
              </button>
              <button
                onClick={exitEditAllMode}
                disabled={saveAllLoading}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={enterEditAllMode}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit All
            </button>
          )}

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
          </button>

          {/* Import CSV */}
          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importLoading}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {importLoading ? (
              <>
                <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
                Import CSV
              </>
            )}
          </button>

          {/* Run Update */}
          <button
            onClick={handleRunUpdate}
            disabled={runUpdateLoading || !projectTextId}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!projectTextId ? 'No project selected' : undefined}
          >
            {runUpdateLoading ? (
              <>
                <svg className="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Running...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Run Update
              </>
            )}
          </button>

          {/* Create New */}
          <button
            onClick={() => { reset({ mrk_uptd: '0', delete_record_flag: '0' }); setIsModalOpen(true) }}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create New
          </button>
        </div>
      </div>

      {/* Edit All mode banner */}
      {editAllMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          <span>Edit All mode — all rows are editable. Click <strong>Save All Changes</strong> to persist, or <strong>Cancel</strong> to discard.</span>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedData.length}</span> record{filteredAndSortedData.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {colHeaders.map(({ key, label }) => (
                    <th key={label} className="px-3 py-3 text-left">
                      {key ? (
                        <div
                          className="flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap"
                          onClick={() => handleSort(key)}
                        >
                          {label}<SortIcon field={key} />
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">{label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr><td colSpan={13} className="px-6 py-8 text-center text-gray-500">No records found</td></tr>
                ) : paginatedData.map(record => {
                  const isEditAll = editAllMode
                  const isSingleEdit = !editAllMode && editingId === record.id
                  const rowVals = isEditAll ? editAllValues[record.id] : editValues

                  if (isEditAll || isSingleEdit) {
                    return (
                      <tr key={record.id} className="bg-amber-50">
                        <td className="px-2 py-1.5"><input value={rowVals?.project_code ?? ''} onChange={isEditAll ? evAll(record.id, 'project_code') : ev('project_code')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={rowVals?.task_code ?? ''} onChange={isEditAll ? evAll(record.id, 'task_code') : ev('task_code')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={rowVals?.task_name ?? ''} onChange={isEditAll ? evAll(record.id, 'task_name') : ev('task_name')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={rowVals?.status_code ?? ''} onChange={isEditAll ? evAll(record.id, 'status_code') : ev('status_code')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input value={rowVals?.wbs_id ?? ''} onChange={isEditAll ? evAll(record.id, 'wbs_id') : ev('wbs_id')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" value={rowVals?.complete_pct ?? ''} onChange={isEditAll ? evAll(record.id, 'complete_pct') : ev('complete_pct')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input type="date" value={rowVals?.act_start_date ?? ''} onChange={isEditAll ? evAll(record.id, 'act_start_date') : ev('act_start_date')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input type="date" value={rowVals?.act_end_date ?? ''} onChange={isEditAll ? evAll(record.id, 'act_end_date') : ev('act_end_date')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" value={rowVals?.remain_drtn_hr_cnt ?? ''} onChange={isEditAll ? evAll(record.id, 'remain_drtn_hr_cnt') : ev('remain_drtn_hr_cnt')} className={inputCls} /></td>
                        <td className="px-2 py-1.5"><input type="date" value={rowVals?.data_date ?? ''} onChange={isEditAll ? evAll(record.id, 'data_date') : ev('data_date')} className={inputCls} /></td>
                        <td className="px-2 py-1.5">
                          <select value={rowVals?.mrk_uptd ?? '0'} onChange={isEditAll ? evAll(record.id, 'mrk_uptd') : ev('mrk_uptd')} className={inputCls}>
                            <option value="0">0</option>
                            <option value="1">1</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={rowVals?.delete_record_flag ?? '0'} onChange={isEditAll ? evAll(record.id, 'delete_record_flag') : ev('delete_record_flag')} className={inputCls}>
                            <option value="0">0</option>
                            <option value="1">1</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {isEditAll ? (
                            <button onClick={() => setDeleteConfirm(record.id)} title="Delete" className="p-1 text-red-400 hover:bg-red-50 rounded">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => setShowSaveConfirm(true)} disabled={saving} title="Save" className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={() => setShowEditCancelConfirm(true)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-sm font-mono text-gray-900 whitespace-nowrap">{record.project_code}</td>
                      <td className="px-3 py-2.5 text-sm font-mono text-gray-900 whitespace-nowrap">{record.task_code}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-900">{record.task_name || '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">{record.status_code || '-'}</td>
                      <td className="px-3 py-2.5 text-sm font-mono text-gray-700 whitespace-nowrap">{record.wbs_id || '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-900 whitespace-nowrap">
                        {record.complete_pct != null ? `${record.complete_pct}%` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.act_start_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.act_end_date)}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                        {record.remain_drtn_hr_cnt != null ? record.remain_drtn_hr_cnt : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(record.data_date)}</td>
                      <td className="px-3 py-2.5 text-sm text-center whitespace-nowrap">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${record.mrk_uptd ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {record.mrk_uptd ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-center whitespace-nowrap">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${record.delete_record_flag ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {record.delete_record_flag ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-blue-500 rounded">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirm(record.id)} title="Delete" className="p-1 text-red-500 rounded">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredAndSortedData.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCancelModal} title="Create Activity Update">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Project Code *" type="text" {...register('project_code', { required: 'Project Code is required' })} error={errors.project_code?.message} />
            <FormField label="Task Code *" type="text" {...register('task_code', { required: 'Task Code is required' })} error={errors.task_code?.message} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status Code" type="text" {...register('status_code')} error={errors.status_code?.message} />
            <FormField label="WBS ID" type="text" {...register('wbs_id')} error={errors.wbs_id?.message} />
          </div>
          <FormField label="Task Name" type="text" {...register('task_name')} error={errors.task_name?.message} />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Actual Start" type="date" {...register('act_start_date')} error={errors.act_start_date?.message} />
            <FormField label="Actual End" type="date" {...register('act_end_date')} error={errors.act_end_date?.message} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="% Complete" type="number" step="0.01" {...register('complete_pct')} error={errors.complete_pct?.message} />
            <FormField label="Remaining Hours" type="number" step="0.01" {...register('remain_drtn_hr_cnt')} error={errors.remain_drtn_hr_cnt?.message} />
          </div>
          <FormField label="Data Date" type="date" {...register('data_date')} error={errors.data_date?.message} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Mrk Updated</label>
              <select {...register('mrk_uptd')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="0">0</option>
                <option value="1">1</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Delete Flag</label>
              <select {...register('delete_record_flag')} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="0">0</option>
                <option value="1">1</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={handleCancelModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={deleteConfirm != null} title="Delete Record" message="Permanently delete this activity update?" confirmLabel="Delete" loading={deleting}
        onConfirm={() => deleteConfirm != null && handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard Changes" message="You have unsaved changes. Discard them?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); setIsModalOpen(false); reset() }} onCancel={() => setShowDiscardConfirm(false)} />
      <ConfirmDialog isOpen={showSaveConfirm} title="Save Changes" message="Save changes to this record?" confirmLabel="Save" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowSaveConfirm(false); handleSaveEdit() }} onCancel={() => setShowSaveConfirm(false)} />
      <ConfirmDialog isOpen={showEditCancelConfirm} title="Discard Changes" message="Discard your changes?" confirmLabel="Discard" cancelLabel="Keep Editing" variant="warning"
        onConfirm={() => { setShowEditCancelConfirm(false); setEditingId(null) }} onCancel={() => setShowEditCancelConfirm(false)} />
    </div>
  )
}
