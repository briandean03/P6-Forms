import { useState, useEffect, useRef } from 'react'
import { supabase, schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const IR_STATUS_OPTIONS = [
  { value: 'A', label: 'A - Approved' },
  { value: 'B', label: 'B - Approved with Comments' },
  { value: 'C', label: 'C - Revise and Resubmit' },
  { value: 'D', label: 'D - Rejected' },
]

const STATUS_BADGE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<string, string> = {
  A: 'Approved',
  B: 'Approved with Comments',
  C: 'Revise and Resubmit',
  D: 'Rejected',
}

interface ProjectMeta {
  dgt_employersname: string | null
  dgt_consultantsname: string | null
  dgt_contractorsname: string | null
  dgt_location: string | null
  dgt_projectid: string | null
}

interface InspectionReport {
  id: string
  ir_ref: string | null
  ir_revision: string | null
  ir_discipline: string | null
  ir_block: string | null
  ir_level: string | null
  ir_element: string | null
  ir_submission_date: string | null
  ir_inspection_date: string | null
  ir_status: string | null
}

const emptyForm = {
  ir_ref: '',
  ir_revision: '00',
  ir_description: '',
  ir_discipline: '',
  ir_block: '',
  ir_level: '',
  ir_element: '',
  ir_submission_date: '',
  ir_inspection_date: '',
  ir_status: '',
  additional_comments: '',
}

const BLOCK_PATTERN = /^Zone-\d+$/

export function InspectionReportForm({
  projectId,
  projectTextId,
  schemaName,
}: {
  projectId: string
  projectTextId: string
  schemaName: string
}) {
  const [form, setForm] = useState({ ...emptyForm })
  const [blockError, setBlockError] = useState('')
  const [disciplines, setDisciplines] = useState<string[]>([])
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null)
  const [reports, setReports] = useState<InspectionReport[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingReports, setLoadingReports] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { notification, showSuccess, showError, hideNotification } = useNotification()

  const ricDb = schemaClient('ric')

  // Fetch project meta and disciplines on mount
  useEffect(() => {
    if (!projectId) return

    const fetchMeta = async () => {
      setLoadingMeta(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (ricDb as any)
          .from('dbp6_0000_projectdata')
          .select('dgt_employersname, dgt_consultantsname, dgt_contractorsname, dgt_location, dgt_projectid')
          .eq('dgt_dbp6bd00projectdataid', projectId)
          .maybeSingle()
        if (data) setProjectMeta(data)
      } catch { /* non-fatal */ }
      setLoadingMeta(false)
    }

    const fetchDisciplines = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (schemaClient('atgc') as any)
          .from('dbp6_0018_discipline')
          .select('discipline_name')
          .order('discipline_name', { ascending: true })
        if (data) setDisciplines((data as { discipline_name: string }[]).map(d => d.discipline_name))
      } catch { /* non-fatal */ }
    }

    fetchMeta()
    fetchDisciplines()
  }, [projectId])

  const fetchReports = async () => {
    if (!projectId) return
    setLoadingReports(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (ricDb as any)
        .from('p6_inspection_reports')
        .select('id, ir_ref, ir_revision, ir_discipline, ir_block, ir_level, ir_element, ir_submission_date, ir_inspection_date, ir_status')
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .order('ir_submission_date', { ascending: false })
      if (error) throw error
      setReports(data ?? [])
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load reports')
    }
    setLoadingReports(false)
  }

  useEffect(() => { fetchReports() }, [projectId])

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'ir_block') {
      setBlockError(value && !BLOCK_PATTERN.test(value) ? 'Format must be Zone-{integer}, e.g. Zone-1' : '')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.ir_block && !BLOCK_PATTERN.test(form.ir_block)) {
      setBlockError('Format must be Zone-{integer}, e.g. Zone-1')
      return
    }

    setSubmitting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (ricDb as any)
        .from('p6_inspection_reports')
        .insert({
          ir_ref: form.ir_ref || null,
          ir_revision: form.ir_revision || null,
          ir_description: form.ir_description || null,
          ir_discipline: form.ir_discipline || null,
          ir_block: form.ir_block || null,
          ir_level: form.ir_level || null,
          ir_element: form.ir_element || null,
          ir_submission_date: form.ir_submission_date || null,
          ir_inspection_date: form.ir_inspection_date || null,
          ir_status: form.ir_status || null,
          additional_comments: form.additional_comments || null,
          dgt_projectid: projectMeta?.dgt_projectid ?? projectTextId ?? null,
          dgt_dbp6bd00projectdataid: projectId,
        })
      if (error) throw error
      showSuccess('Inspection report submitted successfully')
      setForm({ ...emptyForm })
      setBlockError('')
      fetchReports()
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
      showError(msg || 'Submission failed')
    }
    setSubmitting(false)
  }

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      showError('Only PDF files are accepted')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setPdfFile(file)
  }

  const handlePdfUpload = async () => {
    if (!pdfFile) return
    setUploadingPdf(true)
    try {
      const projectCode = projectTextId || projectId
      const filePath = `${projectCode}/${pdfFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('inspection-reports')
        .upload(filePath, pdfFile, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError
      showSuccess(`${pdfFile.name} uploaded successfully`)
      setPdfFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
      showError(msg || 'Upload failed')
    }
    setUploadingPdf(false)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return d }
  }

  return (
    <div className="space-y-6">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}

      {/* Form card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-5">New Inspection Report</h3>

        {/* Read-only project info */}
        {loadingMeta ? (
          <div className="mb-5"><LoadingSpinner /></div>
        ) : projectMeta && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
            {[
              { label: 'Client', value: projectMeta.dgt_employersname },
              { label: 'Consultant', value: projectMeta.dgt_consultantsname },
              { label: 'Contractor', value: projectMeta.dgt_contractorsname },
              { label: 'Location', value: projectMeta.dgt_location },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-gray-700">{value || '—'}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Row 1: Ref + Revision */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">IR Ref</label>
              <input
                type="text"
                value={form.ir_ref}
                onChange={e => handleChange('ir_ref', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. IR-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Revision</label>
              <input
                type="text"
                value={form.ir_revision}
                onChange={e => handleChange('ir_revision', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="00"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
            <textarea
              value={form.ir_description}
              onChange={e => handleChange('ir_description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Inspection report description"
            />
          </div>

          {/* Row: Discipline + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Discipline</label>
              <select
                value={form.ir_discipline}
                onChange={e => handleChange('ir_discipline', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select discipline</option>
                {disciplines.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={form.ir_status}
                onChange={e => handleChange('ir_status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select status</option>
                {IR_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Block + Level + Element */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Block</label>
              <input
                type="text"
                value={form.ir_block}
                onChange={e => handleChange('ir_block', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  blockError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'
                }`}
                placeholder="Zone-1"
              />
              {blockError && <p className="mt-1 text-xs text-red-500">{blockError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Level</label>
              <input
                type="text"
                value={form.ir_level}
                onChange={e => handleChange('ir_level', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. G, 1, R"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Element</label>
              <input
                type="text"
                value={form.ir_element}
                onChange={e => handleChange('ir_element', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Columns"
              />
            </div>
          </div>

          {/* Row: Submission Date + Inspection Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Submission Date</label>
              <input
                type="date"
                value={form.ir_submission_date}
                onChange={e => handleChange('ir_submission_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Inspection Date</label>
              <input
                type="date"
                value={form.ir_inspection_date}
                onChange={e => handleChange('ir_inspection_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Additional Comments */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Additional Comments</label>
            <textarea
              value={form.additional_comments}
              onChange={e => handleChange('additional_comments', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Any additional comments"
            />
          </div>

          {/* PDF Upload */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Attach PDF Report</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handlePdfChange}
                disabled={uploadingPdf}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdf}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-700"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Choose PDF
              </button>
              {pdfFile && (
                <>
                  <span className="text-sm text-gray-600 truncate max-w-xs">{pdfFile.name}</span>
                  <button
                    type="button"
                    onClick={handlePdfUpload}
                    disabled={uploadingPdf}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploadingPdf ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Uploading…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">PDF will be saved to <span className="font-mono">{projectTextId || projectId}/</span></p>
          </div>

          <button
            type="submit"
            disabled={submitting || !!blockError}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </span>
            ) : 'Submit Inspection Report'}
          </button>
        </form>
      </div>

      {/* Reports table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Submitted Inspection Reports</h3>
        </div>

        {loadingReports ? (
          <div className="py-12"><LoadingSpinner /></div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="text-sm text-gray-500">No inspection reports submitted yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ref', 'Revision', 'Discipline', 'Block', 'Level', 'Element', 'Submission Date', 'Inspection Date', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">{r.ir_ref ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.ir_revision ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.ir_discipline ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.ir_block ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.ir_level ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.ir_element ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.ir_submission_date)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.ir_inspection_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.ir_status ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.ir_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.ir_status} — {STATUS_LABEL[r.ir_status] ?? r.ir_status}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
