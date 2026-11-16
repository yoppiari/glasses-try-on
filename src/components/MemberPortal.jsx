import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppHeader, CornerBrackets, DoozLogogram, DoozWordmark } from './brand/Brand'
import {
  SIZE_CHART_DEFAULT,
  DEFAULT_OFFICIAL_WA,
  getStoredPortalSession,
  setStoredPortalSession,
  clearStoredPortalSession,
  getLocalTrackedEvents,
  syncLocalEventsToHub,
  inspectMagicLink,
  exchangeMagicLink,
  fetchPortalMe,
  confirmRecycledName,
  revokeAllSessions,
  updatePortalConsent,
  requestPrivacyDeletion,
  setPrimaryMeasurement,
  deleteMeasurement,
} from '../sdk/doozCapture'

const MEASUREMENT_SOURCE_LABEL = {
  self_measure: 'Ukur sendiri',
  outlet: 'Diukur di outlet',
  temple_label: 'Dari gagang kacamata',
}

const COMFORT_LABEL = {
  pas_nyaman: '😊 Pas & nyaman',
  kurang_nyaman: '😐 Kurang nyaman',
  tidak_pas: '❌ Tidak pas',
}

function formatShortDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * Generates a deterministic 21x21 QR-style SVG matrix from a signed rotating token (`DQR1...`).
 */
function DynamicQRMatrixSVG({ token = 'DQR1.DEMO.SIGNATURE' }) {
  const size = 21
  const cells = useMemo(() => {
    const grid = Array.from({ length: size }, () => Array(size).fill(false))

    // Draw standard 7x7 finder patterns at top-left, top-right, bottom-left
    const drawFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4
          grid[r0 + r][c0 + c] = isBorder || isInner
        }
      }
    }
    drawFinder(0, 0)
    drawFinder(0, size - 7)
    drawFinder(size - 7, 0)

    // Deterministic hash stream from signed token string
    let hash = 2166136261
    const str = String(token || 'DQR1')
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inTopLeft = r < 8 && c < 8
        const inTopRight = r < 8 && c >= size - 8
        const inBottomLeft = r >= size - 8 && c < 8
        if (inTopLeft || inTopRight || inBottomLeft) continue

        const charCode = str.charCodeAt((r * size + c) % str.length)
        const bit = ((hash ^ (charCode * (r + 3) * (c + 7))) >>> ((r + c) % 16)) & 1
        grid[r][c] = bit === 1
      }
    }
    return grid
  }, [token])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="176"
      height="176"
      className="dooz-qr-svg"
      role="img"
      aria-label="QR Kartu Member DOOZ"
    >
      <rect width={size} height={size} fill="#ffffff" rx="1.2" />
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx}
              y={rIdx}
              width={0.92}
              height={0.92}
              fill="#252A2D"
              rx="0.15"
            />
          ) : null
        )
      )}
    </svg>
  )
}

