import { useState, useMemo } from 'react'
import {
  INDONESIA_CITIES,
  CATALOG_FRAMES_DEFAULT,
  normalizePhone,
  mapWidthToSizeCategory,
  kasirLookupPhone,
  kasirScanQR,
  kasirLevel2Action,
  kasirCreateWalkIn,
  kasirFetchDemoMemberQR,
} from '../sdk/doozCapture'

const OUTLET_LIST = [
  { id: 'outlet-solo-gading', label: 'DOOZ Optik Gading — Kota Surakarta (Solo)' },
  { id: 'outlet-sukoharjo', label: 'DOOZ Optik Sukoharjo' },
  { id: 'outlet-jogja-sleman', label: 'DOOZ Optik Sleman — Yogyakarta' },
]

function WalkInQRMatrixSVG({ url = 'https://wa.me/6281122334455' }) {
  const size = 21
  const cells = useMemo(() => {
    const grid = Array.from({ length: size }, () => Array(size).fill(false))
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

    let hash = 2166136261
    const str = String(url || 'wa.me')
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)) continue
        const ch = str.charCodeAt((r * size + c) % str.length)
        grid[r][c] = (((hash ^ (ch * (r + 3) * (c + 7))) >>> ((r + c) % 16)) & 1) === 1
      }
    }
    return grid
  }, [url])

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="160" height="160" className="dooz-qr-svg" role="img" aria-label="QR Code Verifikasi Walk-In Kasir">
      <rect width={size} height={size} fill="#ffffff" rx="1.2" />
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={0.92} height={0.92} fill="#0a0a0a" rx="0.15" /> : null
        )
      )}
    </svg>
  )
}

