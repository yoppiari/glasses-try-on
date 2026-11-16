/**
 * Klien API Member DOOZ → DOOZ CRM (lintas origin, sesi Bearer, tanpa cookie).
 * Kontrak: repo dooz-crm `docs/api.md` (§1 aturan umum, §3 magic link, §4 token serah-terima, §5 riwayat).
 *
 * Tidak bergantung pada React; bisa dipakai di mini app mana pun:
 *
 *   const member = createMemberClient({ apiBase: 'https://dooz-crm-pocco.fural.space', app: 'ukur' })
 *   const tokens = member.takeUrlTokens()        // ?masuk= / ?handoff= (dihapus dari address bar)
 *   if (tokens.handoff) await member.exchangeHandoff(tokens.handoff)
 *   const me = await member.me()
 */
import type {
  CreateMeasurementInput,
  ContactEvent,
  EventPayload,
  HandoffResult,
  MagicLinkInfo,
  Measurement,
  MeasurementList,
  MeasurementPatch,
  MemberSession,
  PortalMe,
  ProfilePatch,
  SessionGrant,
  UrlTokens,
  VerificationStatus,
  WhatsAppLoginRequest,
} from './types.ts'

export const SESSION_STORAGE_KEY = 'dooz_member_session_v1'

export class MemberApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MemberApiError'
    this.status = status
  }
}

type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export interface MemberClientOptions {
  /** Base URL DOOZ CRM, mis. `https://dooz-crm-pocco.fural.space` (tanpa garis miring di akhir). */
  apiBase: string
  /** Nama mini app yang terdaftar di CRM (`ukur`, `tryon`, …): tujuan magic link WhatsApp & validasi serah-terima. */
  app: string
  /** Kunci localStorage sesi (default `dooz_member_session_v1`). */
  storageKey?: string
  /** Penyimpanan sesi (default `window.localStorage`; `null` = hanya di memori). */
  storage?: KV | null
  fetch?: typeof fetch
  /** Nama parameter URL magic link WhatsApp (default `['masuk']`). Try-On tahap 1 memakai `token` di `/kartu-member`. */
  magicParams?: string[]
}

export interface MemberClient {
  readonly demo: boolean
  readonly app: string
  readonly apiBase: string

  /* Sesi di perangkat ini */
  getSession(): MemberSession | null
  isMember(): boolean
  saveSession(s: MemberSession): void
  /** Keluar dari perangkat ini saja (sesi di server tetap sampai kedaluwarsa). */
  logout(): void
  /** Dipanggil setiap sesi berubah (masuk/keluar, termasuk dari tab lain). Mengembalikan fungsi berhenti. */
  subscribe(listener: (s: MemberSession | null) => void): () => void

  /* Masuk */
  takeUrlTokens(): UrlTokens
  requestWhatsAppLogin(): Promise<WhatsAppLoginRequest>
  pollVerificationStatus(code: string, pollToken: string): Promise<VerificationStatus>
  inspectMagicLink(token: string): Promise<MagicLinkInfo>
  exchangeMagicLink(token: string, confirmFullName?: string): Promise<SessionGrant>
  exchangeHandoff(token: string): Promise<SessionGrant>
  /** Buat token serah-terima lalu kembalikan URL app tujuan (login ikut terbawa). */
  createHandoff(targetApp: string): Promise<HandoffResult>
  confirmRecycled(fullName: string): Promise<void>

  /* Kartu Member & profil */
  me(): Promise<PortalMe>
  updateProfile(patch: ProfilePatch): Promise<PortalMe>
  setConsent(scope: 'crm_wa', granted: boolean): Promise<void>
  revokeAllSessions(): Promise<number>
  deleteAllData(): Promise<void>

  /* Ukuran Saya */
  list(): Promise<MeasurementList>
  create(input: CreateMeasurementInput): Promise<Measurement>
  update(id: string, patch: MeasurementPatch): Promise<Measurement>
  setPrimary(id: string): Promise<Measurement>
  remove(id: string): Promise<{ primary_measurement: Measurement | null }>

  /* Riwayat */
  framesTried(limit?: number): Promise<ContactEvent[]>
  trackEvent(eventType: string, payload: EventPayload, src?: string): Promise<void>
}

function defaultStorage(): KV | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

