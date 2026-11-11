import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Ticket = { request_id: string; access_token: string }
type RequestStatus = 'queued' | 'accepted' | 'dispatch_uncertain' | 'rejected' | 'closed'
const messages: Record<RequestStatus, string> = {
  queued: 'Request saved: waiting for the dispatch response.',
  accepted: '149: Request accepted. Calculations may still be running. Report readiness has not been checked.',
  dispatch_uncertain: '149: Dispatch outcome is uncertain. Check the n8n execution before retrying. No automatic retry was made.',
  rejected: '149: The server returned an unexpected response. Check the execution before starting another request.',
  closed: 'This request has been closed by the administrator.',
}

export function ReportRequestPanel({ schema, projectId, disabled, onBusy }: {
  schema: string; projectId: string; disabled: boolean; onBusy: (busy: boolean) => void
}) {
  const key = `p6-report-request:${schema}:${projectId}`
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [status, setStatus] = useState<RequestStatus | null>(null)
  const [error, setError] = useState('')
  const running = useRef<AbortController | null>(null)

  useEffect(() => {
    setTicket(null); setStatus(null); setError(''); onBusy(false)
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      if (stored?.request_id && stored?.access_token) setTicket(stored)
    } catch { /* No recoverable request in this browser tab. */ }
    return () => { running.current?.abort(); running.current = null; onBusy(false) }
  }, [key, onBusy])

  const check = async (saved: Ticket, signal: AbortSignal) => {
    for (let attempt = 0; attempt < 45; attempt++) {
      signal.throwIfAborted()
      // These RPCs use the public client; the server validates the selected
      // project schema and mapping. No service-role key is used by the browser.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: failure } = await (supabase as any).rpc('dbp6_weekly_report_request_status', {
        p_request_id: saved.request_id, p_access_token: saved.access_token,
      }).abortSignal(signal)
      signal.throwIfAborted()
      if (failure) throw new Error(failure.message)
      if (!data || !(data.status in messages)) throw new Error('Unexpected request status response.')
      setStatus(data.status)
      if (data.status !== 'queued') return
      await new Promise<void>((resolve, reject) => {
        const stop = () => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, 3000)
        signal.addEventListener('abort', stop, { once: true })
      })
    }
    throw new Error('Status checking paused. The saved request remains available: use Check status. Do not start a duplicate run.')
  }

  const run = async (submit: boolean) => {
    if (running.current || disabled) return
    const controller = new AbortController()
    running.current = controller
    onBusy(true); setError('')
    try {
      const saved = ticket ?? { request_id: crypto.randomUUID(), access_token: crypto.randomUUID() }
      // Persist before submission: an interrupted response can be recovered with
      // the SAME identifiers without dispatching the webhook again.
      sessionStorage.setItem(key, JSON.stringify(saved))
      setTicket(saved)
      if (submit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: failure } = await (supabase as any).rpc('dbp6_weekly_report_request', {
          p_schema: schema, p_project_id: projectId, p_request_id: saved.request_id, p_access_token: saved.access_token,
        }).abortSignal(controller.signal)
        controller.signal.throwIfAborted()
        if (failure) throw new Error(failure.message)
        setStatus('queued')
      }
      await check(saved, controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (running.current === controller) { running.current = null; onBusy(false) }
    }
  }

  return <div className="p-4 rounded-lg border border-indigo-200 bg-indigo-50 space-y-2">
    <p className="text-sm font-medium">Supabase request demo: calculations only</p>
    <p className="text-xs text-gray-600">Saves a request and dispatches 149 in the background. Steps 152, 151 and 150 are not started by this demo.</p>
    <div className="flex gap-2">
      <button onClick={() => run(true)} disabled={disabled || !!status}
        className="px-4 py-2 text-sm rounded bg-indigo-600 text-white disabled:opacity-50">
        {ticket ? 'Submit or recover same request' : 'Request calculations'}
      </button>
      {ticket && <button onClick={() => run(false)} disabled={disabled} className="px-3 py-2 text-sm border rounded disabled:opacity-50">Check status</button>}
      {status === 'closed' && <button disabled={disabled} onClick={() => { sessionStorage.removeItem(key); setTicket(null); setStatus(null); setError('') }} className="text-sm underline">Clear closed request</button>}
    </div>
    {ticket && <p className="text-xs break-all">Request ID: {ticket.request_id}</p>}
    <p className="text-xs" role="status">{status ? messages[status] : ticket ? 'Saved request found: check its status or recover the same request.' : 'No request submitted.'}</p>
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
  </div>
}
