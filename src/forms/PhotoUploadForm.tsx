import { useState, useEffect, useRef } from 'react'
import { ContainerClient } from '@azure/storage-blob'
import { supabase } from '@/lib/supabase'
import { useNotification } from '@/hooks/useNotification'
import { Notification } from '@/components/Notification'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const ACCOUNT = import.meta.env.VITE_AZURE_STORAGE_ACCOUNT as string
const SAS_TOKEN = import.meta.env.VITE_AZURE_SAS_TOKEN as string
const CONTAINER = import.meta.env.VITE_AZURE_CONTAINER as string
const BLOB_BASE = `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}`

function getContainerClient() {
  return new ContainerClient(`${BLOB_BASE}?${SAS_TOKEN}`)
}

// URL with SAS for display — base URL (no SAS) is what we store in Supabase
function blobDisplayUrl(blobName: string) {
  return `${BLOB_BASE}/${blobName}?${SAS_TOKEN}`
}

interface Photo {
  supabaseId: string
  blobName: string    // used for Azure deletion
  fileName: string
  photoDate: string
  url: string         // display URL with SAS
  serialNumber: string
}

interface SupabasePhotoRow {
  id: string
  filename: string | null
  photodate: string | null
  imageurl: string | null
  serialnumber: string | null
}

export function PhotoUploadForm({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoDate, setPhotoDate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadCounterRef = useRef(1)
  const { notification, showSuccess, showError, hideNotification } = useNotification()

  const fetchPhotos = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('p6forms_photoupload')
        .select('*')
        .like('imageurl', `%/${projectId}/%`)
        .order('photodate', { ascending: false }) as { data: SupabasePhotoRow[] | null; error: unknown }

      if (error) throw error

      const result: Photo[] = (data ?? []).map(row => {
        const blobName = row.imageurl
          ? row.imageurl.replace(`${BLOB_BASE}/`, '')
          : ''
        return {
          supabaseId: row.id,
          blobName,
          fileName: row.filename ?? '',
          photoDate: row.photodate ? row.photodate.split('T')[0] : '',
          url: blobDisplayUrl(blobName),
          serialNumber: row.serialnumber ?? '',
        }
      })
      setPhotos(result)
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load photos')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (projectId) fetchPhotos()
  }, [projectId])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !photoDate) return
    setUploading(true)
    try {
      const ext = selectedFile.name.includes('.') ? `.${selectedFile.name.split('.').pop()}` : ''
      const serial = uploadCounterRef.current
      const displayName = `${photoDate}${ext}`
      const blobName = `${projectId}/${photoDate}-${serial}${ext}`

      // 1. Upload file to Azure
      const blockBlob = getContainerClient().getBlockBlobClient(blobName)
      await blockBlob.uploadData(selectedFile, {
        blobHTTPHeaders: { blobContentType: selectedFile.type },
      })

      // 2. Save metadata to Supabase (store base URL without SAS token)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('p6forms_photoupload')
        .insert({
          filename: displayName,
          photodate: photoDate,
          imageurl: `${BLOB_BASE}/${blobName}`,
          serialnumber: String(serial),
        })
      if (insertError) {
        // Rollback: remove the blob if Supabase insert fails
        await getContainerClient().deleteBlob(blobName)
        throw insertError
      }

      // 3. Refresh gallery from Supabase
      uploadCounterRef.current += 1
      showSuccess(`"${displayName}" uploaded successfully`)
      setSelectedFile(null)
      setPhotoDate('')
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchPhotos()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // 1. Delete from Azure
      await getContainerClient().deleteBlob(deleteTarget.blobName)

      // 2. Delete from Supabase
      const { error } = await supabase
        .from('p6forms_photoupload')
        .delete()
        .eq('id', deleteTarget.supabaseId)
      if (error) throw error

      setPhotos(prev => prev.filter(p => p.supabaseId !== deleteTarget.supabaseId))
      showSuccess('Photo deleted')
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Delete failed')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return d
    }
  }

  return (
    <div className="space-y-6">
      {notification && <Notification type={notification.type} message={notification.message} onClose={hideNotification} />}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Photo"
        message={`Delete "${deleteTarget?.fileName}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.fileName}
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
            />
            <div className="mt-2 text-center text-white text-sm">
              <span className="font-medium">{formatDate(lightbox.photoDate)}</span>
              <span className="text-white/60 ml-2">— {lightbox.fileName}</span>
            </div>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Upload panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Upload Photo</h3>
        <form onSubmit={handleUpload} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Image File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={e => {
                const file = e.target.files?.[0] ?? null
                setSelectedFile(file)
                if (previewUrl) URL.revokeObjectURL(previewUrl)
                setPreviewUrl(file ? URL.createObjectURL(file) : null)
              }}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Photo Date</label>
            <input
              type="date"
              value={photoDate}
              onChange={e => setPhotoDate(e.target.value)}
              required
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={!selectedFile || !photoDate || uploading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
        {previewUrl && (
          <div className="mt-4 flex items-start gap-3">
            <img
              src={previewUrl}
              alt="Preview"
              className="h-32 w-32 rounded-lg object-cover border border-gray-200"
            />
            <div className="text-xs text-gray-500 mt-1">
              <p className="font-medium text-gray-700">{selectedFile?.name}</p>
              <p className="mt-0.5">{selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : ''}</p>
            </div>
          </div>
        )}
      </div>

      {/* Gallery */}
      {loading ? (
        <LoadingSpinner />
      ) : photos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-500">No photos uploaded yet</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map(photo => (
              <div key={photo.supabaseId} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                <div
                  className="relative aspect-square bg-gray-100 cursor-pointer"
                  onClick={() => setLightbox(photo)}
                >
                  <img
                    src={photo.url}
                    alt={photo.fileName}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(photo) }}
                    className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete photo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-700">{formatDate(photo.photoDate)}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5" title={photo.fileName}>{photo.fileName}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
