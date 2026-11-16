#!/usr/bin/env node
/**
 * Server statis Try-On (pengganti server Go "Customer Hub" yang sudah pindah ke DOOZ CRM).
 * Tanpa dependensi. Try-On tidak menyimpan data member apa pun.
 *
 *   PORT=3000 CRM_URL=https://dooz-crm-pocco.fural.space UKUR_URL=https://ukur-frame-dooz-pocco.fural.space \
 *     node server/serve.mjs [folder-dist]
 *
 * - `dist/` (hasil `npm run build`) dengan fallback SPA ke index.html.
 * - Link lama: /staf/*, /kasir, /admin/*, /live-counter → DOOZ CRM; /kartu-member → Member DOOZ (lihat redirects.mjs).
 * - /sdk/dooz-capture.js → CRM. API staf lama (/api/kasir/*, /api/admin/*, …) → 308 ke CRM.
 * - API member lama (/api/capture/*, /api/auth/*, /api/portal/*, /api/catalog/*, /api/webhooks/fonnte*) diteruskan ke
 *   CRM supaya URL webhook / app versi lama tidak putus. Mini app baru memanggil CRM langsung.
 */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStaffApiPath, resolveLegacyRedirect } from './redirects.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
}

const PROXY_HOP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'proxy-connection'])

function baseHeaders(res) {
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function redirect(res, status, location) {
  baseHeaders(res)
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' })
  res.end()
}

function proxyToCrm(req, res, crm) {
  const target = new URL(req.url, crm)
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) if (!PROXY_HOP_HEADERS.has(k)) headers[k] = v
  headers.host = target.host
  headers['x-forwarded-host'] = target.host
  const fwd = req.socket.remoteAddress
  if (fwd) headers['x-forwarded-for'] = req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${fwd}` : fwd
  const client = target.protocol === 'https:' ? https : http
  const up = client.request(target, { method: req.method, headers }, (upRes) => {
    const out = {}
    for (const [k, v] of Object.entries(upRes.headers)) if (!PROXY_HOP_HEADERS.has(k)) out[k] = v
    res.writeHead(upRes.statusCode || 502, out)
    upRes.pipe(res)
  })
  up.setTimeout(30_000, () => up.destroy(new Error('timeout')))
  up.on('error', () => {
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ok: false, error: 'DOOZ CRM tidak dapat dihubungi, coba lagi sebentar' }))
  })
  req.pipe(up)
}

/** Membuat handler HTTP. Diekspor untuk tes (`node --test`). */
export function createHandler({ root, crmUrl, ukurUrl }) {
  const ROOT = path.resolve(root)
  const crm = String(crmUrl || '').replace(/\/+$/, '')
  const indexPath = path.join(ROOT, 'index.html')

  function sendFile(req, res, file, urlPath, status = 200) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('Tidak ditemukan')
      }
      baseHeaders(res)
      const ext = path.extname(file).toLowerCase()
      const cache = ext === '.html' ? 'no-cache' : urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
      res.writeHead(status, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': cache,
        'Last-Modified': st.mtime.toUTCString(),
      })
      if (req.method === 'HEAD') return res.end()
      fs.createReadStream(file).pipe(res)
    })
  }

  return function handler(req, res) {
    let url
    try {
      url = new URL(req.url || '/', 'http://localhost')
      decodeURIComponent(url.pathname)
    } catch {
      res.writeHead(400)
      return res.end()
    }
    const p = url.pathname

    if (p === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify({ ok: true, app: 'tryon' }))
    }

    if (p.startsWith('/api/') || p === '/sdk/dooz-capture.js') {
      if (!crm) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        return res.end(JSON.stringify({ ok: false, error: 'Try-On tidak punya API; pakai DOOZ CRM' }))
      }
      if (isStaffApiPath(p)) return redirect(res, 308, `${crm}${p}${url.search}`)
      if (p === '/sdk/dooz-capture.js') return redirect(res, 302, `${crm}${p}`)
      return proxyToCrm(req, res, crm)
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      return res.end()
    }

    const legacy = resolveLegacyRedirect(p, url.search, { crmUrl: crm, ukurUrl })
    if (legacy) return redirect(res, 302, legacy.location)

    const file = path.normalize(path.join(ROOT, decodeURIComponent(p)))
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403)
      return res.end()
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isFile()) return sendFile(req, res, file, p)
      // File ber-ekstensi yang tidak ada → 404; selain itu → index.html (SPA)
      if (path.extname(p)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('Tidak ditemukan')
      }
      return sendFile(req, res, indexPath, '/index.html')
    })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000)
  const root = process.argv[2] || process.env.STATIC_DIR || path.join(here, '..', 'dist')
  const crmUrl = process.env.CRM_URL || 'https://dooz-crm-pocco.fural.space'
  const ukurUrl = process.env.UKUR_URL || 'https://ukur-frame-dooz-pocco.fural.space'
  http.createServer(createHandler({ root, crmUrl, ukurUrl })).listen(port, () => {
    console.log(`Try-On di :${port} (static ${path.resolve(root)}, CRM ${crmUrl})`)
  })
}
