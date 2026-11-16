import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchLiveCounter } from '../sdk/doozCapture'

/**
 * Overlay OBS Live (`/staf/live?sesi=&host=`): dipasang sebagai Browser Source di OBS.
 * Latar transparan, tanpa menu, nama penonton selalu tersamar (mis. "R***").
 * Link overlay dibuat dari menu Laporan di aplikasi staf.
 */
export default function ObsLiveCounter() {
  const filters = useMemo(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    return { sesi: (params.get('sesi') || '').trim(), host: (params.get('host') || '').trim() }
  }, [])
  const [snapshot, setSnapshot] = useState(null)

  const refreshCounter = useCallback(async () => {
    try {
      const data = await fetchLiveCounter(filters)
      setSnapshot(data)
    } catch {
      // tetap tampilkan data terakhir
    }
  }, [filters])

  useEffect(() => {
    refreshCounter()
    const id = setInterval(refreshCounter, 4000)
    return () => clearInterval(id)
  }, [refreshCounter])

  const toasts = (snapshot?.recent_toasts || []).slice(0, 4)

  return (
    <div className="obs-overlay-page">
      <div className="obs-widget">
        <div className="obs-widget__badge">● Live Kacamata DOOZ</div>
        <div className="obs-widget__count">
          <strong>{snapshot?.total_leads ?? 0}</strong>
          <span>penonton sudah ukur &amp; coba frame</span>
        </div>
        <div className="obs-widget__sizes">
          {['XS', 'S', 'M', 'L', 'XL'].map((cat) => (
            <div key={cat}>
              <strong>{snapshot?.size_breakdown?.[cat] ?? 0}</strong>
              {cat}
            </div>
          ))}
        </div>
        {toasts.length > 0 ? (
          toasts.map((toast) => (
            <div key={toast.id} className="obs-widget__toast">
              {toast.message}
            </div>
          ))
        ) : (
          <div className="obs-widget__toast">Menunggu penonton...</div>
        )}
      </div>
    </div>
  )
}
