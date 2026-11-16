import { useEffect, useState } from 'react'

/**
 * Router ringan untuk aplikasi DOOZ.
 *
 * Aplikasi customer:  /                → Coba Kacamata (Try-On)
 *                     /kartu-member    → Kartu Member Saya (dibuka lewat link WhatsApp)
 * Aplikasi staf:      /staf/kasir      → Kasir
 *                     /staf/laporan    → Laporan (+ link overlay OBS Live)
 *                     /staf/katalog    → Katalog
 *                     /staf/live       → Overlay OBS Live (tanpa menu)
 *
 * Link lama (?view=kasir, ?view=crm-admin, ?view=catalog-admin, ?view=live-counter,
 * /data-saya, /kasir, /admin/crm, /admin/catalog, /live-counter) dialihkan ke rute baru.
 * Pemetaan yang sama ada di server Go (`internal/hub/webapp.go`).
 */

export const PATHS = {
  tryon: '/',
  kartu: '/kartu-member',
  kasir: '/staf/kasir',
  laporan: '/staf/laporan',
  katalog: '/staf/katalog',
  live: '/staf/live',
}

const LEGACY_PATHS = {
  '/kasir': PATHS.kasir,
  '/admin/crm': PATHS.laporan,
  '/admin/catalog': PATHS.katalog,
  '/live-counter': PATHS.live,
  '/data-saya': PATHS.kartu,
  '/staf': PATHS.kasir,
}

const LEGACY_VIEWS = {
  kasir: PATHS.kasir,
  'crm-admin': PATHS.laporan,
  'catalog-admin': PATHS.katalog,
  'live-counter': PATHS.live,
  portal: PATHS.kartu,
}

const ROUTE_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [v, k]))

function basePath() {
  const raw = (import.meta.env && import.meta.env.BASE_URL) || '/'
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed === '.' ? '' : trimmed
}

/** Path aplikasi tanpa base (mis. `/try-on`) dan tanpa garis miring di akhir. */
export function appPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const base = basePath()
  let p = pathname || '/'
  if (base && (p === base || p.startsWith(base + '/'))) p = p.slice(base.length)
  if (p === '/try-on' || p.startsWith('/try-on/')) p = p.slice('/try-on'.length)
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

/** Mengembalikan `{ path, search }` tujuan untuk link lama, atau null. */
export function resolveLegacy(pathname, search) {
  const p = appPath(pathname)
  const params = new URLSearchParams(search || '')
  let target = LEGACY_PATHS[p] || null
  if (!target && p === '/') {
    const view = (params.get('view') || '').trim()
    if (view && LEGACY_VIEWS[view]) target = LEGACY_VIEWS[view]
    else if ((params.get('token') || '').trim()) target = PATHS.kartu
  }
  if (!target) return null
  params.delete('view')
  const qs = params.toString()
  return { path: target, search: qs ? `?${qs}` : '' }
}

export function routeFromPath(pathname) {
  return ROUTE_BY_PATH[appPath(pathname)] || 'tryon'
}

/** URL lengkap (dengan base) untuk path aplikasi + query opsional. */
export function hrefFor(path, params) {
  const base = basePath()
  let qs = ''
  if (params) {
    const sp = params instanceof URLSearchParams ? params : new URLSearchParams()
    if (!(params instanceof URLSearchParams)) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') sp.set(k, String(v))
      })
    }
    const s = sp.toString()
    qs = s ? `?${s}` : ''
  }
  return `${base}${path === '/' && base ? '/' : path}${qs}`
}

export function absoluteHref(path, params) {
  if (typeof window === 'undefined') return hrefFor(path, params)
  return `${window.location.origin}${hrefFor(path, params)}`
}

const NAV_EVENT = 'dooz:navigate'

export function navigate(path, { params, replace = false } = {}) {
  if (typeof window === 'undefined') return
  const url = hrefFor(path, params)
  if (replace) window.history.replaceState({}, '', url)
  else window.history.pushState({}, '', url)
  window.dispatchEvent(new Event(NAV_EVENT))
  window.scrollTo?.(0, 0)
}

/** Terapkan pengalihan link lama sekali saat aplikasi dibuka (sebelum render pertama). */
export function applyLegacyRedirect() {
  if (typeof window === 'undefined') return
  const legacy = resolveLegacy(window.location.pathname, window.location.search)
  if (legacy) {
    window.history.replaceState({}, '', `${hrefFor(legacy.path)}${legacy.search}`)
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? 'tryon' : routeFromPath(window.location.pathname)
  )
  useEffect(() => {
    const update = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', update)
    window.addEventListener(NAV_EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(NAV_EVENT, update)
    }
  }, [])
  return route
}

/** Link internal tanpa reload halaman. */
export function NavLink({ to, params, className, children, ...rest }) {
  return (
    <a
      href={hrefFor(to, params)}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to, { params })
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