function buildOfflineDemoView(recycledMode = false) {
  const now = new Date()
  const exp = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  const baseView = {
    access_scope: recycledMode ? 'basic_recycled_pending' : 'full',
    requires_name_confirm: recycledMode,
    member_code: 'DOOZ-48219',
    first_name_masked: 'Rina K.',
    phone_masked: '0812****7890',
    verification_status: 'verified',
    latest_measurement: {
      frame_width_mm: 138,
      bridge_mm: 18,
      temple_mm: 142,
      size_category: 'M',
    },
  }
  if (recycledMode) {
    return { ...baseView, primary_size_category: 'M' }
  }
  const demoMeasurements = [
    {
      id: 'demo-meas-1',
      name: 'Kerja',
      note: 'Nyaman dipakai seharian',
      frame_width_mm: 138,
      size_category: 'M',
      lens_mm: null,
      bridge_mm: null,
      temple_mm: null,
      comfort: 'pas_nyaman',
      is_primary: true,
      source: 'self_measure',
      created_at: new Date(now.getTime() - 3 * 86400 * 1000).toISOString(),
    },
    {
      id: 'demo-meas-2',
      name: 'Baca',
      note: '',
      frame_width_mm: 132,
      size_category: 'S',
      lens_mm: 52,
      bridge_mm: 18,
      temple_mm: 140,
      comfort: null,
      is_primary: false,
      source: 'temple_label',
      created_at: new Date(now.getTime() - 86400 * 1000).toISOString(),
    },
  ]
  return {
    ...baseView,
    primary_size_category: 'M',
    primary_measurement: demoMeasurements[0],
    measurements: demoMeasurements,
    full_name: 'Rina Kartika',
    city_regency: 'Kota Surakarta (Solo)',
    qr_token: `DQR1.eyJjaWQiOiJkZW1vLWNpZCIsIm1jIjoiRE9PWi00ODIxOSIsImV4cCI6${Math.floor(
      Date.now() / 1000 + 300
    )}}.c2lnbmVkX3JvdGF0aW5nX2htYWNfc2hhMjU2`,
    qr_token_expires_at: exp,
    tried_frames: [
      {
        id: 'ev-try-1',
        event_type: 'frame_tried',
        src: 'live_tiktok',
        host_code: 'rina',
        session_code: '20261116',
        created_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
        payload: {
          frame_sku: 'glasses-1',
          frame_name: 'Classic Black',
          frame_width_mm: 138,
          size_category: 'M',
        },
      },
      {
        id: 'ev-try-2',
        event_type: 'frame_tried',
        src: 'outlet_solo_gading',
        created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
        payload: {
          frame_sku: 'glasses-3',
          frame_name: 'Retro Round',
          frame_width_mm: 135,
          size_category: 'M',
        },
      },
    ],
    store_visits: [
      {
        id: 'ev-visit-1',
        event_type: 'store_visit',
        src: 'outlet_qr_kasir',
        created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
        payload: {
          outlet_id: 'DOOZ Optik Gading Solo',
          notes: 'Konsultasi frame & ukur lebar wajah digital',
        },
      },
      {
        id: 'ev-visit-2',
        event_type: 'store_visit',
        src: 'outlet_qr_kasir',
        created_at: new Date(now.getTime() - 14 * 86400 * 1000).toISOString(),
        payload: {
          outlet_id: 'DOOZ Optik Sukoharjo',
          notes: 'Penyetelan nosepad gratis member DOOZ',
        },
      },
    ],
    vouchers: [
      {
        id: 'ev-vouch-1',
        event_type: 'voucher_claimed',
        src: 'live_tiktok',
        created_at: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
        payload: {
          voucher_code: 'LIVE-DOOZ50K',
          amount_idr: 50000,
          notes: 'Potongan Rp 50.000 Frame + Lensa Anti Radiasi (Berlaku di seluruh Outlet DOOZ)',
        },
      },
    ],
    consents: [
      {
        id: 'cons-1',
        scope: 'crm_wa',
        granted: true,
        granted_at: now.toISOString(),
      },
      {
        id: 'cons-2',
        scope: 'health_prescription',
        granted: false,
        granted_at: now.toISOString(),
      },
    ],
  }
}

// Tombol simulasi magic link hanya untuk mode dev (`npm run dev`). Di produksi, staf membuat
// Kartu Member contoh dari menu Laporan di aplikasi staf (/staf/laporan).
const SHOW_DEV_DEMO = Boolean(import.meta.env.DEV)

const EXPIRED_LINK_MESSAGE =
  'Link ini sudah tidak berlaku (link hanya bisa dipakai sekali dan berlaku 15 menit). Kirim MASUK ke WhatsApp DOOZ untuk menerima link baru.'

