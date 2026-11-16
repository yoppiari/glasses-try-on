import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  SIZE_CHART_DEFAULT,
  DEFAULT_OFFICIAL_WA,
  getStoredPortalSession,
  setStoredPortalSession,
  clearStoredPortalSession,
  inspectMagicLink,
  exchangeMagicLink,
  fetchPortalMe,
  confirmRecycledName,
  revokeAllSessions,
  updatePortalConsent,
  requestPrivacyDeletion,
} from '../sdk/doozCapture'

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
      aria-label="Kartu Member QR Dinamis DOOZ"
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
              fill="#0a0a0a"
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
    return baseView
  }
  return {
    ...baseView,
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

export default function MemberPortal({ onBackToTryOn, onSelectFrameFromHistory }) {
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
            setErrorBanner(err.message)
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
      const view = await fetchPortalMe(tokenToUse)
      setPortalView(view)
    } catch (err) {
      clearStoredPortalSession()
      setPortalView(null)
      setErrorBanner(err.message)
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
        setStatusBanner('Sesi berhasil diaktifkan melalui konfirmasi tombol klik (POST).')
        return
      }

      const exchanged = await exchangeMagicLink(urlToken)
      stripTokenFromAddressBar()
      setUrlToken('')
      setMagicPreview(null)
      await loadPortalSession(exchanged.session_token)
      setStatusBanner('Sesi berhasil diaktifkan. Selamat datang di Portal Data Saya!')
    } catch (err) {
      setErrorBanner(err.message)
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
      setErrorBanner('Mohon ketik nama lengkap terdaftar Anda.')
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
            'Nama lengkap tidak cocok dengan profil terdaftar (Gunakan: Rina Kartika untuk simulasi).'
          )
        }
        const upgraded = { ...sess, session_token: 'demo-sess-full', access_scope: 'full', requires_name_confirm: false }
        setStoredPortalSession(upgraded)
        setPortalView(buildOfflineDemoView(false))
        setStatusBanner('Verifikasi nama lengkap berhasil! Profil penuh telah dibuka.')
        return
      }

      await confirmRecycledName(recycledNameInput.trim())
      await loadPortalSession()
      setStatusBanner('Verifikasi nama lengkap berhasil! Profil penuh Anda kini aktif.')
    } catch (err) {
      setErrorBanner(err.message)
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
      setStatusBanner('Token QR Dinamis berhasil diperbarui (rotasi otomatis 5 menit).')
      return
    }
    await loadPortalSession()
    setStatusBanner('Token QR Dinamis berhasil diperbarui.')
  }

  // Revoke all sessions ("Keluar dari Semua Perangkat")
  const handleRevokeAll = async () => {
    setErrorBanner('')
    try {
      const res = await revokeAllSessions()
      setPortalView(null)
      setUrlToken('')
      setStatusBanner(
        `Berhasil keluar dari semua perangkat (${res?.revoked_sessions ?? 1} sesi dicabut).`
      )
    } catch (err) {
      setPortalView(null)
      setStatusBanner('Seluruh sesi pada perangkat ini telah dihapus.')
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
      setStatusBanner(
        nextGranted
          ? `Persetujuan (${scope}) berhasil diaktifkan.`
          : `Anda berhasil opt-out / mencabut persetujuan (${scope}) sesuai hak UU PDP.`
      )
      return
    }

    try {
      await updatePortalConsent(scope, nextGranted)
      await loadPortalSession()
      setStatusBanner(
        nextGranted
          ? `Persetujuan (${scope}) berhasil diaktifkan kembali.`
          : `Berhasil berhenti berlangganan / mencabut persetujuan (${scope}).`
      )
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

  const waMasukUrl = `https://wa.me/${DEFAULT_OFFICIAL_WA}?text=${encodeURIComponent('MASUK')}`
  const waKeluarUrl = `https://wa.me/${DEFAULT_OFFICIAL_WA}?text=${encodeURIComponent('KELUAR')}`

  return (
    <div className="dooz-portal-wrapper">
      <div className="dooz-portal-container">
        {/* Top bar */}
        <div className="dooz-portal-topbar">
          <div>
            <span className="dooz-chip">🔒 Tanpa Password • Referrer-Policy: no-referrer</span>
            <h1 className="dooz-portal-title">Portal Member — Data Saya</h1>
          </div>
          {onBackToTryOn && (
            <button type="button" className="dooz-btn-outline" onClick={onBackToTryOn}>
              👓 Kembali ke Virtual Try-On
            </button>
          )}
        </div>

        {statusBanner && (
          <div className="dooz-status-banner">
            <span>✓ {statusBanner}</span>
            <button type="button" onClick={() => setStatusBanner('')}>✕</button>
          </div>
        )}

        {errorBanner && (
          <div className="dooz-error-alert">
            <span>⚠ {errorBanner}</span>
          </div>
        )}

        {deletedSuccess && (
          <div className="dooz-card dooz-deleted-card">
            <h2>🗑️ Permohonan Hapus Data Pribadi Selesai (UU PDP)</h2>
            <p>
              Seluruh profil kontak, riwayat ukuran frame, riwayat try-on, dan sesi aktif Anda telah dihapus secara permanen dari DOOZ Customer Hub.
            </p>
            <button
              type="button"
              className="dooz-btn-primary"
              onClick={() => setDeletedSuccess(false)}
            >
              Kembali ke Halaman Masuk
            </button>
          </div>
        )}

        {/* STATE 1: Magic Link Confirmation Screen (`POST /api/auth/magic-exchange`) */}
        {urlToken && !deletedSuccess && (
          <div className="dooz-card dooz-magic-confirm-card">
            <div className="magic-shield-icon">🔐</div>
            <h2>Konfirmasi Akses Masuk "Data Saya"</h2>
            <p className="magic-desc">
              Demi keamanan akun Anda dari bot <em>link preview</em> WhatsApp, tautan sekali pakai ini hanya ditukar setelah Anda menekan tombol konfirmasi di bawah.
            </p>

            {magicChecking ? (
              <div className="dooz-loading-box">Memeriksa keaslian tautan...</div>
            ) : magicPreview ? (
              <div className="magic-preview-summary">
                <div className="magic-row">
                  <span>ID Member:</span>
                  <strong>{magicPreview.member_code}</strong>
                </div>
                <div className="magic-row">
                  <span>Nama Terdaftar:</span>
                  <strong>{magicPreview.first_name_masked}</strong>
                </div>
                {magicPreview.requires_name_confirm && (
                  <div className="magic-recycled-badge">
                    ⚠ Akun pasif &gt; 6 bulan: Konfirmasi nama lengkap diperlukan setelah masuk
                  </div>
                )}
              </div>
            ) : null}

            <div className="magic-confirm-actions">
              <button
                type="button"
                className="dooz-btn-primary dooz-btn-large"
                onClick={handleConfirmMagicExchange}
                disabled={exchanging}
              >
                {exchanging ? 'Mengaktifkan Sesi...' : '🔓 Buka Data Saya Sekarang (POST)'}
              </button>
              <button
                type="button"
                className="dooz-btn-secondary"
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

        {/* STATE 2: Unauthenticated / Passwordless Login Landing */}
        {!urlToken && !portalView && !loadingPortal && !deletedSuccess && (
          <div className="dooz-portal-login-grid">
            <div className="dooz-card">
              <h2>💬 Masuk Tanpa Password via WhatsApp</h2>
              <p className="portal-muted">
                DOOZ tidak menggunakan password atau OTP yang rawan penipuan. Cukup kirim kata kunci{' '}
                <strong>MASUK</strong> atau <strong>DATA</strong> dari nomor WhatsApp terdaftar Anda untuk menerima tautan masuk sekali pakai (berlaku 15 menit).
              </p>

              <div className="portal-wa-actions">
                <a
                  href={waMasukUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dooz-wa-cta-button"
                >
                  💬 Ketik "MASUK" ke WA Resmi DOOZ
                </a>
                <a
                  href={waKeluarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dooz-btn-outline"
                >
                  🛑 Darurat: Ketik "KELUAR" via WA
                </a>
              </div>

              <form
                className="portal-manual-token-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (manualTokenInput.trim()) {
                    setUrlToken(manualTokenInput.trim())
                  }
                }}
              >
                <label htmlFor="manual-magic-token">Sudah punya Token Magic Link?</label>
                <div className="manual-token-row">
                  <input
                    id="manual-magic-token"
                    type="text"
                    placeholder="Tempel token magic link di sini..."
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                  />
                  <button type="submit" className="dooz-btn-primary">
                    Verifikasi Token
                  </button>
                </div>
              </form>
            </div>

            <div className="dooz-card dooz-demo-sandbox-card">
              <span className="dooz-chip">🧪 Mode Uji & Validasi Cepat</span>
              <h3>Simulasi Alur Magic Link & Nomor Daur Ulang</h3>
              <p className="portal-muted">
                Gunakan tombol di bawah untuk membuat token <em>magic link</em> uji coba di Customer Hub lalu menguji halaman konfirmasi tombol klik (<code>POST /api/auth/magic-exchange</code>):
              </p>
              <div className="demo-btn-stack">
                <button
                  type="button"
                  className="dooz-btn-primary"
                  onClick={() => handleStartDemoFlow(false)}
                >
                  ⚡ Simulasi Magic Link — Member Aktif (Profil Penuh)
                </button>
                <button
                  type="button"
                  className="dooz-btn-outline"
                  onClick={() => handleStartDemoFlow(true)}
                >
                  🛡️ Simulasi Nomor WA Daur Ulang (&gt;6 Bulan Pasif)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3 & 4: Authenticated Member Portal View */}
        {!urlToken && portalView && !deletedSuccess && (
          <div className="dooz-portal-dashboard">
            {/* Recycled Number (>6 months passive) Protection Gate */}
            {portalView.requires_name_confirm ? (
              <div className="dooz-card dooz-recycled-gate-card">
                <div className="recycled-header">
                  <span className="dooz-chip warning">🛡️ Proteksi Nomor Daur Ulang (&gt;6 Bulan Pasif)</span>
                  <h2>Ringkasan Dasar Member {portalView.member_code}</h2>
                  <p>
                    Akun ini tercatat tidak aktif lebih dari 6 bulan. Untuk mencegah pemilik baru nomor seluler daur ulang mengakses riwayat pribadi, kami hanya menampilkan ringkasan dasar.
                  </p>
                </div>

                <div className="recycled-basic-summary">
                  <div className="basic-item">
                    <span>ID Member</span>
                    <strong>{portalView.member_code}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Inisial Nama</span>
                    <strong>{portalView.first_name_masked}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Nomor WA Tersamar</span>
                    <strong>{portalView.phone_masked}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Ukuran Frame Dasar</span>
                    <strong>
                      {portalView.latest_measurement
                        ? `${portalView.latest_measurement.frame_width_mm} mm · Size ${portalView.latest_measurement.size_category}`
                        : 'Belum ada data'}
                    </strong>
                  </div>
                </div>

                <form onSubmit={handleConfirmRecycledSubmit} className="recycled-confirm-form">
                  <label htmlFor="confirm-registered-name">
                    Konfirmasi Nama Lengkap Terdaftar untuk Membuka Profil Penuh:
                  </label>
                  <div className="manual-token-row">
                    <input
                      id="confirm-registered-name"
                      type="text"
                      placeholder="Ketik nama lengkap saat mendaftar (contoh: Rina Kartika)"
                      value={recycledNameInput}
                      onChange={(e) => setRecycledNameInput(e.target.value)}
                      required
                    />
                    <button type="submit" className="dooz-btn-primary" disabled={confirmingRecycled}>
                      {confirmingRecycled ? 'Memverifikasi...' : 'Buka Profil Penuh'}
                    </button>
                  </div>
                  <small className="portal-muted">
                    Atau kunjungi outlet DOOZ terdekat untuk verifikasi ulang secara langsung di kasir.
                  </small>
                </form>

                <div className="recycled-footer">
                  <button type="button" className="dooz-btn-danger-outline" onClick={handleRevokeAll}>
                    🚪 Keluar dari Semua Perangkat
                  </button>
                </div>
              </div>
            ) : (
              /* FULL PROFILE VIEW */
              <>
                <div className="dooz-portal-top-grid">
                  {/* Dynamic Member QR Card */}
                  <div className="dooz-card dooz-member-qr-card">
                    <div className="qr-card-header">
                      <div>
                        <span className="qr-brand-tag">KARTU MEMBER DIGITAL DOOZ</span>
                        <h2 className="qr-member-code">{portalView.member_code}</h2>
                        <p className="qr-member-meta">
                          {portalView.full_name} • {portalView.phone_masked}
                        </p>
                        {portalView.city_regency && (
                          <span className="qr-city-pill">📍 {portalView.city_regency}</span>
                        )}
                      </div>
                      <span className="qr-verified-badge">✓ WA Verified</span>
                    </div>

                    <div className="qr-visual-section">
                      <div className="qr-svg-frame">
                        <DynamicQRMatrixSVG token={portalView.qr_token} />
                      </div>
                      <div className="qr-token-details">
                        <span className="qr-security-label">
                          🔒 Signed Rotating Token (Kasir Level 2)
                        </span>
                        <p className="qr-security-note">
                          Tunjukkan QR ini ke staf kasir outlet DOOZ untuk membuka profil penuh, klaim voucher, dan riwayat ukuran. Kode <code>{portalView.member_code}</code> hanya untuk label tampilan.
                        </p>
                        <div className="qr-timer-row">
                          <span>Berotasi otomatis dalam:</span>
                          <strong>
                            {Math.floor(qrSecondsLeft / 60)}:
                            {String(qrSecondsLeft % 60).padStart(2, '0')}
                          </strong>
                        </div>
                        <div className="qr-token-preview" title={portalView.qr_token}>
                          <code>{portalView.qr_token ? `${portalView.qr_token.slice(0, 28)}...` : 'DQR1...'}</code>
                        </div>
                        <button
                          type="button"
                          className="dooz-btn-secondary qr-refresh-btn"
                          onClick={handleRefreshQRToken}
                        >
                          🔄 Perbarui QR Token Sekarang
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Frame Size Summary (`mm` & Category XS-XL) */}
                  <div className="dooz-card dooz-size-summary-card">
                    <div className="card-title-row">
                      <h3>📏 Ukuran Frame Saya</h3>
                      <span className="size-badge-large">
                        Kategori {portalView.latest_measurement?.size_category || 'M'}
                      </span>
                    </div>

                    <div className="size-metrics-row">
                      <div className="size-metric-box">
                        <span>Lebar Frame / Wajah</span>
                        <strong>
                          {portalView.latest_measurement?.frame_width_mm
                            ? `${portalView.latest_measurement.frame_width_mm} mm`
                            : '138 mm'}
                        </strong>
                      </div>
                      <div className="size-metric-box">
                        <span>Bridge (Jembatan Hidung)</span>
                        <strong>
                          {portalView.latest_measurement?.bridge_mm
                            ? `${portalView.latest_measurement.bridge_mm} mm`
                            : '18 mm'}
                        </strong>
                      </div>
                      <div className="size-metric-box">
                        <span>Temple (Panjang Tangkai)</span>
                        <strong>
                          {portalView.latest_measurement?.temple_mm
                            ? `${portalView.latest_measurement.temple_mm} mm`
                            : '142 mm'}
                        </strong>
                      </div>
                    </div>

                    <div className="size-scale-table">
                      <span className="scale-caption">Panduan Standar Ukuran Katalog DOOZ (XS–XL):</span>
                      <div className="scale-pills">
                        {SIZE_CHART_DEFAULT.map((item) => {
                          const isCurrent =
                            (portalView.latest_measurement?.size_category || 'M') === item.category
                          return (
                            <div
                              key={item.category}
                              className={`scale-pill ${isCurrent ? 'active' : ''}`}
                            >
                              <strong>{item.category}</strong>
                              <span>
                                {item.min_mm}–{item.max_mm} mm
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle Grid: Tried Frames History, Active Vouchers, Outlet Visits */}
                <div className="dooz-portal-middle-grid">
                  {/* Tried Frames History */}
                  <div className="dooz-card">
                    <h3>👓 Riwayat Frame yang Dicoba (Try-On & Outlet)</h3>
                    {portalView.tried_frames && portalView.tried_frames.length > 0 ? (
                      <ul className="portal-item-list">
                        {portalView.tried_frames.map((ev) => (
                          <li key={ev.id} className="portal-item">
                            <div>
                              <strong>{ev.payload?.frame_name || ev.payload?.frame_sku || 'Frame DOOZ'}</strong>
                              <span className="item-sub">
                                SKU: {ev.payload?.frame_sku || '-'} •{' '}
                                {ev.payload?.frame_width_mm ? `${ev.payload.frame_width_mm} mm` : ''}{' '}
                                {ev.payload?.size_category ? `(${ev.payload.size_category})` : ''} • Kanal:{' '}
                                {ev.src || 'tryon'}
                              </span>
                            </div>
                            {onSelectFrameFromHistory && (
                              <button
                                type="button"
                                className="dooz-btn-outline btn-sm"
                                onClick={() => onSelectFrameFromHistory(ev.payload)}
                              >
                                Coba Lagi →
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="portal-empty">Belum ada riwayat frame yang dicoba.</p>
                    )}
                  </div>

                  {/* Active Vouchers */}
                  <div className="dooz-card">
                    <h3>🎟️ Voucher Aktif Saya</h3>
                    {portalView.vouchers && portalView.vouchers.length > 0 ? (
                      <ul className="portal-item-list">
                        {portalView.vouchers.map((v) => (
                          <li key={v.id} className="portal-item voucher-item">
                            <div>
                              <strong className="voucher-code">
                                {v.payload?.voucher_code || 'DOOZ-MEMBER-VOUCHER'}
                              </strong>
                              <span className="item-sub">
                                {v.payload?.notes || 'Tunjukkan Kartu Member QR Dinamis di Kasir Outlet DOOZ'}
                              </span>
                            </div>
                            {v.payload?.amount_idr ? (
                              <span className="voucher-amount">
                                Rp {Number(v.payload.amount_idr).toLocaleString('id-ID')}
                              </span>
                            ) : (
                              <span className="voucher-amount">Aktif</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="voucher-default-card">
                        <strong>MEMBER-WELCOME-50K</strong>
                        <p>Tunjukkan QR Member Dinamis Anda di kasir outlet DOOZ untuk klaim voucher member baru.</p>
                      </div>
                    )}
                  </div>

                  {/* Store Visits History */}
                  <div className="dooz-card">
                    <h3>🏪 Riwayat Kunjungan Outlet DOOZ</h3>
                    {portalView.store_visits && portalView.store_visits.length > 0 ? (
                      <ul className="portal-item-list">
                        {portalView.store_visits.map((visit) => (
                          <li key={visit.id} className="portal-item">
                            <div>
                              <strong>{visit.payload?.outlet_id || 'Outlet DOOZ Optik'}</strong>
                              <span className="item-sub">
                                {visit.payload?.notes || 'Kunjungan & konsultasi optik'}
                              </span>
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
                    ) : (
                      <p className="portal-empty">Belum ada catatan kunjungan cabang.</p>
                    )}
                  </div>
                </div>

                {/* Bottom Card: Session Security & UU PDP Privacy Controls */}
                <div className="dooz-card dooz-privacy-card">
                  <div className="privacy-header">
                    <div>
                      <span className="dooz-chip">⚖️ Kepatuhan UU PDP & Keamanan Sesi</span>
                      <h3>Kendali Privasi Mandiri & Perangkat Aktif</h3>
                    </div>
                    <button
                      type="button"
                      className="dooz-btn-danger-outline"
                      onClick={handleRevokeAll}
                    >
                      🚪 Keluar dari Semua Perangkat
                    </button>
                  </div>

                  <div className="privacy-controls-grid">
                    <div className="privacy-control-box">
                      <div>
                        <strong>Persetujuan Pesan Promo & Info Voucher WhatsApp (`crm_wa`)</strong>
                        <p>
                          Status saat ini:{' '}
                          <span className={crmConsentGranted ? 'status-on' : 'status-off'}>
                            {crmConsentGranted ? 'Aktif (Disetujui)' : 'Nonaktif (Opt-Out)'}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        className="dooz-btn-secondary"
                        onClick={() => handleToggleConsent('crm_wa', crmConsentGranted)}
                      >
                        {crmConsentGranted
                          ? '🔕 Berhenti Terima Promo (Opt-Out)'
                          : '🔔 Aktifkan Kembali Promo WA'}
                      </button>
                    </div>

                    <div className="privacy-control-box">
                      <div>
                        <strong>Hak Penghapusan Data Pribadi (UU PDP)</strong>
                        <p>
                          Anda berhak mengajukan penghapusan seluruh data profil, ukuran frame, dan riwayat try-on kapan saja. Data tidak aktif &gt;24 bulan tanpa transaksi juga dihapus otomatis.
                        </p>
                      </div>
                      {!showDeleteConfirm ? (
                        <button
                          type="button"
                          className="dooz-btn-danger-outline"
                          onClick={() => setShowDeleteConfirm(true)}
                        >
                          🗑️ Ajukan Hapus Data Saya
                        </button>
                      ) : (
                        <div className="delete-confirm-inline">
                          <span>Yakin hapus permanen seluruh data & cabut semua sesi?</span>
                          <div className="delete-confirm-btns">
                            <button
                              type="button"
                              className="dooz-btn-danger"
                              onClick={handleConfirmDeleteData}
                              disabled={deletingData}
                            >
                              {deletingData ? 'Menghapus...' : 'Ya, Hapus Permanen'}
                            </button>
                            <button
                              type="button"
                              className="dooz-btn-secondary"
                              onClick={() => setShowDeleteConfirm(false)}
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
