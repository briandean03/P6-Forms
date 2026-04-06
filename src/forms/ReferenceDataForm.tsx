import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SearchFilter } from '@/components/SearchFilter'

interface RefTableConfig {
  title: string
  table: string
  codeField: string
  nameField: string
  pkField: string
  pkIsAuto: boolean
  codeIsNumber?: boolean
}

const REF_TABLES: RefTableConfig[] = [
  {
    title: 'Disciplines',
    table: 'dbp6_0018_discipline',
    codeField: 'discipline_code',
    nameField: 'discipline_name',
    pkField: 'id',
    pkIsAuto: true,
    codeIsNumber: true,
  },
  {
    title: 'Types',
    table: 'dbp6_0019_type',
    codeField: 'type_code',
    nameField: 'type_name',
    pkField: 'id',
    pkIsAuto: true,
    codeIsNumber: true,
  },
  {
    title: 'Activity Disciplines',
    table: 'dbp6_activity_discipline',
    codeField: 'discipline_code',
    nameField: 'discipline_name',
    pkField: 'discipline_code',
    pkIsAuto: false,
  },
  {
    title: 'Activity Work Types',
    table: 'dbp6_activity_work_type',
    codeField: 'work_type_code',
    nameField: 'work_type_name',
    pkField: 'work_type_code',
    pkIsAuto: false,
  },
]

type Row = Record<string, string | number | null>

interface ReferenceCardProps {
  config: RefTableConfig
  onNotify: (type: 'success' | 'error', message: string) => void
}

