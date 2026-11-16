import { useState, useEffect, useCallback } from 'react'
import { fetchLiveCounter } from '../sdk/doozCapture'

export default function ObsLiveCounter({ onBack }) {
  const [sesiFilter, setSesiFilter] = useState('')
  const [hostFilter, setHostFilter] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [transparentMode, setTransparentMode] = useState(false)

  const refreshCounter = useCallback(async () => {
    const data = await fetchLiveCounter({
      sesi: sesiFilter.trim(),
      host: hostFilter.trim(),
    })
    setSnapshot(data)
  }, [sesiFilter, hostFilter])

  useEffect(() => {
    refreshCounter()
    const id = setInterval(refreshCounter, 4000)
    return () => clearInterval(id)
  }, [refreshCounter])

  return (
    <div
      className="dooz-portal-wrapper"
      style={
        transparentMode
          ? { background: 'transparent', minHeight: '100vh', padding: '20px' }
          : undefined
      }
    >
      <div className="dooz-portal-container" style={{ maxWidth: '860px' }}>
        {!transparentMode && (
          <div className="dooz-portal-topbar">
            <div>
              <span className="dooz-chip">🔴 OBS Browser Source • Tanpa Login Dashboard CRM • Privasi Aman</span>
              <h1 className="dooz-portal-title">OBS Live Counter & Toast Aktivitas Real-Time</h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="dooz-btn-secondary"
                onClick={() => setTransparentMode(true)}
              >
                🎥 Mode Overlay Transparan OBS
              </button>
              {onBack && (
                <button type="button" className="dooz-btn-outline" onClick={onBack}>
                  ← Kembali
                </button>
              )}
            </div>
          </div>
        )}

        {transparentMode && (
          <div style={{ marginBottom: '10px' }}>
            <button
              type="button"
              className="dooz-btn-secondary"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
              onClick={() => setTransparentMode(false)}
            >
              ✕ Keluar Mode Transparan
            </button>
          </div>
        )}

        {!transparentMode && (
          <div className="dooz-card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>
                Filter Sesi / Host Live Opsional:
              </span>
              <input
                type="text"
                placeholder="Filter Sesi (contoh: 20261116)"
                value={sesiFilter}
                onChange={(e) => setSesiFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <input
                type="text"
                placeholder="Filter Host (contoh: rina)"
                value={hostFilter}
                onChange={(e) => setHostFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', background: '#141418', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              <button type="button" className="dooz-btn-primary" onClick={refreshCounter}>
                🔄 Refresh
              </button>
            </div>
          </div>
        )}

        {/* OBS Overlay Widget Box */}
        <div
          className="dooz-card"
          style={{
            background: 'rgba(10, 12, 20, 0.9)',
            border: '2px solid rgba(251, 146, 60, 0.55)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <div>
              <span className="dooz-chip" style={{ background: 'rgba(249,115,22,0.2)', color: '#fb923c' }}>
                ● LIVE KACAMATA DOOZ • UKUR FRAME & VIRTUAL TRY-ON
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: '8px' }}>
                <strong style={{ fontSize: '2.8rem', fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>
                  {snapshot?.total_leads ?? 0}
                </strong>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Penonton Sudah Ukur Frame / Try-On</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.68)' }}>
                    {snapshot?.verified_leads ?? 0} Member WA Terverifikasi • {snapshot?.total_events ?? 0} Aktivitas Sesi Ini
                  </div>
                </div>
              </div>
            </div>

            {/* Size Breakdown Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['XS', 'S', 'M', 'L', 'XL'].map((cat) => (
                <div
                  key={cat}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    textAlign: 'center',
                    minWidth: '52px',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)' }}>Size {cat}</div>
                  <strong style={{ fontSize: '0.95rem', color: '#fb923c' }}>
                    {snapshot?.size_breakdown?.[cat] ?? 0}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <h3 style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.8)', marginBottom: '10px' }}>
            ✨ Notifikasi Real-Time Tersamar (UU PDP — Nama Disamarkan `R***`):
          </h3>

          <ul className="portal-item-list">
            {snapshot?.recent_toasts && snapshot.recent_toasts.length > 0 ? (
              snapshot.recent_toasts.map((toast) => (
                <li
                  key={toast.id}
                  className="portal-item"
                  style={{
                    background: 'rgba(251, 146, 60, 0.08)',
                    borderColor: 'rgba(251, 146, 60, 0.3)',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                      🔔 {toast.message}
                    </strong>
                    <span className="item-sub">
                      Kanal: {toast.src || 'live'} {toast.host ? `• Host: ${toast.host}` : ''}{' '}
                      {toast.sesi ? `• Sesi: ${toast.sesi}` : ''}
                    </span>
                  </div>
                  <span className="dooz-chip">Size {toast.size_category || 'M'}</span>
                </li>
              ))
            ) : (
              <li className="portal-item">
                <span>Menunggu aktivitas ukur frame / virtual try-on dari penonton live...</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
