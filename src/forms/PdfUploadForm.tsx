import { useState, useEffect, useRef } from 'react'
import { ContainerClient } from '@azure/storage-blob'
import { schemaClient } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const atgcDb = schemaClient('atgc')

const PDF_ACCOUNT = import.meta.env.VITE_PDF_AZURE_STORAGE_ACCOUNT as string
const PDF_SAS_TOKEN = import.meta.env.VITE_PDF_AZURE_SAS_TOKEN as string
const PDF_CONTAINER = import.meta.env.VITE_PDF_AZURE_CONTAINER as string
const PDF_BLOB_BASE = `https://${PDF_ACCOUNT}.blob.core.windows.net/${PDF_CONTAINER}`

function getPdfContainerClient() {
  return new ContainerClient(`${PDF_BLOB_BASE}?${PDF_SAS_TOKEN}`)
}

type ActivityType = 'LA' | 'DA'

interface ProjectMeta {
  dataDate: string | null
  weekNum: number | null
  projectId: string | null
}

export function PdfUploadForm({
  projectId,
  projectTextId,
}: {
  projectId: string
  projectTextId: string
}) {
  const [activityType, setActivityType] = useState<ActivityType>('LA')
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<ProjectMeta>({ dataDate: null, weekNum: null, projectId: null })
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { notification, showSuccess, showError, hideNotification } = useNotification()

  useEffect(() => {
    if (!projectId) return
    const fetchMeta = async () => {
      setLoadingMeta(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (atgcDb as any)
        .from('dbp6_0000_projectdata')
        .select('dgt_datadate, dgt_weeknum, dgt_projectid')
        .eq('dgt_dbp6bd00projectdataid', projectId)
        .maybeSingle()
      if (!error && data) {
        setMeta({
          dataDate: data.dgt_datadate ?? null,
          weekNum: data.dgt_weeknum ?? null,
          projectId: data.dgt_projectid ?? null,
        })
      }
      setLoadingMeta(false)
    }
    fetchMeta()
  }, [projectId])

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return d }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.type !== 'application/pdf') {
      showError('Only PDF files are accepted')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { showError('Please select a PDF file'); return }
    if (meta.weekNum === null) { showError('Week number not available for this project'); return }

    setUploading(true)
    try {
      const blobName = `${projectTextId || projectId}/${activityType}_${meta.weekNum}.pdf`
      const pdfUrl = `${PDF_BLOB_BASE}/${blobName}`

      // 1. Upload to Azure
      const blockBlob = getPdfContainerClient().getBlockBlobClient(blobName)
      await blockBlob.uploadData(file, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      })

      // 2. Insert record into Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (atgcDb as any)
        .from('pdf_form_uploads')
        .insert({
          filename: `${activityType}_${meta.weekNum}.pdf`,
          activity_type: activityType,
          pdf_url: pdfUrl,
          dgt_projectid: meta.projectId ?? projectTextId ?? null,
          dgt_dbp6bd00projectdataid: projectId,
          data_date: meta.dataDate ?? null,
        })

      if (insertError) {
        // Attempt to clean up the blob on DB failure
        try { await getPdfContainerClient().deleteBlob(blobName) } catch { /* ignore */ }
        throw insertError
      }

      showSuccess(`${activityType}_${meta.weekNum}.pdf uploaded successfully`)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  if (loadingMeta) return <LoadingSpinner />

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-5">Upload PDF Report</h3>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Activity Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Activity Type</label>
            <select
              value={activityType}
              onChange={e => setActivityType(e.target.value as ActivityType)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="LA">Lookahead (LA)</option>
              <option value="DA">Driving Activity (DA)</option>
            </select>
          </div>

          {/* PDF File */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">PDF File</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors select-none ${
                file
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium text-blue-700 truncate max-w-xs">{file.name}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-gray-500">Click to <span className="text-blue-600 font-medium">browse</span> for a PDF</p>
                  <p className="text-xs text-gray-400 mt-1">PDF files only</p>
                </>
              )}
            </div>
          </div>

          {/* Read-only project meta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Data Date</label>
              <div className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                {formatDate(meta.dataDate)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Week Number</label>
              <div className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                {meta.weekNum ?? '—'}
              </div>
            </div>
          </div>

          {/* Filename preview */}
          {meta.weekNum !== null && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-gray-500">
                Will be saved as{' '}
                <span className="font-mono font-semibold text-gray-700">{activityType}_{meta.weekNum}.pdf</span>
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!file || uploading}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading…
              </span>
            ) : 'Upload PDF'}
          </button>
        </form>
      </div>
    </div>
  )
}
