// Geocode a typed address with the US Census Geocoder (free, no API key) and
// say whether it falls inside the contest geofence. Used by the lights
// submission flow when device GPS is denied (plan §4).
//
//   POST /functions/v1/geocode
//   Authorization: Bearer <signed-in user's access token> (phone accounts only)
//   { "address": "1221 Candlewood Dr" }
//
//   200 { "match": { "lat", "lng", "matchedAddress" }, "inGeofence": true }
//   400 { "error": "invalid_json" | "invalid_address" }
//   401 { "error": "sign_in_required" }
//   404 { "error": "no_match" }
//   405 { "error": "method_not_allowed" }
//   429 { "error": "rate_limited" }            (Retry-After header)
//   502 { "error": "geocoder_unavailable" }    (Census down, slow or malformed)
//   500 { "error": "geofence_unavailable" }    (lights.settings unreadable)
//   500 { "error": "internal_error" }          (anything else; details in the log)
//
// The database re-checks the geofence on insert (RLS); this check is for UX.
// verify_jwt is off (config.toml) and the caller is verified here against
// GoTrue instead, which works with both legacy JWT keys and the new API keys.
//
// Env (set automatically by Supabase): SUPABASE_URL, SUPABASE_ANON_KEY.
// Optional: CENSUS_GEOCODER_URL to point at a stub in tests.

import {
  CENSUS_DEFAULT_BASE,
  RateLimiter,
  censusUrl,
  inGeofence,
  pickMatch,
  toCensusAddress,
  toGeofence,
} from './census.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const CENSUS_BASE = Deno.env.get('CENSUS_GEOCODER_URL') || CENSUS_DEFAULT_BASE
const CENSUS_TIMEOUT_MS = 8000

// 20 lookups per user per 10 minutes is plenty for one submission.
const limiter = new RateLimiter(20, 10 * 60 * 1000)

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  })
}

/**
 * The signed-in, phone-verified user's id, or null. Asks GoTrue, so the token
 * is really verified. Email or anonymous accounts have no phone and are
 * refused, as they are by the lights RLS (lights.caller_has_phone()).
 */
async function userIdFrom(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: ANON_KEY },
  })
  if (!res.ok) return null
  const user = await res.json().catch(() => null)
  const hasPhone = typeof user?.phone === 'string' && user.phone !== '' && user.is_anonymous !== true
  return typeof user?.id === 'string' && hasPhone ? user.id : null
}

async function loadGeofence() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=geofence_min_lat,geofence_max_lat,geofence_min_lng,geofence_max_lng,geofence_polygon`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Accept-Profile': 'lights' } },
  )
  if (!res.ok) return null
  const rows = await res.json().catch(() => null)
  return Array.isArray(rows) ? toGeofence(rows[0]) : null
}

Deno.serve(async (req) => {
  // A network error talking to GoTrue or PostgREST must still answer with JSON
  // and CORS headers (an unhandled throw gives the browser an opaque 500) and
  // must not echo internals; details go to the function log.
  try {
    return await handle(req)
  } catch (error) {
    console.error('geocode: unexpected error', error)
    return json(500, { error: 'internal_error' })
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const userId = await userIdFrom(req)
  if (!userId) return json(401, { error: 'sign_in_required' })

  const wait = limiter.take(userId)
  if (wait > 0) return json(429, { error: 'rate_limited' }, { 'Retry-After': String(wait) })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }
  const address = toCensusAddress(body)
  if (!address) return json(400, { error: 'invalid_address' })

  const fence = await loadGeofence()
  if (!fence) return json(500, { error: 'geofence_unavailable' })

  let payload: unknown
  try {
    const res = await fetch(censusUrl(address, CENSUS_BASE), {
      signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Census responded ${res.status}`)
    payload = await res.json()
  } catch (error) {
    console.error('geocode: Census request failed', error)
    return json(502, { error: 'geocoder_unavailable' })
  }

  let match
  try {
    match = pickMatch(payload, fence)
  } catch (error) {
    console.error('geocode: unexpected Census payload', error)
    return json(502, { error: 'geocoder_unavailable' })
  }
  if (!match) return json(404, { error: 'no_match' })
  return json(200, { match, inGeofence: inGeofence(match, fence) })
}
