import { useState, useEffect, useRef, useCallback } from 'react'
import { ContainerClient } from '@azure/storage-blob'
import { schemaClient } from '@/lib/supabase'
import { getSchemaConfig } from '@/lib/schemaConfig'
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
  description: string
}

interface Photo {
  supabaseId: string
  blobName: string
  fileName: string
  photoDate: string
  url: string
  serialNumber: string
  description: string
}

interface SupabasePhotoRow {
  id: string
  filename: string | null
  photodate: string | null
  imageurl: string | null
  serialnumber: string | null
  description: string | null
}

export function PhotoUploadForm({ projectId, schemaName }: { projectId: string; schemaName: string }) {
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
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadCounterRef = useRef(1)
  const { notification, showSuccess, showError, hideNotification } = useNotification()
  const db = schemaClient(schemaName)
  const schemaCfg = getSchemaConfig(schemaName)
  const folder = schemaCfg.blobFolder ?? projectId

  const fetchPhotos = async () => {
    setLoading(true)
    try {
      const { data, error } = await db
        .from('p6forms_photoupload')
        .select('*')
        .like('imageurl', `%/${folder}/%`)
        .order('photodate', { ascending: false }) as unknown as { data: SupabasePhotoRow[] | null; error: unknown }

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
          description: row.description ?? '',
        }
      })
      setPhotos(result)
      // Seed serial counter above the highest existing serial so uploads in a
      // new session never collide with blobs already in Azure.
      const maxSerial = result.reduce((max, p) => {
        const n = parseInt(p.serialNumber, 10)
        return isNaN(n) ? max : Math.max(max, n)
      }, 0)
      uploadCounterRef.current = maxSerial + 1
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
      description: '',
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
      const { file, previewUrl, description } = fileQueue[i]
      setUploadProgress({ current: i + 1, total: fileQueue.length })
      try {
        const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
        const serial = uploadCounterRef.current
        const displayName = `${photoDate}${ext}`
        const blobName = `${folder}/${photoDate}-${serial}${ext}`

        // 1. Upload to Azure
        const blockBlob = getContainerClient().getBlockBlobClient(blobName)
        await blockBlob.uploadData(file, {
          blobHTTPHeaders: { blobContentType: file.type },
        })

        // 2. Save metadata to Supabase
        const insertPayload: Record<string, string | null> = {
          filename: displayName,
          photodate: photoDate,
          imageurl: `${BLOB_BASE}/${blobName}`,
          serialnumber: String(serial),
          dgt_projectid: projectId,
          description: description.trim() || null,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (db as any)
          .from('p6forms_photoupload')
          .insert(insertPayload)
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

  const handleSaveDescription = async (photo: Photo) => {
    setSavingDescription(true)
    const description = descriptionDraft.trim()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any)
        .from('p6forms_photoupload')
        .update({ description: description || null })
        .eq('id', photo.supabaseId)
        .select('id, description')
        .single()
      if (error) throw error
      if (!data) throw new Error('The description was not saved. Please refresh and try again.')
      const saved = data.description ?? ''
      setPhotos(prev => prev.map(p => p.supabaseId === photo.supabaseId ? { ...p, description: saved } : p))
      setLightbox(prev => prev?.supabaseId === photo.supabaseId ? { ...prev, description: saved } : prev)
      setEditingPhotoId(null)
      showSuccess('Photo description saved')
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save photo description')
    }
    setSavingDescription(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await getContainerClient().deleteBlob(deleteTarget.blobName)
      const { error } = await db
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
          role="dialog"
          aria-label="Photo preview"
          aria-modal="true"
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
              {lightbox.description && <p className="mt-2 whitespace-pre-wrap break-words">{lightbox.description}</p>}
            </div>
            <button
              aria-label="Close photo preview"
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
              aria-label="Choose photos"
              disabled={uploading}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fileQueue.map((item, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <img src={item.previewUrl} alt={item.file.name} className="w-16 h-16 rounded object-cover" />
                      <p className="min-w-0 flex-1 text-sm break-words">{item.file.name}</p>
                      <button type="button" disabled={uploading} onClick={() => removeFromQueue(i)} aria-label={`Remove ${item.file.name}`} className="text-red-600 text-sm disabled:opacity-50">Remove</button>
                    </div>
                    <label htmlFor={`queued-description-${i}`} className="block text-xs font-medium text-gray-600">Description for {item.file.name} (optional)</label>
                    <textarea
                      id={`queued-description-${i}`}
                      value={item.description}
                      onChange={e => setFileQueue(prev => prev.map((entry, index) => index === i ? { ...entry, description: e.target.value } : entry))}
                      disabled={uploading}
                      rows={3}
                      placeholder="Describe the work or location shown in this photo"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date + submit row */}
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label htmlFor="photo-upload-date" className="block text-xs font-medium text-gray-600 mb-1">Photo Date</label>
              <input
                id="photo-upload-date"
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
                  {editingPhotoId === photo.supabaseId ? (
                    <div className="mt-2 space-y-2">
                      <label htmlFor={`saved-description-${photo.supabaseId}`} className="block text-xs font-medium text-gray-600">Photo description</label>
                      <textarea id={`saved-description-${photo.supabaseId}`} value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} disabled={savingDescription} rows={3} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      <div className="flex gap-3 text-xs">
                        <button type="button" disabled={savingDescription} onClick={() => handleSaveDescription(photo)} className="text-blue-600 disabled:opacity-50">{savingDescription ? 'Saving…' : 'Save description'}</button>
                        <button type="button" disabled={savingDescription} onClick={() => setEditingPhotoId(null)} className="text-gray-600">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {photo.description && <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap break-words line-clamp-3" title={photo.description}>{photo.description}</p>}
                      <button type="button" disabled={savingDescription} onClick={() => { setEditingPhotoId(photo.supabaseId); setDescriptionDraft(photo.description) }} className="mt-2 text-xs text-blue-600">{photo.description ? 'Edit description' : 'Add description'}</button>
                    </>
                  )}

                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
