/**
 * DOOZ Glasses Try-On — adaptor Katalog & data frame bawaan.
 * Sumber data: Katalog di DOOZ CRM (`src/lib/catalog.js`):
 * - `GET {CRM}/api/catalog/size-chart` (rentang mm XS–XL)
 * - `GET {CRM}/api/catalog/frames` (SKU aktif, sprite 2.5D, ukuran, stok)
 */

import {
  CATALOG_FRAMES_DEFAULT,
  SIZE_CHART_DEFAULT,
  fetchCatalogFrames,
  fetchSizeChart,
  mapWidthToSizeCategory,
} from '../lib/catalog'

const RAW_BASE =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/'

export const ASSET_BASE_URL = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`

/**
 * Resolves a catalog asset URL (`/images/1.png` or `https://...`) against the Vite base URL.
 */
export function resolveAssetUrl(assetPath, baseUrl = ASSET_BASE_URL) {
  if (!assetPath || typeof assetPath !== 'string') {
    return `${baseUrl}images/1.png`
  }
  const trimmed = assetPath.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  if (trimmed.startsWith(cleanBase)) {
    return trimmed
  }
  const cleanRel = trimmed.replace(/^\/+/, '')
  return `${cleanBase}${cleanRel}`
}

/**
 * Normalizes multi-angle 2.5D sprite paths (`{ 0, 15, 30, 45 }`) from CatalogFrame.
 */
export function normalizeSpritesMap(rawSprites, baseUrl = ASSET_BASE_URL) {
  if (!rawSprites || typeof rawSprites !== 'object') return null
  const entries = Object.entries(rawSprites).filter(([, val]) => Boolean(val))
  if (entries.length === 0) return null

  const normalized = {}
  for (const [angleKey, urlVal] of entries) {
    const numKey = Number(angleKey)
    const key = Number.isFinite(numKey) ? numKey : angleKey
    normalized[key] = resolveAssetUrl(String(urlVal), baseUrl)
  }
  return Object.keys(normalized).length > 0 ? normalized : null
}

/**
 * Converts a `CatalogFrame` from `GET /api/catalog/frames` (or `CATALOG_FRAMES_DEFAULT`)
 * into the product structure required by `TryOnCanvas`, `OpticalHud`, `fitCalculator`,
 * and the Shared Catalog UI.
 */
export function normalizeCatalogFrameToProduct(frame, baseUrl = ASSET_BASE_URL, sizeChart = SIZE_CHART_DEFAULT) {
  if (!frame || typeof frame !== 'object') {
    return null
  }

  const frameWidthMm = Number(frame.frame_width_mm ?? frame.frameWidth ?? 138)
  const bridgeMm = Number(frame.bridge_mm ?? frame.bridgeMm ?? 18)
  const templeMm = Number(frame.temple_mm ?? frame.templeMm ?? 142)
  const sizeCategory = String(
    frame.size_category || frame.sizeCategory || mapWidthToSizeCategory(frameWidthMm, sizeChart)
  )
    .trim()
    .toUpperCase()

  const rawImage = frame.tryon_asset_url || frame.image || frame.thumbnail_url || '/images/1.png'
  const rawThumb = frame.thumbnail_url || frame.image || frame.tryon_asset_url || rawImage
  const image = resolveAssetUrl(rawImage, baseUrl)
  const thumbnailUrl = resolveAssetUrl(rawThumb, baseUrl)
  const sprites = normalizeSpritesMap(frame.tryon_sprites || frame.sprites, baseUrl)

  const rawConfig = frame.tryon_config || frame.config || {}
  const config = {
    widthMultiplier: Number(rawConfig.widthMultiplier ?? 1.38),
    verticalOffset: Number(rawConfig.verticalOffset ?? 0.016),
    bridgeOffset: Number(rawConfig.bridgeOffset ?? 0),
  }

  const faceShapes = Array.isArray(frame.face_shapes)
    ? frame.face_shapes
    : Array.isArray(frame.bestForFaces)
      ? frame.bestForFaces
      : ['oval', 'round']

  const sku = String(frame.sku || frame.id || 'DOOZ-CLS-001').trim().toUpperCase()
  const id = String(frame.id || sku.toLowerCase()).trim()
  const frameStyle = String(frame.frame_style || frame.frameStyle || 'rectangle').trim().toLowerCase()
  const color = String(frame.color || 'Black').trim()
  const material = String(frame.material || 'Acetate').trim()
  const priceIdr = Number(frame.price_idr ?? frame.priceIdr ?? 299000)
  const stockStatus = String(frame.stock_status || frame.stockStatus || 'in_stock').trim().toLowerCase()

  return {
    id,
    sku,
    name: String(frame.name || sku).trim(),
    image,
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    tryonAssetUrl: image,
    tryon_asset_url: image,
    ...(sprites ? { sprites, tryon_sprites: sprites } : {}),
    frameWidth: frameWidthMm,
    frame_width_mm: frameWidthMm,
    bridgeMm,
    bridge_mm: bridgeMm,
    templeMm,
    temple_mm: templeMm,
    sizeCategory,
    size_category: sizeCategory,
    frameStyle,
    frame_style: frameStyle,
    bestForFaces: faceShapes,
    face_shapes: faceShapes,
    color,
    material,
    priceIdr,
    price_idr: priceIdr,
    stockStatus,
    stock_status: stockStatus,
    isActive: frame.is_active !== false,
    is_active: frame.is_active !== false,
    sortOrder: Number(frame.sort_order ?? frame.sortOrder ?? 99),
    sort_order: Number(frame.sort_order ?? frame.sortOrder ?? 99),
    config,
    tryon_config: config,
  }
}