function ReferenceCard({ config, onNotify }: ReferenceCardProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  // Add row state
  const [addingRow, setAddingRow] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit row state
  const [editingPk, setEditingPk] = useState<string | number | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<string | number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Search state
  const [searchTerm, setSearchTerm] = useState('')

  // Sort state
  type SortCol = 'code' | 'name'
  const [sortCol, setSortCol] = useState<SortCol>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const displayRows = useMemo(() => {
    let result = rows
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(r =>
        String(r[config.codeField] ?? '').toLowerCase().includes(term) ||
        String(r[config.nameField] ?? '').toLowerCase().includes(term)
      )
    }
    return [...result].sort((a, b) => {
      const aVal = sortCol === 'code' ? a[config.codeField] : a[config.nameField]
      const bVal = sortCol === 'code' ? b[config.codeField] : b[config.nameField]
      if (aVal == null) return sortDir === 'asc' ? 1 : -1
      if (bVal == null) return sortDir === 'asc' ? -1 : 1
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true })
    })
  }, [rows, searchTerm, sortCol, sortDir, config.codeField, config.nameField])

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <svg className="w-3 h-3 text-gray-400 inline ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    return sortDir === 'asc'
      ? <svg className="w-3 h-3 text-blue-600 inline ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-blue-600 inline ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
  }

  const fetchRows = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .order(config.codeField, { ascending: true })
    if (error) onNotify('error', `Failed to load ${config.title}: ${error.message}`)
    else setRows((data as Row[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchRows() }, []) // config is from a constant, safe to omit

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newCode.trim() || !newName.trim()) return
    setSaving(true)
    const payload: Row = {
      [config.codeField]: config.codeIsNumber ? parseFloat(newCode) : newCode.trim(),
      [config.nameField]: newName.trim(),
    }
    const { error } = await supabase.from(config.table).insert(payload as never)
    if (error) {
      onNotify('error', `Failed to add: ${error.message}`)
    } else {
      onNotify('success', 'Record added')
      setAddingRow(false)
      setNewCode('')
      setNewName('')
      fetchRows()
    }
    setSaving(false)
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (row: Row) => {
    setEditingPk(row[config.pkField] as string | number)
    setEditCode(String(row[config.codeField] ?? ''))
    setEditName(String(row[config.nameField] ?? ''))
  }

  const handleSaveEdit = async () => {
    if (!editCode.trim() || !editName.trim() || editingPk === null) return
    setSaving(true)
    const newCodeVal = config.codeIsNumber ? parseFloat(editCode) : editCode.trim()
    const payload: Row = {
      [config.codeField]: newCodeVal,
      [config.nameField]: editName.trim(),
    }

    if (config.pkIsAuto) {
      // Auto-increment id — update by id
      const { error } = await supabase
        .from(config.table)
        .update(payload as never)
        .eq(config.pkField, editingPk)
      if (error) onNotify('error', `Failed to update: ${error.message}`)
      else { onNotify('success', 'Record updated'); setEditingPk(null); fetchRows() }
    } else {
      // Text PK = codeField. If code changed: delete + insert; otherwise just update name.
      if (String(editingPk) !== String(newCodeVal)) {
        const { error: delErr } = await supabase
          .from(config.table)
          .delete()
          .eq(config.pkField, editingPk)
        if (delErr) { onNotify('error', `Failed to update: ${delErr.message}`); setSaving(false); return }
        const { error: insErr } = await supabase.from(config.table).insert(payload as never)
        if (insErr) onNotify('error', `Failed to update: ${insErr.message}`)
        else { onNotify('success', 'Record updated'); setEditingPk(null); fetchRows() }
      } else {
        const { error } = await supabase
          .from(config.table)
          .update({ [config.nameField]: editName.trim() } as never)
          .eq(config.pkField, editingPk)
        if (error) onNotify('error', `Failed to update: ${error.message}`)
        else { onNotify('success', 'Record updated'); setEditingPk(null); fetchRows() }
      }
    }
    setSaving(false)
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (deleteConfirm === null) return
    setDeleting(true)
    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq(config.pkField, deleteConfirm)
    if (error) {
      onNotify('error', `Failed to delete: ${error.message}`)
    } else {
      setRows(prev => prev.filter(r => r[config.pkField] !== deleteConfirm))
      onNotify('success', 'Record deleted')
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow flex flex-col">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{config.title}</h3>
          <button
            onClick={() => { setAddingRow(true); setNewCode(''); setNewName('') }}
            title={`Add ${config.title}`}
            className="p-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100">
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder={`Search ${config.title.toLowerCase()}…`} />
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-64">
          {loading ? (
            <div className="p-6 text-xs text-gray-400 text-center">Loading…</div>
          ) : (
            <table className="min-w-max text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-28 cursor-pointer hover:text-gray-800 select-none" onClick={() => handleSort('code')}>Code<SortIcon col="code" /></th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none" onClick={() => handleSort('name')}>Name<SortIcon col="name" /></th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">

                {/* Inline add row */}
                {addingRow && (
                  <tr className="bg-blue-50">
                    <td className="px-2 py-1.5">
                      <input
                        autoFocus
                        type={config.codeIsNumber ? 'number' : 'text'}
                        value={newCode}
                        onChange={e => setNewCode(e.target.value)}
                        placeholder="Code"
                        className="w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Name"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAdd()
                          if (e.key === 'Escape') { setAddingRow(false) }
                        }}
                        className="w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={handleAdd}
                          disabled={saving || !newCode.trim() || !newName.trim()}
                          title="Save"
                          className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setAddingRow(false)}
                          title="Cancel"
                          className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Empty state */}
                {displayRows.length === 0 && !addingRow && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-xs text-gray-400">
                      {searchTerm ? 'No matching records' : 'No records'}
                    </td>
                  </tr>
                )}

                {/* Data rows */}
                {displayRows.map(row => {
                  const pk = row[config.pkField] as string | number
                  const isEditing = editingPk === pk
                  return (
                    <tr key={String(pk)} className={`${isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5">
                            <input
                              autoFocus
                              type={config.codeIsNumber ? 'number' : 'text'}
                              value={editCode}
                              onChange={e => setEditCode(e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') setEditingPk(null)
                              }}
                              className="w-full px-2 py-1 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                title="Save"
                                className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setEditingPk(null)}
                                title="Cancel"
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">
                            {String(row[config.codeField] ?? '-')}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900">
                            {String(row[config.nameField] ?? '-')}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => startEdit(row)}
                                title="Edit"
                                className="p-1 text-blue-500 rounded"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(pk)}
                                title="Delete"
                                className="p-1 text-red-500 rounded"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer row count */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
          <span className="text-xs text-gray-400">
            {searchTerm
              ? `${displayRows.length} of ${rows.length} record${rows.length !== 1 ? 's' : ''}`
              : `${rows.length} record${rows.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Record"
        message={`Permanently delete this record?`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  )
}

export function ReferenceDataForm() {
  const { notification, hideNotification, showSuccess, showError } = useNotification()

  const handleNotify = (type: 'success' | 'error', message: string) => {
    if (type === 'success') showSuccess(message)
    else showError(message)
  }

  return (
    <div className="space-y-4">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REF_TABLES.map(config => (
          <ReferenceCard key={config.table} config={config} onNotify={handleNotify} />
        ))}
      </div>
    </div>
  )
}
