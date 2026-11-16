import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MemberApiError, type MemberClient } from '../client.ts'
import type { MemberSession, PortalMe } from '../types.ts'

export type MemberView = 'kartu' | 'ukuran' | 'riwayat' | 'profil' | 'join' | 'login' | 'magic' | 'deleted'
export const MEMBER_TABS: MemberView[] = ['kartu', 'ukuran', 'riwayat', 'profil']

/** Link ke mini app DOOZ lain; dibuka lewat token serah-terima supaya login ikut terbawa. */
export interface MemberAppLink {
  /** Nama app yang terdaftar di CRM (`tryon`, `ukur`, …). */
  app: string
  label: string
  hint?: string
  /** URL biasa (tanpa login) bila belum member / serah-terima gagal. */
  fallbackUrl?: string
}

export interface MemberDoozContextValue {
  client: MemberClient
  session: MemberSession | null
  isMember: boolean
  /** Data Kartu Member (dimuat saat panel dibuka / setelah masuk). */
  me: PortalMe | null
  meError: { message: string; status: number } | null
  reloadMe: () => Promise<PortalMe | null>
  setMe: (me: PortalMe) => void
  panelOpen: boolean
  view: MemberView
  /** Buka panel. Tanpa argumen: Kartu Member (member) atau Jadi Member/Masuk (belum member). */
  open: (view?: MemberView) => void
  close: () => void
  setView: (view: MemberView) => void
  /** Token magic link `?masuk=` yang sedang dikonfirmasi. */
  magicToken: string | null
  /** Pesan singkat (toast) di atas app. */
  notice: string
  notify: (message: string) => void
  /** Pesan untuk layar masuk (mis. token serah-terima kedaluwarsa). */
  loginMessage: string
  apps: MemberAppLink[]
  cities: string[]
  brand?: ReactNode
  /** Ada ajakan "Jadi Member" di app ini (App Ukur). */
  canJoin: boolean
  setCanJoin: (v: boolean) => void
  openApp: (link: MemberAppLink) => Promise<void>
}

const Ctx = createContext<MemberDoozContextValue | null>(null)

export function useMemberDooz(): MemberDoozContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMemberDooz harus dipakai di dalam <MemberDoozProvider>')
  return v
}

/** Sesi member saja (bisa dipakai di luar Provider). */
export function useMemberSession(client: MemberClient): MemberSession | null {
  const [s, setS] = useState(() => client.getSession())
  useEffect(() => {
    setS(client.getSession())
    return client.subscribe(setS)
  }, [client])
  return s
}

export interface MemberDoozProviderProps {
  client: MemberClient
  children: ReactNode
  /** Mini app DOOZ lain yang bisa dibuka dari panel (login ikut terbawa). */
  apps?: MemberAppLink[]
  /** Daftar Kota/Kabupaten untuk isian Profil (opsional, untuk saran ketik). */
  cities?: string[]
  /** Logo untuk Kartu Member (default: wordmark teks KACAMATA DOOZ). */
  brand?: ReactNode
  /** Baca `?masuk=` / `?handoff=` dari URL saat app dibuka (default true). */
  handleUrlTokens?: boolean
  /** Dipanggil setelah berhasil masuk (magic link / serah-terima / polling). */
  onSignedIn?: (via: 'magic' | 'handoff') => void
}

const NO_APPS: MemberAppLink[] = []
const NO_CITIES: string[] = []

