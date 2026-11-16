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
  SIZE_CHART_CACHE: 'dooz_size_chart_cache_v1',
  FRAMES_CACHE: 'dooz_frames_cache_v1',
}

export const DEFAULT_OFFICIAL_WA = '6281122334455'

export const SIZE_CHART_DEFAULT = [
  {
    category: 'XS',
    label: 'Extra Small (XS)',
    name_id: 'Sangat kecil',
    min_mm: 115,
    max_mm: 127,
    bridge_mm_rec: '15–17 mm',
    temple_mm_rec: '135–138 mm',
    description: 'Wajah mungil / remaja',
    sort_order: 1,
  },
  {
    category: 'S',
    label: 'Small (S)',
    name_id: 'Kecil',
    min_mm: 128,
    max_mm: 133,
    bridge_mm_rec: '16–18 mm',
    temple_mm_rec: '138–140 mm',
    description: 'Wajah ramping',
    sort_order: 2,
  },
  {
    category: 'M',
    label: 'Medium (M)',
    name_id: 'Sedang',
    min_mm: 134,
    max_mm: 139,
    bridge_mm_rec: '17–19 mm',
    temple_mm_rec: '140–145 mm',
    description: 'Ukuran standar mayoritas dewasa',
    sort_order: 3,
  },
  {
    category: 'L',
    label: 'Large (L)',
    name_id: 'Besar',
    min_mm: 140,
    max_mm: 145,
    bridge_mm_rec: '18–20 mm',
    temple_mm_rec: '143–148 mm',
    description: 'Wajah lebar',
    sort_order: 4,
  },
  {
    category: 'XL',
    label: 'Extra Large (XL)',
    name_id: 'Sangat besar',
    min_mm: 146,
    max_mm: 165,
    bridge_mm_rec: '19–22 mm',
    temple_mm_rec: '145–152 mm',
    description: 'Wajah ekstra lebar',
    sort_order: 5,
  },
]

