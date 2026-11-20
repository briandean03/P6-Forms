import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Notification } from '@/components/Notification'
import { useNotification } from '@/hooks/useNotification'

const BUCKET = 'weekly-report-appendix'
const MAX_BYTES = 25 * 1024 * 1024
const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
type Drawing = { name: string; path: string; label: string; pdf: boolean; url: string }

export function Appendix({ schemaName, projectId, reportId, dataDate }: { schemaName: string; projectId: string; reportId: string; dataDate: string }) {
  const folder = [schemaName, projectId, reportId, dataDate].map(encodeURIComponent).join('/')
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const { notification, showSuccess, hideNotification } = useNotification()
  const storage = supabase.storage.from(BUCKET)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const objects: { name: string }[] = []
        for (let offset = 0; ; offset += 100) {
          const { data, error } = await storage.list(folder, { limit: 100, offset, sortBy: { column: 'created_at', order: 'desc' } })
          if (error) throw error
          objects.push(...(data ?? []).filter(object => object.id))
          if (!data || data.length < 100) break
        }
        const next = await Promise.all(objects.map(async object => {
          const path = `${folder}/${object.name}`
          const { data, error } = await storage.createSignedUrl(path, 3600)
          if (error) throw error
          let label = object.name.split('--').slice(1).join('--') || object.name
          try { label = decodeURIComponent(label) } catch { /* keep original filename */ }
          return { name: object.name, path, label, pdf: /\.pdf$/i.test(label), url: data.signedUrl }
        }))
        if (!cancelled) {
          setDrawings(next)
          setSelected(previous => next.some(drawing => drawing.name === previous) ? previous : next[0]?.name ?? '')
        }
      } catch (reason) {
        if (!cancelled) setError(`Supabase Storage (${BUCKET}): ${reason instanceof Error ? reason.message : (reason as { message?: string })?.message ?? String(reason)}. Check the appendix bucket and its SELECT/INSERT policies.`)
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    const refresh = window.setInterval(() => void load(), 45 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(refresh) }
  }, [folder, revision])

  async function attach(file: File) {
    setError('')
    if (!allowed.has(file.type) || !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) { setError('Attach a PDF, PNG, JPEG, or WebP drawing. Export CAD drawings to PDF first.'); return }
    if (file.size > MAX_BYTES) { setError('The drawing must be 25 MB or smaller.'); return }
    setUploading(true)
    try {
      const name = `${crypto.randomUUID()}--${encodeURIComponent(file.name)}`
      const { error } = await storage.upload(`${folder}/${name}`, file, { contentType: file.type, upsert: false })
      if (error) throw error
      setSelected(name); setRevision(value => value + 1)
      showSuccess('Drawing attached')
    } catch (reason) {
      setError(`Could not attach drawing: ${(reason as { message?: string })?.message ?? String(reason)}`)
    } finally { setUploading(false) }
  }
  const current = drawings.find(drawing => drawing.name === selected)
  return <div className="bg-white border rounded-xl p-4 md:p-6 space-y-4">
    {notification && <Notification {...notification} onClose={hideNotification} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-600">Drawings attached to this project and reporting week.</p>
      <button className="no-print px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? 'Attaching…' : 'Attach drawing'}</button>
      <input ref={input} className="hidden" type="file" aria-label="Attach drawing file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(file) }} />
    </div>
    <p className="no-print text-xs text-gray-500">PDF, PNG, JPEG or WebP · Up to 25 MB per file · Visible to everyone who can access this website.</p>
    {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded">{error}</p>}
    {loading && <p role="status">Loading appendix drawings…</p>}
    {!loading && !error && !drawings.length && <p className="text-gray-500 py-6 text-center">No drawings attached for this reporting week yet.</p>}
    {!!drawings.length && <div className="flex flex-wrap gap-2 no-print" aria-label="Attached drawings">{drawings.map(drawing => <button key={drawing.name} aria-pressed={selected === drawing.name} className={`px-3 py-2 rounded border text-sm break-all ${selected === drawing.name ? 'bg-indigo-50 border-indigo-500' : 'border-gray-200'}`} onClick={() => setSelected(drawing.name)}>{drawing.label}</button>)}</div>}
    {current && <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center"><h3 className="font-semibold break-all">{current.label}</h3><a className="no-print text-indigo-700 underline text-sm" href={current.url} target="_blank" rel="noreferrer">Open drawing in new tab</a></div>
      {current.pdf ? <>
        <iframe className="no-print w-full rounded border" style={{ height: '75vh', minHeight: 420 }} title={`Drawing preview: ${current.label}`} src={current.url} />
        <p className="text-xs text-gray-500">Use Open drawing in new tab if your browser cannot display the PDF. Print the drawing from its PDF viewer; dashboard printing does not merge attached PDF pages.</p>
      </> : <img className="w-full max-h-[80vh] object-contain rounded border" src={current.url} alt={current.label} />}
    </div>}
  </div>
}
