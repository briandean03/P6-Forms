import { useState, useEffect, useRef } from 'react'
import { supabase, schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const BUCKET = 'inspection-reports'
const DISCIPLINE_OPTIONS = ['Civil', 'Architectural', 'Mechanical', 'Electrical', 'Other']
const TEST_RESULT_OPTIONS = ['Passed', 'Failed', 'N/A']
const STATUS_OPTIONS = [
  { value: 'A', sublabel: 'Approved' },
  { value: 'B', sublabel: 'Approved with Comments' },
  { value: 'C', sublabel: 'Revise and Resubmit' },
  { value: 'D', sublabel: 'Rejected' },
]
const STATUS_BADGE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  A: 'Approved', B: 'Approved with Comments', C: 'Revise and Resubmit', D: 'Rejected',
}

interface ProjectMeta {
  dgt_employersname: string | null
  dgt_consultantsname: string | null
  dgt_contractorsname: string | null
  dgt_projectname: string | null
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
  ir_disciplines: [] as string[],
  ir_other_discipline: '',
  ir_block: '',
  ir_level: '',
  ir_element: '',
  ir_spec_no: '',
  ir_drawing_no: '',
  ir_material_submittal_no: '',
  ir_material_inspection_no: '',
  ir_method_statement_no: '',
  ir_itp_no: '',
  ir_checklist_no: '',
  ir_submission_date: '',
  ir_submission_time: '',
  ir_inspection_date: '',
  ir_inspection_time: '',
  sketch_attached: false,
  test_certificates: '' as '' | 'Yes' | 'No',
  other_sections_comments: '',
  site_engineer_name: '',
  site_engineer_date: '',
  site_engineer_time: '',
  qaqc_engineer_name: '',
  qaqc_engineer_date: '',
  qaqc_engineer_time: '',
  received_by_name: '',
  received_by_date: '',
  received_by_time: '',
  inspector_comments: '',
  test_result: '' as '' | 'Passed' | 'Failed' | 'N/A',
  ir_status: '',
  ir_remarks: '',
  additional_comments: '',
}

const BLOCK_PATTERN = /^Zone-\d+$/

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}
function canvasIsEmpty(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  return !ctx.getImageData(0, 0, canvas.width, canvas.height).data.some(v => v !== 0)
}