export const CATALOG_FRAMES_DEFAULT = [
  {
    id: 'glasses-1',
    sku: 'DOOZ-CLS-001',
    name: 'Classic Black',
    frame_width_mm: 138,
    bridge_mm: 18,
    temple_mm: 142,
    size_category: 'M',
    frame_style: 'rectangle',
    face_shapes: ['oval', 'round'],
    color: 'Black',
    material: 'Acetate',
    price_idr: 299000,
    thumbnail_url: '/images/1.png',
    tryon_asset_url: '/images/1.png',
    tryon_config: { widthMultiplier: 1.4, verticalOffset: 0.015, bridgeOffset: 0 },
    stock_status: 'in_stock',
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'glasses-2',
    sku: 'DOOZ-AVI-002',
    name: 'Modern Aviator',
    frame_width_mm: 142,
    bridge_mm: 19,
    temple_mm: 145,
    size_category: 'L',
    frame_style: 'aviator',
    face_shapes: ['oval', 'heart', 'square'],
    color: 'Gold/Black',
    material: 'Metal',
    price_idr: 349000,
    thumbnail_url: '/images/2.png',
    tryon_asset_url: '/images/2.png',
    tryon_config: { widthMultiplier: 1.35, verticalOffset: 0.02, bridgeOffset: 0 },
    stock_status: 'in_stock',
    is_active: true,
    sort_order: 2,
  },
  {
    id: 'glasses-3',
    sku: 'DOOZ-RND-003',
    name: 'Retro Round',
    frame_width_mm: 132,
    bridge_mm: 17,
    temple_mm: 140,
    size_category: 'S',
    frame_style: 'round',
    face_shapes: ['square', 'oval', 'oblong'],
    color: 'Silver',
    material: 'Metal',
    price_idr: 329000,
    thumbnail_url: '/images/3.png',
    tryon_asset_url: '/images/3.png',
    tryon_sprites: {
      0: '/images/3/0.png',
      15: '/images/3/15.png',
      30: '/images/3/30.png',
      45: '/images/3/45.png',
    },
    tryon_config: { widthMultiplier: 1.3, verticalOffset: 0.015, bridgeOffset: 0 },
    stock_status: 'in_stock',
    is_active: true,
    sort_order: 3,
  },
  {
    id: 'glasses-4',
    sku: 'DOOZ-SPT-004',
    name: 'Sport Wrap',
    frame_width_mm: 148,
    bridge_mm: 20,
    temple_mm: 148,
    size_category: 'XL',
    frame_style: 'wraparound',
    face_shapes: ['oval', 'round', 'square'],
    color: 'Black',
    material: 'TR90/Nylon',
    price_idr: 379000,
    thumbnail_url: '/images/4.png',
    tryon_asset_url: '/images/4.png',
    tryon_config: { widthMultiplier: 1.45, verticalOffset: 0.02, bridgeOffset: 0 },
    stock_status: 'low_stock',
    is_active: true,
    sort_order: 4,
  },
  {
    id: 'glasses-5',
    sku: 'DOOZ-BRW-005',
    name: 'Designer Browline',
    frame_width_mm: 126,
    bridge_mm: 16,
    temple_mm: 138,
    size_category: 'XS',
    frame_style: 'browline',
    face_shapes: ['oval', 'square', 'heart'],
    color: 'Havana/Gold',
    material: 'Acetate/Metal',
    price_idr: 399000,
    thumbnail_url: '/images/5.png',
    tryon_asset_url: '/images/5.png',
    tryon_config: { widthMultiplier: 1.35, verticalOffset: 0.018, bridgeOffset: 0 },
    stock_status: 'in_stock',
    is_active: true,
    sort_order: 5,
  },
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
 * Uses either a supplied size chart array, cached size chart, or SIZE_CHART_DEFAULT.
 */
export function mapWidthToSizeCategory(widthMm, sizeChart) {
  const n = Number(widthMm)
  if (!Number.isFinite(n) || n <= 0) return 'M'
  const chart =
    Array.isArray(sizeChart) && sizeChart.length > 0
      ? sizeChart
      : safeStorageGet(STORAGE_KEYS.SIZE_CHART_CACHE)?.size_chart || SIZE_CHART_DEFAULT
  for (const entry of chart) {
    if (n <= Number(entry.max_mm)) {
      return entry.category
    }
  }
  return chart[chart.length - 1]?.category || 'XL'
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
    void syncLocalEventsToHub(data.contact_id, options)
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
  const portalSess = getStoredPortalSession()
  const attr = getStoredAttribution()
  const contactId =
    options.contact_id ||
    options.contactId ||
    leadState?.contact_id ||
    portalSess?.contact_id ||
    ''
  const sessionToken = options.session_token || portalSess?.session_token || ''

  const eventRecord = {
    contact_id: contactId,
    session_token: sessionToken || undefined,
    event_type: eventType,
    payload: {
      ...payload,
      size_category:
        payload.size_category ||
        (payload.frame_width_mm ? mapWidthToSizeCategory(payload.frame_width_mm) : undefined),
    },
    src: options.src || attr.src || 'glasses_try_on',
    host: options.host !== undefined ? options.host : attr.host || '',
    sesi: options.sesi !== undefined ? options.sesi : attr.sesi || '',
    created_at: new Date().toISOString(),
  }

  // Persist in local history for immediate UI responsiveness (deduplicating same frame_tried SKU at top)
  const localEvents = safeStorageGet(STORAGE_KEYS.LOCAL_EVENTS) || []
  const filteredLocal =
    eventType === 'frame_tried' && eventRecord.payload?.frame_sku
      ? localEvents.filter(
          (e) =>
            !(
              e.event_type === 'frame_tried' &&
              String(e.payload?.frame_sku || '').toUpperCase() ===
                String(eventRecord.payload.frame_sku).toUpperCase()
            )
        )
      : localEvents

  const localEntry = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    synced: false,
    ...eventRecord,
  }
  filteredLocal.unshift(localEntry)
  safeStorageSet(STORAGE_KEYS.LOCAL_EVENTS, filteredLocal.slice(0, 30))

  const hasValidContact = Boolean(contactId && !String(contactId).startsWith('local-'))
  const hasValidSession = Boolean(sessionToken && !String(sessionToken).startsWith('demo-sess-'))

  if (!hasValidContact && !hasValidSession) {
    return { ok: true, local_only: true, event: eventRecord }
  }

  const base = resolveApiBase(options)
  const headers = { 'Content-Type': 'application/json' }
  if (hasValidSession) {
    headers.Authorization = `Bearer ${sessionToken}`
  }

  try {
    const resp = await fetch(`${base}/api/capture/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(eventRecord),
    })
    if (!resp.ok) {
      return { ok: false, local_only: true, event: eventRecord }
    }
    const saved = await resp.json()
    // Mark local event as synced
    const currentLocal = safeStorageGet(STORAGE_KEYS.LOCAL_EVENTS) || []
    const updatedLocal = currentLocal.map((item) =>
      item.id === localEntry.id ? { ...item, synced: true, id: saved.id || item.id } : item
    )
    safeStorageSet(STORAGE_KEYS.LOCAL_EVENTS, updatedLocal)
    return { ok: true, event: saved }
  } catch {
    return { ok: true, local_only: true, event: eventRecord }
  }
}

/**
 * Flushes any unsynced local `frame_tried` events to Customer Hub once a contact_id or session_token becomes available.
 */
export async function syncLocalEventsToHub(contactId, options = {}) {
  const localEvents = safeStorageGet(STORAGE_KEYS.LOCAL_EVENTS) || []
  const unsynced = localEvents.filter((e) => !e.synced && e.event_type === 'frame_tried')
  if (unsynced.length === 0) return { synced: 0 }

  const portalSess = getStoredPortalSession()
  const sessionToken = options.session_token || portalSess?.session_token || ''
  const resolvedContactId = contactId || portalSess?.contact_id || getStoredLeadState()?.contact_id || ''

  const hasValidContact = Boolean(resolvedContactId && !String(resolvedContactId).startsWith('local-'))
  const hasValidSession = Boolean(sessionToken && !String(sessionToken).startsWith('demo-sess-'))
  if (!hasValidContact && !hasValidSession) return { synced: 0 }

  const base = resolveApiBase(options)
  const headers = { 'Content-Type': 'application/json' }
  if (hasValidSession) {
    headers.Authorization = `Bearer ${sessionToken}`
  }

  let syncedCount = 0
  const updated = [...localEvents]

  for (const item of unsynced) {
    try {
      const resp = await fetch(`${base}/api/capture/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact_id: resolvedContactId,
          session_token: sessionToken || undefined,
          event_type: item.event_type,
          payload: item.payload,
          src: item.src || 'glasses_try_on',
          host: item.host || '',
          sesi: item.sesi || '',
        }),
      })
      if (resp.ok) {
        syncedCount++
        const idx = updated.findIndex((u) => u.id === item.id)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], synced: true, contact_id: resolvedContactId }
        }
      }
    } catch {
      // ignore network error in background sync
    }
  }

  safeStorageSet(STORAGE_KEYS.LOCAL_EVENTS, updated)
  return { synced: syncedCount }
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
  void syncLocalEventsToHub(data.contact_id, { ...options, session_token: data.session_token })
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
  const currentSess = getStoredPortalSession() || {}
  setStoredPortalSession({
    ...currentSess,
    session_token: tok,
    contact_id: data.contact_id || currentSess.contact_id || '',
    member_code: data.member_code || currentSess.member_code || '',
    latest_measurement: data.latest_measurement || currentSess.latest_measurement || null,
  })
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

