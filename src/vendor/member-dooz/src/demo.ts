/**
 * Klien Member DOOZ berisi data contoh di memori — untuk pratinjau QA (`?demo=1`), tanpa jaringan.
 * Bentuknya sama persis dengan `createMemberClient`, jadi komponen tidak perlu tahu bedanya.
 */
import type { MemberClient } from './client.ts'
import { MemberApiError } from './client.ts'
import { estimateFrameWidthFromTemple, parseTempleLabel, sizeCategoryFor } from './format.ts'
import type { ContactEvent, Measurement, MeasurementList, MemberSession, PortalMe } from './types.ts'

const DEMO_MAX = 20
const day = 24 * 3600 * 1000
const iso = (ago: number) => new Date(Date.now() - ago * day).toISOString()

function seedMeasurements(): Measurement[] {
  const base = { customer_id: 'demo', lens_mm: null, bridge_mm: null, temple_mm: null }
  return [
    { ...base, id: 'demo-1', name: 'Ukuran pertama saya', note: 'nyaman dipakai seharian', frame_width_mm: 136, size_category: 'M', comfort: 'pas_nyaman', is_primary: true, source: 'self_measure', created_at: iso(12), updated_at: iso(12) },
    { ...base, id: 'demo-2', name: 'Kacamata baca', note: '', frame_width_mm: 132, size_category: 'S', lens_mm: 52, bridge_mm: 18, temple_mm: 140, comfort: 'kurang_nyaman', is_primary: false, source: 'temple_label', created_at: iso(5), updated_at: iso(5) },
    { ...base, id: 'demo-3', name: 'Sunglasses', note: 'untuk nyetir', frame_width_mm: 142, size_category: 'L', comfort: null, is_primary: false, source: 'outlet', created_at: iso(1), updated_at: iso(1) },
  ]
}

function seedTried(): ContactEvent[] {
  return [
    { id: 't1', event_type: 'frame_tried', src: 'glasses_try_on', payload: { frame_sku: 'DOOZ-CLS-001', frame_name: 'Classic Black', frame_width_mm: 138, size_category: 'M' }, created_at: iso(2) },
    { id: 't2', event_type: 'frame_tried', src: 'glasses_try_on', payload: { frame_sku: 'DOOZ-RND-002', frame_name: 'Round Gold', frame_width_mm: 134, size_category: 'M' }, created_at: iso(2.1) },
  ]
}

function sortList(list: Measurement[]) {
  return [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.created_at.localeCompare(a.created_at))
}

