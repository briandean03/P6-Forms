// Supabase Edge Function: release-webhook-151-lock
//
// Called by the front end after the webhook 151 polling loop exits — either because
// all required outputs are confirmed ready, or because the deadline was reached / the
// user aborted.  Deletes the in-flight lock row from dbp6_0008_widget_generation_requests.
//
// This is the ONLY mechanism that releases the lock.  The dispatch function
// (invoke-webhook-151) intentionally never deletes the row, so a 524 or network
// error on the n8n side does not prematurely allow a duplicate dispatch.
//
// Deploy: supabase functions deploy release-webhook-151-lock --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

  let body: { request_id?: string }
  try {
    body = await req.json()
  } catch {
    return corsResponse('Invalid JSON body', 400)
  }

  if (!body?.request_id)
    return corsResponse('request_id is required', 400)

  // Service-role client — required to delete from the lock table (browser has no write access)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase
    .from('dbp6_0008_widget_generation_requests')
    .delete()
    .eq('request_id', body.request_id)

  if (error)
    return jsonResponse({ error: error.message }, 500)

  return jsonResponse({ released: true }, 200)
})
