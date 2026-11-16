import { useState, useEffect, useCallback, useMemo } from 'react'
import { PATHS, absoluteHref } from '../lib/routes'
import {
  adminFetchDashboard,
  adminSignAttributionLink,
  adminExportContactsCSV,
  adminPurgeInactiveRetention,
} from '../sdk/doozCapture'

export default function CrmAdminDashboard() {
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

  // Overlay OBS Live (link dipasang sebagai Browser Source di OBS)
  const [obsSesi, setObsSesi] = useState('')
  const [obsHost, setObsHost] = useState('')
  const obsOverlayUrl = useMemo(
    () => absoluteHref(PATHS.live, { sesi: obsSesi.trim(), host: obsHost.trim() }),
    [obsSesi, obsHost]
  )

  // Alat uji: buat Kartu Member contoh (magic link sekali pakai, ditukar lewat POST di halaman Kartu Member)
  const [demoCardUrl, setDemoCardUrl] = useState('')
  const [creatingDemo, setCreatingDemo] = useState(false)

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatusBanner(`${label} disalin.`)
    } catch {
      setStatusBanner(`Salin manual: ${text}`)
    }
  }

  const handleCreateDemoMemberCard = async (recycledPassive = false) => {
    setCreatingDemo(true)
    setErrorBanner('')
    try {
      const resp = await fetch('/api/portal/demo-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recycled_passive: recycledPassive }),
      })
      if (!resp.ok) throw new Error('Kartu Member contoh belum bisa dibuat.')
      const data = await resp.json()
      setDemoCardUrl(absoluteHref(PATHS.kartu, { token: data.magic_token }))
    } catch (err) {
      setErrorBanner(err.message)
    } finally {
      setCreatingDemo(false)
    }
  }

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
      setStatusBanner('Link kampanye sudah dibuat. Link ini bertanda tangan sehingga kode host tidak bisa diubah.')
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
      setStatusBanner('File CSV (nomor tersamar) sudah diunduh. Unduhan ini tercatat di riwayat akses.')
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
        `Pembersihan data selesai: ${res.purged_count ?? 0} kontak yang tidak aktif >24 bulan dihapus.`
      )
      await loadDashboard()
    } catch (err) {
      setErrorBanner(err.message)
    }
  }

  return (
    <div className="dz-stack">
      <div className="staff-section-head">
        <div>
          <span className="dz-eyebrow">Laporan</span>
          <h1 className="dz-title">Ringkasan pelanggan</h1>
        </div>
        <div className="dz-row">
          <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={loadDashboard}>
            Muat ulang
          </button>
          <button type="button" className="dz-btn dz-btn--outline dz-btn--sm" onClick={handleExportCSV}>
            Unduh CSV
          </button>
        </div>
      </div>

      {/* Peran & identitas staf (akses dibatasi per peran; semua tercatat di riwayat akses) */}
      <div className="dz-panel staff-context">
        <label className="dz-label" htmlFor="laporan-role">
          Peran
        </label>
        <select id="laporan-role" className="dz-input--sm" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="kasir">Kasir (tidak boleh buka laporan)</option>
        </select>
        <label className="dz-label" htmlFor="laporan-staff-id">
          ID staf
        </label>
        <input
          id="laporan-staff-id"
          type="text"
          className="dz-input--sm"
          value={staffUserId}
          onChange={(e) => setStaffUserId(e.target.value)}
        />
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

      {loading ? (
        <div className="dz-card dz-muted">Memuat laporan...</div>
      ) : dashboard ? (
        <>
          <div className="dz-kv" style={{ margin: 0 }}>
            <div className="dz-kv__item">
              <span>Total pelanggan</span>
              <strong style={{ fontSize: 22 }}>{dashboard.total_contacts}</strong>
              <small className="dz-small">
                Menunggu WA: {dashboard.pending_contacts} · Input manual: {dashboard.unverified_contacts}
              </small>
            </div>
            <div className="dz-kv__item">
              <span>Terverifikasi WhatsApp</span>
              <strong style={{ fontSize: 22, color: 'var(--dz-success)' }}>
                {dashboard.verified_contacts} ({dashboard.verification_rate_pct}%)
              </strong>
            </div>
            <div className="dz-kv__item">
              <span>Ukur & coba frame</span>
              <strong style={{ fontSize: 22 }}>
                {dashboard.total_frames_measured} ukur · {dashboard.total_frames_tried} coba
              </strong>
            </div>
            <div className="dz-kv__item">
              <span>Kunjungan & voucher</span>
              <strong style={{ fontSize: 22, color: 'var(--dz-orange-text)' }}>
                {dashboard.total_store_visits} kunjungan · {dashboard.total_vouchers_claimed} voucher
              </strong>
            </div>
          </div>

          <div className="dooz-portal-middle-grid">
            <div className="dz-card">
              <h3>Per sumber</h3>
              <ul className="dz-list">
                {(dashboard.by_source || []).map((row) => (
                  <li key={row.key} className="dz-list-item">
                    <div>
                      <strong>{row.key}</strong>
                      <span className="item-sub">
                        {row.total_leads} pelanggan · {row.verified_leads} terverifikasi · {row.frames_measured} ukur ·{' '}
                        {row.frames_tried} coba
                      </span>
                    </div>
                    <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="dz-card">
              <h3>Per host & sesi live</h3>
              <ul className="dz-list">
                {(dashboard.by_host || []).map((row) => (
                  <li key={`host-${row.key}`} className="dz-list-item">
                    <div>
                      <strong>Host {row.key}</strong>
                      <span className="item-sub">
                        {row.total_leads} pelanggan · {row.verified_leads} terverifikasi
                      </span>
                    </div>
                    <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                  </li>
                ))}
                {(dashboard.by_session || []).map((row) => (
                  <li key={`sesi-${row.key}`} className="dz-list-item">
                    <div>
                      <strong>Sesi {row.key}</strong>
                      <span className="item-sub">
                        {row.total_leads} pelanggan · {row.verified_leads} terverifikasi
                      </span>
                    </div>
                    <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="dz-card">
              <h3>Per kota</h3>
              <ul className="dz-list">
                {(dashboard.by_city || []).slice(0, 6).map((row) => (
                  <li key={row.key} className="dz-list-item">
                    <div>
                      <strong>{row.key}</strong>
                      <span className="item-sub">
                        {row.total_leads} pelanggan · {row.verified_leads} terverifikasi
                      </span>
                    </div>
                    <span className="voucher-amount">{row.conversion_rate_pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}

      {/* Overlay OBS Live */}
      <div className="dz-card">
        <h3>Overlay OBS Live</h3>
        <p className="dz-muted" style={{ marginBottom: 12 }}>
          Tempel link ini sebagai <strong>Browser Source</strong> di OBS. Overlay menampilkan jumlah penonton yang sudah
          ukur & coba frame, dengan nama tersamar.
        </p>
        <div className="dz-grid" style={{ gap: 10, marginBottom: 10 }}>
          <div className="dz-field">
            <label htmlFor="obs-sesi">Sesi (opsional)</label>
            <input id="obs-sesi" type="text" placeholder="mis. 20261116" value={obsSesi} onChange={(e) => setObsSesi(e.target.value)} />
          </div>
          <div className="dz-field">
            <label htmlFor="obs-host">Host (opsional)</label>
            <input id="obs-host" type="text" placeholder="mis. rina" value={obsHost} onChange={(e) => setObsHost(e.target.value)} />
          </div>
        </div>
        <div className="dz-panel" style={{ wordBreak: 'break-all', fontSize: 13, marginBottom: 10 }}>
          {obsOverlayUrl}
        </div>
        <div className="dz-row">
          <a href={obsOverlayUrl} target="_blank" rel="noopener noreferrer" className="dz-btn dz-btn--orange">
            Buka overlay
          </a>
          <button type="button" className="dz-btn dz-btn--outline" onClick={() => handleCopy(obsOverlayUrl, 'Link overlay')}>
            Salin link
          </button>
        </div>
      </div>

      {/* Link kampanye bertanda tangan (host live & QR meja outlet) */}
      <div className="dz-card">
        <h3>Buat link kampanye</h3>
        <p className="dz-muted" style={{ marginBottom: 12 }}>
          Link untuk host live atau QR meja outlet. Link diberi tanda tangan agar kode host & outlet tidak bisa diubah
          orang lain.
        </p>
        <form onSubmit={handleGenerateSignedLink} className="dz-grid" style={{ gap: 10, alignItems: 'end' }}>
          <div className="dz-field">
            <label>Alamat aplikasi tujuan</label>
            <input type="text" value={baseUrlInput} onChange={(e) => setBaseUrlInput(e.target.value)} required />
          </div>
          <div className="dz-field">
            <label>Sumber</label>
            <input type="text" value={srcInput} onChange={(e) => setSrcInput(e.target.value)} required />
          </div>
          <div className="dz-field">
            <label>Kode host</label>
            <input type="text" value={hostInput} onChange={(e) => setHostInput(e.target.value)} />
          </div>
          <div className="dz-field">
            <label>Kode sesi</label>
            <input type="text" value={sesiInput} onChange={(e) => setSesiInput(e.target.value)} />
          </div>
          <div className="dz-field">
            <label>Outlet</label>
            <input type="text" value={outletInput} onChange={(e) => setOutletInput(e.target.value)} />
          </div>
          <button type="submit" className="dz-btn dz-btn--outline" disabled={signingLink}>
            {signingLink ? 'Membuat...' : 'Buat link'}
          </button>
        </form>
        {generatedLink && (
          <div className="dz-panel" style={{ marginTop: 12 }}>
            <div className="dz-row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13, color: 'var(--dz-success)' }}>✓ Link siap dibagikan</strong>
              <button
                type="button"
                className="dz-btn dz-btn--ghost dz-btn--sm"
                onClick={() => handleCopy(generatedLink.signed_url, 'Link kampanye')}
              >
                Salin
              </button>
            </div>
            <div style={{ marginTop: 4, wordBreak: 'break-all', fontSize: 13 }}>{generatedLink.signed_url}</div>
          </div>
        )}
      </div>

      {/* Riwayat akses staf (audit log) */}
      {dashboard && (
        <div className="dz-card">
          <h3>Riwayat akses staf ({dashboard.recent_audit_logs?.length || 0})</h3>
          <p className="dz-muted" style={{ marginBottom: 12 }}>
            Setiap pencarian nomor di kasir, scan Kartu Member, perubahan katalog, dan unduhan CSV tercatat permanen.
          </p>
          {dashboard.recent_audit_logs && dashboard.recent_audit_logs.length > 0 ? (
            <ul className="dz-list">
              {dashboard.recent_audit_logs.slice(0, 15).map((log) => (
                <li key={log.id} className="dz-list-item">
                  <div>
                    <strong>
                      {log.action} · {log.actor_user_id} ({log.role})
                    </strong>
                    <span className="item-sub">
                      {log.access_level} · Outlet {log.outlet_id || '-'} · {log.details}
                    </span>
                  </div>
                  <span className="item-date">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID') : '-'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="portal-empty">Belum ada riwayat akses.</p>
          )}
        </div>
      )}

      {/* Perawatan data & alat uji */}
      <div className="dz-card dz-card--plain">
        <h3>Perawatan data & alat uji</h3>
        <div className="dz-toggle-row">
          <div>
            <strong style={{ fontSize: 14 }}>Bersihkan data tidak aktif</strong>
            <p>Hapus kontak yang tidak aktif lebih dari 24 bulan tanpa transaksi (aturan UU PDP).</p>
          </div>
          <button type="button" className="dz-btn dz-btn--danger-outline dz-btn--sm" onClick={handlePurgeRetention}>
            Bersihkan
          </button>
        </div>
        <div className="dz-toggle-row">
          <div>
            <strong style={{ fontSize: 14 }}>Kartu Member contoh</strong>
            <p>Buat link Kartu Member contoh untuk mencoba alur yang diterima customer dari WhatsApp.</p>
          </div>
          <div className="dz-row">
            <button
              type="button"
              className="dz-btn dz-btn--outline dz-btn--sm"
              disabled={creatingDemo}
              onClick={() => handleCreateDemoMemberCard(false)}
            >
              Member aktif
            </button>
            <button
              type="button"
              className="dz-btn dz-btn--outline dz-btn--sm"
              disabled={creatingDemo}
              onClick={() => handleCreateDemoMemberCard(true)}
            >
              Nomor lama &gt;6 bulan
            </button>
          </div>
        </div>
        {demoCardUrl && (
          <div className="dz-panel" style={{ marginTop: 8 }}>
            <div style={{ wordBreak: 'break-all', fontSize: 13, marginBottom: 8 }}>{demoCardUrl}</div>
            <div className="dz-row">
              <a href={demoCardUrl} target="_blank" rel="noopener noreferrer" className="dz-btn dz-btn--outline dz-btn--sm">
                Buka Kartu Member contoh
              </a>
              <button type="button" className="dz-btn dz-btn--ghost dz-btn--sm" onClick={() => handleCopy(demoCardUrl, 'Link')}>
                Salin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