export function createDemoMemberClient(options: { app?: string; empty?: boolean; signedIn?: boolean } = {}): MemberClient {
  let items: Measurement[] = options.empty ? [] : seedMeasurements()
  const tried = options.empty ? [] : seedTried()
  let seq = 10
  let profile = { full_name: 'Rina', city_regency: 'Kota Surakarta' }
  let consentWa = true
  let session: MemberSession | null =
    options.signedIn === false ? null : { session_token: 'demo', access_scope: 'full', member_code: 'DOOZ-48219', first_name: 'Rina' }
  const listeners = new Set<(s: MemberSession | null) => void>()
  const setSession = (s: MemberSession | null) => {
    session = s
    listeners.forEach((l) => l(s))
  }
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250))
  const snapshot = (): MeasurementList => {
    const sorted = sortList(items)
    return { measurements: sorted, primary_measurement: sorted.find((m) => m.is_primary) ?? null, count: sorted.length, max: DEMO_MAX }
  }
  const find = (id: string) => {
    const m = items.find((x) => x.id === id)
    if (!m) throw new MemberApiError('Ukuran tidak ditemukan.', 404)
    return m
  }
  const meView = (): PortalMe => {
    const snap = snapshot()
    return {
      access_scope: 'full',
      requires_name_confirm: false,
      member_code: 'DOOZ-48219',
      first_name_masked: profile.full_name.split(' ')[0],
      full_name: profile.full_name,
      city_regency: profile.city_regency,
      phone_masked: '0812****7890',
      primary_size_category: snap.primary_measurement?.size_category,
      primary_measurement: snap.primary_measurement,
      measurements: snap.measurements,
      tried_frames: tried,
      store_visits: [],
      consents: [{ scope: 'crm_wa', granted: consentWa }],
      qr_token: 'DQR1.DEMO.PRATINJAU-KARTU-MEMBER',
      qr_token_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }
  }
  const needSession = () => {
    if (!session) throw new MemberApiError('Masuk dulu sebagai Member DOOZ.', 401)
  }

  return {
    demo: true,
    app: options.app ?? 'demo',
    apiBase: '',
    getSession: () => session,
    isMember: () => !!session,
    saveSession: (s) => setSession(s),
    logout: () => setSession(null),
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    takeUrlTokens: () => ({}),
    requestWhatsAppLogin: () =>
      wait({
        login_code: 'DZ-DEMO',
        poll_token: 'demo',
        wa_me_url: 'https://wa.me/6281122334455?text=' + encodeURIComponent('Halo DOOZ, saya mau masuk Member. Kode: DZ-DEMO'),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
    pollVerificationStatus: () => wait({ status: 'pending' }),
    inspectMagicLink: () => wait({ valid: true, member_code: 'DOOZ-48219', first_name_masked: 'Rina', requires_name_confirm: false }),
    async exchangeMagicLink() {
      const g = { session_token: 'demo', access_scope: 'full', member_code: 'DOOZ-48219', expires_at: new Date(Date.now() + 30 * day).toISOString() }
      setSession({ ...g })
      return wait(g)
    },
    async exchangeHandoff(token) {
      return this.exchangeMagicLink(token)
    },
    createHandoff: (target) =>
      wait({ handoff_token: 'demo', target_app: target, expires_at: new Date(Date.now() + 120_000).toISOString(), url: '#' }),
    confirmRecycled: () => wait(undefined),
    async me() {
      needSession()
      return wait(meView())
    },
    async updateProfile(patch) {
      needSession()
      profile = { full_name: patch.full_name?.trim() || profile.full_name, city_regency: patch.city_regency?.trim() || profile.city_regency }
      return wait(meView())
    },
    async setConsent(_scope, granted) {
      consentWa = granted
      await wait(undefined)
    },
    async revokeAllSessions() {
      setSession(null)
      return wait(2)
    },
    async deleteAllData() {
      items = []
      setSession(null)
      await wait(undefined)
    },
    async list() {
      needSession()
      return wait(snapshot())
    },
    async create(input) {
      if (items.length >= DEMO_MAX) throw new MemberApiError('Ukuran Saya sudah penuh (maks. 20). Hapus salah satu dulu.', 409)
      let width = Number(input.frame_width_mm) || 0
      let lens: number | null = input.lens_mm ?? null
      let bridge: number | null = input.bridge_mm ?? null
      let temple: number | null = input.temple_mm ?? null
      if (input.temple_label) {
        const p = parseTempleLabel(input.temple_label)
        if (!p) throw new MemberApiError('Data ukuran belum benar. Periksa lagi angkanya.', 400)
        ;({ lens, bridge, temple } = p)
      }
      if (!width && lens && bridge) width = estimateFrameWidthFromTemple(lens, bridge)
      const now = new Date().toISOString()
      const first = items.length === 0
      const m: Measurement = {
        id: `demo-${++seq}`,
        customer_id: 'demo',
        name: input.name?.trim() || (first ? 'Ukuran pertama saya' : lens ? 'Dari gagang kacamata' : `Ukuran ${items.length + 1}`),
        note: input.note?.trim() ?? '',
        frame_width_mm: width,
        size_category: sizeCategoryFor(width),
        lens_mm: lens,
        bridge_mm: bridge,
        temple_mm: temple,
        comfort: input.comfort ?? null,
        is_primary: first || !!input.set_primary,
        source: input.temple_label || lens ? 'temple_label' : 'self_measure',
        created_at: now,
        updated_at: now,
      }
      if (m.is_primary) items = items.map((x) => ({ ...x, is_primary: false }))
      items.push(m)
      return wait(m)
    },
    async update(id, patch) {
      const m = find(id)
      Object.assign(m, patch, { updated_at: new Date().toISOString() })
      return wait({ ...m })
    },
    async setPrimary(id) {
      find(id)
      items = items.map((x) => ({ ...x, is_primary: x.id === id }))
      return wait({ ...find(id) })
    },
    async remove(id) {
      const m = find(id)
      items = items.filter((x) => x.id !== id)
      if (m.is_primary && items.length > 0) {
        const newest = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        newest.is_primary = true
      }
      return wait({ primary_measurement: items.find((x) => x.is_primary) ?? null })
    },
    framesTried: () => wait(tried),
    trackEvent: () => wait(undefined),
  }
}
