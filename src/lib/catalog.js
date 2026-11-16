/**
 * Katalog frame Try-On dari DOOZ CRM (server data Member DOOZ + Katalog).
 *
 * - `GET {CRM}/api/catalog/size-chart` (ETag) → rentang mm XS–XL
 * - `GET {CRM}/api/catalog/frames`            → frame aktif (sprite 2.5D, ukuran, stok)
 *
 * Kontrak: repo `dooz-crm` → `docs/api.md`. Bila CRM tidak bisa dihubungi, Try-On memakai cache terakhir
 * di HP ini lalu katalog bawaan di bawah.
 */

/** Alamat DOOZ CRM. Sama dengan `apiBase` klien Member DOOZ. */
export const CRM_URL = String(import.meta.env?.VITE_DOOZ_CRM_URL || 'https://dooz-crm-pocco.fural.space').replace(
  /\/+$/,
  ''
)

/** App Ukur (ukur lebar frame & ajakan jadi Member). */
export const UKUR_URL = String(import.meta.env?.VITE_DOOZ_UKUR_URL || 'https://ukur-frame-dooz-pocco.fural.space').replace(
  /\/+$/,
  ''
)

const CACHE_KEYS = {
  SIZE_CHART: 'dooz_size_chart_cache_v1',
  FRAMES: 'dooz_frames_cache_v1',
}

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

function cacheGet(key) {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(key) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function cacheSet(key, value) {
  try {
    if (typeof window !== 'undefined') window.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // mode privat / kuota penuh: tanpa cache
  }
}

/** Lebar frame (mm) → kategori ukuran DOOZ (XS–XL) menurut size chart. */
export function mapWidthToSizeCategory(widthMm, sizeChart) {
  const n = Number(widthMm)
  if (!Number.isFinite(n) || n <= 0) return 'M'
  const chart =
    Array.isArray(sizeChart) && sizeChart.length > 0
      ? sizeChart
      : cacheGet(CACHE_KEYS.SIZE_CHART)?.size_chart || SIZE_CHART_DEFAULT
  for (const entry of chart) {
    if (n <= Number(entry.max_mm)) return entry.category
  }
  return chart[chart.length - 1]?.category || 'XL'
}

/** Size chart dari CRM (memakai ETag); gagal → cache → bawaan. */
export async function fetchSizeChart({ apiBase = CRM_URL, fetchImpl = globalThis.fetch } = {}) {
  const cached = cacheGet(CACHE_KEYS.SIZE_CHART)
  const headers = cached?.etag ? { 'If-None-Match': cached.etag } : {}
  try {
    const resp = await fetchImpl(`${apiBase}/api/catalog/size-chart`, { headers, referrerPolicy: 'no-referrer' })
    if (resp.status === 304 && cached?.size_chart) return cached
    if (!resp.ok) throw new Error(`size-chart ${resp.status}`)
    const data = await resp.json()
    const result = {
      etag: resp.headers.get('ETag') || '',
      size_chart: Array.isArray(data.size_chart) && data.size_chart.length > 0 ? data.size_chart : SIZE_CHART_DEFAULT,
    }
    cacheSet(CACHE_KEYS.SIZE_CHART, result)
    return result
  } catch {
    return cached?.size_chart ? { ...cached, offline_fallback: true } : { size_chart: SIZE_CHART_DEFAULT, offline_fallback: true }
  }
}

/** Frame aktif dari Katalog CRM; gagal → cache → bawaan. */
export async function fetchCatalogFrames({ apiBase = CRM_URL, fetchImpl = globalThis.fetch } = {}) {
  try {
    const resp = await fetchImpl(`${apiBase}/api/catalog/frames`, { referrerPolicy: 'no-referrer' })
    if (!resp.ok) throw new Error(`frames ${resp.status}`)
    const data = await resp.json()
    const frames = Array.isArray(data.frames) ? data.frames : []
    cacheSet(CACHE_KEYS.FRAMES, frames)
    return { frames }
  } catch {
    const frames = cacheGet(CACHE_KEYS.FRAMES) || CATALOG_FRAMES_DEFAULT
    return { frames: frames.filter((f) => f.is_active !== false), offline_fallback: true }
  }
}
