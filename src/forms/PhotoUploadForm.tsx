import { useState, useEffect, useRef, useCallback } from 'react'
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

function blobDisplayUrl(blobName: string) {
  return `${BLOB_BASE}/${blobName}?${SAS_TOKEN}`
}

interface QueuedFile {
  file: File
  previewUrl: string
}

interface Photo {
  supabaseId: string
  blobName: string
  fileName: string
  photoDate: string
  url: string
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
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
        const blobName = row.imageurl ? row.imageurl.replace(`${BLOB_BASE}/`, '') : ''
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

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    const newItems: QueuedFile[] = imageFiles.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setFileQueue(prev => [...prev, ...newItems])
  }, [])

  const removeFromQueue = (index: number) => {
    setFileQueue(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (fileQueue.length === 0 || !photoDate) return
    setUploading(true)
    setUploadProgress({ current: 0, total: fileQueue.length })

    let successCount = 0
    const failedNames: string[] = []

    for (let i = 0; i < fileQueue.length; i++) {
      const { file, previewUrl } = fileQueue[i]
      setUploadProgress({ current: i + 1, total: fileQueue.length })
      try {
        const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
        const serial = uploadCounterRef.current
        const displayName = `${photoDate}${ext}`
        const blobName = `${projectId}/${photoDate}-${serial}${ext}`

        // 1. Upload to Azure
        const blockBlob = getContainerClient().getBlockBlobClient(blobName)
        await blockBlob.uploadData(file, {
          blobHTTPHeaders: { blobContentType: file.type },
        })

        // 2. Save metadata to Supabase
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
          await getContainerClient().deleteBlob(blobName)
          throw insertError
        }

        uploadCounterRef.current += 1
        successCount++
      } catch {
        failedNames.push(file.name)
      }
      URL.revokeObjectURL(previewUrl)
    }

    setFileQueue([])
    setPhotoDate('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploadProgress(null)

    if (successCount > 0) {
      showSuccess(`${successCount} photo${successCount !== 1 ? 's' : ''} uploaded successfully`)
      fetchPhotos()
    }
    if (failedNames.length > 0) {
      showError(`Failed to upload: ${failedNames.join(', ')}`)
    }

    setUploading(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await getContainerClient().deleteBlob(deleteTarget.blobName)
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
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Upload Photos</h3>
        <form onSubmit={handleUpload} className="space-y-4">

          {/* Drag & drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors select-none ${
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)}
            />
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-500">Drag & drop images here, or <span className="text-blue-600 font-medium">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">Multiple images supported</p>
          </div>

          {/* Queued file previews */}
          {fileQueue.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">{fileQueue.length} file{fileQueue.length !== 1 ? 's' : ''} selected</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {fileQueue.map((item, i) => (
                  <div key={i} className="relative group aspect-square">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full h-full object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromQueue(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date + submit row */}
          <div className="flex flex-wrap gap-4 items-end">
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
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={fileQueue.length === 0 || !photoDate || uploading}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading && uploadProgress
                  ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…`
                  : `Upload${fileQueue.length > 1 ? ` ${fileQueue.length} photos` : ''}`}
              </button>
            </div>
          </div>
        </form>
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