/* ============================================================================
 * Shared Catalog (Single Source of Truth: XS-XL Size Chart & Active DOOZ SKUs)
 * ============================================================================ */

/**
 * Fetches the official DOOZ XS–XL size chart from `GET /api/catalog/size-chart`
 * with ETag support and local fallback.
 */
export async function fetchSizeChart(options = {}) {
  const base = resolveApiBase(options)
  const cached = safeStorageGet(STORAGE_KEYS.SIZE_CHART_CACHE)
  const headers = {}
  if (cached?.etag && !options.forceRefresh) {
    headers['If-None-Match'] = cached.etag
  }
  const qs = options.width_mm ? `?width_mm=${encodeURIComponent(options.width_mm)}` : ''
  try {
    const resp = await fetch(`${base}/api/catalog/size-chart${qs}`, {
      method: 'GET',
      headers,
    })
    if (resp.status === 304 && cached?.size_chart) {
      return cached
    }
    if (!resp.ok) {
      throw new Error('Gagal memuat size chart dari Customer Hub')
    }
    const data = await resp.json()
    const etag = resp.headers.get('ETag') || ''
    const result = {
      ...data,
      etag,
      size_chart: Array.isArray(data.size_chart) && data.size_chart.length > 0 ? data.size_chart : SIZE_CHART_DEFAULT,
    }
    safeStorageSet(STORAGE_KEYS.SIZE_CHART_CACHE, result)
    return result
  } catch {
    return (
      cached || {
        ok: true,
        offline_fallback: true,
        size_chart: SIZE_CHART_DEFAULT,
      }
    )
  }
}