export function MemberDoozProvider({ client, children, apps = NO_APPS, cities = NO_CITIES, brand, handleUrlTokens = true, onSignedIn }: MemberDoozProviderProps) {
  const session = useMemberSession(client)
  const isMember = !!session
  const [me, setMeState] = useState<PortalMe | null>(null)
  const [meError, setMeError] = useState<{ message: string; status: number } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [view, setView] = useState<MemberView>('kartu')
  const [magicToken, setMagicToken] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [canJoin, setCanJoin] = useState(false)
  const started = useRef(false)
  const signedInRef = useRef(onSignedIn)
  signedInRef.current = onSignedIn

  const notify = useCallback((m: string) => setNotice(m), [])
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(t)
  }, [notice])

  const reloadMe = useCallback(async () => {
    if (!client.isMember()) {
      setMeState(null)
      return null
    }
    try {
      const data = await client.me()
      setMeState(data)
      setMeError(null)
      return data
    } catch (err) {
      setMeError({
        message: err instanceof Error ? err.message : 'Gagal memuat Kartu Member.',
        status: err instanceof MemberApiError ? err.status : 0,
      })
      return null
    }
  }, [client])

  // Ganti akun / keluar → data lama dibuang.
  const token = session?.session_token ?? null
  useEffect(() => {
    setMeState(null)
    setMeError(null)
    if (token) void reloadMe()
  }, [token, reloadMe])

  // QR dinamis diperbarui sebelum kedaluwarsa selama panel terbuka.
  useEffect(() => {
    if (!panelOpen || !me?.qr_token_expires_at) return
    const ms = Date.parse(me.qr_token_expires_at) - Date.now() - 10_000
    const t = window.setTimeout(() => void reloadMe(), Math.max(15_000, ms))
    return () => window.clearTimeout(t)
  }, [panelOpen, me?.qr_token_expires_at, reloadMe])

  // Link WhatsApp (?masuk=) & token serah-terima dari app lain (?handoff=), sekali saat app dibuka.
  useEffect(() => {
    if (!handleUrlTokens || started.current) return
    started.current = true
    const t = client.takeUrlTokens()
    if (t.magic) {
      setMagicToken(t.magic)
      setView('magic')
      setPanelOpen(true)
    } else if (t.handoff) {
      client
        .exchangeHandoff(t.handoff)
        .then(() => {
          setNotice('Kamu masuk sebagai Member DOOZ')
          signedInRef.current?.('handoff')
        })
        .catch((err) => {
          // Sudah member di HP ini? Tidak perlu apa-apa. Selain itu tawarkan masuk lewat WhatsApp.
          if (client.isMember()) return
          setLoginMessage(err instanceof Error ? err.message : 'Link sudah tidak berlaku.')
          setView('login')
          setPanelOpen(true)
        })
    }
  }, [client, handleUrlTokens])

  const open = useCallback(
    (v?: MemberView) => {
      const member = client.isMember()
      let next: MemberView = v ?? (member ? 'kartu' : canJoin ? 'join' : 'login')
      if (!member && MEMBER_TABS.includes(next)) next = canJoin && !v ? 'join' : 'login'
      if (next !== 'login') setLoginMessage('')
      setView(next)
      setPanelOpen(true)
      if (member) void reloadMe()
    },
    [client, canJoin, reloadMe],
  )
  const close = useCallback(() => {
    setPanelOpen(false)
    setMagicToken(null)
    setLoginMessage('')
  }, [])

  const openApp = useCallback(
    async (link: MemberAppLink) => {
      if (client.isMember()) {
        try {
          const h = await client.createHandoff(link.app)
          if (h.url && h.url !== '#') window.location.assign(h.url)
          return
        } catch {
          /* jatuh ke URL biasa */
        }
      }
      if (link.fallbackUrl) window.location.assign(link.fallbackUrl)
    },
    [client],
  )

  const value = useMemo<MemberDoozContextValue>(
    () => ({
      client,
      session,
      isMember,
      me,
      meError,
      reloadMe,
      setMe: setMeState,
      panelOpen,
      view,
      open,
      close,
      setView,
      magicToken,
      notice,
      notify,
      loginMessage,
      apps,
      cities,
      brand,
      canJoin,
      setCanJoin,
      openApp,
    }),
    [client, session, isMember, me, meError, reloadMe, panelOpen, view, open, close, magicToken, notice, notify, loginMessage, apps, cities, brand, canJoin, openApp],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {notice && !panelOpen && (
        <div role="status" className="mdz-root mdz-toast">
          {notice}
        </div>
      )}
    </Ctx.Provider>
  )
}
