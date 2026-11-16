/**
 * Pengalihan link lama Try-On — dipakai server statis (`server/serve.mjs`) dan aplikasi web (`src/main.jsx`,
 * mis. di GitHub Pages yang tidak punya server). Tanpa dependensi, tanpa `import.meta`.
 *
 * Try-On sekarang hanya punya satu layar (`/` = Coba Kacamata). Link lama:
 *   /staf, /staf/*, /kasir, /admin/crm, /admin/catalog, /live-counter, /?view=kasir|crm-admin|catalog-admin|live-counter
 *       → DOOZ CRM (aplikasi staf, wajib login)
 *   /kartu-member, /data-saya, /?view=portal
 *       → dengan ?token= (magic link WA lama untuk Try-On): `/?masuk=<token>` di Try-On (panel Member DOOZ)
 *       → tanpa token: Member DOOZ di App Ukur (`/?layar=kartu-member`)
 */

export const STAFF_PAGE_REDIRECTS = {
  '/staf': '/staf/kasir',
  '/kasir': '/staf/kasir',
  '/admin/crm': '/staf/laporan',
  '/admin/catalog': '/staf/katalog',
  '/live-counter': '/staf/live',
}

export const STAFF_VIEW_REDIRECTS = {
  kasir: '/staf/kasir',
  'crm-admin': '/staf/laporan',
  'catalog-admin': '/staf/katalog',
  'live-counter': '/staf/live',
}

export const MEMBER_PAGE_PATHS = ['/kartu-member', '/data-saya']

/** Path aplikasi tanpa base (`/try-on`) dan tanpa garis miring di akhir. */
export function normalizeAppPath(pathname, base = '') {
  let p = pathname || '/'
  const b = String(base || '').replace(/\/+$/, '')
  if (b && (p === b || p.startsWith(b + '/'))) p = p.slice(b.length)
  if (p === '/try-on' || p.startsWith('/try-on/')) p = p.slice('/try-on'.length)
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

function withQuery(path, params) {
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Tujuan pengalihan untuk link lama, atau null bila halaman ini Try-On biasa.
 * @returns {{ location: string, external: boolean, kind: 'staff' | 'member-login' | 'member-ukur' } | null}
 *   `external: false` → path di Try-On sendiri (tanpa base).
 */
export function resolveLegacyRedirect(pathname, search, { crmUrl, ukurUrl, base = '' } = {}) {
  const p = normalizeAppPath(pathname, base)
  const params = new URLSearchParams(search || '')
  const view = (params.get('view') || '').trim()
  const crm = String(crmUrl || '').replace(/\/+$/, '')
  const ukur = String(ukurUrl || '').replace(/\/+$/, '')

  let staffTarget = STAFF_PAGE_REDIRECTS[p] || null
  if (!staffTarget && p.startsWith('/staf/')) staffTarget = p
  if (!staffTarget && p === '/' && STAFF_VIEW_REDIRECTS[view]) staffTarget = STAFF_VIEW_REDIRECTS[view]
  if (staffTarget && crm) {
    params.delete('view')
    return { location: withQuery(`${crm}${staffTarget}`, params), external: true, kind: 'staff' }
  }

  const isMemberPage = MEMBER_PAGE_PATHS.includes(p) || (p === '/' && view === 'portal')
  if (!isMemberPage) return null

  const token = (params.get('token') || params.get('masuk') || '').trim()
  if (token) {
    return { location: withQuery('/', new URLSearchParams({ masuk: token })), external: false, kind: 'member-login' }
  }
  if (!ukur) return { location: '/', external: false, kind: 'member-ukur' }
  return { location: `${ukur}/?layar=kartu-member`, external: true, kind: 'member-ukur' }
}

/** API staf lama → dialihkan (308) ke CRM; CRM mewajibkan login staf. */
export const CRM_STAFF_API_PREFIXES = ['/api/kasir/', '/api/admin/', '/api/attribution/sign', '/api/live/', '/api/staff/']

export function isStaffApiPath(pathname) {
  return CRM_STAFF_API_PREFIXES.some((pre) => pathname === pre.replace(/\/$/, '') || pathname.startsWith(pre))
}
