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

const MEASUREMENT_SOURCE_LABEL = {
  self_measure: 'ukur sendiri',
  outlet: 'diukur di outlet',
  temple_label: 'dari gagang kacamata',
}

const COMFORT_LABEL = {
  pas_nyaman: '😊 Pas & nyaman',
  kurang_nyaman: '😐 Kurang nyaman',
  tidak_pas: '❌ Tidak pas',
}

const ACTION_LABELS = {
  store_visit: 'Kunjungan',
  voucher_claimed: 'Klaim voucher',
  frame_tried: 'Frame dicoba',
}

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
    <svg viewBox={`0 0 ${size} ${size}`} width="160" height="160" className="dooz-qr-svg" role="img" aria-label="QR WhatsApp pelanggan baru">
      <rect width={size} height={size} fill="#ffffff" rx="1.2" />
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={0.92} height={0.92} fill="#252A2D" rx="0.15" /> : null
        )
      )}
    </svg>
  )
}

export default function KasirOutletPanel() {
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
        `Data contoh siap: ${demo.member_code} (${demo.phone}). Coba menu Cari nomor WA atau Scan Kartu Member.`
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
        'Cari pakai nomor WhatsApp lengkap, bukan nama (contoh: 081299887766). Ini untuk melindungi data pelanggan.'
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
        `Pencarian tercatat di riwayat akses (${staffContext.userId} · ${staffContext.outletId}).`
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
      setErrorBanner('Pindai QR Kartu Member di HP pelanggan dulu.')
      return
    }

    setLoadingLevel2(true)
    try {
      const res = await kasirScanQR(qrTokenInput.trim(), staffContext)
      setLevel2Result(res)
      setStatusBanner(
        `Data lengkap ${res.contact?.member_code} terbuka. Akses ini tercatat di riwayat akses.`
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
      setStatusBanner(`${ACTION_LABELS[eventType] || 'Tindakan'} tersimpan di Kartu Member pelanggan.`)
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
      setErrorBanner('Isi nama lengkap pelanggan.')
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
          'Pelanggan tersimpan sebagai "belum terverifikasi". Sistem tidak mengirim WhatsApp ke nomor yang diketik staf.'
        )
      } else {
        setStatusBanner('QR siap. Minta pelanggan memindai dan menekan Kirim di WhatsApp.')
      }
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setSubmittingWalkIn(false)
    }
  }

  return (
    <div className="dz-stack">
      <div className="staff-section-head">
        <div>
          <span className="dz-eyebrow">Kasir outlet</span>
          <h1 className="dz-title">Layani pelanggan</h1>
        </div>
        <button type="button" className="dz-btn dz-btn--ghost dz-btn--sm" onClick={handleLoadDemoCustomer}>
          Muat data contoh
        </button>
      </div>

      {/* Identitas staf: setiap pencarian & scan tercatat di riwayat akses */}
      <div className="dz-panel staff-context">
        <label className="dz-label" htmlFor="kasir-staff-id">
          ID staf
        </label>
        <input
          id="kasir-staff-id"
          type="text"
          className="dz-input--sm"
          value={staffUserId}
          onChange={(e) => setStaffUserId(e.target.value)}
        />
        <select className="dz-input--sm" value={staffOutletId} onChange={(e) => setStaffOutletId(e.target.value)}>
          {OUTLET_LIST.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="dz-small">Semua pencarian tercatat atas nama ID staf ini.</span>
      </div>

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

      <div className="dz-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'level1'}
          className={`dz-tab ${activeTab === 'level1' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('level1')}
        >
          1 · Cari nomor WA
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'level2'}
          className={`dz-tab ${activeTab === 'level2' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('level2')}
        >
          2 · Scan Kartu Member
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'walkin'}
          className={`dz-tab ${activeTab === 'walkin' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('walkin')}
        >
          Pelanggan baru
        </button>
      </div>

      {/* LEVEL 1: cari dengan nomor WA lengkap → data dasar & tersamar */}
      {activeTab === 'level1' && (
        <div className="dz-card">
          <h2 className="dz-subtitle">Cari dengan nomor WhatsApp lengkap</h2>
          <p className="dz-muted" style={{ margin: '4px 0 14px' }}>
            Hanya menampilkan data dasar: inisial nama, nomor tersamar, ukuran frame, dan 3 frame terakhir. Untuk data
            lengkap & voucher, scan Kartu Member pelanggan.
          </p>

          <form onSubmit={handleLookupLevel1} className="manual-token-row" style={{ marginBottom: 16 }}>
            <input
              type="tel"
              inputMode="tel"
              placeholder="Nomor WA lengkap, mis. 081299887766"
              value={lookupPhoneInput}
              onChange={(e) => setLookupPhoneInput(e.target.value)}
              required
            />
            <button type="submit" className="dz-btn dz-btn--orange" disabled={loadingLevel1}>
              {loadingLevel1 ? 'Mencari...' : 'Cari'}
            </button>
          </form>

          {level1Result && (
            <div className="dz-panel">
              <div className="dz-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span className="dz-chip">Data dasar</span>
                  <h3 style={{ marginTop: 6 }}>
                    {level1Result.first_name_initial} · {level1Result.member_code}
                  </h3>
                </div>
                <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={() => setActiveTab('level2')}>
                  Scan Kartu Member →
                </button>
              </div>

              <div className="dz-kv">
                <div className="dz-kv__item">
                  <span>Nama</span>
                  <strong>{level1Result.first_name_initial}</strong>
                </div>
                <div className="dz-kv__item">
                  <span>WhatsApp</span>
                  <strong>{level1Result.phone_masked}</strong>
                </div>
                <div className="dz-kv__item">
                  <span>Ukuran utama</span>
                  <strong>
                    {(level1Result.primary_measurement || level1Result.latest_measurement)?.size_category
                      ? `Kategori ${(level1Result.primary_measurement || level1Result.latest_measurement).size_category}`
                      : 'Belum diukur'}
                  </strong>
                  <span className="dz-small">Detail mm & daftar ukuran terbuka setelah scan Kartu Member</span>
                </div>
                <div className="dz-kv__item">
                  <span>Terkunci</span>
                  <strong style={{ color: 'var(--dz-danger)', fontSize: 13 }}>
                    Kota, voucher, kunjungan & resep — perlu scan Kartu Member
                  </strong>
                </div>
              </div>

              <h4 style={{ margin: '4px 0 8px' }}>3 frame terakhir yang dicoba</h4>
              {level1Result.recent_tried_frames && level1Result.recent_tried_frames.length > 0 ? (
                <ul className="dz-list">
                  {level1Result.recent_tried_frames.map((ev) => (
                    <li key={ev.id} className="dz-list-item">
                      <div>
                        <strong>{ev.payload?.frame_name || ev.payload?.frame_sku}</strong>
                        <span className="item-sub">
                          {ev.payload?.frame_sku} · {ev.payload?.frame_width_mm} mm · {ev.payload?.size_category}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="portal-empty">Belum ada frame yang dicoba.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 2: scan QR Kartu Member (token berputar bertanda tangan) → data lengkap & tindakan */}
      {activeTab === 'level2' && (
        <div className="dz-card">
          <h2 className="dz-subtitle">Scan Kartu Member</h2>
          <p className="dz-muted" style={{ margin: '4px 0 14px' }}>
            Minta pelanggan membuka <strong>Kartu Member Saya</strong> di HP-nya, lalu pindai QR-nya untuk membuka data
            lengkap, klaim voucher, dan mencatat kunjungan.
          </p>

          <form onSubmit={handleScanQRLevel2} className="manual-token-row" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Hasil scan QR Kartu Member"
              value={qrTokenInput}
              onChange={(e) => setQrTokenInput(e.target.value)}
              required
            />
            <button type="submit" className="dz-btn dz-btn--orange" disabled={loadingLevel2}>
              {loadingLevel2 ? 'Memeriksa...' : 'Buka data'}
            </button>
          </form>

          {level2Result && (
            <div className="dz-stack">
              <div className="dz-kv" style={{ margin: 0 }}>
                <div className="dz-kv__item">
                  <span>Nama & ID member</span>
                  <strong>
                    {level2Result.contact?.full_name} ({level2Result.contact?.member_code})
                  </strong>
                </div>
                <div className="dz-kv__item">
                  <span>Kota & WhatsApp</span>
                  <strong>
                    {level2Result.contact?.city_regency} · {level2Result.contact?.phone_masked}
                  </strong>
                </div>
                <div className="dz-kv__item">
                  <span>⭐ Ukuran utama</span>
                  <strong>
                    {level2Result.primary_measurement
                      ? `${level2Result.primary_measurement.size_category} · ${level2Result.primary_measurement.frame_width_mm} mm · ${level2Result.primary_measurement.name}`
                      : level2Result.latest_measurement
                        ? `${level2Result.latest_measurement.frame_width_mm} mm · ${level2Result.latest_measurement.size_category}`
                        : 'Belum diukur'}
                  </strong>
                </div>
                <div className="dz-kv__item">
                  <span>Status WhatsApp</span>
                  <strong style={{ color: 'var(--dz-success)' }}>
                    {level2Result.contact?.verification_status === 'verified'
                      ? '✓ Terverifikasi'
                      : level2Result.contact?.verification_status || '-'}
                  </strong>
                </div>
              </div>

              <div className="dz-panel">
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>Catat tindakan</h3>
                <div className="dz-grid" style={{ gap: 10, marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Catatan (mis. cek mata, setel nosepad)"
                    value={level2ActionNotes}
                    onChange={(e) => setLevel2ActionNotes(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Kode voucher"
                    value={level2VoucherCode}
                    onChange={(e) => setLevel2VoucherCode(e.target.value)}
                  />
                  <select value={level2TriedSku} onChange={(e) => setLevel2TriedSku(e.target.value)}>
                    {CATALOG_FRAMES_DEFAULT.map((f) => (
                      <option key={f.sku} value={f.sku}>
                        {f.name} ({f.size_category})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="dz-row">
                  <button
                    type="button"
                    className="dz-btn dz-btn--orange"
                    disabled={submittingAction}
                    onClick={() => handleRecordLevel2Action('store_visit')}
                  >
                    Catat kunjungan
                  </button>
                  <button
                    type="button"
                    className="dz-btn dz-btn--outline"
                    disabled={submittingAction}
                    onClick={() => handleRecordLevel2Action('voucher_claimed')}
                  >
                    Klaim voucher
                  </button>
                  <button
                    type="button"
                    className="dz-btn dz-btn--outline"
                    disabled={submittingAction}
                    onClick={() => handleRecordLevel2Action('frame_tried')}
                  >
                    Tambah frame dicoba
                  </button>
                </div>
              </div>

              {(level2Result.measurements || []).length > 0 && (
                <div className="dz-card dz-card--plain">
                  <h3>Ukuran Saya member ({level2Result.measurements.length})</h3>
                  <ul className="dz-list">
                    {level2Result.measurements.map((m) => (
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
                          </span>
                          {(m.comfort || m.note) && (
                            <span className="item-sub">
                              {m.comfort ? COMFORT_LABEL[m.comfort] || m.comfort : ''}
                              {m.comfort && m.note ? ' · ' : ''}
                              {m.note}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="dooz-portal-middle-grid">
                <div className="dz-card dz-card--plain">
                  <h3>Frame dicoba ({level2Result.tried_frames?.length || 0})</h3>
                  <ul className="dz-list">
                    {(level2Result.tried_frames || []).map((ev) => (
                      <li key={ev.id} className="dz-list-item">
                        <div>
                          <strong>{ev.payload?.frame_name || ev.payload?.frame_sku}</strong>
                          <span className="item-sub">
                            {ev.payload?.frame_sku} · {ev.payload?.frame_width_mm} mm · {ev.payload?.size_category}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="dz-card dz-card--plain">
                  <h3>Voucher ({level2Result.vouchers?.length || 0})</h3>
                  <ul className="dz-list">
                    {(level2Result.vouchers || []).map((v) => (
                      <li key={v.id} className="dz-list-item">
                        <div>
                          <strong className="voucher-code">{v.payload?.voucher_code}</strong>
                          <span className="item-sub">{v.payload?.notes}</span>
                        </div>
                        <span className="voucher-amount">Aktif</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="dz-card dz-card--plain">
                  <h3>Kunjungan ({level2Result.store_visits?.length || 0})</h3>
                  <ul className="dz-list">
                    {(level2Result.store_visits || []).map((vis) => (
                      <li key={vis.id} className="dz-list-item">
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

      {/* PELANGGAN BARU: QR WhatsApp (terverifikasi) atau isi manual (belum terverifikasi) */}
      {activeTab === 'walkin' && (
        <div className="dz-card">
          <h2 className="dz-subtitle">Daftarkan pelanggan baru</h2>
          <p className="dz-muted" style={{ margin: '4px 0 14px' }}>
            Paling baik: tampilkan QR WhatsApp, pelanggan memindai dan menekan Kirim — nomornya langsung terverifikasi.
            Kalau pelanggan tidak membawa HP, isi manual (status belum terverifikasi).
          </p>

          <div className="dz-tabs" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`dz-tab ${walkInMode === 'qr_wa' ? 'is-active' : ''}`}
              onClick={() => {
                setWalkInMode('qr_wa')
                setWalkInResult(null)
              }}
            >
              QR WhatsApp (disarankan)
            </button>
            <button
              type="button"
              className={`dz-tab ${walkInMode === 'manual' ? 'is-active' : ''}`}
              onClick={() => {
                setWalkInMode('manual')
                setWalkInResult(null)
              }}
            >
              Isi manual
            </button>
          </div>

          <form onSubmit={handleWalkInSubmit} className="dz-form">
            <div className="dz-grid" style={{ gap: 12 }}>
              <div className="dz-field">
                <label>Nama lengkap</label>
                <input type="text" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} required />
              </div>
              <div className="dz-field">
                <label>No. WhatsApp</label>
                <input
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  required
                />
              </div>
              <div className="dz-field">
                <label>Kota</label>
                <select value={walkInCity} onChange={(e) => setWalkInCity(e.target.value)}>
                  {INDONESIA_CITIES.slice(0, 35).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dz-field">
                <label>Lebar frame hasil ukur (mm)</label>
                <input
                  type="number"
                  min={115}
                  max={165}
                  value={walkInWidthMm}
                  onChange={(e) => setWalkInWidthMm(Number(e.target.value))}
                />
              </div>
              <div className="dz-field">
                <label>Frame yang dicoba</label>
                <select value={walkInSku} onChange={(e) => setWalkInSku(e.target.value)}>
                  {CATALOG_FRAMES_DEFAULT.map((f) => (
                    <option key={f.sku} value={f.sku}>
                      {f.name} ({f.size_category})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="dz-actions">
              <button type="submit" className="dz-btn dz-btn--orange" disabled={submittingWalkIn}>
                {submittingWalkIn ? 'Memproses...' : walkInMode === 'qr_wa' ? 'Tampilkan QR WhatsApp' : 'Simpan pelanggan'}
              </button>
            </div>
          </form>

          {walkInResult && (
            <div className="dz-panel" style={{ marginTop: 16 }}>
              {walkInResult.mode === 'qr_wa' ? (
                <div className="dz-row" style={{ gap: 20, alignItems: 'center' }}>
                  <div className="qr-svg-frame">
                    <WalkInQRMatrixSVG url={walkInResult.wa_me_url} />
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h3 style={{ margin: '0 0 6px' }}>Minta pelanggan memindai QR ini</h3>
                    <p className="dz-muted" style={{ marginBottom: 10 }}>
                      Pesan WhatsApp sudah terisi. Setelah pelanggan menekan Kirim, nomornya terverifikasi dan Kartu
                      Member dikirim otomatis.
                    </p>
                    <a href={walkInResult.wa_me_url} target="_blank" rel="noopener noreferrer" className="dz-btn dz-btn--wa">
                      Buka WhatsApp
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="dz-chip dz-chip--warning">Belum terverifikasi</span>
                  <h3 style={{ margin: '6px 0' }}>
                    {walkInResult.contact?.full_name} ({walkInResult.contact?.member_code}) tersimpan
                  </h3>
                  <p className="dz-muted">
                    Sistem tidak mengirim WhatsApp ke nomor yang diketik staf. Pelanggan bisa verifikasi nanti dengan
                    memindai QR WhatsApp.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
