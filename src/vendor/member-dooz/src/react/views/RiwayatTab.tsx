import { useMemberDooz } from '../MemberDoozProvider.tsx'
import { SOURCE_LABEL, formatDate, formatMm } from '../../format.ts'
import { Loading } from '../ui.tsx'
import { SessionProblem } from './KartuTab.tsx'

interface Row {
  id: string
  at: string
  icon: string
  title: string
  detail: string
}

/** Tab Riwayat: ukuran yang disimpan + frame yang dicoba (Try-On) + kunjungan outlet, terbaru dulu. */
export function RiwayatTab() {
  const { me, meError, reloadMe, setView } = useMemberDooz()
  if (meError && !me) return <SessionProblem status={meError.status} message={meError.message} onRetry={() => void reloadMe()} onLogin={() => setView('login')} />
  if (!me) return <Loading />

  const rows: Row[] = [
    ...(me.measurements ?? []).map((m) => ({
      id: `m-${m.id}`,
      at: m.created_at,
      icon: '📏',
      title: `Ukuran disimpan: ${m.name}`,
      detail: `${m.size_category} · ${formatMm(m.frame_width_mm)} mm · ${SOURCE_LABEL[m.source] ?? m.source}${m.is_primary ? ' · ⭐ utama' : ''}`,
    })),
    ...(me.tried_frames ?? []).map((e) => ({
      id: `t-${e.id}`,
      at: e.created_at,
      icon: '👓',
      title: `Frame dicoba: ${e.payload.frame_name || e.payload.frame_sku || 'Frame DOOZ'}`,
      detail: [e.payload.size_category && `Ukuran ${e.payload.size_category}`, e.payload.frame_width_mm && `${formatMm(e.payload.frame_width_mm)} mm`, 'Try-On']
        .filter(Boolean)
        .join(' · '),
    })),
    ...(me.store_visits ?? []).map((e) => ({
      id: `v-${e.id}`,
      at: e.created_at,
      icon: '🏬',
      title: 'Kunjungan outlet DOOZ',
      detail: e.payload.outlet_id ? `Outlet ${e.payload.outlet_id}` : 'Outlet DOOZ',
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="mdz-stack">
      <div>
        <h1 className="mdz-title">Riwayat</h1>
        <p className="mdz-muted">Ukuran yang kamu simpan dan frame yang pernah kamu coba.</p>
      </div>
      {rows.length === 0 ? (
        <div className="mdz-empty">Belum ada riwayat. Simpan ukuran atau coba frame di Try-On.</div>
      ) : (
        <ol className="mdz-timeline">
          {rows.map((r) => (
            <li key={r.id} className="mdz-timeline__item">
              <span className="mdz-timeline__icon" aria-hidden>
                {r.icon}
              </span>
              <div className="mdz-grow mdz-min0">
                <div className="mdz-timeline__title">{r.title}</div>
                <div className="mdz-muted mdz-small">{r.detail}</div>
              </div>
              <time className="mdz-muted mdz-small mdz-nowrap" dateTime={r.at}>
                {formatDate(r.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
