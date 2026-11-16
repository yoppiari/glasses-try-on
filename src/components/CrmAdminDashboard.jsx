import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  adminFetchDashboard,
  adminSignAttributionLink,
  adminExportContactsCSV,
  adminPurgeInactiveRetention,
} from '../sdk/doozCapture'

export default function CrmAdminDashboard({ onBack, onOpenLiveCounter }) {
  const [staffRole, setStaffRole] = useState('owner') // 'owner' | 'admin' | 'kasir' (to test RBAC)
  const [staffUserId, setStaffUserId] = useState('owner-yoppi')
  const [staffOutletId, setStaffOutletId] = useState('hq-solo')

  const staffContext = useMemo(
    () => ({
      role: staffRole,
      userId: staffUserId || 'owner-yoppi',
      outletId: staffOutletId || 'hq-solo',
    }),
    [staffRole, staffUserId, staffOutletId]
  )

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusBanner, setStatusBanner] = useState('')
  const [errorBanner, setErrorBanner] = useState('')

  // Signed Attribution Link Generator state
  const [baseUrlInput, setBaseUrlInput] = useState('https://ukur.doozoptik.id')
  const [srcInput, setSrcInput] = useState('live_tiktok')
  const [hostInput, setHostInput] = useState('rina')
  const [sesiInput, setSesiInput] = useState('20261116-malam')
  const [outletInput, setOutletInput] = useState('outlet-solo-gading')
  const [signingLink, setSigningLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setErrorBanner('')
    try {
      const data = await adminFetchDashboard(staffContext)
      setDashboard(data)
    } catch (err) {
      setDashboard(null)
      setErrorBanner(err.message)
    } finally {
      setLoading(false)
    }
  }, [staffContext])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handleGenerateSignedLink = async (e) => {
    e.preventDefault()
    setSigningLink(true)
    setErrorBanner('')
    setStatusBanner('')
    try {
      const link = await adminSignAttributionLink(
        {
          base_url: baseUrlInput.trim(),
          src: srcInput.trim(),
          host: hostInput.trim(),
          sesi: sesiInput.trim(),
          outlet: outletInput.trim(),
        },
        staffContext
      )
      setGeneratedLink(link)
      setStatusBanner('Signed Attribution Link (HMAC-SHA256) berhasil dibuat & disimpan!')
      await loadDashboard()
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setSigningLink(false)
    }
  }

  const handleExportCSV = async () => {
    setErrorBanner('')
    setStatusBanner('')
    try {
      const csvText = await adminExportContactsCSV(staffContext)
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dooz-contacts-masked-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatusBanner('Export CSV tersamar berhasil diunduh dan tercatat di Audit Log (`admin_export`).')
      await loadDashboard()
    } catch (err) {
      setErrorBanner(err.message)
    }
  }

  const handlePurgeRetention = async () => {
    setErrorBanner('')
    setStatusBanner('')
    try {
      const res = await adminPurgeInactiveRetention(staffContext)
      setStatusBanner(
        `Purge Retensi UU PDP (>24 bulan pasif tanpa transaksi) selesai: ${res.purged_count ?? 0} kontak dihapus.`
      )
      await loadDashboard()
    } catch (err) {
      setErrorBanner(err.message)
    }
  }

  return (
    <div className="dooz-portal-wrapper">
      <div className="dooz-portal-container">
        <div className="dooz-portal-topbar">
          <div>
            <span className="dooz-chip">📊 DOOZ Omnichannel CRM • Owner & Admin Governance</span>
            <h1 className="dooz-portal-title">Dashboard CRM, Atribusi Live & Audit Log</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onOpenLiveCounter && (
              <button type="button" className="dooz-btn-primary" onClick={onOpenLiveCounter}>
                🔴 Buka OBS Live Counter
              </button>
            )}
            <button type="button" className="dooz-btn-secondary" onClick={handleExportCSV}>
              📥 Export CSV Tersamar (Owner/Admin)
            </button>
            <button type="button" className="dooz-btn-outline" onClick={handlePurgeRetention}>
              🧹 Purge Retensi &gt;24 Bulan
            </button>
            {onBack && (
              <button type="button" className="dooz-btn-outline" onClick={onBack}>
                ← Kembali ke Try-On
              </button>
            )}
          </div>
        </div>

        {/* Role & Staff Context Selector */}
        <div className="dooz-card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>Simulasi Peran RBAC:</span>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <option value="owner">OWNER (Akses Penuh + Export CSV)</option>
                <option value="admin">ADMIN (Akses Penuh + Export CSV)</option>
                <option value="kasir">KASIR (Uji Blokir Dashboard & Export CSV)</option>
              </select>
              <input
                type="text"
                value={staffUserId}
                onChange={(e) => setStaffUserId(e.target.value)}
                placeholder="ID Aktor Audit"
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              />
            </div>
            <button type="button" className="dooz-btn-secondary" onClick={loadDashboard}>
              🔄 Muat Ulang Statistik
            </button>
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

        {loading ? (
          <div className="dooz-card">Memuat analitik Omnichannel CRM...</div>
        ) : dashboard ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Top KPI Cards */}
            <div className="recycled-basic-summary" style={{ margin: 0 }}>
              <div className="basic-item">
                <span>Total Kontak / Lead</span>
                <strong style={{ fontSize: '1.4rem' }}>{dashboard.total_contacts}</strong>
                <small className="portal-muted">
                  Pending: {dashboard.pending_contacts} • Unverified: {dashboard.unverified_contacts}
                </small>
              </div>
              <div className="basic-item">
                <span>Member Terverifikasi WA</span>
                <strong style={{ fontSize: '1.4rem', color: '#4ade80' }}>
                  {dashboard.verified_contacts} ({dashboard.verification_rate_pct}%)
                </strong>
                <small className="portal-muted">Verified via Inbound Fonnte</small>
              </div>
              <div className="basic-item">
                <span>Ukur Frame & Virtual Try-On</span>
                <strong style={{ fontSize: '1.4rem', color: '#38bdf8' }}>
                  {dashboard.total_frames_measured} Ukur • {dashboard.total_frames_tried} Try-On
                </strong>
                <small className="portal-muted">Total Event: {dashboard.total_events}</small>
              </div>
              <div className="basic-item">
                <span>Kunjungan Outlet & Voucher</span>
                <strong style={{ fontSize: '1.4rem', color: '#fb923c' }}>
                  {dashboard.total_store_visits} Kunjungan • {dashboard.total_vouchers_claimed} Voucher
                </strong>
                <small className="portal-muted">Omnichannel Online → Offline</small>
              </div>
            </div>

            {/* Conversion Tables: By Source, By Host, By Session, By City */}
            <div className="dooz-portal-middle-grid">
              <div className="dooz-card">
                <h3>📡 Konversi per Sumber (`src`)</h3>
                <ul className="portal-item-list">
                  {(dashboard.by_source || []).map((row) => (
                    <li key={row.key} className="portal-item">
                      <div>
                        <strong>{row.key}</strong>
                        <span className="item-sub">
                          Lead: {row.total_leads} • Verified WA: {row.verified_leads} • Ukur: {row.frames_measured} • Try-On: {row.frames_tried}
                        </span>
                      </div>
                      <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="dooz-card">
                <h3>🎙️ Performa per Host Live & Sesi</h3>
                <ul className="portal-item-list">
                  {(dashboard.by_host || []).map((row) => (
                    <li key={`host-${row.key}`} className="portal-item">
                      <div>
                        <strong>Host: {row.key}</strong>
                        <span className="item-sub">
                          Lead: {row.total_leads} • Verified WA: {row.verified_leads} ({row.conversion_rate_pct}%)
                        </span>
                      </div>
                      <span className="dooz-chip">Host Live</span>
                    </li>
                  ))}
                  {(dashboard.by_session || []).map((row) => (
                    <li key={`sesi-${row.key}`} className="portal-item">
                      <div>
                        <strong>Sesi: {row.key}</strong>
                        <span className="item-sub">
                          Lead: {row.total_leads} • Verified WA: {row.verified_leads} ({row.conversion_rate_pct}%)
                        </span>
                      </div>
                      <span className="dooz-chip">Sesi</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="dooz-card">
                <h3>📍 Konversi per Kota / Kabupaten</h3>
                <ul className="portal-item-list">
                  {(dashboard.by_city || []).slice(0, 6).map((row) => (
                    <li key={row.key} className="portal-item">
                      <div>
                        <strong>{row.key}</strong>
                        <span className="item-sub">
                          Lead: {row.total_leads} • Terverifikasi: {row.verified_leads}
                        </span>
                      </div>
                      <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Signed Attribution Link Generator */}
            <div className="dooz-card">
              <h3>🔗 Generator Signed Attribution Link (Host Live & QR Meja Outlet)</h3>
              <p className="portal-muted" style={{ marginBottom: '12px' }}>
                Setiap tautan kampanye ditandatangani dengan HMAC-SHA256 (`?src=...&host=...&sesi=...&outlet=...&sig=...`) agar parameter insentif host tidak dapat dimanipulasi.
              </p>

              <form onSubmit={handleGenerateSignedLink} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div className="dooz-field">
                  <label>URL Mini-App Tujuan</label>
                  <input type="text" value={baseUrlInput} onChange={(e) => setBaseUrlInput(e.target.value)} required />
                </div>
                <div className="dooz-field">
                  <label>Sumber (`src`)</label>
                  <input type="text" value={srcInput} onChange={(e) => setSrcInput(e.target.value)} required />
                </div>
                <div className="dooz-field">
                  <label>Kode Host (`host`)</label>
                  <input type="text" value={hostInput} onChange={(e) => setHostInput(e.target.value)} />
                </div>
                <div className="dooz-field">
                  <label>Kode Sesi (`sesi`)</label>
                  <input type="text" value={sesiInput} onChange={(e) => setSesiInput(e.target.value)} />
                </div>
                <div className="dooz-field">
                  <label>Cabang Outlet (`outlet`)</label>
                  <input type="text" value={outletInput} onChange={(e) => setOutletInput(e.target.value)} />
                </div>
                <button type="submit" className="dooz-btn-primary" disabled={signingLink} style={{ height: '42px' }}>
                  {signingLink ? 'Membuat...' : '✍️ Buat Signed Link'}
                </button>
              </form>

              {generatedLink && (
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>
                    ✓ Signed URL Siap Dibagikan (Signature: {generatedLink.sig?.slice(0, 16)}...):
                  </div>
                  <code style={{ display: 'block', marginTop: '4px', wordBreak: 'break-all', fontSize: '0.82rem', color: '#fff' }}>
                    {generatedLink.signed_url}
                  </code>
                </div>
              )}
            </div>

            {/* Audit Log Table */}
            <div className="dooz-card">
              <h3>🛡️ Tabel Audit Log Akses Staf & Keamanan Data ({dashboard.recent_audit_logs?.length || 0})</h3>
              <p className="portal-muted" style={{ marginBottom: '12px' }}>
                Setiap pencarian nomor WA di Kasir Level 1 (`level_1_lookup`), pemindaian QR Level 2 (`level_2_qr`), perubahan Katalog SSOT (`admin_catalog`), dan ekspor CSV (`admin_export`) tercatat permanen.
              </p>
              {dashboard.recent_audit_logs && dashboard.recent_audit_logs.length > 0 ? (
                <ul className="portal-item-list">
                  {dashboard.recent_audit_logs.slice(0, 15).map((log) => (
                    <li key={log.id} className="portal-item">
                      <div>
                        <strong>
                          [{log.access_level}] {log.action} — oleh <code>{log.actor_user_id}</code> ({log.role})
                        </strong>
                        <span className="item-sub">
                          Outlet: {log.outlet_id || '-'} • Target: {log.target_contact_id || '-'} • {log.details}
                        </span>
                      </div>
                      <span className="item-date">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID') : '-'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="portal-empty">Belum ada entri audit log.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