// Shared cell style for the form table
const cell = 'border border-gray-400 px-2 py-1'
const labelTd = 'border border-gray-400 px-2 py-1 bg-gray-100 text-xs font-semibold text-gray-600 whitespace-nowrap'
const inputCls = 'w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5'

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
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null)
  const [reports, setReports] = useState<InspectionReport[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingReports, setLoadingReports] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [issueDate] = useState(() => new Date().toISOString().split('T')[0])

  // Signature canvases
  const consultantSigRef = useRef<HTMLCanvasElement>(null)
  const contractorSigRef = useRef<HTMLCanvasElement>(null)
  const [activeCanvas, setActiveCanvas] = useState<'consultant' | 'contractor' | null>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [consultantHasSig, setConsultantHasSig] = useState(false)
  const [contractorHasSig, setContractorHasSig] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { notification, showSuccess, showError, hideNotification } = useNotification()
  const atgcDb = schemaClient('atgc')       // shared: project meta, disciplines
  const projectDb = schemaClient(schemaName) // project-specific: inspection reports

  useEffect(() => {
    if (!projectId) return
    const fetchMeta = async () => {
      setLoadingMeta(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (atgcDb as any)
          .from('dbp6_0000_projectdata')
          .select('dgt_employersname, dgt_consultantsname, dgt_contractorsname, dgt_projectname, dgt_location, dgt_projectid')
          .eq('dgt_dbp6bd00projectdataid', projectId)
          .maybeSingle()
        if (data) setProjectMeta(data)
      } catch { /* non-fatal */ }
      setLoadingMeta(false)
    }
    fetchMeta()
  }, [projectId])

  const fetchReports = async () => {
    if (!projectId) return
    setLoadingReports(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (projectDb as any)
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

  // ── Signature drawing ────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const makeSigHandlers = (which: 'consultant' | 'contractor'): React.HTMLAttributes<HTMLCanvasElement> => {
    const ref = which === 'consultant' ? consultantSigRef : contractorSigRef
    const setSig = which === 'consultant' ? setConsultantHasSig : setContractorHasSig
    return {
      onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => { setActiveCanvas(which); isDrawing.current = true; lastPos.current = getPos(e, ref.current!) },
      onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current || activeCanvas !== which || !ref.current) return
        const ctx = ref.current.getContext('2d')!
        const pos = getPos(e, ref.current)
        if (lastPos.current) {
          ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
          ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.5
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
        }
        lastPos.current = pos; setSig(true)
      },
      onMouseUp: () => { isDrawing.current = false; lastPos.current = null },
      onMouseLeave: () => { isDrawing.current = false; lastPos.current = null },
      onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => { e.preventDefault(); setActiveCanvas(which); isDrawing.current = true; lastPos.current = getPos(e, ref.current!) },
      onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        if (!isDrawing.current || !ref.current) return
        const ctx = ref.current.getContext('2d')!
        const pos = getPos(e, ref.current)
        if (lastPos.current) {
          ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
          ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.5
          ctx.lineCap = 'round'; ctx.stroke()
        }
        lastPos.current = pos; setSig(true)
      },
      onTouchEnd: () => { isDrawing.current = false; lastPos.current = null },
    }
  }

  const consultantSigHandlers = makeSigHandlers('consultant')
  const contractorSigHandlers = makeSigHandlers('contractor')

  // ── Form helpers ──────────────────────────────────────────────────────────
  const set = (field: keyof typeof emptyForm, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const toggleDiscipline = (d: string) =>
    setForm(prev => ({
      ...prev,
      ir_disciplines: prev.ir_disciplines.includes(d)
        ? prev.ir_disciplines.filter(x => x !== d)
        : [...prev.ir_disciplines, d],
    }))

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { showError('Only PDF files are accepted'); if (fileInputRef.current) fileInputRef.current.value = ''; return }
    setPdfFile(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.ir_block && !BLOCK_PATTERN.test(form.ir_block)) { setBlockError('Format must be Zone-{integer}, e.g. Zone-1'); return }

    setSubmitting(true)
    let filePath: string | null = null

    try {
      // Capture signatures
      const consultantSig = (consultantSigRef.current && consultantHasSig && !canvasIsEmpty(consultantSigRef.current))
        ? consultantSigRef.current.toDataURL('image/png') : null
      const contractorSig = (contractorSigRef.current && contractorHasSig && !canvasIsEmpty(contractorSigRef.current))
        ? contractorSigRef.current.toDataURL('image/png') : null

      // Upload PDF
      if (pdfFile) {
        const projectCode = projectTextId || projectId
        filePath = `${projectCode}/${pdfFile.name}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, pdfFile, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw uploadError
      }

      const disciplines = form.ir_disciplines.includes('Other') && form.ir_other_discipline
        ? [...form.ir_disciplines.filter(d => d !== 'Other'), `Other (${form.ir_other_discipline})`]
        : form.ir_disciplines

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (projectDb as any).from('p6_inspection_reports').insert({
        ir_ref: form.ir_ref || null,
        ir_revision: form.ir_revision || null,
        ir_description: form.ir_description || null,
        ir_discipline: disciplines.join(', ') || null,
        ir_block: form.ir_block || null,
        ir_level: form.ir_level || null,
        ir_element: form.ir_element || null,
        ir_spec_no: form.ir_spec_no || null,
        ir_drawing_no: form.ir_drawing_no || null,
        ir_material_submittal_no: form.ir_material_submittal_no || null,
        ir_material_inspection_no: form.ir_material_inspection_no || null,
        ir_method_statement_no: form.ir_method_statement_no || null,
        ir_itp_no: form.ir_itp_no || null,
        ir_checklist_no: form.ir_checklist_no || null,
        ir_submission_date: form.ir_submission_date || null,
        ir_submission_time: form.ir_submission_time || null,
        ir_inspection_date: form.ir_inspection_date || null,
        ir_inspection_time: form.ir_inspection_time || null,
        sketch_attached: form.sketch_attached,
        test_certificates: form.test_certificates || null,
        other_sections_comments: form.other_sections_comments || null,
        site_engineer_name: form.site_engineer_name || null,
        site_engineer_date: form.site_engineer_date || null,
        site_engineer_time: form.site_engineer_time || null,
        qaqc_engineer_name: form.qaqc_engineer_name || null,
        qaqc_engineer_date: form.qaqc_engineer_date || null,
        qaqc_engineer_time: form.qaqc_engineer_time || null,
        received_by_name: form.received_by_name || null,
        received_by_date: form.received_by_date || null,
        received_by_time: form.received_by_time || null,
        inspector_comments: form.inspector_comments || null,
        test_result: form.test_result || null,
        ir_status: form.ir_status || null,
        ir_remarks: form.ir_remarks || null,
        additional_comments: form.additional_comments || null,
        consultant_signature: consultantSig,
        contractor_signature: contractorSig,
        file_path: filePath,
        dgt_projectid: projectMeta?.dgt_projectid ?? projectTextId ?? null,
        dgt_dbp6bd00projectdataid: projectId,
      })

      if (error) {
        if (filePath) { try { await supabase.storage.from(BUCKET).remove([filePath]) } catch { /* ignore */ } }
        throw error
      }

      showSuccess('Inspection report submitted successfully')
      setForm({ ...emptyForm })
      setBlockError('')
      setPdfFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (consultantSigRef.current) { clearCanvas(consultantSigRef.current); setConsultantHasSig(false) }
      if (contractorSigRef.current) { clearCanvas(contractorSigRef.current); setContractorHasSig(false) }
      fetchReports()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err) ? String((err as { message: unknown }).message)
        : JSON.stringify(err)
      showError(msg || 'Submission failed')
    }
    setSubmitting(false)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return d }
  }

  const SigCanvas = ({
    canvasRef, hasSig, onClear, handlers,
  }: {
    canvasRef: React.RefObject<HTMLCanvasElement>
    hasSig: boolean
    onClear: () => void
    handlers: React.HTMLAttributes<HTMLCanvasElement>
  }) => (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={400} height={80}
        className="w-full border border-gray-300 bg-white touch-none cursor-crosshair rounded"
        {...handlers}
      />
      {hasSig && (
        <button type="button" onClick={onClear}
          className="absolute top-1 right-1 text-xs text-red-400 hover:text-red-600 bg-white px-1 rounded">
          Clear
        </button>
      )}
      {!hasSig && <p className="text-xs text-gray-400 mt-0.5">Sign here</p>}
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}

      <form onSubmit={handleSubmit}>
        {/* PDF Attachment — top */}
        <div className="mb-4 flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attach PDF</span>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfChange} disabled={submitting} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700">
            Choose PDF
          </button>
          {pdfFile ? (
            <>
              <span className="text-sm text-gray-700 truncate max-w-xs font-medium">{pdfFile.name}</span>
              <button type="button" onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="text-gray-400 hover:text-red-500 ml-auto">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <span className="text-xs text-gray-400 ml-1">No file selected · PDF only</span>
          )}
        </div>

        {/* ── MAIN FORM DOCUMENT ─────────────────────────────────────────── */}
        <div className="bg-white border border-gray-400 shadow-sm rounded-lg overflow-hidden">

          {/* Title */}
          <div className="border-b border-gray-400 py-3 text-center">
            <h2 className="text-base font-bold tracking-widest uppercase text-gray-800">Inspection Request (IR)</h2>
          </div>

          <table className="w-full border-collapse text-sm">
            <tbody>

              {/* Row: Ref | Rev | Form Issue Date */}
              <tr>
                <td className={labelTd} style={{ width: '12%' }}>IR Ref</td>
                <td className={cell} style={{ width: '22%' }}>
                  <input value={form.ir_ref} onChange={e => set('ir_ref', e.target.value)} className={inputCls} placeholder="e.g. IR-001" />
                </td>
                <td className={labelTd} style={{ width: '8%' }}>Rev</td>
                <td className={cell} style={{ width: '12%' }}>
                  <input value={form.ir_revision} onChange={e => set('ir_revision', e.target.value)} className={inputCls} placeholder="00" />
                </td>
                <td className={labelTd} style={{ width: '18%' }}>Form Issue Date</td>
                <td className={cell}>
                  {loadingMeta ? '…' : formatDate(issueDate)}
                </td>
              </tr>

              {/* Row: Client | Consultant */}
              <tr>
                <td className={labelTd}>Client</td>
                <td className={cell}>
                  <span className="text-sm text-gray-700">{loadingMeta ? '…' : (projectMeta?.dgt_employersname || '—')}</span>
                </td>
                <td className={labelTd}>Consultant</td>
                <td className={`${cell} `} colSpan={3}>
                  <span className="text-sm text-gray-700">{loadingMeta ? '…' : (projectMeta?.dgt_consultantsname || '—')}</span>
                </td>
              </tr>

              {/* Row: Project | Contractor */}
              <tr>
                <td className={labelTd}>Project</td>
                <td className={cell}>
                  <span className="text-sm text-gray-700">{loadingMeta ? '…' : (projectMeta?.dgt_projectname || '—')}</span>
                </td>
                <td className={labelTd}>Contractor</td>
                <td className={cell} colSpan={3}>
                  <span className="text-sm text-gray-700">{loadingMeta ? '…' : (projectMeta?.dgt_contractorsname || '—')}</span>
                </td>
              </tr>

              {/* Row: Location */}
              <tr>
                <td className={labelTd}>Location</td>
                <td className={cell} colSpan={5}>
                  <span className="text-sm text-gray-700">{loadingMeta ? '…' : (projectMeta?.dgt_location || '—')}</span>
                </td>
              </tr>

              {/* Row: Description (left) | Dates + Discipline (right) */}
              <tr>
                <td className={labelTd} style={{ verticalAlign: 'top', paddingTop: '6px' }}>Description of Works</td>
                <td className={cell} style={{ verticalAlign: 'top' }}>
                  <textarea value={form.ir_description} onChange={e => set('ir_description', e.target.value)}
                    rows={6} className={`${inputCls} resize-none`} placeholder="Describe scope of inspection" />
                </td>
                <td className={cell} colSpan={4} style={{ verticalAlign: 'top' }}>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Date of Submission</p>
                        <input type="date" value={form.ir_submission_date} onChange={e => set('ir_submission_date', e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Time</p>
                        <input type="time" value={form.ir_submission_time} onChange={e => set('ir_submission_time', e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Date of Inspection</p>
                        <input type="date" value={form.ir_inspection_date} onChange={e => set('ir_inspection_date', e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Time</p>
                        <input type="time" value={form.ir_inspection_time} onChange={e => set('ir_inspection_time', e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Discipline</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {DISCIPLINE_OPTIONS.map(d => (
                          <label key={d} className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={form.ir_disciplines.includes(d)} onChange={() => toggleDiscipline(d)}
                              className="w-3.5 h-3.5 rounded border-gray-400 text-blue-600" />
                            <span className="text-xs text-gray-700">{d}</span>
                          </label>
                        ))}
                      </div>
                      {form.ir_disciplines.includes('Other') && (
                        <input type="text" value={form.ir_other_discipline} onChange={e => set('ir_other_discipline', e.target.value)}
                          className={`${inputCls} mt-1 border border-gray-300`} placeholder="Specify other" />
                      )}
                    </div>
                  </div>
                </td>
              </tr>

              {/* Row: Block / Level / Element */}
              <tr>
                <td className={labelTd}>Block No.</td>
                <td className={cell}>
                  <input value={form.ir_block} onChange={e => { set('ir_block', e.target.value); setBlockError(e.target.value && !BLOCK_PATTERN.test(e.target.value) ? 'Format: Zone-{integer}' : '') }}
                    className={`${inputCls} ${blockError ? 'border border-red-400' : ''}`} placeholder="Zone-1" />
                  {blockError && <p className="text-xs text-red-500 mt-0.5">{blockError}</p>}
                </td>
                <td className={labelTd}>Level</td>
                <td className={cell}>
                  <input value={form.ir_level} onChange={e => set('ir_level', e.target.value)} className={inputCls} placeholder="e.g. G" />
                </td>
                <td className={labelTd}>Element</td>
                <td className={cell}>
                  <input value={form.ir_element} onChange={e => set('ir_element', e.target.value)} className={inputCls} placeholder="e.g. Columns" />
                </td>
              </tr>

              {/* Reference numbers */}
              <tr>
                <td className={labelTd}>Spec No.</td>
                <td className={cell}><input value={form.ir_spec_no} onChange={e => set('ir_spec_no', e.target.value)} className={inputCls} /></td>
                <td className={labelTd}>Drawing No.</td>
                <td className={cell} colSpan={3}><input value={form.ir_drawing_no} onChange={e => set('ir_drawing_no', e.target.value)} className={inputCls} /></td>
              </tr>
              <tr>
                <td className={labelTd}>Mat. Submittal No.</td>
                <td className={cell}><input value={form.ir_material_submittal_no} onChange={e => set('ir_material_submittal_no', e.target.value)} className={inputCls} /></td>
                <td className={labelTd}>Mat. Inspection No.</td>
                <td className={cell} colSpan={3}><input value={form.ir_material_inspection_no} onChange={e => set('ir_material_inspection_no', e.target.value)} className={inputCls} /></td>
              </tr>
              <tr>
                <td className={labelTd}>Method Statement No.</td>
                <td className={cell}><input value={form.ir_method_statement_no} onChange={e => set('ir_method_statement_no', e.target.value)} className={inputCls} /></td>
                <td className={labelTd}>ITP No.</td>
                <td className={cell}><input value={form.ir_itp_no} onChange={e => set('ir_itp_no', e.target.value)} className={inputCls} /></td>
                <td className={labelTd}>Checklist No.</td>
                <td className={cell}><input value={form.ir_checklist_no} onChange={e => set('ir_checklist_no', e.target.value)} className={inputCls} /></td>
              </tr>

              {/* Sketch attached / Test certificates */}
              <tr>
                <td className={labelTd}>Sketch Attached</td>
                <td className={cell}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.sketch_attached} onChange={e => set('sketch_attached', e.target.checked)} className="w-4 h-4" />
                    <span className="text-xs text-gray-600">Yes</span>
                  </label>
                </td>
                <td className={labelTd}>Test Certificates</td>
                <td className={cell} colSpan={3}>
                  <div className="flex gap-4">
                    {['Yes', 'No'].map(v => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="test_certificates" value={v} checked={form.test_certificates === v}
                          onChange={() => set('test_certificates', v)} className="w-3.5 h-3.5" />
                        <span className="text-xs text-gray-700">{v}</span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>

              {/* Other sections comments */}
              <tr>
                <td className={labelTd} style={{ verticalAlign: 'top', paddingTop: '6px' }}>Other Sections Comments</td>
                <td className={cell} colSpan={5}>
                  <textarea value={form.other_sections_comments} onChange={e => set('other_sections_comments', e.target.value)}
                    rows={2} className={`${inputCls} resize-none w-full`} />
                </td>
              </tr>

              {/* Sign-off header */}
              <tr>
                <td colSpan={6} className="border border-gray-400 bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Submission Sign-Off
                </td>
              </tr>

              {/* Sign-off header row */}
              <tr className="bg-gray-50">
                <td className={labelTd}></td>
                <td className={`${labelTd} text-center`}>Name</td>
                <td className={`${labelTd} text-center`}>Date</td>
                <td className={`${labelTd} text-center`}>Time</td>
                <td className={`${labelTd} text-center`} colSpan={2}>Signed By</td>
              </tr>

              {/* Site Engineer */}
              <tr>
                <td className={labelTd}>Site Engineer</td>
                <td className={cell}><input value={form.site_engineer_name} onChange={e => set('site_engineer_name', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="date" value={form.site_engineer_date} onChange={e => set('site_engineer_date', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="time" value={form.site_engineer_time} onChange={e => set('site_engineer_time', e.target.value)} className={inputCls} /></td>
                <td className={cell} colSpan={2}></td>
              </tr>

              {/* QA/QC Engineer */}
              <tr>
                <td className={labelTd}>QA/QC Engineer</td>
                <td className={cell}><input value={form.qaqc_engineer_name} onChange={e => set('qaqc_engineer_name', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="date" value={form.qaqc_engineer_date} onChange={e => set('qaqc_engineer_date', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="time" value={form.qaqc_engineer_time} onChange={e => set('qaqc_engineer_time', e.target.value)} className={inputCls} /></td>
                <td className={cell} colSpan={2}></td>
              </tr>

              {/* Received by */}
              <tr>
                <td className={labelTd}>Received By</td>
                <td className={cell}><input value={form.received_by_name} onChange={e => set('received_by_name', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="date" value={form.received_by_date} onChange={e => set('received_by_date', e.target.value)} className={inputCls} /></td>
                <td className={cell}><input type="time" value={form.received_by_time} onChange={e => set('received_by_time', e.target.value)} className={inputCls} /></td>
                <td className={cell} colSpan={2}></td>
              </tr>

              {/* Inspector comments */}
              <tr>
                <td colSpan={6} className="border border-gray-400 bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Engineer's Inspector Comments
                </td>
              </tr>
              <tr>
                <td className={cell} colSpan={6}>
                  <textarea value={form.inspector_comments} onChange={e => set('inspector_comments', e.target.value)}
                    rows={3} className={`${inputCls} resize-none w-full`} placeholder="Inspector's comments…" />
                </td>
              </tr>

              {/* Witnessed site test results */}
              <tr>
                <td className={labelTd} style={{ verticalAlign: 'middle' }}>Witnessed Site Test Results</td>
                <td className={cell} colSpan={5}>
                  <div className="flex gap-4">
                    {TEST_RESULT_OPTIONS.map(v => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="test_result" value={v} checked={form.test_result === v}
                          onChange={() => set('test_result', v)} className="w-3.5 h-3.5" />
                        <span className="text-xs text-gray-700">{v}</span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>

              {/* Engineer's final comments header */}
              <tr>
                <td colSpan={6} className="border border-gray-400 bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Engineer's Final Comments
                </td>
              </tr>

              {/* Status A/B/C/D */}
              <tr>
                <td className={cell} colSpan={6}>
                  <div className="flex gap-4 flex-wrap py-1">
                    {STATUS_OPTIONS.map(o => (
                      <label key={o.value} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-colors ${
                        form.ir_status === o.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="ir_status" value={o.value} checked={form.ir_status === o.value}
                          onChange={() => set('ir_status', o.value)} className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-bold text-gray-800">{o.value}</span>
                        <span className="text-xs text-gray-500">{o.sublabel}</span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>

              {/* Remarks */}
              <tr>
                <td className={labelTd} style={{ verticalAlign: 'top', paddingTop: '6px' }}>Remarks</td>
                <td className={cell} colSpan={5}>
                  <textarea value={form.ir_remarks} onChange={e => set('ir_remarks', e.target.value)}
                    rows={3} className={`${inputCls} resize-none w-full`} placeholder="Engineer's remarks…" />
                </td>
              </tr>

              {/* Signatures */}
              <tr>
                <td colSpan={6} className="border border-gray-400 bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Signatures
                </td>
              </tr>
              <tr>
                <td className={`${labelTd} text-center`} colSpan={3}>Consultant</td>
                <td className={`${labelTd} text-center`} colSpan={3}>Contractor</td>
              </tr>
              <tr>
                <td className={cell} colSpan={3} style={{ height: '100px', verticalAlign: 'top', padding: '6px' }}>
                  <SigCanvas canvasRef={consultantSigRef} hasSig={consultantHasSig}
                    onClear={() => { if (consultantSigRef.current) clearCanvas(consultantSigRef.current); setConsultantHasSig(false) }}
                    handlers={consultantSigHandlers} />
                </td>
                <td className={cell} colSpan={3} style={{ height: '100px', verticalAlign: 'top', padding: '6px' }}>
                  <SigCanvas canvasRef={contractorSigRef} hasSig={contractorHasSig}
                    onClear={() => { if (contractorSigRef.current) clearCanvas(contractorSigRef.current); setContractorHasSig(false) }}
                    handlers={contractorSigHandlers} />
                </td>
              </tr>

            </tbody>
          </table>

          {/* Submit button */}
          <div className="px-4 py-4 border-t border-gray-300 bg-gray-50">
            <button type="submit" disabled={submitting || !!blockError}
              className="w-full px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-lg hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
          </div>
        </div>
      </form>

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Submitted Inspection Reports</h3>
        </div>
        {loadingReports ? (
          <div className="py-12"><LoadingSpinner /></div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No inspection reports submitted yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ref', 'Revision', 'Discipline', 'Block', 'Level', 'Element', 'Submission Date', 'Inspection Date', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.ir_ref ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.ir_revision ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.ir_discipline ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.ir_block ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.ir_level ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.ir_element ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.ir_submission_date)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.ir_inspection_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.ir_status ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.ir_status] ?? 'bg-gray-100 text-gray-600'}`}>
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