export default function KasirOutletPanel({ onBack }) {
  const [activeTab, setActiveTab] = useState('level1') // 'level1' | 'level2' | 'walkin'
  const [staffUserId, setStaffUserId] = useState('kasir-gading-01')
  const [staffOutletId, setStaffOutletId] = useState(OUTLET_LIST[0].id)

  const staffContext = useMemo(
    () => ({
      userId: staffUserId || 'kasir-gading-01',
      role: 'kasir',
      outletId: staffOutletId || 'outlet-solo-gading',
    }),
    [staffUserId, staffOutletId]
  )

  const [statusBanner, setStatusBanner] = useState('')
  const [errorBanner, setErrorBanner] = useState('')

  // Level 1 state (Lookup by FULL WA phone only)
  const [lookupPhoneInput, setLookupPhoneInput] = useState('')
  const [loadingLevel1, setLoadingLevel1] = useState(false)
  const [level1Result, setLevel1Result] = useState(null)

  // Level 2 state (Scan rotating signed QR token from customer HP)
  const [qrTokenInput, setQrTokenInput] = useState('')
  const [loadingLevel2, setLoadingLevel2] = useState(false)
  const [level2Result, setLevel2Result] = useState(null)
  const [level2ActionNotes, setLevel2ActionNotes] = useState('')
  const [level2VoucherCode, setLevel2VoucherCode] = useState('MEMBER-OUTLET-50K')
  const [level2TriedSku, setLevel2TriedSku] = useState(CATALOG_FRAMES_DEFAULT[0].sku)
  const [submittingAction, setSubmittingAction] = useState(false)

  // Walk-In state (QR wa.me verified vs Manual unverified)
  const [walkInMode, setWalkInMode] = useState('qr_wa') // 'qr_wa' | 'manual'
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInCity, setWalkInCity] = useState('Kota Surakarta (Solo)')
  const [walkInWidthMm, setWalkInWidthMm] = useState(138)
  const [walkInSku, setWalkInSku] = useState(CATALOG_FRAMES_DEFAULT[0].sku)
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false)
  const [walkInResult, setWalkInResult] = useState(null)

  const handleLoadDemoCustomer = async () => {
    setErrorBanner('')
    setStatusBanner('')
    try {
      const demo = await kasirFetchDemoMemberQR(staffContext)
      setLookupPhoneInput(demo.phone || '081299887766')
      setQrTokenInput(demo.qr_token || '')
      setStatusBanner(
        `Data member uji (${demo.member_code} • ${demo.phone}) siap! Anda dapat langsung menguji Cari Level 1 maupun Scan QR Level 2.`
      )
    } catch (err) {
      setErrorBanner(err.message)
    }
  }

  const handleLookupLevel1 = async (e) => {
    e.preventDefault()
    setErrorBanner('')
    setStatusBanner('')

    // Reject partial name search explicitly per PRD
    if (/[a-zA-Z]/.test(lookupPhoneInput.trim())) {
      setErrorBanner(
        'Pencarian nama sebagian diblokir (Anti-Insider Threat). Kasir Level 1 wajib mengetik Nomor WhatsApp Lengkap (contoh: 081299887766).'
      )
      return
    }
    const check = normalizePhone(lookupPhoneInput)
    if (!check.valid) {
      setErrorBanner(check.error)
      return
    }

    setLoadingLevel1(true)
    try {
      const res = await kasirLookupPhone(lookupPhoneInput, staffContext)
      setLevel1Result(res)
      setStatusBanner(
        `Lookup Level 1 berhasil dicatat ke Audit Log (${staffContext.userId} @ ${staffContext.outletId}).`
      )
    } catch (err) {
      setLevel1Result(null)
      setErrorBanner(err.message)
    } finally {
      setLoadingLevel1(false)
    }
  }

  const handleScanQRLevel2 = async (e) => {
    if (e) e.preventDefault()
    setErrorBanner('')
    setStatusBanner('')
    if (!qrTokenInput.trim()) {
      setErrorBanner('Silakan pindai atau tempel Token QR Dinamis dari HP pelanggan terlebih dahulu.')
      return
    }

    setLoadingLevel2(true)
    try {
      const res = await kasirScanQR(qrTokenInput.trim(), staffContext)
      setLevel2Result(res)
      setStatusBanner(
        `Akses Level 2 (Penuh) terbuka untuk ${res.contact?.member_code} dan tercatat di Audit Log.`
      )
    } catch (err) {
      setLevel2Result(null)
      setErrorBanner(err.message)
    } finally {
      setLoadingLevel2(false)
    }
  }

  const handleRecordLevel2Action = async (eventType) => {
    if (!qrTokenInput.trim()) return
    setSubmittingAction(true)
    setErrorBanner('')
    setStatusBanner('')
    try {
      let payload = {
        outlet_id: staffOutletId,
        notes: level2ActionNotes.trim() || 'Layanan konsultasi & fitting di kasir outlet',
      }
      if (eventType === 'voucher_claimed') {
        payload = {
          outlet_id: staffOutletId,
          voucher_code: level2VoucherCode.trim() || 'MEMBER-OUTLET-50K',
          amount_idr: 50000,
          notes: level2ActionNotes.trim() || 'Klaim voucher member di kasir outlet',
        }
      } else if (eventType === 'frame_tried') {
        const frameObj = CATALOG_FRAMES_DEFAULT.find((f) => f.sku === level2TriedSku) || CATALOG_FRAMES_DEFAULT[0]
        payload = {
          outlet_id: staffOutletId,
          frame_sku: frameObj.sku,
          frame_name: frameObj.name,
          frame_width_mm: frameObj.frame_width_mm,
          size_category: frameObj.size_category,
          notes: 'Dicoba langsung di etalase outlet',
        }
      }

      const res = await kasirLevel2Action(qrTokenInput.trim(), eventType, payload, staffContext)
      if (res.profile) {
        setLevel2Result(res.profile)
      }
      setLevel2ActionNotes('')
      setStatusBanner(`Aksi Level 2 (${eventType}) berhasil disimpan ke profil member & Audit Log.`)
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleWalkInSubmit = async (e) => {
    e.preventDefault()
    setErrorBanner('')
    setStatusBanner('')
    if (!walkInName.trim() || walkInName.trim().length < 2) {
      setErrorBanner('Nama lengkap pelanggan wajib diisi.')
      return
    }
    const check = normalizePhone(walkInPhone)
    if (!check.valid) {
      setErrorBanner(check.error)
      return
    }

    setSubmittingWalkIn(true)
    try {
      const sizeCat = mapWidthToSizeCategory(walkInWidthMm)
      const frameObj = CATALOG_FRAMES_DEFAULT.find((f) => f.sku === walkInSku) || CATALOG_FRAMES_DEFAULT[0]
      const res = await kasirCreateWalkIn(
        {
          mode: walkInMode,
          full_name: walkInName.trim(),
          phone: check.normalized,
          city_regency: walkInCity,
          payload: {
            outlet_id: staffOutletId,
            frame_width_mm: Number(walkInWidthMm) || 138,
            size_category: sizeCat,
            frame_sku: frameObj.sku,
            frame_name: frameObj.name,
            sku_list: [frameObj.sku],
          },
        },
        staffContext
      )
      setWalkInResult(res)
      if (res.mode === 'manual') {
        setStatusBanner(
          'Data Walk-In Manual tersimpan dengan status UNVERIFIED. Customer Hub TIDAK mengirim pesan WA keluar otomatis (Anti-Blokir Fonnte).'
        )
      } else {
        setStatusBanner(
          `QR Code Verifikasi Walk-In (${res.verification_code}) siap dipindai pelanggan!`
        )
      }
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setSubmittingWalkIn(false)
    }
  }

  return (
    <div className="dooz-portal-wrapper">
      <div className="dooz-portal-container">
        <div className="dooz-portal-topbar">
          <div>
            <span className="dooz-chip">🏪 Operasional Outlet DOOZ • 2 Level Akses Kasir & Audit Log</span>
            <h1 className="dooz-portal-title">Mode Kasir Outlet (Online ↔ Offline)</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="dooz-btn-secondary" onClick={handleLoadDemoCustomer}>
              ⚡ Muat Data Member & QR Uji
            </button>
            {onBack && (
              <button type="button" className="dooz-btn-outline" onClick={onBack}>
                ← Kembali ke Try-On
              </button>
            )}
          </div>
        </div>

        {/* Staff Context Bar */}
        <div className="dooz-card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                ID Staf Kasir (Tercatat di Audit Log):
              </label>
              <input
                type="text"
                value={staffUserId}
                onChange={(e) => setStaffUserId(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <select
                value={staffOutletId}
                onChange={(e) => setStaffOutletId(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                {OUTLET_LIST.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="dooz-chip">Role: KASIR (Export CSV Massal Diblokir)</span>
          </div>
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

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={activeTab === 'level1' ? 'dooz-btn-primary' : 'dooz-btn-secondary'}
            onClick={() => setActiveTab('level1')}
          >
            🔎 Level 1: Cari Nomor WA Lengkap (Data Dasar & Tersamar)
          </button>
          <button
            type="button"
            className={activeTab === 'level2' ? 'dooz-btn-primary' : 'dooz-btn-secondary'}
            onClick={() => setActiveTab('level2')}
          >
            📲 Level 2: Scan QR Dinamis Customer (Profil Penuh & Klaim Voucher)
          </button>
          <button
            type="button"
            className={activeTab === 'walkin' ? 'dooz-btn-primary' : 'dooz-btn-secondary'}
            onClick={() => setActiveTab('walkin')}
          >
            🚶 Walk-In Baru di Outlet (QR wa.me vs Input Manual)
          </button>
        </div>

        {/* TAB 1: LEVEL 1 LOOKUP */}
        {activeTab === 'level1' && (
          <div className="dooz-card">
            <h2>🔎 Akses Kasir Level 1 — Ketik Nomor WhatsApp Lengkap</h2>
            <p className="portal-muted" style={{ marginBottom: '14px' }}>
              Sesuai matriks hak akses PRD, staf kasir hanya dapat mencari dengan <strong>Nomor WA Lengkap</strong> (tidak bisa mencari nama sebagian). Hanya menampilkan inisial nama, nomor WA tersamar, ukuran frame, dan 3 frame terakhir yang dicoba.
            </p>

            <form onSubmit={handleLookupLevel1} className="manual-token-row" style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Ketik Nomor WA Lengkap (contoh: 081299887766)"
                value={lookupPhoneInput}
                onChange={(e) => setLookupPhoneInput(e.target.value)}
                required
              />
              <button type="submit" className="dooz-btn-primary" disabled={loadingLevel1}>
                {loadingLevel1 ? 'Mencari...' : 'Cari Member (Level 1)'}
              </button>
            </form>

            {level1Result && (
              <div className="recycled-gate-card" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span className="dooz-chip">LEVEL 1 — DATA DASAR & TERSAMAR</span>
                    <h3 style={{ marginTop: '4px' }}>{level1Result.first_name_initial} • {level1Result.member_code}</h3>
                  </div>
                  <button
                    type="button"
                    className="dooz-btn-primary"
                    onClick={() => setActiveTab('level2')}
                  >
                    🔓 Buka Level 2 (Scan QR Customer) →
                  </button>
                </div>

                <div className="recycled-basic-summary">
                  <div className="basic-item">
                    <span>Nama Depan / Inisial</span>
                    <strong>{level1Result.first_name_initial}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Nomor WA Tersamar</span>
                    <strong>{level1Result.phone_masked}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Ukuran Frame Pelanggan</span>
                    <strong>
                      {level1Result.latest_measurement
                        ? `${level1Result.latest_measurement.frame_width_mm} mm · Size ${level1Result.latest_measurement.size_category}`
                        : 'Belum diukur'}
                    </strong>
                  </div>
                  <div className="basic-item">
                    <span>Data yang Diblokir di Level 1</span>
                    <strong style={{ color: '#f87171', fontSize: '0.78rem' }}>
                      🔒 Kota Detail, Klaim Voucher, Riwayat Kunjungan & Resep
                    </strong>
                  </div>
                </div>

                <h4 style={{ marginTop: '14px', marginBottom: '8px', fontSize: '0.9rem' }}>
                  👓 Maksimal 3 Frame Terakhir yang Dicoba Pelanggan:
                </h4>
                {level1Result.recent_tried_frames && level1Result.recent_tried_frames.length > 0 ? (
                  <ul className="portal-item-list">
                    {level1Result.recent_tried_frames.map((ev) => (
                      <li key={ev.id} className="portal-item">
                        <div>
                          <strong>{ev.payload?.frame_name || ev.payload?.frame_sku}</strong>
                          <span className="item-sub">
                            SKU: {ev.payload?.frame_sku} • {ev.payload?.frame_width_mm} mm (Size {ev.payload?.size_category})
                          </span>
                        </div>
                        <span className="dooz-chip">{ev.src || 'tryon'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="portal-empty">Belum ada riwayat frame yang dicoba.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LEVEL 2 QR SCAN */}
        {activeTab === 'level2' && (
          <div className="dooz-card">
            <h2>📲 Akses Kasir Level 2 — Scan QR Dinamis dari HP Customer</h2>
            <p className="portal-muted" style={{ marginBottom: '14px' }}>
              Minta pelanggan membuka <strong>Portal "Data Saya"</strong> di HP mereka lalu pindai <strong>Kartu Member QR Dinamis (`DQR1...`)</strong> untuk membuka profil penuh, klaim voucher, dan mencatat kunjungan toko.
            </p>

            <form onSubmit={handleScanQRLevel2} className="manual-token-row" style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Hasil Scan QR Token Dinamis (contoh: DQR1...)"
                value={qrTokenInput}
                onChange={(e) => setQrTokenInput(e.target.value)}
                required
              />
              <button type="submit" className="dooz-btn-primary" disabled={loadingLevel2}>
                {loadingLevel2 ? 'Memverifikasi QR...' : 'Verifikasi QR Level 2'}
              </button>
            </form>

            {level2Result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="recycled-basic-summary">
                  <div className="basic-item">
                    <span>Nama Lengkap & ID Member</span>
                    <strong>{level2Result.contact?.full_name} ({level2Result.contact?.member_code})</strong>
                  </div>
                  <div className="basic-item">
                    <span>Kota / Kabupaten & WA</span>
                    <strong>{level2Result.contact?.city_regency} • {level2Result.contact?.phone_masked}</strong>
                  </div>
                  <div className="basic-item">
                    <span>Ukuran Frame & Detail (mm)</span>
                    <strong>
                      {level2Result.latest_measurement
                        ? `${level2Result.latest_measurement.frame_width_mm} mm · Size ${level2Result.latest_measurement.size_category} (Bridge ${level2Result.latest_measurement.bridge_mm || 18}mm)`
                        : '138 mm · Size M'}
                    </strong>
                  </div>
                  <div className="basic-item">
                    <span>Status Verifikasi</span>
                    <strong style={{ color: '#4ade80' }}>✓ {level2Result.contact?.verification_status?.toUpperCase()} (Level 2 Penuh)</strong>
                  </div>
                </div>

                {/* Level 2 Staff Actions */}
                <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '10px' }}>⚡ Tindakan Kasir Level 2 (Tercatat di Audit Log)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="Catatan kunjungan / pemeriksaan mata..."
                      value={level2ActionNotes}
                      onChange={(e) => setLevel2ActionNotes(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                    />
                    <input
                      type="text"
                      placeholder="Kode Voucher Klaim..."
                      value={level2VoucherCode}
                      onChange={(e) => setLevel2VoucherCode(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                    />
                    <select
                      value={level2TriedSku}
                      onChange={(e) => setLevel2TriedSku(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                    >
                      {CATALOG_FRAMES_DEFAULT.map((f) => (
                        <option key={f.sku} value={f.sku}>
                          {f.sku} — {f.name} (Size {f.size_category})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="dooz-btn-primary"
                      disabled={submittingAction}
                      onClick={() => handleRecordLevel2Action('store_visit')}
                    >
                      🏪 Catat Kunjungan Outlet (`store_visit`)
                    </button>
                    <button
                      type="button"
                      className="dooz-btn-secondary"
                      disabled={submittingAction}
                      onClick={() => handleRecordLevel2Action('voucher_claimed')}
                    >
                      🎟️ Klaim Voucher Member (`voucher_claimed`)
                    </button>
                    <button
                      type="button"
                      className="dooz-btn-secondary"
                      disabled={submittingAction}
                      onClick={() => handleRecordLevel2Action('frame_tried')}
                    >
                      👓 Tambah Frame Dicoba di Toko (`frame_tried`)
                    </button>
                  </div>
                </div>

                {/* Full Lists */}
                <div className="dooz-portal-middle-grid">
                  <div className="dooz-card">
                    <h3>👓 Seluruh Riwayat Try-On ({level2Result.tried_frames?.length || 0})</h3>
                    <ul className="portal-item-list">
                      {(level2Result.tried_frames || []).map((ev) => (
                        <li key={ev.id} className="portal-item">
                          <div>
                            <strong>{ev.payload?.frame_name || ev.payload?.frame_sku}</strong>
                            <span className="item-sub">
                              {ev.payload?.frame_sku} • {ev.payload?.frame_width_mm} mm (Size {ev.payload?.size_category})
                            </span>
                          </div>
                          <span className="item-date">{ev.src}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="dooz-card">
                    <h3>🎟️ Voucher Member ({level2Result.vouchers?.length || 0})</h3>
                    <ul className="portal-item-list">
                      {(level2Result.vouchers || []).map((v) => (
                        <li key={v.id} className="portal-item voucher-item">
                          <div>
                            <strong className="voucher-code">{v.payload?.voucher_code}</strong>
                            <span className="item-sub">{v.payload?.notes}</span>
                          </div>
                          <span className="voucher-amount">Aktif</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="dooz-card">
                    <h3>🏪 Riwayat Kunjungan Outlet ({level2Result.store_visits?.length || 0})</h3>
                    <ul className="portal-item-list">
                      {(level2Result.store_visits || []).map((vis) => (
                        <li key={vis.id} className="portal-item">
                          <div>
                            <strong>{vis.payload?.outlet_id}</strong>
                            <span className="item-sub">{vis.payload?.notes}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: WALK-IN OUTLET REGISTRATION */}
        {activeTab === 'walkin' && (
          <div className="dooz-card">
            <h2>🚶 Pendaftaran Pelanggan Walk-In Baru di Outlet</h2>
            <p className="portal-muted" style={{ marginBottom: '14px' }}>
              Pilih <strong>Rekomendasi Utama (QR `wa.me` Kode `DZ-xxxx`)</strong> agar pelanggan memindai QR di layar kasir dan mengirim WA sendiri (langsung <code>verified</code> & anti-blokir Fonnte), atau gunakan <strong>Fallback Input Manual (`unverified`)</strong> jika pelanggan tidak membawa HP.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={walkInMode === 'qr_wa' ? 'dooz-btn-primary' : 'dooz-btn-secondary'}
                onClick={() => {
                  setWalkInMode('qr_wa')
                  setWalkInResult(null)
                }}
              >
                ✅ Rekomendasi Utama: Tampilkan QR `wa.me` (Otomatis Verified 100%)
              </button>
              <button
                type="button"
                className={walkInMode === 'manual' ? 'dooz-btn-primary' : 'dooz-btn-secondary'}
                onClick={() => {
                  setWalkInMode('manual')
                  setWalkInResult(null)
                }}
              >
                📝 Fallback Input Manual Staf (Status `unverified` • Tanpa Kirim WA Keluar)
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="dooz-lead-form">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div className="dooz-field">
                  <label>Nama Lengkap Pelanggan *</label>
                  <input
                    type="text"
                    placeholder="Contoh: Andi Pratama"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    required
                  />
                </div>
                <div className="dooz-field">
                  <label>Nomor WhatsApp *</label>
                  <input
                    type="tel"
                    placeholder="Contoh: 081234567890"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="dooz-field">
                  <label>Kota / Kabupaten Domisili *</label>
                  <select
                    value={walkInCity}
                    onChange={(e) => setWalkInCity(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '10px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    {INDONESIA_CITIES.slice(0, 35).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="dooz-field">
                  <label>Hasil Ukur Lebar Frame di Toko (mm)</label>
                  <input
                    type="number"
                    min={115}
                    max={165}
                    value={walkInWidthMm}
                    onChange={(e) => setWalkInWidthMm(Number(e.target.value))}
                  />
                </div>
                <div className="dooz-field">
                  <label>Frame yang Dicoba di Toko</label>
                  <select
                    value={walkInSku}
                    onChange={(e) => setWalkInSku(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '10px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    {CATALOG_FRAMES_DEFAULT.map((f) => (
                      <option key={f.sku} value={f.sku}>
                        {f.sku} — {f.name} (Size {f.size_category})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dooz-form-actions" style={{ marginTop: '14px' }}>
                <button type="submit" className="dooz-btn-primary" disabled={submittingWalkIn}>
                  {submittingWalkIn
                    ? 'Memproses...'
                    : walkInMode === 'qr_wa'
                      ? '📲 Buat QR Verifikasi Walk-In (Kode DZ-xxxx)'
                      : '💾 Simpan Walk-In Manual (Status Unverified)'}
                </button>
              </div>
            </form>

            {walkInResult && (
              <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {walkInResult.mode === 'qr_wa' ? (
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="qr-svg-frame">
                      <WalkInQRMatrixSVG url={walkInResult.wa_me_url} />
                    </div>
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <span className="dooz-chip">SCAN DI HP PELANGGAN • USER-INITIATED WA</span>
                      <h3 style={{ margin: '6px 0' }}>Kode Verifikasi: {walkInResult.verification_code}</h3>
                      <p className="portal-muted" style={{ marginBottom: '10px' }}>
                        Pelanggan cukup memindai QR ini dan menekan <strong>Send</strong> di WhatsApp mereka. Sistem Fonnte otomatis memverifikasi nomor pengirim asli dan mengirimkan Kartu Member Digital.
                      </p>
                      <a
                        href={walkInResult.wa_me_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dooz-wa-cta-button"
                      >
                        💬 Buka Tautan wa.me ({walkInResult.verification_code})
                      </a>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="dooz-chip warning">STATUS: UNVERIFIED (INPUT MANUAL STAF)</span>
                    <h3 style={{ margin: '6px 0' }}>
                      Member Tersimpan: {walkInResult.contact?.full_name} ({walkInResult.contact?.member_code})
                    </h3>
                    <p className="portal-muted">
                      Outbound WA Sent: <strong>{String(walkInResult.outbound_wa_sent)}</strong> — Sesuai aturan anti-blokir Fonnte, Customer Hub tidak mengirim pesan WA keluar ke nomor yang diinput manual oleh staf.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