/** Pesan ramah (Bahasa Indonesia) per status HTTP. `context` membedakan pesan 403/404. */
export function friendlyError(status: number, raw: string, context: 'member' | 'measurement' | 'auth' = 'member'): string {
  switch (status) {
    case 0:
      return 'Tidak ada koneksi internet. Coba lagi sebentar.'
    case 401:
      return context === 'auth'
        ? 'Link sudah kedaluwarsa atau sudah dipakai. Masuk lagi lewat WhatsApp.'
        : 'Sesi member sudah berakhir. Silakan masuk lagi lewat WhatsApp.'
    case 403:
      return context === 'auth'
        ? 'Link ini untuk aplikasi DOOZ lain. Masuk lewat WhatsApp, ya.'
        : 'Konfirmasi nama lengkap dulu untuk membuka data member.'
    case 404:
      return context === 'measurement' ? 'Ukuran tidak ditemukan. Muat ulang daftar.' : 'Data tidak ditemukan.'
    case 409:
      return 'Ukuran Saya sudah penuh (maks. 20). Hapus salah satu dulu.'
    case 429:
      return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
    default:
      if (raw.startsWith('invalid measurement')) return 'Data ukuran belum benar. Periksa lagi angkanya.'
      if (raw.startsWith('invalid profile')) return 'Nama 2–80 huruf dan kota wajib diisi.'
      return status >= 500 ? 'Server DOOZ sedang sibuk. Coba lagi sebentar.' : raw || 'Terjadi kendala. Coba lagi sebentar.'
  }
}