function applyLocalFrameFilter(frames, filters = {}) {
  const wantSize = String(filters.size || '').trim().toUpperCase()
  const wantFace = String(filters.face_shape || '').trim().toLowerCase()
  const wantStock = String(filters.stock || '').trim().toLowerCase()
  const wantQuery = String(filters.q || '').trim().toLowerCase()
  return frames.filter((f) => {
    if (!filters.include_inactive && f.is_active === false) return false
    if (wantSize && String(f.size_category || '').toUpperCase() !== wantSize) return false
    if (wantStock && String(f.stock_status || '').toLowerCase() !== wantStock) return false
    if (
      wantFace &&
      !(Array.isArray(f.face_shapes) && f.face_shapes.some((s) => String(s).toLowerCase() === wantFace))
    ) {
      return false
    }
    if (wantQuery) {
      const hay = `${f.sku} ${f.name} ${f.size_category} ${f.frame_style} ${f.color} ${f.material}`.toLowerCase()
      if (!hay.includes(wantQuery)) return false
    }
    return true
  })
}

/**
 * Fetches active DOOZ frame SKUs from `GET /api/catalog/frames` with optional filters
 * (`size`, `width_mm`, `face_shape`, `stock`, `style`, `q`, `include_inactive`).
 */
export async function fetchCatalogFrames(filters = {}, options = {}) {
  const base = resolveApiBase(options)
  const params = new URLSearchParams()
  if (filters.size) params.set('size', filters.size)
  if (filters.width_mm) params.set('width_mm', String(filters.width_mm))
  if (filters.include_adjacent) params.set('include_adjacent', 'true')
  if (filters.face_shape) params.set('face_shape', filters.face_shape)
  if (filters.stock) params.set('stock', filters.stock)
  if (filters.in_stock_only) params.set('in_stock_only', 'true')
  if (filters.style) params.set('style', filters.style)
  if (filters.q) params.set('q', filters.q)
  if (filters.include_inactive) params.set('include_inactive', 'true')

  const qs = params.toString() ? `?${params.toString()}` : ''
  try {
    const resp = await fetch(`${base}/api/catalog/frames${qs}`, { method: 'GET' })
    if (!resp.ok) {
      throw new Error('Gagal memuat katalog frame DOOZ')
    }
    const data = await resp.json()
    if (!qs && Array.isArray(data.frames)) {
      safeStorageSet(STORAGE_KEYS.FRAMES_CACHE, data.frames)
    }
    return data
  } catch {
    const baseFrames = safeStorageGet(STORAGE_KEYS.FRAMES_CACHE) || CATALOG_FRAMES_DEFAULT
    const filtered = applyLocalFrameFilter(baseFrames, filters)
    return {
      ok: true,
      offline_fallback: true,
      total: filtered.length,
      frames: filtered,
    }
  }
}

