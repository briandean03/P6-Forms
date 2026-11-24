import { SearchableSelect } from '@/components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { schemaClient } from '@/lib/supabase'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Pagination } from '@/components/Pagination'
import { useNotification } from '@/hooks/useNotification'
import { LONG_LEAD_TABLE, ENGINEERING_HISTORY_TABLE, longLeadFields, emptyLongLead, latestEngineeringRevision, integerError, type LongLeadDraft, type LongLeadRecord, type EngineeringReference } from '@/lib/longLead'

const inputClass = 'block w-full px-3 py-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100'
const primary = 'px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
const secondary = 'px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'
const PAGE_SIZE = 15

export function LongLeadForm({ projectTextId, schemaName }: { projectTextId: string; schemaName: string }) {
  // This newly added table is not yet part of the generated Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = useMemo(() => schemaClient(schemaName) as any, [schemaName])
  const [records, setRecords] = useState<LongLeadRecord[]>([])
  const [engineering, setEngineering] = useState<EngineeringReference[]>([])
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [week, setWeek] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<LongLeadDraft>(emptyLongLead)
  const [initial, setInitial] = useState<LongLeadDraft>(emptyLongLead)
  const [discard, setDiscard] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LongLeadRecord | null>(null)
  const { notification, showSuccess, hideNotification } = useNotification()
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(initial)
  async function checked<T>(table: string, query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const result = await query
    if (result.error) throw new Error(`${schemaName}.${table}: ${result.error.message}${/permission|row.level security/i.test(result.error.message) ? ' — Check table grants and RLS policies.' : ''}`)
    return result.data
  }
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setReady(false); setError('')
      try {
        const references: EngineeringReference[] = []
        for (let offset = 0; ; offset += 500) {
          const rows = await checked<EngineeringReference[]>(ENGINEERING_HISTORY_TABLE, db.from(ENGINEERING_HISTORY_TABLE).select('dgt_transmittalref,dgt_revision,dgt_transmittalsubject,is_long_lead').eq('dgt_projectid', projectTextId).order('dgt_transmittalref').order('dgt_dbp6bd041engineeringid').range(offset, offset + 499))
          if (!active) return
          references.push(...(rows ?? []))
          if (!rows || rows.length < 500) break
        }
        const refs = [...new Set(references.map(row => row.dgt_transmittalref).filter((ref): ref is string => !!ref))]
        const items: LongLeadRecord[] = []
        // This table has no project column. Never load or mutate another project's references.
        for (let start = 0; start < refs.length; start += 100) {
          for (let offset = 0; ; offset += 500) {
            const rows = await checked<LongLeadRecord[]>(LONG_LEAD_TABLE, db.from(LONG_LEAD_TABLE).select('*').in('transmittal_ref', refs.slice(start, start + 100)).order('id').range(offset, offset + 499))
            if (!active) return
            items.push(...(rows ?? []))
            if (!rows || rows.length < 500) break
          }
        }
        const project = await checked<{ dgt_current_weeknum: number | null } | null>('dbp6_0000_projectdata', db.from('dbp6_0000_projectdata').select('dgt_current_weeknum').eq('dgt_projectid', projectTextId).maybeSingle())
        if (!active) return
        setEngineering(references)
        setRecords(items.sort((a, b) => (b.week_num ?? -1) - (a.week_num ?? -1) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)))
        setCurrentWeek(project?.dgt_current_weeknum ?? null)
        setReady(true)
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { if (active) setLoading(false) }
    }
    if (projectTextId) void load()
    else { setLoading(false); setReady(false) }
    return () => { active = false }
  }, [db, projectTextId, reload])
  useEffect(() => { setPage(1) }, [search, week, reload])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = '' } }
    const beforeNavigate = (event: Event) => { if ((dirty || busy) && !window.confirm('Leave Long Lead Items with unsaved changes or an operation in progress?')) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('app:before-navigate', beforeNavigate)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('app:before-navigate', beforeNavigate) }
  }, [dirty, busy])
  const byReference = useMemo(() => {
    const grouped = new Map<string, EngineeringReference[]>()
    for (const row of engineering) if (row.dgt_transmittalref) {
      const group = grouped.get(row.dgt_transmittalref) ?? []
      group.push(row); grouped.set(row.dgt_transmittalref, group)
    }
    return grouped
  }, [engineering])
  const references = useMemo(() => [...byReference.keys()].sort(), [byReference])
  const transmittalOptions = useMemo(() => references.map(ref => ({ value: ref, label: ref + (byReference.get(ref)?.some(row => row.is_long_lead) ? ' · Long lead' : '') })), [references, byReference])
  const candidates = byReference.get(draft.transmittal_ref) ?? []
  const revisions = [...new Set(candidates.map(row => row.dgt_revision).filter((rev): rev is number => rev != null))].sort((a, b) => b - a)
  const filtered = records.filter(record => (!week || (week === 'none' ? record.week_num == null : String(record.week_num) === week)) && [record.transmittal_ref, record.supplier_name, record.procurement_tracker_status, record.lpo_number].some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase())))
  const lpoError = integerError(draft.lpo_number, 'LPO number', 0)
  const weekError = integerError(draft.week_num, 'Week number', 1)
  const set = (field: keyof LongLeadDraft, value: string) => setDraft(previous => ({ ...previous, [field]: value }))
  function begin(record?: LongLeadRecord) {
    let next = { ...emptyLongLead, week_num: currentWeek == null ? '' : String(currentWeek) }
    if (record) next = Object.fromEntries(Object.keys(emptyLongLead).map(key => [key, record[key as keyof LongLeadRecord] == null ? '' : String(record[key as keyof LongLeadRecord])])) as LongLeadDraft
    setEditing(record?.id ?? null); setDraft(next); setInitial(next); setOpen(true); setError('')
  }
  async function save() {
    if (busy || !ready || !references.includes(draft.transmittal_ref) || lpoError || weekError) return
    if (draft.engineering_revision !== '' && !revisions.some(rev => String(rev) === draft.engineering_revision)) { setError('Select an available engineering revision.'); return }
    setBusy(true); setError('')
    try {
      const payload = {
        ...Object.fromEntries(longLeadFields.map(([field]) => [field, draft[field] || null])),
        transmittal_ref: draft.transmittal_ref,
        engineering_revision: draft.engineering_revision === '' ? null : Number(draft.engineering_revision),
        week_num: draft.week_num === '' ? null : Number(draft.week_num),
        lpo_number: draft.lpo_number === '' ? null : Number(draft.lpo_number),
        supplier_name: draft.supplier_name.trim() || null,
        procurement_tracker_status: draft.procurement_tracker_status.trim() || null,
      }
      const original = records.find(record => record.id === editing)
      const query = editing ? db.from(LONG_LEAD_TABLE).update(payload).eq('id', editing).eq('transmittal_ref', original?.transmittal_ref) : db.from(LONG_LEAD_TABLE).insert(payload)
      await checked(LONG_LEAD_TABLE, query.select('id').single())
      setOpen(false); setReload(value => value + 1); showSuccess(editing ? 'Long-lead item updated' : 'Long-lead item added')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!deleteTarget || busy) return
    setBusy(true); setError('')
    try {
      await checked(LONG_LEAD_TABLE, db.from(LONG_LEAD_TABLE).delete().eq('id', deleteTarget.id).eq('transmittal_ref', deleteTarget.transmittal_ref).select('id').single())
      setDeleteTarget(null); setReload(value => value + 1); showSuccess('Long-lead item deleted')
    } catch (reason) { setDeleteTarget(null); setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const close = () => { if (!busy) { if (dirty) setDiscard(true); else setOpen(false) } }
  const errorPanel = error && <p role="alert" className="p-3 rounded border border-red-200 bg-red-50 text-red-800 whitespace-pre-wrap">{error}</p>
  return <div className="space-y-4">
    {notification && <Notification {...notification} onClose={hideNotification} />}
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-900">Long Lead Items</h2><p className="text-sm text-gray-500">Procurement tracker for the selected project.</p></div><button className={primary} disabled={!ready || busy || !references.length} onClick={() => begin()}>Add long-lead item</button></div>
    {!open && errorPanel}
    <div className="flex flex-wrap gap-3"><label className="text-sm flex-1 min-w-[200px]">Search<input className={inputClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Transmittal, supplier, status or LPO" /></label><label className="text-sm">Reporting week<select aria-label="Reporting week" className={inputClass} value={week} onChange={event => setWeek(event.target.value)}><option value="">All weeks</option><option value="none">Unspecified week</option>{[...new Set(records.map(record => record.week_num).filter((value): value is number => value != null))].sort((a, b) => b - a).map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className={`${secondary} self-end`} disabled={loading || busy} onClick={() => setReload(value => value + 1)}>Refresh</button></div>
    {loading ? <LoadingSpinner /> : <div className="bg-white rounded-lg border overflow-x-auto"><table className="w-full text-sm whitespace-nowrap"><thead className="bg-gray-50"><tr>{['Transmittal ref', 'Revision', 'Week', ...longLeadFields.map(([, label]) => label), 'Procurement status', 'Supplier', 'LPO number', 'Actions'].map(label => <th key={label} className="px-3 py-3 text-left font-semibold text-gray-600">{label}</th>)}</tr></thead><tbody>{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(record => <tr key={record.id} className="border-t hover:bg-gray-50"><td className="px-3 py-3 font-medium">{record.transmittal_ref}</td><td className="px-3 py-3">{record.engineering_revision ?? '—'}</td><td className="px-3 py-3">{record.week_num ?? '—'}</td>{longLeadFields.map(([field]) => <td key={field} className="px-3 py-3">{record[field] ?? '—'}</td>)}<td className="px-3 py-3">{record.procurement_tracker_status ?? '—'}</td><td className="px-3 py-3">{record.supplier_name ?? '—'}</td><td className="px-3 py-3">{record.lpo_number ?? '—'}</td><td className="px-3 py-3 space-x-3"><button className="text-blue-700 hover:underline" disabled={busy} onClick={() => begin(record)} aria-label={`Edit ${record.transmittal_ref}`}>Edit</button><button className="text-red-700 hover:underline" disabled={busy} onClick={() => setDeleteTarget(record)} aria-label={`Delete ${record.transmittal_ref}`}>Delete</button></td></tr>)}</tbody></table>{!filtered.length && <p className="text-center text-gray-500 p-8">{ready && !references.length ? 'No engineering transmittals found for this project.' : 'No long-lead items found.'}</p>}<Pagination currentPage={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} itemsPerPage={PAGE_SIZE} /></div>}
    <Modal isOpen={open} onClose={close} title={editing ? 'Edit long-lead item' : 'Add long-lead item'}>
      <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-4">
        {errorPanel}
        <fieldset disabled={busy} className="space-y-4">
          <div className="block text-sm font-medium"><span>Transmittal reference</span><SearchableSelect label="Transmittal reference" disabled={busy} value={draft.transmittal_ref} options={transmittalOptions} onChange={ref => setDraft(previous => ({ ...previous, transmittal_ref: ref, engineering_revision: String(latestEngineeringRevision(byReference.get(ref) ?? []) ?? '') }))} /></div>
          {candidates.length > 0 && <p className="text-xs text-gray-500">{candidates.find(row => String(row.dgt_revision ?? '') === draft.engineering_revision)?.dgt_transmittalsubject ?? ''}</p>}
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Engineering revision<select aria-label="Engineering revision" className={inputClass} value={draft.engineering_revision} onChange={event => set('engineering_revision', event.target.value)}><option value="">Unspecified (NULL)</option>{revisions.map(rev => <option key={rev} value={rev}>{rev}</option>)}</select></label><label className="text-sm font-medium">Week number<input aria-label="Week number" aria-invalid={!!weekError} className={inputClass} type="number" min="1" max="2147483647" step="1" value={draft.week_num} onChange={event => set('week_num', event.target.value)} />{weekError && <span className="text-red-600 text-xs">{weekError}</span>}</label></div>
          <div className="grid grid-cols-2 gap-3">{longLeadFields.map(([field, label]) => <label key={field} className="text-sm font-medium">{label}<input className={inputClass} type="date" value={draft[field]} onChange={event => set(field, event.target.value)} /></label>)}</div>
          <label className="block text-sm font-medium">Procurement tracker status<input className={inputClass} list="long-lead-status-options" value={draft.procurement_tracker_status} onChange={event => set('procurement_tracker_status', event.target.value)} /><datalist id="long-lead-status-options">{[...new Set(['Planned', 'Order Placed', 'Partially Delivered', 'Delivered', ...records.map(record => record.procurement_tracker_status).filter((status): status is string => !!status)])].map(status => <option key={status} value={status} />)}</datalist></label>
          <label className="block text-sm font-medium">Supplier name<input className={inputClass} value={draft.supplier_name} onChange={event => set('supplier_name', event.target.value)} /></label>
          <label className="block text-sm font-medium">LPO number<input aria-label="LPO number" aria-invalid={!!lpoError} className={inputClass} type="number" min="0" max="2147483647" step="1" value={draft.lpo_number} onChange={event => set('lpo_number', event.target.value)} />{lpoError && <span className="text-red-600 text-xs">{lpoError}</span>}</label>
        </fieldset>
        <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={busy} onClick={close}>Cancel</button><button type="submit" className={primary} disabled={busy || !!lpoError || !!weekError || !draft.transmittal_ref}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create item'}</button></div>
      </form>
    </Modal>
    <ConfirmDialog isOpen={discard} title="Discard changes?" message="Your changes to this long-lead item have not been saved." confirmLabel="Discard changes" onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); setOpen(false) }} />
    <ConfirmDialog isOpen={!!deleteTarget} title="Delete long-lead item?" message={`Delete ${deleteTarget?.transmittal_ref ?? ''} for week ${deleteTarget?.week_num ?? 'unspecified'}? Its engineering history will remain unchanged.`} confirmLabel="Delete item" loading={busy} onCancel={() => { if (!busy) setDeleteTarget(null) }} onConfirm={() => void remove()} />
  </div>
}