export function createMemberClient(options: MemberClientOptions): MemberClient {
  const apiBase = String(options.apiBase || '').replace(/\/+$/, '')
  const app = options.app
  const key = options.storageKey ?? SESSION_STORAGE_KEY
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const magicParams = options.magicParams ?? ['masuk']
  const listeners = new Set<(s: MemberSession | null) => void>()
  let memory: MemberSession | null = null
  let storageOk = !!storage

  const read = (): MemberSession | null => {
    let s: MemberSession | null = memory
    if (storage && storageOk) {
      try {
        const raw = storage.getItem(key)
        s = raw ? (JSON.parse(raw) as MemberSession) : null
      } catch {
        s = memory
      }
    }
    if (!s?.session_token) return null
    if (s.expires_at && Date.parse(s.expires_at) < Date.now()) return null
    return s
  }
  const emit = () => {
    const s = read()
    listeners.forEach((l) => l(s))
  }
  const write = (s: MemberSession | null) => {
    memory = s
    if (storage) {
      try {
        if (s) storage.setItem(key, JSON.stringify(s))
        else storage.removeItem(key)
      } catch {
        storageOk = false // mode privat / kuota: sesi tetap di memori
      }
    }
    emit()
  }

  if (typeof window !== 'undefined' && storage) {
    window.addEventListener('storage', (e) => {
      if (e.key === key || e.key === null) emit()
    })
  }

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; auth?: boolean; context?: 'member' | 'measurement' | 'auth' } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const sess = init.auth ? read() : null
    if (init.auth) {
      if (!sess) throw new MemberApiError('Masuk dulu sebagai Member DOOZ.', 401)
      headers.Authorization = `Bearer ${sess.session_token}`
    }
    let resp: Response
    try {
      resp = await doFetch(`${apiBase}${path}`, {
        method: init.method ?? 'GET',
        headers,
        referrerPolicy: 'no-referrer',
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch {
      throw new MemberApiError(friendlyError(0, ''), 0)
    }
    let data: Record<string, unknown> = {}
    try {
      data = (await resp.json()) as Record<string, unknown>
    } catch {
      /* respons kosong */
    }
    if (!resp.ok) {
      // Sesi dicabut/kedaluwarsa di server → hapus juga di perangkat ini.
      if (resp.status === 401 && init.auth && read()?.session_token === sess?.session_token) write(null)
      throw new MemberApiError(friendlyError(resp.status, String(data.error ?? ''), init.context), resp.status)
    }
    return data as T
  }

  const grant = (res: SessionGrant, extra: Partial<MemberSession> = {}) => {
    write({
      session_token: res.session_token,
      access_scope: res.access_scope,
      member_code: res.member_code,
      expires_at: res.expires_at,
      ...extra,
    })
    return res
  }

  const client: MemberClient = {
    demo: false,
    app,
    apiBase,

    getSession: read,
    isMember: () => !!read(),
    saveSession(s) {
      const cur = read()
      write(cur && cur.session_token === s.session_token ? { ...cur, ...s } : s)
    },
    logout: () => write(null),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    takeUrlTokens() {
      if (typeof window === 'undefined') return {}
      const out: UrlTokens = {}
      try {
        const url = new URL(window.location.href)
        for (const p of magicParams) {
          const v = url.searchParams.get(p)?.trim()
          if (v) {
            out.magic = v
            url.searchParams.delete(p)
          }
        }
        const h = url.searchParams.get('handoff')?.trim()
        if (h) {
          out.handoff = h
          url.searchParams.delete('handoff')
        }
        // Token tidak boleh tertinggal di address bar / riwayat / Referer.
        if (out.magic || out.handoff) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
      } catch {
        /* abaikan */
      }
      return out
    },

    requestWhatsAppLogin: () =>
      request<WhatsAppLoginRequest>('/api/auth/whatsapp-login', { method: 'POST', body: { app }, context: 'auth' }),

    async pollVerificationStatus(code, pollToken) {
      try {
        const res = await request<VerificationStatus>('/api/capture/verification-status', {
          method: 'POST',
          body: { verification_code: code, poll_token: pollToken },
        })
        if (res.status === 'verified' && res.session_token) {
          write({
            session_token: res.session_token,
            access_scope: res.access_scope,
            member_code: res.member_code,
            first_name: res.first_name_masked,
            expires_at: res.session_expires_at,
          })
        }
        return res
      } catch (err) {
        if (err instanceof MemberApiError && err.status === 404) return { status: 'not_found' }
        throw err
      }
    },

    inspectMagicLink: (token) =>
      request<MagicLinkInfo>(`/api/auth/magic-verify?token=${encodeURIComponent(token)}`, { context: 'auth' }),

    async exchangeMagicLink(token, confirmFullName = '') {
      const res = await request<SessionGrant>('/api/auth/magic-exchange', {
        method: 'POST',
        body: { token, confirm_full_name: confirmFullName },
        context: 'auth',
      })
      return grant(res)
    },

    async exchangeHandoff(token) {
      const res = await request<SessionGrant>('/api/auth/handoff/exchange', {
        method: 'POST',
        body: { handoff_token: token },
        context: 'auth',
      })
      return grant(res)
    },

    createHandoff: (targetApp) =>
      request<HandoffResult>('/api/auth/handoff', { method: 'POST', body: { target_app: targetApp }, auth: true }),

    async confirmRecycled(fullName) {
      const res = await request<{ access_scope: string }>('/api/portal/confirm-recycled', {
        method: 'POST',
        body: { full_name: fullName },
        auth: true,
      })
      const s = read()
      if (s) write({ ...s, access_scope: res.access_scope })
    },

    async me() {
      const me = await request<PortalMe>('/api/portal/me', { auth: true })
      const s = read()
      if (s && (s.member_code !== me.member_code || s.access_scope !== me.access_scope || s.first_name !== me.first_name_masked)) {
        write({ ...s, member_code: me.member_code, access_scope: me.access_scope, first_name: me.first_name_masked })
      }
      return me
    },

    updateProfile: (patch) => request<PortalMe>('/api/portal/me', { method: 'PATCH', body: patch, auth: true }),

    async setConsent(scope, granted) {
      await request('/api/portal/consents', { method: 'POST', body: { scope, granted }, auth: true })
    },

    async revokeAllSessions() {
      const res = await request<{ revoked_sessions?: number }>('/api/portal/sessions/revoke-all', { method: 'POST', auth: true })
      write(null)
      return res.revoked_sessions ?? 1
    },

    async deleteAllData() {
      await request('/api/portal/privacy/delete', { method: 'POST', body: { immediate: true }, auth: true })
      write(null)
    },

    list: () => request<MeasurementList>('/api/portal/measurements', { auth: true, context: 'measurement' }),

    async create(input) {
      const res = await request<{ measurement: Measurement }>('/api/portal/measurements', {
        method: 'POST',
        body: input,
        auth: true,
        context: 'measurement',
      })
      return res.measurement
    },

    async update(id, patch) {
      const res = await request<{ measurement: Measurement }>(`/api/portal/measurements/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        auth: true,
        context: 'measurement',
      })
      return res.measurement
    },

    async setPrimary(id) {
      const res = await request<{ measurement: Measurement }>(`/api/portal/measurements/${encodeURIComponent(id)}/primary`, {
        method: 'POST',
        auth: true,
        context: 'measurement',
      })
      return res.measurement
    },

    remove: (id) =>
      request<{ primary_measurement: Measurement | null }>(`/api/portal/measurements/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true,
        context: 'measurement',
      }),

    async framesTried(limit = 20) {
      const res = await request<{ tried_frames?: ContactEvent[] }>(`/api/portal/frames-tried?limit=${limit}`, { auth: true })
      return res.tried_frames ?? []
    },

    async trackEvent(eventType, payload, src) {
      await request('/api/capture/events', {
        method: 'POST',
        body: { event_type: eventType, payload, src: src ?? app },
        auth: true,
      })
    },
  }
  return client
}
