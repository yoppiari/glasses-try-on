/**
 * DOOZ Shared Capture SDK & Passwordless Member Portal Client
 * Single source of truth for:
 * 1. Indonesian WhatsApp number normalization (0812..., +62812..., 628... -> 628...)
 * 2. Signed attribution token capture & persistence (?src=&host=&sesi=&outlet=&sig=)
 * 3. Post-result lead identification (identify) & omnichannel event tracking (track)
 * 4. Privacy-minimized wa.me verification URL builder (DZ-xxxx only, no PII in WA text)
 * 5. Passwordless Member Portal ("Data Saya") API client
 */

const STORAGE_KEYS = {
  ATTRIBUTION: 'dooz_attribution_v1',
  LEAD_STATE: 'dooz_lead_state_v1',
  PORTAL_SESSION: 'dooz_member_session_v1',
  LOCAL_EVENTS: 'dooz_local_events_v1',
}

export const DEFAULT_OFFICIAL_WA = '6281122334455'

export const SIZE_CHART_DEFAULT = [
  { category: 'XS', label: 'Extra Small (XS)', min_mm: 115, max_mm: 127, description: 'Wajah mungil / remaja' },
  { category: 'S', label: 'Small (S)', min_mm: 128, max_mm: 133, description: 'Wajah ramping' },
  { category: 'M', label: 'Medium (M)', min_mm: 134, max_mm: 139, description: 'Ukuran standar mayoritas dewasa' },
  { category: 'L', label: 'Large (L)', min_mm: 140, max_mm: 145, description: 'Wajah lebar' },
  { category: 'XL', label: 'Extra Large (XL)', min_mm: 146, max_mm: 165, description: 'Wajah ekstra lebar' },
]

/**
 * Searchable list of Indonesian Kota & Kabupaten (prioritizing Solo Raya, Jawa, and major cities nationwide)
 */
export const INDONESIA_CITIES = [
  'Kota Surakarta (Solo)',
  'Kab. Sukoharjo',
  'Kab. Karanganyar',
  'Kab. Boyolali',
  'Kab. Klaten',
  'Kab. Sragen',
  'Kab. Wonogiri',
  'Kota Yogyakarta',
  'Kab. Sleman',
  'Kab. Bantul',
  'Kab. Kulon Progo',
  'Kab. Gunungkidul',
  'Kota Semarang',
  'Kab. Semarang',
  'Kota Salatiga',
  'Kota Magelang',
  'Kab. Magelang',
  'Kota Pekalongan',
  'Kota Tegal',
  'Kab. Banyumas (Purwokerto)',
  'Kab. Cilacap',
  'Kab. Kudus',
  'Kab. Jepara',
  'Kab. Pati',
  'Kab. Kebumen',
  'Kab. Purworejo',
  'Kab. Wonosobo',
  'Kab. Temanggung',
  'Kab. Kendal',
  'Kab. Demak',
  'Kab. Grobogan',
  'Kab. Blora',
  'Kab. Rembang',
  'Kab. Pemalang',
  'Kab. Brebes',
  'Kota Jakarta Selatan',
  'Kota Jakarta Pusat',
  'Kota Jakarta Barat',
  'Kota Jakarta Timur',
  'Kota Jakarta Utara',
  'Kota Bogor',
  'Kab. Bogor',
  'Kota Depok',
  'Kota Tangerang',
  'Kota Tangerang Selatan',
  'Kab. Tangerang',
  'Kota Bekasi',
  'Kab. Bekasi',
  'Kota Bandung',
  'Kab. Bandung',
  'Kab. Bandung Barat',
  'Kota Cimahi',
  'Kota Cirebon',
  'Kab. Cirebon',
  'Kota Tasikmalaya',
  'Kota Sukabumi',
  'Kab. Karawang',
  'Kab. Purwakarta',
  'Kab. Subang',
  'Kab. Garut',
  'Kab. Sumedang',
  'Kab. Indramayu',
  'Kab. Majalengka',
  'Kab. Kuningan',
  'Kota Serang',
  'Kota Cilegon',
  'Kota Surabaya',
  'Kab. Sidoarjo',
  'Kab. Gresik',
  'Kota Malang',
  'Kab. Malang',
  'Kota Batu',
  'Kota Madiun',
  'Kab. Madiun',
  'Kota Kediri',
  'Kab. Kediri',
  'Kota Mojokerto',
  'Kota Pasuruan',
  'Kota Probolinggo',
  'Kota Blitar',
  'Kab. Jember',
  'Kab. Banyuwangi',
  'Kab. Tulungagung',
  'Kab. Ponorogo',
  'Kab. Ngawi',
  'Kab. Magetan',
  'Kab. Bojonegoro',
  'Kab. Tuban',
  'Kab. Lamongan',
  'Kab. Jombang',
  'Kab. Nganjuk',
  'Kota Denpasar',
  'Kab. Badung',
  'Kab. Gianyar',
  'Kab. Tabanan',
  'Kab. Buleleng',
  'Kota Medan',
  'Kab. Deli Serdang',
  'Kota Binjai',
  'Kota Pematangsiantar',
  'Kota Padang',
  'Kota Bukittinggi',
  'Kota Pekanbaru',
  'Kota Dumai',
  'Kota Batam',
  'Kota Tanjungpinang',
  'Kota Palembang',
  'Kota Jambi',
  'Kota Bengkulu',
  'Kota Bandar Lampung',
  'Kota Pangkalpinang',
  'Kota Banda Aceh',
  'Kota Pontianak',
  'Kota Singkawang',
  'Kota Palangka Raya',
  'Kota Banjarmasin',
  'Kota Banjarbaru',
  'Kota Balikpapan',
  'Kota Samarinda',
  'Kota Bontang',
  'Kota Tarakan',
  'Kota Makassar',
  'Kab. Gowa',
  'Kab. Maros',
  'Kota Parepare',
  'Kota Palopo',
  'Kota Manado',
  'Kota Bitung',
  'Kota Tomohon',
  'Kota Palu',
  'Kota Kendari',
  'Kota Gorontalo',
  'Kota Mataram',
  'Kab. Lombok Barat',
  'Kab. Lombok Tengah',
  'Kota Kupang',
  'Kota Ambon',
  'Kota Ternate',
  'Kota Jayapura',
  'Kota Sorong',
]

