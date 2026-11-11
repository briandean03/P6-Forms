// Supabase Edge Function: invoke-webhook-151
//
// Acts as a fire-and-forget proxy for the n8n widget generator webhook (workflow 151).
// The direct browser→n8n call times out with a Cloudflare 524 because n8n takes longer
// than Cloudflare's 100-second connection limit to respond.
//
// This function:
//   1. Validates the request body.
//   2. Atomically inserts a lock row in dbp6_0008_widget_generation_requests.
//      A unique constraint on (schema_name, project_id, report_id) prevents concurrent dispatches.
//   3. Returns 202 Accepted with { request_id } immediately.
//   4. Dispatches to n8n in the background (EdgeRuntime.waitUntil).
//      The lock is intentionally NOT released here — n8n may still be running after
//      a 524 or network error. The front end releases the lock via release-webhook-151-lock
//      once it has confirmed readiness or given up.
//
// Deploy: supabase functions deploy invoke-webhook-151 --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const N8N_WEBHOOK_151_URL =
  'https://pmc2p2c.app.n8n.cloud/webhook/c89518bf-c14f-4c4a-8711-1d506c39600c'

function corsResponse(body: string | null, status: number, extra?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, ...extra },
  })
}

function jsonResponse(data: unknown, status: number): Response {
  return corsResponse(JSON.stringify(data), status, { 'Content-Type': 'application/json' })
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return corsResponse('ok', 200)

  if (req.method !== 'POST')
    return corsResponse('Method not allowed', 405)

  // Parse and validate request body
  let body: { flow_parameters?: Record<string, string> }
  try {
    body = await req.json()
  } catch {
    return corsResponse('Invalid JSON body', 400)
  }

  const p = body?.flow_parameters
  if (!p?.schema || !p?.project_id || !p?.report_id) {
    return corsResponse(
      'flow_parameters must include schema, project_id, and report_id',
      400,
    )
  }

  // Service-role client — required to bypass RLS on the lock table
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Atomically acquire the in-flight lock.
  // The UNIQUE constraint on (schema_name, project_id, report_id) causes this INSERT to fail
  // with Postgres error code 23505 if another dispatch is already in progress.
  const { data: lockRow, error: lockErr } = await supabase
    .from('dbp6_0008_widget_generation_requests')
    .insert({ schema_name: p.schema, project_id: p.project_id, report_id: p.report_id })
    .select('request_id')
    .single()

  if (lockErr) {
    const isConflict = lockErr.code === '23505'
    return jsonResponse(
      { error: isConflict
        ? 'A widget generation is already in progress for this report.'
        : lockErr.message },
      isConflict ? 409 : 500,
    )
  }

  const requestId: string = (lockRow as { request_id: string }).request_id

  // Dispatch to n8n in the background.
  // fetch() does not throw for HTTP-level errors (e.g. 500, 524) — always check res.status.
  // The lock is NOT released here regardless of n8n's response:
  //   - On success: front end polls for readiness and then calls release-webhook-151-lock.
  //   - On 524 / network error: n8n may still be running; releasing prematurely would allow
  //     a duplicate dispatch.
  const bg: Promise<void> = fetch(N8N_WEBHOOK_151_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_parameters: p }),
  }).then((res) => {
    if (res.status !== 200 && res.status !== 202) {
      console.error('[invoke-webhook-151] n8n returned unexpected status', res.status)
    }
  }).catch((err) => {
    // Network / Cloudflare error — n8n may still be running; do not release the lock.
    console.error('[invoke-webhook-151] dispatch to n8n failed', err)
  })

  // Keep the edge function isolate alive until the background fetch settles.
  // Note: EdgeRuntime.waitUntil has an execution-time limit (~150 s on Supabase Edge).
  // If n8n takes longer, the fetch may be killed, but the lock row will remain
  // (it is never deleted here) so the front end's releaseLock call will still work.
  // @ts-ignore — EdgeRuntime is injected by the Supabase edge runtime
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(bg)

  return jsonResponse({ request_id: requestId }, 202)
})