/**
 * Default fallback products derived from `CATALOG_FRAMES_DEFAULT` SSOT.
 */
export const DEFAULT_PRODUCTS = CATALOG_FRAMES_DEFAULT.map((f) =>
  normalizeCatalogFrameToProduct(f, ASSET_BASE_URL, SIZE_CHART_DEFAULT)
).filter(Boolean)

/**
 * Memuat size chart XS–XL dan frame aktif dari Katalog DOOZ CRM, lalu menormalkan frame untuk Try-On.
 */
export async function syncSharedCatalog(options = {}) {
  const [sizeChartRes, framesRes] = await Promise.all([fetchSizeChart(options), fetchCatalogFrames(options)])

  const sizeChart =
    Array.isArray(sizeChartRes?.size_chart) && sizeChartRes.size_chart.length > 0
      ? sizeChartRes.size_chart
      : SIZE_CHART_DEFAULT

  const rawFrames =
    Array.isArray(framesRes?.frames) && framesRes.frames.length > 0
      ? framesRes.frames
      : CATALOG_FRAMES_DEFAULT

  const products = rawFrames
    .map((f) => normalizeCatalogFrameToProduct(f, ASSET_BASE_URL, sizeChart))
    .filter((p) => p && p.isActive !== false)

  return {
    products: products.length > 0 ? products : DEFAULT_PRODUCTS,
    sizeChart,
    offlineFallback: Boolean(framesRes?.offline_fallback || sizeChartRes?.offline_fallback),
  }
}

/**
 * Menentukan ukuran customer (XS–XL, lebar mm) dari: link App Ukur (`?size=&width_mm=`),
 * ukuran utama Member DOOZ (bila sudah masuk), atau perkiraan kamera.
 */
export function resolveCustomerSizeProfile({
  searchString,
  memberMeasurement,
  cameraFaceWidthMm,
  sizeChart = SIZE_CHART_DEFAULT,
} = {}) {
  const query =
    typeof searchString === 'string'
      ? searchString
      : typeof window !== 'undefined'
        ? window.location.search
        : ''
  const params = new URLSearchParams(query)

  const urlSizeRaw = (params.get('size') || params.get('size_category') || '').trim().toUpperCase()
  const urlWidthRaw = Number(params.get('width_mm') || params.get('frame_width_mm') || 0)
  const urlSkuRaw = (params.get('sku') || params.get('frame_sku') || '').trim().toUpperCase()

  const validCategories = ['XS', 'S', 'M', 'L', 'XL']

  // 1. Parameter URL (link "Coba frame yang pas" dari App Ukur)
  if (validCategories.includes(urlSizeRaw) || (Number.isFinite(urlWidthRaw) && urlWidthRaw > 0)) {
    const resolvedWidth = Number.isFinite(urlWidthRaw) && urlWidthRaw > 0 ? Math.round(urlWidthRaw) : null
    const resolvedCategory = validCategories.includes(urlSizeRaw)
      ? urlSizeRaw
      : mapWidthToSizeCategory(resolvedWidth, sizeChart)
    return {
      sizeCategory: resolvedCategory,
      widthMm: resolvedWidth,
      requestedSku: urlSkuRaw || null,
      source: 'url_param',
      sourceLabel: 'Hasil Ukur Frame',
    }
  }

  // 2. Ukuran utama Member DOOZ (Ukuran Saya)
  const meas = memberMeasurement
  if (meas && (meas.size_category || meas.frame_width_mm)) {
    const widthMm = Number(meas.frame_width_mm) > 0 ? Math.round(Number(meas.frame_width_mm)) : null
    const cat = String(meas.size_category || '').trim().toUpperCase()
    const resolvedCategory = validCategories.includes(cat)
      ? cat
      : widthMm
        ? mapWidthToSizeCategory(widthMm, sizeChart)
        : 'M'
    return {
      sizeCategory: resolvedCategory,
      widthMm,
      requestedSku: urlSkuRaw || null,
      source: 'member',
      sourceLabel: 'Ukuran Saya (Member DOOZ)',
    }
  }

  // 3. Perkiraan lebar wajah dari kamera (MediaPipe)
  if (Number.isFinite(Number(cameraFaceWidthMm)) && Number(cameraFaceWidthMm) > 0) {
    const widthMm = Math.round(Number(cameraFaceWidthMm))
    const resolvedCategory = mapWidthToSizeCategory(widthMm, sizeChart)
    return {
      sizeCategory: resolvedCategory,
      widthMm,
      requestedSku: urlSkuRaw || null,
      source: 'camera_biometric',
      sourceLabel: 'Deteksi Kamera',
    }
  }

  return {
    sizeCategory: null,
    widthMm: null,
    requestedSku: urlSkuRaw || null,
    source: 'none',
    sourceLabel: null,
  }
}

export { CATALOG_FRAMES_DEFAULT, SIZE_CHART_DEFAULT }
export default DEFAULT_PRODUCTS
