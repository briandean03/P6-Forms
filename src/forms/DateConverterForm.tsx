import { useState, useRef, useMemo } from 'react'

// ─── Date parsing helpers ────────────────────────────────────────────────────

// Mirrors the Python DATE_FORMATS list — tried in order, first match wins.
// Output: "YYYY-MM-DD HH:MM:SS"
interface FmtDef {
  re: RegExp
  dayIdx: number
  monIdx: number
  yrIdx: number
  hrIdx: number
  minIdx: number
  secIdx: number | null
  twoDigitYear: boolean
}

const DATE_FORMATS: FmtDef[] = [
  // %m/%d/%Y %H:%M:%S  — MM/DD tried first (P6 default locale)
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/, dayIdx: 2, monIdx: 1, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: 6, twoDigitYear: false },
  // %m/%d/%Y %H:%M
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/, dayIdx: 2, monIdx: 1, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: null, twoDigitYear: false },
  // %d/%m/%Y %H:%M:%S  — DD/MM fallback (day > 12 makes it unambiguous)
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/, dayIdx: 1, monIdx: 2, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: 6, twoDigitYear: false },
  // %d/%m/%Y %H:%M
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/, dayIdx: 1, monIdx: 2, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: null, twoDigitYear: false },
  // %d/%m/%y %H:%M:%S  — 2-digit year variants
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/, dayIdx: 1, monIdx: 2, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: 6, twoDigitYear: true },
  // %d/%m/%y %H:%M
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/, dayIdx: 1, monIdx: 2, yrIdx: 3, hrIdx: 4, minIdx: 5, secIdx: null, twoDigitYear: true },
]

function tryParseDate(val: string): string | null {
  const v = val.trim()
  if (!v) return null

  for (const fmt of DATE_FORMATS) {
    const m = v.match(fmt.re)
    if (!m) continue

    let yr = parseInt(m[fmt.yrIdx], 10)
    const mo = parseInt(m[fmt.monIdx], 10)
    const dy = parseInt(m[fmt.dayIdx], 10)
    const hr = parseInt(m[fmt.hrIdx], 10)
    const mn = parseInt(m[fmt.minIdx], 10)
    const sc = fmt.secIdx !== null ? parseInt(m[fmt.secIdx], 10) : 0

    if (fmt.twoDigitYear) yr = yr >= 50 ? 1900 + yr : 2000 + yr
    if (mo < 1 || mo > 12) continue
    if (dy < 1 || dy > 31) continue

    return (
      `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')} ` +
      `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(sc).padStart(2, '0')}`
    )
  }

  return null
}

function looksDateLike(v: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())
}

function colLooksLikeDate(samples: string[]): boolean {
  const nonEmpty = samples.filter(v => v.trim()).slice(0, 20)
  if (nonEmpty.length < 2) return false
  return nonEmpty.filter(v => looksDateLike(v)).length / nonEmpty.length >= 0.5
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const res: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      res.push(cur); cur = ''
    } else cur += ch
  }
  res.push(cur)
  return res
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '') // strip UTF-8 BOM
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 1) return { headers: [], rows: [] }
  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows = lines.slice(1).map(l => {
    const cols = parseLine(l)
    while (cols.length < headers.length) cols.push('')
    return cols.map(c => c.trim())
  })
  return { headers, rows }
}

function escCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n'))
    return `"${val.replace(/"/g, '""')}"`
  return val
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DateConverterForm() {
  const [step, setStep] = useState<'upload' | 'configure' | 'preview'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [selectedCols, setSelectedCols] = useState<Set<number>>(new Set())
  const [filename, setFilename] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
    const text = await file.text()
    const { headers: h, rows: r } = parseCSV(text)
    if (h.length === 0) return
    setHeaders(h)
    setRows(r)
    setFilename(file.name)
    const detected = new Set<number>()
    h.forEach((_, ci) => {
      if (colLooksLikeDate(r.slice(0, 30).map(row => row[ci] ?? ''))) detected.add(ci)
    })
    setSelectedCols(detected)
    setStep('configure')
  }

  const toggleCol = (ci: number) => {
    setSelectedCols(prev => {
      const next = new Set(prev)
      if (next.has(ci)) next.delete(ci); else next.add(ci)
      return next
    })
  }

  const convertedRows = useMemo(() =>
    rows.map(row =>
      row.map((val, ci) =>
        selectedCols.has(ci) ? (tryParseDate(val) ?? val) : val
      )
    ), [rows, selectedCols])

  const stats = useMemo(() => {
    let converted = 0, failed = 0
    rows.forEach(row => {
      selectedCols.forEach(ci => {
        const v = row[ci]?.trim()
        if (!v) return
        if (tryParseDate(v) !== null) converted++
        else failed++
      })
    })
    return { converted, failed }
  }, [rows, selectedCols])

  const download = () => {
    const csv = [
      headers.map(escCell).join(','),
      ...convertedRows.map(r => r.map(escCell).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.csv$/i, '_converted.csv')
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setSelectedCols(new Set())
    setFilename('')
  }

  // ── Upload step ─────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Date Format Converter</h2>
        <p className="text-sm text-gray-500 mb-8">
          Upload a CSV, select which columns contain dates, and download a converted file with all dates in{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">YYYY-MM-DD HH:MM:SS</code> format.
          Supports formats like{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">15/06/2024 08:30</code>,{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">15/06/24 08:30:00</code>,{' '}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">06/15/2024 08:30</code>.
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) processFile(f)
          }}
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-gray-600 font-medium">Drop your CSV here</p>
          <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) processFile(f)
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  // ── Configure step ──────────────────────────────────────────────────────────
  if (step === 'configure') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Configure Conversion</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {filename} · {rows.length.toLocaleString()} rows · {headers.length} columns
            </p>
          </div>
          <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Start over
          </button>
        </div>

        {/* Column selection */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Select columns to convert
            </span>
            <div className="flex gap-3 text-xs text-gray-500">
              <button
                onClick={() => setSelectedCols(new Set(headers.map((_, i) => i)))}
                className="hover:text-blue-600"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedCols(new Set())}
                className="hover:text-red-600"
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {headers.map((header, ci) => {
              const samples = rows.slice(0, 5).map(r => r[ci] ?? '').filter(v => v)
              const autoDetected = colLooksLikeDate(rows.slice(0, 30).map(r => r[ci] ?? ''))
              const isChecked = selectedCols.has(ci)
              return (
                <label
                  key={ci}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${isChecked ? 'bg-blue-50/50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCol(ci)}
                    className="accent-blue-600 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{header}</span>
                      {autoDetected && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                          Auto-detected
                        </span>
                      )}
                    </div>
                    {samples.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        e.g. {samples.slice(0, 3).join(' · ')}
                      </p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => setStep('preview')}
            disabled={selectedCols.size === 0}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Preview Conversion →
          </button>
        </div>
      </div>
    )
  }

  // ── Preview step ────────────────────────────────────────────────────────────
  const previewRows = convertedRows.slice(0, 20)

  return (
    <div className="space-y-4 py-4">
      <div className="max-w-full px-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Conversion Preview</h2>
            <p className="text-sm text-gray-500 mt-0.5">{filename}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStep('configure')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={download}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Converted CSV
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-gray-600">
              <strong>{stats.converted.toLocaleString()}</strong> values converted
            </span>
          </div>
          {stats.failed > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-gray-600">
                <strong>{stats.failed.toLocaleString()}</strong> values not recognised (kept as-is)
              </span>
            </div>
          )}
          <div className="text-sm text-gray-400">
            {rows.length.toLocaleString()} total rows · {selectedCols.size} column{selectedCols.size !== 1 ? 's' : ''} selected
          </div>
        </div>

        {/* Preview table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            Showing first {Math.min(20, rows.length)} of {rows.length.toLocaleString()} rows ·{' '}
            <span className="text-blue-600 font-medium">Blue headers</span> = converted columns ·{' '}
            <span className="text-green-600 font-medium">Green cells</span> = converted ·{' '}
            <span className="text-amber-600 font-medium">Amber cells</span> = not recognised
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-max text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  {headers.map((h, ci) => (
                    <th
                      key={ci}
                      className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${
                        selectedCols.has(ci)
                          ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-300'
                          : 'text-gray-600 bg-gray-50'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    {row.map((val, ci) => {
                      const orig = rows[ri][ci]
                      const wasConverted =
                        selectedCols.has(ci) && !!orig?.trim() && tryParseDate(orig) !== null
                      const unrecognised =
                        selectedCols.has(ci) && !!orig?.trim() && tryParseDate(orig) === null
                      return (
                        <td
                          key={ci}
                          className={`px-3 py-1.5 whitespace-nowrap ${
                            wasConverted
                              ? 'text-green-800 bg-green-50'
                              : unrecognised
                              ? 'text-amber-700 bg-amber-50'
                              : selectedCols.has(ci)
                              ? 'bg-blue-50/20'
                              : ''
                          }`}
                        >
                          {val || <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
