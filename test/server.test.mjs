// Tes server statis Try-On + pengalihan link lama:  npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { resolveLegacyRedirect, isStaffApiPath } from '../server/redirects.mjs'
import { createHandler } from '../server/serve.mjs'

const CRM = 'https://crm.example'
const UKUR = 'https://ukur.example'
const cfg = { crmUrl: CRM, ukurUrl: UKUR }

describe('resolveLegacyRedirect', () => {
  test('halaman staf → DOOZ CRM', () => {
    assert.equal(resolveLegacyRedirect('/staf/kasir', '', cfg).location, `${CRM}/staf/kasir`)
    assert.equal(resolveLegacyRedirect('/staf/laporan/', '?x=1', cfg).location, `${CRM}/staf/laporan?x=1`)
    assert.equal(resolveLegacyRedirect('/staf', '', cfg).location, `${CRM}/staf/kasir`)
    assert.equal(resolveLegacyRedirect('/staf/live', '?key=abc', cfg).location, `${CRM}/staf/live?key=abc`)
    assert.equal(resolveLegacyRedirect('/kasir', '', cfg).location, `${CRM}/staf/kasir`)
    assert.equal(resolveLegacyRedirect('/admin/catalog', '', cfg).location, `${CRM}/staf/katalog`)
    assert.equal(resolveLegacyRedirect('/live-counter', '', cfg).location, `${CRM}/staf/live`)
    assert.equal(resolveLegacyRedirect('/', '?view=crm-admin&a=1', cfg).location, `${CRM}/staf/laporan?a=1`)
    assert.equal(resolveLegacyRedirect('/try-on/staf/katalog', '', cfg).location, `${CRM}/staf/katalog`)
    assert.equal(resolveLegacyRedirect('/staf/kasir', '', cfg).external, true)
  })

  test('/kartu-member tanpa token → Member DOOZ di App Ukur', () => {
    for (const [p, q] of [['/kartu-member', ''], ['/data-saya', ''], ['/', '?view=portal'], ['/kartu-member/', '?x=1']]) {
      const r = resolveLegacyRedirect(p, q, cfg)
      assert.deepEqual(r, { location: `${UKUR}/?layar=kartu-member`, external: true, kind: 'member-ukur' }, p + q)
    }
  })

  test('/kartu-member?token= (magic link WA lama) → masuk di Try-On', () => {
    const r = resolveLegacyRedirect('/kartu-member', '?token=abc123&utm=x', cfg)
    assert.deepEqual(r, { location: '/?masuk=abc123', external: false, kind: 'member-login' })
    assert.equal(resolveLegacyRedirect('/', '?view=portal&token=t1', cfg).location, '/?masuk=t1')
  })

  test('Try-On biasa tidak dialihkan', () => {
    for (const [p, q] of [['/', ''], ['/', '?size=M&width_mm=138'], ['/', '?masuk=abc'], ['/', '?handoff=h'], ['/images/1.png', '']]) {
      assert.equal(resolveLegacyRedirect(p, q, cfg), null, p + q)
    }
  })

  test('base path GitHub Pages', () => {
    const r = resolveLegacyRedirect('/try-on/kartu-member', '?token=z', { ...cfg, base: '/try-on/' })
    assert.equal(r.location, '/?masuk=z')
  })

  test('API staf dikenali', () => {
    assert.ok(isStaffApiPath('/api/kasir/scan-qr'))
    assert.ok(isStaffApiPath('/api/admin/dashboard'))
    assert.ok(isStaffApiPath('/api/attribution/sign'))
    assert.ok(!isStaffApiPath('/api/attribution/verify'))
    assert.ok(!isStaffApiPath('/api/portal/me'))
  })
})

describe('server statis', () => {
  let dir
  let server
  let crm
  let base
  let crmUrl
  const crmHits = []

  before(async () => {
    dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'tryon-dist-'))
    fs.mkdirSync(path.join(dir, 'assets'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Try-On</title>')
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc.js'), 'console.log(1)')
    crm = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        crmHits.push({ method: req.method, url: req.url, host: req.headers.host, auth: req.headers.authorization, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, from: 'crm' }))
      })
    })
    await new Promise((r) => crm.listen(0, '127.0.0.1', r))
    crmUrl = `http://127.0.0.1:${crm.address().port}`
    server = http.createServer(createHandler({ root: dir, crmUrl, ukurUrl: UKUR }))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}`

  })

  after(() => {
    server?.close()
    crm?.close()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  const get = (p, init = {}) => fetch(base + p, { redirect: 'manual', ...init })

  test('/ dan rute SPA → index.html', async () => {
    for (const p of ['/', '/?size=M', '/apa-saja']) {
      const r = await get(p)
      assert.equal(r.status, 200, p)
      assert.match(await r.text(), /Try-On/)
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
      assert.equal(r.headers.get('cache-control'), 'no-cache')
    }
  })

  test('aset + 404 untuk file yang tidak ada + path traversal', async () => {
    const r = await get('/assets/app-abc.js')
    assert.equal(r.status, 200)
    assert.match(r.headers.get('cache-control'), /immutable/)
    assert.equal((await get('/assets/tidak-ada.js')).status, 404)
    assert.notEqual((await get('/..%2f..%2fetc%2fpasswd')).status, 200)
  })

  test('/staf/* → 302 ke CRM, /kartu-member → App Ukur / masuk', async () => {
    let r = await get('/staf/kasir?outlet=solo')
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), `${crmUrl}/staf/kasir?outlet=solo`)
    r = await get('/kartu-member')
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), `${UKUR}/?layar=kartu-member`)
    r = await get('/kartu-member?token=tok1')
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), '/?masuk=tok1')
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
  })

  test('API staf lama → 308 ke CRM; API member lama diteruskan ke CRM', async () => {
    let r = await get('/api/kasir/lookup-phone', { method: 'POST', body: '{}' })
    assert.equal(r.status, 308)
    assert.equal(r.headers.get('location'), `${crmUrl}/api/kasir/lookup-phone`)

    r = await get('/api/webhooks/fonnte/rahasia', { method: 'POST', body: '{"device":"x"}', headers: { 'Content-Type': 'application/json' } })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true, from: 'crm' })
    const hit = crmHits.at(-1)
    assert.equal(hit.url, '/api/webhooks/fonnte/rahasia')
    assert.equal(hit.body, '{"device":"x"}')
    assert.equal(hit.host, new URL(crmUrl).host)

    r = await get('/api/portal/me', { headers: { Authorization: 'Bearer s1' } })
    assert.equal(r.status, 200)
    assert.equal(crmHits.at(-1).auth, 'Bearer s1')

    r = await get('/sdk/dooz-capture.js')
    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), `${crmUrl}/sdk/dooz-capture.js`)
  })

  test('healthz', async () => {
    const r = await get('/healthz')
    assert.deepEqual(await r.json(), { ok: true, app: 'tryon' })
  })
})