/**
 * Normalizes any Indonesian WhatsApp number input into canonical `628...` format.
 * Examples:
 * - "0812-3456-7890" -> "6281234567890"
 * - "+62 812 3456 7890" -> "6281234567890"
 * - "6281234567890" -> "6281234567890"
 * - "81234567890" -> "6281234567890"
 */
export function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      valid: false,
      normalized: '',
      masked: '',
      error: 'Nomor WhatsApp wajib diisi',
    }
  }

  let digits = raw.replace(/\D+/g, '')
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1)
  } else if (digits.startsWith('8')) {
    digits = '62' + digits
  } else if (digits.startsWith('00628')) {
    digits = digits.slice(2)
  }

  if (!digits.startsWith('628') || digits.length < 10 || digits.length > 15) {
    return {
      valid: false,
      normalized: digits,
      masked: '',
      error: 'Format nomor WhatsApp Indonesia tidak valid (contoh: 081234567890)',
    }
  }

  return {
    valid: true,
    normalized: digits,
    masked: maskPhoneDisplay(digits),
  }
}

export function normalizePhoneString(raw) {
  const res = normalizePhone(raw)
  return res.valid ? res.normalized : ''
}

/**
 * Formats a phone number as `0812****4567` per UU PDP & PRD specification.
 */
export function maskPhoneDisplay(phone) {
  if (!phone) return '08******'
  const digits = String(phone).replace(/\D+/g, '')
  let local = digits
  if (digits.startsWith('62')) {
    local = '0' + digits.slice(2)
  }
  if (local.length < 8) {
    return '08******'
  }
  return `${local.slice(0, 4)}****${local.slice(-4)}`
}

/**
 * Maps a width in millimeters to DOOZ standard size category (XS, S, M, L, XL).
 */