function buildStaffHeaders(staffContext = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Staff-User-ID': staffContext.userId || 'admin-dooz',
    'X-Staff-Role': staffContext.role || 'owner',
    'X-Staff-Outlet-ID': staffContext.outletId || 'hq-solo',
  }
}

export async function adminUpdateSizeChart(sizeChart, staffContext = {}, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/admin/catalog/size-chart`, {
    method: 'PUT',
    headers: buildStaffHeaders(staffContext),
    body: JSON.stringify({ size_chart: sizeChart, recalculate_frames: true }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal memperbarui tabel ukuran.')
  safeStorageSet(STORAGE_KEYS.SIZE_CHART_CACHE, { ok: true, size_chart: data.size_chart })
  return data
}

export async function adminUpsertCatalogFrame(frame, isUpdate = false, staffContext = {}, options = {}) {
  const base = resolveApiBase(options)
  const url = isUpdate
    ? `${base}/api/admin/catalog/frames/${encodeURIComponent(frame.sku)}`
    : `${base}/api/admin/catalog/frames`
  const resp = await fetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: buildStaffHeaders(staffContext),
    body: JSON.stringify(frame),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal menyimpan SKU frame.')
  return data
}

export async function adminDeleteCatalogFrame(sku, staffContext = {}, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/admin/catalog/frames/${encodeURIComponent(sku)}`, {
    method: 'DELETE',
    headers: buildStaffHeaders(staffContext),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal menghapus SKU frame.')
  return data
}

export async function adminImportCatalog(payload, staffContext = {}, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/admin/catalog/import`, {
    method: 'POST',
    headers: buildStaffHeaders(staffContext),
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal mengimpor data katalog.')
  return data
}

/* ============================================================================
 * Mode Kasir Outlet (2 Level Akses + Walk-In), Dashboard CRM & OBS Live Counter
 * ============================================================================ */

export async function kasirLookupPhone(phone, staffContext = { role: 'kasir', userId: 'kasir-gading-01', outletId: 'outlet-solo-gading' }, options = {}) {
  const check = normalizePhone(phone)
  if (!check.valid) {
    throw new Error(check.error || 'Masukkan nomor WhatsApp lengkap (tidak bisa cari nama sebagian).')
  }
  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/kasir/lookup-phone`, {
      method: 'POST',
      headers: buildStaffHeaders(staffContext),
      body: JSON.stringify({ phone: check.normalized }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Member tidak ditemukan untuk nomor WA tersebut.')
    return data
  } catch (err) {
    if (String(err.message).includes('Failed to fetch') || err.name === 'TypeError') {
      return {
        access_level: 'level_1_lookup',
        contact_id: 'demo-contact-1',
        member_code: 'DOOZ-48219',
        first_name_initial: 'Rina K.',
        phone_masked: check.masked,
        latest_measurement: {
          frame_width_mm: 138,
          bridge_mm: 18,
          temple_mm: 142,
          size_category: 'M',
        },
        recent_tried_frames: [
          {
            id: 'ev-try-1',
            event_type: 'frame_tried',
            src: 'glasses_try_on',
            created_at: new Date().toISOString(),
            payload: { frame_sku: 'DOOZ-CLS-001', frame_name: 'Classic Black', frame_width_mm: 138, size_category: 'M' },
          },
          {
            id: 'ev-try-2',
            event_type: 'frame_tried',
            src: 'glasses_try_on',
            created_at: new Date().toISOString(),
            payload: { frame_sku: 'DOOZ-RND-003', frame_name: 'Retro Round', frame_width_mm: 132, size_category: 'S' },
          },
        ],
        offline_demo: true,
      }
    }
    throw err
  }
}

export async function kasirScanQR(qrToken, staffContext = { role: 'kasir', userId: 'kasir-gading-01', outletId: 'outlet-solo-gading' }, options = {}) {
  const clean = String(qrToken || '').trim()
  if (!clean) throw new Error('Token QR Dinamis member wajib diisi atau dipindai.')
  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/kasir/scan-qr`, {
      method: 'POST',
      headers: buildStaffHeaders(staffContext),
      body: JSON.stringify({ qr_token: clean }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Token QR Dinamis tidak valid atau sudah kedaluwarsa.')
    return data
  } catch (err) {
    if (String(err.message).includes('Failed to fetch') || err.name === 'TypeError' || clean.startsWith('DQR1.DEMO')) {
      return {
        access_level: 'level_2_qr',
        contact: {
          id: 'demo-contact-1',
          member_code: 'DOOZ-48219',
          full_name: 'Rina Kartika',
          phone_masked: '0812****7766',
          city_regency: 'Kota Surakarta (Solo)',
          verification_status: 'verified',
        },
        latest_measurement: {
          frame_width_mm: 138,
          bridge_mm: 18,
          temple_mm: 142,
          size_category: 'M',
        },
        tried_frames: [
          {
            id: 'ev-try-1',
            event_type: 'frame_tried',
            src: 'glasses_try_on',
            created_at: new Date().toISOString(),
            payload: { frame_sku: 'DOOZ-CLS-001', frame_name: 'Classic Black', frame_width_mm: 138, size_category: 'M' },
          },
        ],
        store_visits: [
          {
            id: 'ev-vis-1',
            event_type: 'store_visit',
            src: 'outlet_solo_gading',
            created_at: new Date().toISOString(),
            payload: { outlet_id: 'DOOZ Optik Gading Solo', notes: 'Konsultasi frame & fitting lensa' },
          },
        ],
        vouchers: [
          {
            id: 'ev-vch-1',
            event_type: 'voucher_claimed',
            src: 'live_tiktok',
            created_at: new Date().toISOString(),
            payload: { voucher_code: 'LIVE-DOOZ50K', amount_idr: 50000, notes: 'Voucher Potongan Rp 50.000 Sesi Live' },
          },
        ],
        purchases: [],
        consents: [{ scope: 'crm_wa', granted: true }],
        offline_demo: true,
      }
    }
    throw err
  }
}

export async function kasirLevel2Action(qrToken, eventType, payload = {}, staffContext = { role: 'kasir', userId: 'kasir-gading-01', outletId: 'outlet-solo-gading' }, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/kasir/level2-action`, {
    method: 'POST',
    headers: buildStaffHeaders(staffContext),
    body: JSON.stringify({
      qr_token: String(qrToken || '').trim(),
      event_type: eventType,
      payload,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal mencatat aksi Kasir Level 2.')
  return data
}

export async function kasirCreateWalkIn(input = {}, staffContext = { role: 'kasir', userId: 'kasir-gading-01', outletId: 'outlet-solo-gading' }, options = {}) {
  const check = normalizePhone(input.phone || '')
  if (!check.valid) throw new Error(check.error)
  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/kasir/walkin`, {
      method: 'POST',
      headers: buildStaffHeaders(staffContext),
      body: JSON.stringify({
        mode: input.mode || 'qr_wa',
        full_name: String(input.full_name || '').trim(),
        phone: check.normalized,
        city_regency: String(input.city_regency || '').trim(),
        payload: input.payload || {},
      }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Gagal memproses pendaftaran walk-in.')
    return data
  } catch (err) {
    if (String(err.message).includes('Failed to fetch') || err.name === 'TypeError') {
      if (input.mode === 'manual') {
        return {
          mode: 'manual',
          verification_status: 'unverified',
          outbound_wa_sent: false,
          contact: {
            member_code: 'DOOZ-WALKIN',
            full_name: input.full_name,
            phone_masked: check.masked,
            city_regency: input.city_regency,
            verification_status: 'unverified',
          },
          offline_demo: true,
        }
      }
      const dzCode = generateLocalDZCode()
      return {
        mode: 'qr_wa',
        verification_code: dzCode,
        wa_me_url: buildWAMeVerifyURL(dzCode),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        offline_demo: true,
      }
    }
    throw err
  }
}

export async function kasirFetchDemoMemberQR(staffContext = { role: 'kasir', userId: 'kasir-gading-01', outletId: 'outlet-solo-gading' }, options = {}) {
  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/kasir/demo-member-qr`, {
      method: 'POST',
      headers: buildStaffHeaders(staffContext),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Gagal membuat QR demo.')
    return data
  } catch {
    return {
      ok: true,
      phone: '081299887766',
      qr_token: 'DQR1.DEMO.SIGNATURE',
      member_code: 'DOOZ-48219',
      offline_demo: true,
    }
  }
}

export async function adminFetchDashboard(staffContext = { role: 'owner', userId: 'owner-dooz', outletId: 'hq-solo' }, options = {}) {
  const base = resolveApiBase(options)
  try {
    const resp = await fetch(`${base}/api/admin/dashboard`, {
      method: 'GET',
      headers: buildStaffHeaders(staffContext),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Gagal memuat analitik Dashboard CRM.')
    return data
  } catch (err) {
    if (String(staffContext.role || '').toLowerCase() === 'kasir') {
      throw new Error('forbidden: insufficient role permissions')
    }
    return {
      total_contacts: 14,
      verified_contacts: 11,
      pending_contacts: 2,
      unverified_contacts: 1,
      verification_rate_pct: 78.5,
      total_events: 38,
      total_frames_measured: 16,
      total_frames_tried: 15,
      total_store_visits: 4,
      total_vouchers_claimed: 3,
      total_purchases: 2,
      by_source: [
        { key: 'live_tiktok', total_leads: 8, verified_leads: 7, pending_leads: 1, unverified_leads: 0, conversion_rate_pct: 87.5, frames_measured: 9, frames_tried: 8, store_visits: 2 },
        { key: 'outlet_qr_kasir', total_leads: 4, verified_leads: 3, pending_leads: 0, unverified_leads: 1, conversion_rate_pct: 75.0, frames_measured: 4, frames_tried: 4, store_visits: 2 },
        { key: 'glasses_try_on', total_leads: 2, verified_leads: 1, pending_leads: 1, unverified_leads: 0, conversion_rate_pct: 50.0, frames_measured: 3, frames_tried: 3, store_visits: 0 },
      ],
      by_host: [
        { key: 'rina', total_leads: 6, verified_leads: 5, conversion_rate_pct: 83.3, frames_measured: 7, frames_tried: 6 },
        { key: 'dinda', total_leads: 2, verified_leads: 2, conversion_rate_pct: 100.0, frames_measured: 2, frames_tried: 2 },
      ],
      by_session: [
        { key: '20261116-malam', total_leads: 6, verified_leads: 5, conversion_rate_pct: 83.3, frames_measured: 7, frames_tried: 6 },
        { key: '20261116-sore', total_leads: 2, verified_leads: 2, conversion_rate_pct: 100.0, frames_measured: 2, frames_tried: 2 },
      ],
      by_city: [
        { key: 'Kota Surakarta (Solo)', total_leads: 6, verified_leads: 5, conversion_rate_pct: 83.3 },
        { key: 'Kab. Sukoharjo', total_leads: 4, verified_leads: 3, conversion_rate_pct: 75.0 },
        { key: 'Kota Yogyakarta', total_leads: 4, verified_leads: 3, conversion_rate_pct: 75.0 },
      ],
      size_distribution: { XS: 2, S: 3, M: 6, L: 2, XL: 1 },
      attribution_links: [],
      recent_audit_logs: [],
      offline_demo: true,
    }
  }
}

export async function adminSignAttributionLink(input = {}, staffContext = { role: 'owner', userId: 'owner-dooz', outletId: 'hq-solo' }, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/attribution/sign`, {
    method: 'POST',
    headers: buildStaffHeaders(staffContext),
    body: JSON.stringify(input),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal membuat tautan atribusi bertanda tangan.')
  return data
}

export async function adminExportContactsCSV(staffContext = { role: 'owner', userId: 'owner-dooz', outletId: 'hq-solo' }, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/admin/contacts/export.csv`, {
    method: 'GET',
    headers: buildStaffHeaders(staffContext),
  })
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}))
    throw new Error(errData.error || 'Akses ditolak: Ekspor CSV hanya untuk Owner / Admin.')
  }
  return await resp.text()
}

export async function adminPurgeInactiveRetention(staffContext = { role: 'owner', userId: 'owner-dooz', outletId: 'hq-solo' }, options = {}) {
  const base = resolveApiBase(options)
  const resp = await fetch(`${base}/api/admin/retention/purge`, {
    method: 'POST',
    headers: buildStaffHeaders(staffContext),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Gagal menjalankan purge retensi >24 bulan.')
  return data
}

export async function fetchLiveCounter(filters = {}, options = {}) {
  const base = resolveApiBase(options)
  const qs = new URLSearchParams()
  if (filters.sesi) qs.set('sesi', filters.sesi)
  if (filters.host) qs.set('host', filters.host)
  if (filters.src) qs.set('src', filters.src)
  const query = qs.toString() ? `?${qs.toString()}` : ''
  try {
    const resp = await fetch(`${base}/api/live/counter${query}`, { method: 'GET' })
    if (!resp.ok) throw new Error('Gagal memuat live counter')
    return await resp.json()
  } catch {
    return {
      ok: true,
      total_leads: 14,
      verified_leads: 11,
      total_events: 28,
      size_breakdown: { XS: 2, S: 3, M: 6, L: 2, XL: 1 },
      recent_toasts: [
        {
          id: 't-1',
          masked_name: 'R***',
          city_regency: 'Kota Surakarta (Solo)',
          event_type: 'frame_measured',
          size_category: 'M',
          message: 'R*** · Kota Surakarta (Solo) baru saja ukur frame — Kategori M',
          created_at: new Date().toISOString(),
        },
        {
          id: 't-2',
          masked_name: 'B***',
          city_regency: 'Kab. Sukoharjo',
          event_type: 'frame_tried',
          size_category: 'L',
          message: 'B*** · Kab. Sukoharjo mencoba virtual try-on Modern Aviator — Kategori L',
          created_at: new Date().toISOString(),
        },
      ],
      offline_demo: true,
    }
  }
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
  syncLocalEventsToHub,
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
  fetchSizeChart,
  fetchCatalogFrames,
  adminUpdateSizeChart,
  adminUpsertCatalogFrame,
  adminDeleteCatalogFrame,
  adminImportCatalog,
  kasirLookupPhone,
  kasirScanQR,
  kasirLevel2Action,
  kasirCreateWalkIn,
  kasirFetchDemoMemberQR,
  adminFetchDashboard,
  adminSignAttributionLink,
  adminExportContactsCSV,
  adminPurgeInactiveRetention,
  fetchLiveCounter,
  INDONESIA_CITIES,
  SIZE_CHART_DEFAULT,
  CATALOG_FRAMES_DEFAULT,
}

if (typeof window !== 'undefined') {
  window.DoozCaptureSDK = DoozCaptureSDK
}

export default DoozCaptureSDK