export default function MemberPortal({
  onBackToTryOn,
  onSelectFrameFromHistory,
  onApplyCustomerSizeFilter,
}) {
  const [urlToken, setUrlToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return (params.get('token') || '').trim()
  })

  const [magicPreview, setMagicPreview] = useState(null)
  const [magicChecking, setMagicChecking] = useState(false)
  const [exchanging, setExchanging] = useState(false)
  const [manualTokenInput, setManualTokenInput] = useState('')

  const [portalView, setPortalView] = useState(null)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [statusBanner, setStatusBanner] = useState('')
  const [errorBanner, setErrorBanner] = useState('')

  // Recycled number (>6m passive) confirmation state
  const [recycledNameInput, setRecycledNameInput] = useState('')
  const [confirmingRecycled, setConfirmingRecycled] = useState(false)

  // Privacy deletion confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [deletedSuccess, setDeletedSuccess] = useState(false)

  // QR countdown seconds
  const [qrSecondsLeft, setQrSecondsLeft] = useState(300)

  // Enforce Referrer-Policy: no-referrer on document head while in Portal
  useEffect(() => {
    if (typeof document === 'undefined') return
    let meta = document.querySelector('meta[name="referrer"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'referrer'
      document.head.appendChild(meta)
    }
    meta.content = 'no-referrer'
  }, [])

  // Inspect Magic Link token via GET (safe from WA link preview — does NOT consume token)
  useEffect(() => {
    if (!urlToken) return
    let cancelled = false
    setMagicChecking(true)
    setErrorBanner('')

    inspectMagicLink(urlToken)
      .then((info) => {
        if (!cancelled) {
          setMagicPreview(info)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // If offline demo token
          if (urlToken.startsWith('demo-magic-')) {
            const isRecycled = urlToken.includes('recycled')
            setMagicPreview({
              valid: true,
              member_code: 'DOOZ-48219',
              first_name_masked: 'Rina K.',
              requires_name_confirm: isRecycled,
              expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              offline_demo: true,
            })
          } else {
            setErrorBanner(EXPIRED_LINK_MESSAGE)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setMagicChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [urlToken])

  const loadPortalSession = useCallback(async (sessionTok) => {
    const stored = getStoredPortalSession()
    const tokenToUse = sessionTok || stored?.session_token
    if (!tokenToUse) return

    if (String(tokenToUse).startsWith('demo-sess-')) {
      const isRecycled = String(tokenToUse).includes('recycled')
      setPortalView(buildOfflineDemoView(isRecycled))
      return
    }

    setLoadingPortal(true)
    setErrorBanner('')
    try {
      await syncLocalEventsToHub(stored?.contact_id, { session_token: tokenToUse })
      const view = await fetchPortalMe(tokenToUse)
      setPortalView(view)
    } catch {
      clearStoredPortalSession()
      setPortalView(null)
      setErrorBanner('Sesi Kartu Member sudah berakhir. Kirim MASUK ke WhatsApp DOOZ untuk menerima link baru.')
    } finally {
      setLoadingPortal(false)
    }
  }, [])

  useEffect(() => {
    if (!urlToken) {
      const existing = getStoredPortalSession()
      if (existing?.session_token) {
        loadPortalSession(existing.session_token)
      }
    }
  }, [urlToken, loadPortalSession])

  // Countdown timer for dynamic QR rotating token
  useEffect(() => {
    if (!portalView?.qr_token_expires_at) return
    const updateTimer = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(portalView.qr_token_expires_at).getTime() - Date.now()) / 1000)
      )
      setQrSecondsLeft(diff)
    }
    updateTimer()
    const id = setInterval(updateTimer, 1000)
    return () => clearInterval(id)
  }, [portalView?.qr_token_expires_at])

  // Step 1: Confirm button click -> POST /api/auth/magic-exchange
  const handleConfirmMagicExchange = async () => {
    if (!urlToken) return
    setExchanging(true)
    setErrorBanner('')
    setStatusBanner('')

    try {
      if (urlToken.startsWith('demo-magic-')) {
        const isRecycled = urlToken.includes('recycled')
        const fakeSess = {
          session_token: isRecycled ? 'demo-sess-recycled' : 'demo-sess-full',
          access_scope: isRecycled ? 'basic_recycled_pending' : 'full',
          requires_name_confirm: isRecycled,
          member_code: 'DOOZ-48219',
          expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        }
        setStoredPortalSession(fakeSess)
        stripTokenFromAddressBar()
        setUrlToken('')
        setMagicPreview(null)
        setPortalView(buildOfflineDemoView(isRecycled))
        setStatusBanner('Kartu Member kamu sudah terbuka.')
        return
      }

      const exchanged = await exchangeMagicLink(urlToken)
      stripTokenFromAddressBar()
      setUrlToken('')
      setMagicPreview(null)
      await loadPortalSession(exchanged.session_token)
      setStatusBanner('Kartu Member kamu sudah terbuka.')
    } catch {
      setErrorBanner(EXPIRED_LINK_MESSAGE)
    } finally {
      setExchanging(false)
    }
  }

  const stripTokenFromAddressBar = () => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.replaceState({}, document.title, url.pathname + url.search)
  }

  // Start a real or fallback demo magic link flow so user/verifier can test POST /api/auth/magic-exchange
  const handleStartDemoFlow = async (recycledMode = false) => {
    setErrorBanner('')
    setStatusBanner('')
    try {
      const resp = await fetch('/api/portal/demo-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recycled_passive: recycledMode }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setUrlToken(data.magic_token)
        return
      }
    } catch {
      // fallback to local demo magic token
    }
    setUrlToken(recycledMode ? 'demo-magic-recycled-1' : 'demo-magic-normal-1')
  }

  // Step 2: Confirm full name for >6m passive recycled number (`POST /api/portal/confirm-recycled`)
  const handleConfirmRecycledSubmit = async (e) => {
    e.preventDefault()
    if (!recycledNameInput.trim()) {
      setErrorBanner('Ketik nama lengkap kamu dulu ya.')
      return
    }
    setConfirmingRecycled(true)
    setErrorBanner('')
    setStatusBanner('')

    try {
      const sess = getStoredPortalSession()
      if (sess?.session_token?.startsWith('demo-sess-')) {
        if (recycledNameInput.trim().toLowerCase() !== 'rina kartika') {
          throw new Error(
            'Nama lengkap belum cocok (contoh uji: Rina Kartika).'
          )
        }
        const upgraded = { ...sess, session_token: 'demo-sess-full', access_scope: 'full', requires_name_confirm: false }
        setStoredPortalSession(upgraded)
        setPortalView(buildOfflineDemoView(false))
        setStatusBanner('Terima kasih! Kartu Member kamu sudah terbuka penuh.')
        return
      }

      await confirmRecycledName(recycledNameInput.trim())
      await loadPortalSession()
      setStatusBanner('Terima kasih! Kartu Member kamu sudah terbuka penuh.')
    } catch {
      setErrorBanner('Nama lengkap belum cocok. Coba lagi, atau minta bantuan kasir di outlet DOOZ.')
    } finally {
      setConfirmingRecycled(false)
    }
  }

  // Rotate / Refresh Dynamic QR Token
  const handleRefreshQRToken = async () => {
    setErrorBanner('')
    const sess = getStoredPortalSession()
    if (sess?.session_token?.startsWith('demo-sess-')) {
      setPortalView(buildOfflineDemoView(false))
      setStatusBanner('QR sudah diperbarui.')
      return
    }
    await loadPortalSession()
    setStatusBanner('QR sudah diperbarui.')
  }

  // "Ukuran Saya": jadikan ukuran utama / hapus ukuran
  const [measurementBusy, setMeasurementBusy] = useState('')
  const isDemoSession = () => String(getStoredPortalSession()?.session_token || '').startsWith('demo-sess-')

  const handleSetPrimaryMeasurement = async (id) => {
    setErrorBanner('')
    if (isDemoSession()) {
      setPortalView((v) => {
        const list = (v?.measurements || []).map((m) => ({ ...m, is_primary: m.id === id }))
        const primary = list.find((m) => m.is_primary)
        return { ...v, measurements: list, primary_measurement: primary, primary_size_category: primary?.size_category }
      })
      setStatusBanner('Ukuran utama sudah diganti.')
      return
    }
    setMeasurementBusy(id)
    try {
      await setPrimaryMeasurement(id)
      await loadPortalSession()
      setStatusBanner('Ukuran utama sudah diganti. Kasir akan melihat ukuran ini.')
    } catch (err) {
      setErrorBanner(err?.message || 'Gagal mengganti ukuran utama.')
    } finally {
      setMeasurementBusy('')
    }
  }

  const handleDeleteMeasurement = async (id) => {
    setErrorBanner('')
    if (typeof window !== 'undefined' && !window.confirm('Hapus ukuran ini?')) return
    if (isDemoSession()) {
      setPortalView((v) => {
        let list = (v?.measurements || []).filter((m) => m.id !== id)
        if (list.length > 0 && !list.some((m) => m.is_primary)) {
          list = list.map((m, idx) => ({ ...m, is_primary: idx === 0 }))
        }
        const primary = list.find((m) => m.is_primary)
        return { ...v, measurements: list, primary_measurement: primary, primary_size_category: primary?.size_category }
      })
      return
    }
    setMeasurementBusy(id)
    try {
      await deleteMeasurement(id)
      await loadPortalSession()
      setStatusBanner('Ukuran sudah dihapus.')
    } catch (err) {
      setErrorBanner(err?.message || 'Gagal menghapus ukuran.')
    } finally {
      setMeasurementBusy('')
    }
  }

  // Revoke all sessions ("Keluar dari Semua Perangkat")
  const handleRevokeAll = async () => {
    setErrorBanner('')
    try {
      const res = await revokeAllSessions()
      setPortalView(null)
      setUrlToken('')
      setStatusBanner(
        `Kamu sudah keluar dari semua perangkat (${res?.revoked_sessions ?? 1} perangkat).`
      )
    } catch (err) {
      setPortalView(null)
      setStatusBanner('Kamu sudah keluar dari HP ini.')
    }
  }

  // Toggle UU PDP Consent (`crm_wa` or `health_prescription`)
  const handleToggleConsent = async (scope, currentGranted) => {
    setErrorBanner('')
    setStatusBanner('')
    const nextGranted = !currentGranted
    const sess = getStoredPortalSession()

    if (sess?.session_token?.startsWith('demo-sess-')) {
      setPortalView((prev) => {
        if (!prev) return prev
        const updated = (prev.consents || []).map((c) =>
          c.scope === scope ? { ...c, granted: nextGranted } : c
        )
        return { ...prev, consents: updated }
      })
      setStatusBanner(nextGranted ? 'Info promo lewat WhatsApp diaktifkan lagi.' : 'Kamu tidak akan menerima promo lewat WhatsApp lagi.')
      return
    }

    try {
      await updatePortalConsent(scope, nextGranted)
      await loadPortalSession()
      setStatusBanner(nextGranted ? 'Info promo lewat WhatsApp diaktifkan lagi.' : 'Kamu tidak akan menerima promo lewat WhatsApp lagi.')
    } catch (err) {
      setErrorBanner(err.message)
    }
  }

  // Request UU PDP Data Deletion (`POST /api/portal/privacy/delete`)
  const handleConfirmDeleteData = async () => {
    setDeletingData(true)
    setErrorBanner('')
    try {
      const sess = getStoredPortalSession()
      if (sess?.session_token?.startsWith('demo-sess-')) {
        clearStoredPortalSession()
        setPortalView(null)
        setShowDeleteConfirm(false)
        setDeletedSuccess(true)
        return
      }
      await requestPrivacyDeletion(true)
      setPortalView(null)
      setShowDeleteConfirm(false)
      setDeletedSuccess(true)
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setDeletingData(false)
    }
  }

  const crmConsentGranted = useMemo(() => {
    const found = portalView?.consents?.find((c) => c.scope === 'crm_wa')
    return found ? Boolean(found.granted) : true
  }, [portalView?.consents])

  const mergedTriedFrames = useMemo(() => {
    const serverList = Array.isArray(portalView?.tried_frames) ? portalView.tried_frames : []
    const localList = getLocalTrackedEvents().filter((e) => e.event_type === 'frame_tried')
    const combined = [...localList, ...serverList]
    const seen = new Set()
    const deduped = []
    for (const ev of combined) {
      const skuKey = String(ev.payload?.frame_sku || ev.payload?.frame_name || ev.id).toUpperCase()
      if (seen.has(skuKey)) continue
      seen.add(skuKey)
      deduped.push(ev)
    }
    return deduped
  }, [portalView?.tried_frames])

  const waMasukUrl = `https://wa.me/${DEFAULT_OFFICIAL_WA}?text=${encodeURIComponent('MASUK')}`
  const waKeluarUrl = `https://wa.me/${DEFAULT_OFFICIAL_WA}?text=${encodeURIComponent('KELUAR')}`

  // Kartu Member menampilkan ukuran utama "Ukuran Saya"; fallback ke hasil ukur terakhir (member lama).
  const primaryMeas = portalView?.primary_measurement
  const latest = portalView?.latest_measurement
  const sizeCat = primaryMeas?.size_category || portalView?.primary_size_category || latest?.size_category || 'M'
  const widthMm = primaryMeas?.frame_width_mm || latest?.frame_width_mm || 138
  const bridgeMm = primaryMeas ? primaryMeas.bridge_mm : latest?.bridge_mm || 18
  const templeMm = primaryMeas ? primaryMeas.temple_mm : latest?.temple_mm || 142
  const measurements = portalView?.measurements || []

  return (
    <div className="dz-page">
      <AppHeader
        subtitle="Kartu Member Saya"
        actions={
          onBackToTryOn && (
            <button type="button" className="dz-header-link" onClick={onBackToTryOn}>
              Coba kacamata
            </button>
          )
        }
      />

      <main className="dz-page__body">
        <div className="dz-container dz-container--narrow dz-stack">
          {statusBanner && (
            <div className="dz-banner" role="status">
              <span>✓ {statusBanner}</span>
              <button type="button" onClick={() => setStatusBanner('')} aria-label="Tutup">
                ✕
              </button>
            </div>
          )}

          {errorBanner && (
            <div className="dz-alert" role="alert">
              {errorBanner}
            </div>
          )}

          {deletedSuccess && (
            <div className="dz-card">
              <h2 className="dz-subtitle">Data kamu sudah dihapus</h2>
              <p className="dz-muted" style={{ margin: '6px 0 14px' }}>
                Profil, ukuran frame, riwayat coba kacamata, dan semua sesi masuk kamu sudah dihapus permanen.
              </p>
              <button type="button" className="dz-btn dz-btn--outline" onClick={() => setDeletedSuccess(false)}>
                Tutup
              </button>
            </div>
          )}

          {/* 1. Link dari WhatsApp: konfirmasi dengan tombol (magic link ditukar lewat POST) */}
          {urlToken && !deletedSuccess && (
            <div className="dz-card">
              <CornerBrackets />
              <span className="dz-eyebrow">
                <DoozLogogram size={11} /> Link dari WhatsApp
              </span>
              <h1 className="dz-title" style={{ margin: '6px 0' }}>
                Buka Kartu Member Saya
              </h1>
              {magicChecking ? (
                <p className="dz-muted">Memeriksa link...</p>
              ) : magicPreview ? (
                <p className="dz-muted">
                  Kartu member atas nama <strong>{magicPreview.first_name_masked}</strong>.
                  {magicPreview.requires_name_confirm && ' Setelah dibuka, kamu akan diminta mengetik nama lengkap.'}
                </p>
              ) : null}
              <div className="dz-stack" style={{ marginTop: 16, gap: 10 }}>
                <button
                  type="button"
                  className="dz-btn dz-btn--orange dz-btn--lg dz-btn--block"
                  onClick={handleConfirmMagicExchange}
                  disabled={exchanging || magicChecking}
                >
                  {exchanging ? 'Membuka...' : 'Buka Kartu Member'}
                </button>
                <button
                  type="button"
                  className="dz-link dz-link--muted"
                  style={{ alignSelf: 'center' }}
                  onClick={() => {
                    stripTokenFromAddressBar()
                    setUrlToken('')
                    setMagicPreview(null)
                  }}
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {!urlToken && loadingPortal && <div className="dz-card dz-muted">Memuat Kartu Member...</div>}

          {/* 2. Belum masuk: minta link baru lewat WhatsApp */}
          {!urlToken && !portalView && !loadingPortal && !deletedSuccess && (
            <>
              <div className="dz-card">
                <CornerBrackets />
                <span className="dz-eyebrow">
                  <DoozLogogram size={11} /> Kartu Member Saya
                </span>
                <h1 className="dz-title" style={{ margin: '6px 0' }}>
                  Buka lewat WhatsApp
                </h1>
                <p className="dz-muted">
                  Link Kartu Member dikirim lewat WhatsApp setelah kamu menyimpan pilihan frame. Sudah pernah
                  menyimpan? Kirim pesan <strong>MASUK</strong> untuk menerima link baru.
                </p>
                <div className="dz-stack" style={{ marginTop: 16, gap: 10 }}>
                  <a
                    href={waMasukUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dz-btn dz-btn--wa dz-btn--lg dz-btn--block"
                  >
                    Minta link lewat WhatsApp
                  </a>
                  {onBackToTryOn && (
                    <button
                      type="button"
                      className="dz-link"
                      style={{ alignSelf: 'center' }}
                      onClick={onBackToTryOn}
                    >
                      Belum punya? Coba kacamata dulu
                    </button>
                  )}
                </div>
              </div>
              <p className="dz-small" style={{ textAlign: 'center' }}>
                HP hilang? Kirim{' '}
                <a href={waKeluarUrl} target="_blank" rel="noopener noreferrer" className="dz-link dz-link--muted">
                  KELUAR
                </a>{' '}
                dari nomor kamu untuk menutup Kartu Member di semua perangkat.
              </p>

              {SHOW_DEV_DEMO && (
                <div className="dz-card dz-card--plain">
                  <span className="dz-chip dz-chip--warning">Mode dev</span>
                  <p className="dz-muted" style={{ margin: '8px 0' }}>
                    Simulasi link WhatsApp (hanya tampil saat <code>npm run dev</code>).
                  </p>
                  <div className="dz-row">
                    <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={() => handleStartDemoFlow(false)}>
                      Member aktif
                    </button>
                    <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={() => handleStartDemoFlow(true)}>
                      Nomor lama &gt;6 bulan
                    </button>
                  </div>
                  <form
                    className="manual-token-row"
                    style={{ marginTop: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (manualTokenInput.trim()) setUrlToken(manualTokenInput.trim())
                    }}
                  >
                    <input
                      className="dz-input"
                      type="text"
                      placeholder="Token link"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                    />
                    <button type="submit" className="dz-btn dz-btn--outline dz-btn--sm">
                      Buka
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* 3. Nomor tidak aktif >6 bulan: tampil ringkas sampai nama lengkap dikonfirmasi */}
          {!urlToken && portalView && !deletedSuccess && portalView.requires_name_confirm && (
            <div className="dz-card">
              <CornerBrackets />
              <span className="dz-eyebrow">
                <DoozLogogram size={11} /> Kartu Member {portalView.member_code}
              </span>
              <h1 className="dz-title" style={{ margin: '6px 0' }}>
                Konfirmasi nama kamu
              </h1>
              <p className="dz-muted">
                Nomor ini lama tidak dipakai. Demi keamanan, ketik nama lengkap yang kamu daftarkan untuk membuka
                Kartu Member.
              </p>
              <div className="dz-kv">
                <div className="dz-kv__item">
                  <span>Nama</span>
                  <strong>{portalView.first_name_masked}</strong>
                </div>
                <div className="dz-kv__item">
                  <span>WhatsApp</span>
                  <strong>{portalView.phone_masked}</strong>
                </div>
              </div>
              <form onSubmit={handleConfirmRecycledSubmit} className="dz-form">
                <div className="dz-field">
                  <label htmlFor="confirm-registered-name">Nama lengkap</label>
                  <input
                    id="confirm-registered-name"
                    className="dz-input"
                    type="text"
                    autoComplete="name"
                    value={recycledNameInput}
                    onChange={(e) => setRecycledNameInput(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="dz-btn dz-btn--orange dz-btn--lg dz-btn--block"
                  disabled={confirmingRecycled}
                >
                  {confirmingRecycled ? 'Memeriksa...' : 'Buka Kartu Member'}
                </button>
                <p className="dz-small">Atau datang ke outlet DOOZ terdekat, kasir akan membantu.</p>
              </form>
              <div style={{ marginTop: 12 }}>
                <button type="button" className="dz-link dz-link--muted" onClick={handleRevokeAll}>
                  Keluar dari semua perangkat
                </button>
              </div>
            </div>
          )}

          {/* 4. Kartu Member lengkap */}
          {!urlToken && portalView && !deletedSuccess && !portalView.requires_name_confirm && (
            <>
              <section className="member-card" aria-label="Kartu Member DOOZ">
                <div className="member-card__top">
                  <div>
                    <DoozWordmark variant="reverse" height={22} clearSpace={false} />
                    <div className="member-card__code">{portalView.member_code}</div>
                    <div className="member-card__meta">
                      {portalView.full_name} · {portalView.phone_masked}
                    </div>
                    <div className="member-card__meta">
                      Ukuran utama: <strong>{sizeCat} · {widthMm} mm</strong>
                      {primaryMeas?.name ? ` (${primaryMeas.name})` : ''}
                    </div>
                  </div>
                  <span className="dz-chip dz-chip--orange">Member</span>
                </div>
                <div className="member-card__qr">
                  <DynamicQRMatrixSVG token={portalView.qr_token} />
                  <strong style={{ fontSize: 14 }}>Tunjukkan QR ini ke kasir DOOZ</strong>
                  <span className="member-card__timer">
                    QR diperbarui otomatis dalam {Math.floor(qrSecondsLeft / 60)}:
                    {String(qrSecondsLeft % 60).padStart(2, '0')} ·{' '}
                    <button type="button" className="dz-link dz-link--muted" onClick={handleRefreshQRToken}>
                      Perbarui sekarang
                    </button>
                  </span>
                </div>
              </section>

              <div className="dz-card">
                <span className="dz-eyebrow">{primaryMeas ? '⭐ Ukuran utama' : 'Ukuran frame saya'}</span>
                <div className="dz-size-row" style={{ margin: '10px 0 12px' }}>
                  <span className="dz-size-badge">{sizeCat}</span>
                  <div>
                    <div className="dz-size-row__mm">{widthMm} mm</div>
                    {primaryMeas?.name && <div className="dz-small"><strong>{primaryMeas.name}</strong></div>}
                    {(bridgeMm || templeMm) && (
                      <div className="dz-small">
                        {bridgeMm ? `Jembatan hidung ${bridgeMm} mm` : ''}
                        {bridgeMm && templeMm ? ' · ' : ''}
                        {templeMm ? `Gagang ${templeMm} mm` : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div className="dz-scale" aria-label="Panduan ukuran XS sampai XL">
                  {SIZE_CHART_DEFAULT.map((item) => (
                    <div key={item.category} className={`dz-scale__item ${sizeCat === item.category ? 'is-active' : ''}`}>
                      <strong>{item.category}</strong>
                      <span>
                        {item.min_mm}–{item.max_mm}
                      </span>
                    </div>
                  ))}
                </div>
                {(onApplyCustomerSizeFilter || onBackToTryOn) && (
                  <button
                    type="button"
                    className="dz-btn dz-btn--outline dz-btn--block"
                    style={{ marginTop: 14 }}
                    onClick={() => {
                      if (onApplyCustomerSizeFilter) {
                        onApplyCustomerSizeFilter({ sizeCategory: sizeCat, widthMm })
                      } else {
                        onBackToTryOn()
                      }
                    }}
                  >
                    Coba frame ukuran {sizeCat}
                  </button>
                )}
              </div>

              {measurements.length > 0 && (
                <div className="dz-card">
                  <h2 className="dz-subtitle" style={{ marginBottom: 4 }}>
                    Ukuran Saya ({measurements.length})
                  </h2>
                  <p className="dz-small" style={{ marginBottom: 10 }}>
                    Ukuran utama tampil di Kartu Member dan dilihat kasir. Tambah ukuran baru lewat App Ukur DOOZ.
                  </p>
                  <ul className="dz-list">
                    {measurements.map((m) => (
                      <li key={m.id} className="dz-list-item">
                        <div>
                          <strong>
                            {m.is_primary ? '⭐ ' : ''}
                            {m.name}
                          </strong>
                          <span className="item-sub">
                            {m.size_category} · {m.frame_width_mm} mm
                            {m.lens_mm && m.bridge_mm ? ` · ${m.lens_mm}□${m.bridge_mm}${m.temple_mm ? `-${m.temple_mm}` : ''}` : ''}
                            {' · '}
                            {MEASUREMENT_SOURCE_LABEL[m.source] || m.source}
                            {m.created_at ? ` · ${formatShortDate(m.created_at)}` : ''}
                          </span>
                          {m.comfort && <span className="item-sub">{COMFORT_LABEL[m.comfort] || m.comfort}</span>}
                          {m.note && <span className="item-sub">“{m.note}”</span>}
                        </div>
                        <div className="dz-row" style={{ gap: 6 }}>
                          {!m.is_primary && (
                            <button
                              type="button"
                              className="dz-btn dz-btn--outline dz-btn--sm"
                              disabled={measurementBusy === m.id}
                              onClick={() => handleSetPrimaryMeasurement(m.id)}
                            >
                              Jadikan utama
                            </button>
                          )}
                          <button
                            type="button"
                            className="dz-btn dz-btn--ghost dz-btn--sm"
                            disabled={measurementBusy === m.id}
                            onClick={() => handleDeleteMeasurement(m.id)}
                            aria-label={`Hapus ukuran ${m.name}`}
                          >
                            Hapus
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="dz-card">
                <h2 className="dz-subtitle" style={{ marginBottom: 10 }}>
                  Voucher saya
                </h2>
                {portalView.vouchers && portalView.vouchers.length > 0 ? (
                  <ul className="dz-list">
                    {portalView.vouchers.map((v) => (
                      <li key={v.id} className="dz-list-item">
                        <div>
                          <strong className="voucher-code">{v.payload?.voucher_code || 'VOUCHER MEMBER'}</strong>
                          <span className="item-sub">{v.payload?.notes || 'Tunjukkan Kartu Member di kasir DOOZ'}</span>
                        </div>
                        <span className="voucher-amount">
                          {v.payload?.amount_idr ? `Rp ${Number(v.payload.amount_idr).toLocaleString('id-ID')}` : 'Aktif'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="portal-empty">
                    Tunjukkan Kartu Member di kasir DOOZ untuk klaim voucher member baru.
                  </p>
                )}
              </div>

              <div className="dz-card">
                <h2 className="dz-subtitle" style={{ marginBottom: 10 }}>
                  Frame yang pernah saya coba
                </h2>
                {mergedTriedFrames.length > 0 ? (
                  <ul className="dz-list">
                    {mergedTriedFrames.map((ev) => (
                      <li key={ev.id} className="dz-list-item">
                        <div>
                          <strong>{ev.payload?.frame_name || ev.payload?.frame_sku || 'Frame DOOZ'}</strong>
                          <span className="item-sub">
                            {ev.payload?.frame_width_mm ? `${ev.payload.frame_width_mm} mm` : ''}
                            {ev.payload?.size_category ? ` · Ukuran ${ev.payload.size_category}` : ''}
                          </span>
                        </div>
                        {onSelectFrameFromHistory && (
                          <button
                            type="button"
                            className="dz-btn dz-btn--outline dz-btn--sm"
                            onClick={() => onSelectFrameFromHistory(ev.payload)}
                          >
                            Coba lagi
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="portal-empty">Belum ada frame yang dicoba.</p>
                )}
              </div>

              {portalView.store_visits && portalView.store_visits.length > 0 && (
                <div className="dz-card">
                  <h2 className="dz-subtitle" style={{ marginBottom: 10 }}>
                    Kunjungan ke outlet
                  </h2>
                  <ul className="dz-list">
                    {portalView.store_visits.map((visit) => (
                      <li key={visit.id} className="dz-list-item">
                        <div>
                          <strong>{visit.payload?.outlet_id || 'Outlet DOOZ'}</strong>
                          <span className="item-sub">{visit.payload?.notes || 'Kunjungan outlet'}</span>
                        </div>
                        <span className="item-date">
                          {visit.created_at
                            ? new Date(visit.created_at).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Privasi (UU PDP): promo WA, hapus data, keluar dari semua perangkat */}
              <div className="dz-card dz-card--plain">
                <h2 className="dz-subtitle" style={{ marginBottom: 4 }}>
                  Privasi & data
                </h2>
                <div className="dz-toggle-row">
                  <div>
                    <strong style={{ fontSize: 14 }}>Info promo lewat WhatsApp</strong>
                    <p>
                      Sekarang:{' '}
                      <span className={crmConsentGranted ? 'status-on' : 'status-off'}>
                        {crmConsentGranted ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dz-btn dz-btn--outline dz-btn--sm"
                    onClick={() => handleToggleConsent('crm_wa', crmConsentGranted)}
                  >
                    {crmConsentGranted ? 'Berhenti terima promo' : 'Aktifkan lagi'}
                  </button>
                </div>
                <div className="dz-toggle-row">
                  <div>
                    <strong style={{ fontSize: 14 }}>Keluar dari semua perangkat</strong>
                    <p>Tutup Kartu Member di semua HP yang pernah membukanya.</p>
                  </div>
                  <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={handleRevokeAll}>
                    Keluar
                  </button>
                </div>
                <div className="dz-toggle-row">
                  <div>
                    <strong style={{ fontSize: 14 }}>Hapus data saya</strong>
                    <p>Hapus profil, ukuran frame, dan riwayat kamu secara permanen.</p>
                  </div>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      className="dz-btn dz-btn--danger-outline dz-btn--sm"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Hapus data
                    </button>
                  ) : (
                    <div className="dz-row">
                      <button
                        type="button"
                        className="dz-btn dz-btn--danger dz-btn--sm"
                        onClick={handleConfirmDeleteData}
                        disabled={deletingData}
                      >
                        {deletingData ? 'Menghapus...' : 'Ya, hapus permanen'}
                      </button>
                      <button
                        type="button"
                        className="dz-btn dz-btn--ghost dz-btn--sm"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