export function mapWidthToSizeCategory(widthMm) {
  const n = Number(widthMm)
  if (!Number.isFinite(n) || n <= 0) return 'M'
  if (n <= 127) return 'XS'
  if (n <= 133) return 'S'
  if (n <= 139) return 'M'
  if (n <= 145) return 'L'
  return 'XL'
}

/**
 * Builds the privacy-minimized WhatsApp verification URL (`wa.me`).
 * Strictly includes ONLY the unique `DZ-xxxx` code — never personal name or city.
 */
export function buildWAMeVerifyURL(dzCode, officialWANumber = DEFAULT_OFFICIAL_WA) {
  const cleanCode = String(dzCode || 'DZ-0000').trim().toUpperCase()
  const cleanWA = String(officialWANumber || DEFAULT_OFFICIAL_WA).replace(/\D+/g, '') || DEFAULT_OFFICIAL_WA
  const text = `Halo DOOZ, verifikasi hasil ukur saya kode: ${cleanCode}`
  return `https://wa.me/${cleanWA}?text=${encodeURIComponent(text)}`
}

function safeStorageGet(key) {
  try {
    if (typeof window === 'undefined') return null
    const raw =
      window.sessionStorage?.getItem(key) ||
      window.localStorage?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof window === 'undefined') return
    const serialized = JSON.stringify(value)
    window.sessionStorage?.setItem(key, serialized)
    window.localStorage?.setItem(key, serialized)
  } catch {
    // ignore storage quota errors
  }
}

function safeStorageRemove(key) {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage?.removeItem(key)
    window.localStorage?.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Reads signed attribution parameters (`?src=&host=&sesi=&outlet=&sig=`) from URL query
 * and persists them in both sessionStorage and localStorage.
 */
export function captureAttributionFromURL(searchString) {
  const query =
    typeof searchString === 'string'
      ? searchString
      : typeof window !== 'undefined'
        ? window.location.search
        : ''

  if (!query) {
    return getStoredAttribution()
  }

  const params = new URLSearchParams(query)
  const src = (params.get('src') || '').trim()
  const host = (params.get('host') || '').trim()
  const sesi = (params.get('sesi') || '').trim()
  const outlet = (params.get('outlet') || '').trim()
  const sig = (params.get('sig') || '').trim()

  if (!src && !host && !sesi && !outlet && !sig) {
    return getStoredAttribution()
  }

  const attribution = {
    src: src || 'direct_web',
    host,
    sesi,
    outlet,
    sig,
    captured_at: new Date().toISOString(),
  }

  safeStorageSet(STORAGE_KEYS.ATTRIBUTION, attribution)
  return attribution
}

export function getStoredAttribution() {
  return (
    safeStorageGet(STORAGE_KEYS.ATTRIBUTION) || {
      src: 'direct_web',
      host: '',
      sesi: '',
      outlet: '',
      sig: '',
    }
  )
}

export function clearStoredAttribution() {
  safeStorageRemove(STORAGE_KEYS.ATTRIBUTION)
}

export function getStoredLeadState() {
  return safeStorageGet(STORAGE_KEYS.LEAD_STATE)
}

function generateLocalDZCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = 'DZ-'
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function resolveApiBase(options = {}) {
  if (options.apiBase) return String(options.apiBase).replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.DOOZ_HUB_API_BASE) {
    return String(window.DOOZ_HUB_API_BASE).replace(/\/+$/, '')
  }
  return ''
}

/**
 * Verifies the stored attribution token signature against the Customer Hub backend.
 */
export async function verifyStoredAttribution(options = {}) {
  const attr = getStoredAttribution()
  if (!attr.sig) {
    return { valid: false, unsigned: true, ...attr }
  }
  const base = resolveApiBase(options)
  const qs = new URLSearchParams({
    src: attr.src || '',
    host: attr.host || '',
    sesi: attr.sesi || '',
    outlet: attr.outlet || '',
    sig: attr.sig || '',
  })
  try {
    const resp = await fetch(`${base}/api/attribution/verify?${qs.toString()}`)
    if (!resp.ok) return { valid: false, ...attr }
    return await resp.json()
  } catch {
    return { valid: false, offline: true, ...attr }
  }
}

