// Tes klien Katalog DOOZ CRM (src/lib/catalog.js) dengan fetch palsu.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CATALOG_FRAMES_DEFAULT, SIZE_CHART_DEFAULT, fetchCatalogFrames, fetchSizeChart, mapWidthToSizeCategory } from '../src/lib/catalog.js'

const json = (data, init = {}) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } })

test('frame diambil dari Katalog CRM', async () => {
  const calls = []
  const frames = [{ sku: 'DOOZ-NEW-009', name: 'Baru', frame_width_mm: 140, size_category: 'L', is_active: true }]
  const res = await fetchCatalogFrames({
    apiBase: 'https://crm.example',
    fetchImpl: async (url) => {
      calls.push(url)
      return json({ ok: true, frames })
    },
  })
  assert.deepEqual(calls, ['https://crm.example/api/catalog/frames'])
  assert.deepEqual(res.frames, frames)
  assert.equal(res.offline_fallback, undefined)
})

test('CRM tidak bisa dihubungi → katalog bawaan', async () => {
  const res = await fetchCatalogFrames({ apiBase: 'https://crm.example', fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(res.offline_fallback, true)
  assert.equal(res.frames.length, CATALOG_FRAMES_DEFAULT.filter((f) => f.is_active !== false).length)
})

test('size chart dari CRM', async () => {
  const chart = [{ category: 'S', min_mm: 100, max_mm: 130 }, { category: 'L', min_mm: 131, max_mm: 200 }]
  const res = await fetchSizeChart({ apiBase: 'https://crm.example', fetchImpl: async (url) => {
    assert.equal(url, 'https://crm.example/api/catalog/size-chart')
    return json({ ok: true, size_chart: chart }, { headers: { ETag: 'W/"1"' } })
  } })
  assert.deepEqual(res.size_chart, chart)
  const bad = await fetchSizeChart({ apiBase: 'https://crm.example', fetchImpl: async () => new Response('x', { status: 500 }) })
  assert.deepEqual(bad.size_chart, SIZE_CHART_DEFAULT)
})

test('mapWidthToSizeCategory', () => {
  assert.equal(mapWidthToSizeCategory(138, SIZE_CHART_DEFAULT), 'M')
  assert.equal(mapWidthToSizeCategory(120, SIZE_CHART_DEFAULT), 'XS')
  assert.equal(mapWidthToSizeCategory(999, SIZE_CHART_DEFAULT), 'XL')
  assert.equal(mapWidthToSizeCategory(0), 'M')
})