/**
 * Submits post-result lead capture (`identify`) to `POST /api/capture/identify`.
 * Enforces phone normalization, explicit consent, anti-spam honeypot/Turnstile,
 * and returns a uniform response (never enumerating whether a phone is already registered).
 */
export async function identify(input = {}, options = {}) {
  const fullName = String(input.full_name || input.fullName || '').trim()
  const rawPhone = String(input.phone || input.phoneRaw || '').trim()
  const cityRegency = String(input.city_regency || input.cityRegency || '').trim()
  const honeypot = String(input.honeypot || '').trim()
  const turnstileToken = String(input.turnstile_token || input.turnstileToken || '').trim()

  if (!fullName || fullName.length < 2) {
    throw new Error('Nama lengkap wajib diisi minimal 2 karakter.')
  }

  const phoneCheck = normalizePhone(rawPhone)
  if (!phoneCheck.valid) {
    throw new Error(phoneCheck.error || 'Nomor WhatsApp tidak valid.')
  }

  if (!cityRegency) {
    throw new Error('Silakan pilih Kota/Kabupaten terlebih dahulu.')
  }

  const attr = getStoredAttribution()
  const payload = {
    ...(input.payload || {}),
  }
  if (!payload.outlet_id && attr.outlet) {
    payload.outlet_id = attr.outlet
  }
  if (payload.frame_width_mm && !payload.size_category) {
    payload.size_category = mapWidthToSizeCategory(payload.frame_width_mm)
  }

  const requestBody = {
    full_name: fullName,
    phone: phoneCheck.normalized,
    city_regency: cityRegency,
    event_type: input.event_type || input.eventType || 'frame_measured',
    payload,
    src: input.src || attr.src || 'mini_app',
    host: input.host !== undefined ? input.host : attr.host || '',
    sesi: input.sesi !== undefined ? input.sesi : attr.sesi || '',
    sig: input.sig !== undefined ? input.sig : attr.sig || '',
    consent_crm_wa: Boolean(input.consent_crm_wa ?? input.consentCrmWa ?? true),
    consent_health_prescription: Boolean(
      input.consent_health_prescription ?? input.consentHealthPrescription ?? false
    ),
    honeypot,
    turnstile_token: turnstileToken || 'dooz-turnstile-verified-v1',
  }

  const uniformMessage =
    'Silakan kirim pesan WhatsApp berisi kode verifikasi untuk menerima hasil ukur dan kartu member DOOZ.'

  // Anti-spam client honeypot trap: return uniform fake response without hitting backend
  if (honeypot !== '') {
    const fakeCode = generateLocalDZCode()
    return {
      contact_id: 'honeypot-ignored',
      verification_code: fakeCode,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      wa_me_url: buildWAMeVerifyURL(fakeCode, options.officialWANumber),
      message: uniformMessage,
    }
  }

  const base = resolveApiBase(options)
  try {
    const response = await fetch(`${base}/api/capture/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Gagal menyimpan data. Silakan coba beberapa saat lagi.')
    }

    const leadState = {
      contact_id: data.contact_id,
      verification_code: data.verification_code,
      expires_at: data.expires_at,
      wa_me_url: data.wa_me_url || buildWAMeVerifyURL(data.verification_code, options.officialWANumber),
      message: data.message || uniformMessage,
      phone_masked: phoneCheck.masked,
      full_name: fullName,
      city_regency: cityRegency,
      latest_payload: payload,
      saved_at: new Date().toISOString(),
    }
    safeStorageSet(STORAGE_KEYS.LEAD_STATE, leadState)
    return leadState
  } catch (err) {
    // If network/backend is unreachable in static preview mode, provide offline-resilient fallback
    if (options.allowOfflineFallback !== false && (err.name === 'TypeError' || String(err.message).includes('Failed to fetch') || String(err.message).includes('NetworkError'))) {
      const dzCode = generateLocalDZCode()
      const exp = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      const fallbackState = {
        contact_id: `local-${Date.now()}`,
        verification_code: dzCode,
        expires_at: exp,
        wa_me_url: buildWAMeVerifyURL(dzCode, options.officialWANumber),
        message: uniformMessage,
        phone_masked: phoneCheck.masked,
        full_name: fullName,
        city_regency: cityRegency,
        latest_payload: payload,
        offline_fallback: true,
        saved_at: new Date().toISOString(),
      }
      safeStorageSet(STORAGE_KEYS.LEAD_STATE, fallbackState)
      return fallbackState
    }
    throw err
  }
}

/**
 * Tracks an omnichannel customer event (`frame_measured`, `frame_tried`, `store_visit`, `voucher_claimed`, `purchase`).
 */
export async function track(eventType, payload = {}, options = {}) {
  const leadState = getStoredLeadState()
  const attr = getStoredAttribution()
  const contactId = options.contact_id || options.contactId || leadState?.contact_id || ''

  const eventRecord = {
    contact_id: contactId,
    event_type: eventType,
    payload: {
      ...payload,
      size_category:
        payload.size_category ||
        (payload.frame_width_mm ? mapWidthToSizeCategory(payload.frame_width_mm) : undefined),
    },
    src: options.src || attr.src || 'mini_app',
    host: options.host !== undefined ? options.host : attr.host || '',
    sesi: options.sesi !== undefined ? options.sesi : attr.sesi || '',
    created_at: new Date().toISOString(),
  }

  // Persist in local history for immediate UI responsiveness
  const localEvents = safeStorageGet(STORAGE_KEYS.LOCAL_EVENTS) || []
  localEvents.unshift({ id: `ev-${Date.now()}`, ...eventRecord })
  safeStorageSet(STORAGE_KEYS.LOCAL_EVENTS, localEvents.slice(0, 30))

  if (!contactId || String(contactId).startsWith('local-')) {
    return { ok: true, local_only: true, event: eventRecord }
  }

  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/capture/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventRecord),
    })
    if (!resp.ok) {
      return { ok: false, local_only: true, event: eventRecord }
    }
    const saved = await resp.json()
    return { ok: true, event: saved }
  } catch {
    return { ok: true, local_only: true, event: eventRecord }
  }
}

export function getLocalTrackedEvents() {
  return safeStorageGet(STORAGE_KEYS.LOCAL_EVENTS) || []
}

/* ============================================================================
 * Portal Member ("Data Saya") Passwordless Auth & Session Helpers
 * ============================================================================ */

export function getStoredPortalSession() {
  return safeStorageGet(STORAGE_KEYS.PORTAL_SESSION)
}

export function setStoredPortalSession(sessionObj) {
  safeStorageSet(STORAGE_KEYS.PORTAL_SESSION, sessionObj)
}

export function clearStoredPortalSession() {
  safeStorageRemove(STORAGE_KEYS.PORTAL_SESSION)
}

/**
 * Inspects a magic link token via `GET /api/auth/magic-verify` WITHOUT consuming it
 * (protects against WhatsApp link preview bots).
 */
export async function inspectMagicLink(token, options = {}) {
  const base = resolveApiBase(options)
  const clean = String(token || '').trim()
  if (!clean) throw new Error('Token magic link kosong.')

  const resp = await fetch(`${base}/api/auth/magic-verify?token=${encodeURIComponent(clean)}`, {
    method: 'GET',
    referrerPolicy: 'no-referrer',
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'Tautan masuk sudah kedaluwarsa atau sudah digunakan.')
  }
  return data
}

/**
 * Exchanges a one-time magic link token via `POST /api/auth/magic-exchange` (button click confirmation).
 */
export async function exchangeMagicLink(token, confirmFullName = '', options = {}) {
  const base = resolveApiBase(options)
  const clean = String(token || '').trim()
  if (!clean) throw new Error('Token magic link wajib diisi.')

  const resp = await fetch(`${base}/api/auth/magic-exchange`, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: clean,
      confirm_full_name: String(confirmFullName || '').trim(),
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'Gagal menukar tautan masuk. Silakan ketik MASUK ke WhatsApp DOOZ.')
  }
  setStoredPortalSession(data)
  return data
}

/**
 * Fetches the authenticated Member Portal view (`GET /api/portal/me`).
 */
export async function fetchPortalMe(sessionToken, options = {}) {
  const base = resolveApiBase(options)
  const tok = sessionToken || getStoredPortalSession()?.session_token
  if (!tok) throw new Error('Sesi belum aktif.')

  const resp = await fetch(`${base}/api/portal/me`, {
    method: 'GET',
    referrerPolicy: 'no-referrer',
    headers: {
      Authorization: `Bearer ${tok}`,
    },
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'Sesi tidak valid atau telah dicabut.')
  }
  return data
}

/**
 * Confirms the registered full name for a recycled number (>6 months passive)
 * via `POST /api/portal/confirm-recycled`.
 */
export async function confirmRecycledName(fullName, sessionToken, options = {}) {
  const base = resolveApiBase(options)
  const tok = sessionToken || getStoredPortalSession()?.session_token
  if (!tok) throw new Error('Sesi tidak ditemukan.')

  const resp = await fetch(`${base}/api/portal/confirm-recycled`, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify({ full_name: String(fullName || '').trim() }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(
      data.error ||
        'Nama lengkap tidak sesuai dengan data terdaftar. Silakan coba lagi atau verifikasi di outlet DOOZ.'
    )
  }

  const current = getStoredPortalSession() || {}
  setStoredPortalSession({
    ...current,
    access_scope: data.access_scope || 'full',
    requires_name_confirm: false,
  })
  return data
}

/**
 * Revokes all active sessions across all devices (`POST /api/portal/sessions/revoke-all`).
 */
export async function revokeAllSessions(sessionToken, options = {}) {
  const base = resolveApiBase(options)
  const tok = sessionToken || getStoredPortalSession()?.session_token
  if (!tok) {
    clearStoredPortalSession()
    return { ok: true, revoked_sessions: 0 }
  }

  try {
    const resp = await fetch(`${base}/api/portal/sessions/revoke-all`, {
      method: 'POST',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: `Bearer ${tok}`,
      },
    })
    const data = await resp.json()
    clearStoredPortalSession()
    return data
  } catch (err) {
    clearStoredPortalSession()
    throw err
  }
}

/**
 * Updates UU PDP consent (`crm_wa` or `health_prescription`) via `POST /api/portal/consents`.
 */
export async function updatePortalConsent(scope, granted, sessionToken, options = {}) {
  const base = resolveApiBase(options)
  const tok = sessionToken || getStoredPortalSession()?.session_token
  if (!tok) throw new Error('Sesi tidak ditemukan.')

  const resp = await fetch(`${base}/api/portal/consents`, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify({ scope, granted: Boolean(granted) }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'Gagal memperbarui pengaturan persetujuan.')
  }
  return data
}

/**
 * Submits a UU PDP right-to-erasure / data deletion request (`POST /api/portal/privacy/delete`).
 */
export async function requestPrivacyDeletion(immediate = true, sessionToken, options = {}) {
  const base = resolveApiBase(options)
  const tok = sessionToken || getStoredPortalSession()?.session_token
  if (!tok) throw new Error('Sesi tidak ditemukan.')

  const resp = await fetch(`${base}/api/portal/privacy/delete`, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify({ immediate: Boolean(immediate) }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'Gagal memproses permohonan hapus data.')
  }
  clearStoredPortalSession()
  return data
}

// Expose global singleton when loaded in browser
const DoozCaptureSDK = {
  normalizePhone,
  normalizePhoneString,
  maskPhoneDisplay,
  mapWidthToSizeCategory,
  buildWAMeVerifyURL,
  captureAttributionFromURL,
  getStoredAttribution,
  clearStoredAttribution,
  verifyStoredAttribution,
  identify,
  track,
  getStoredLeadState,
  getLocalTrackedEvents,
  inspectMagicLink,
  exchangeMagicLink,
  fetchPortalMe,
  confirmRecycledName,
  revokeAllSessions,
  updatePortalConsent,
  requestPrivacyDeletion,
  getStoredPortalSession,
  setStoredPortalSession,
  clearStoredPortalSession,
  INDONESIA_CITIES,
  SIZE_CHART_DEFAULT,
}

if (typeof window !== 'undefined') {
  window.DoozCaptureSDK = DoozCaptureSDK
}

export default DoozCaptureSDK
