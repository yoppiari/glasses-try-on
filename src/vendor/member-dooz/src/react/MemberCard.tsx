import type { ReactNode } from 'react'
import { formatMm } from '../format.ts'
import type { PortalMe } from '../types.ts'
import { QrCode, TextWordmark } from './ui.tsx'

/** Kartu Member DOOZ: nama, kode member, ukuran utama, QR dinamis (discan Kasir L2 dari app mana saja). */
export function MemberCard({ me, showQr = true, brand }: { me: PortalMe; showQr?: boolean; brand?: ReactNode }) {
  const primary = me.primary_measurement
  const name = me.full_name || me.first_name_masked || 'Member DOOZ'
  return (
    <section className="mdz-root mdz-card" aria-label="Kartu Member DOOZ">
      <span className="mdz-card__corner mdz-card__corner--tl" aria-hidden />
      <span className="mdz-card__corner mdz-card__corner--br" aria-hidden />
      <div className="mdz-row mdz-row--between">
        {brand ?? <TextWordmark />}
        <span className="mdz-badge">Member</span>
      </div>
      <div className="mdz-card__main">
        <div className="mdz-grow mdz-min0">
          <div className="mdz-card__name">{name}</div>
          <div className="mdz-card__code">{me.member_code}</div>
          <div className="mdz-card__label">⭐ Ukuran utama</div>
          {primary ? (
            <div className="mdz-card__size">
              <span className="mdz-card__cat">{primary.size_category}</span>
              <span className="mdz-card__mm">{formatMm(primary.frame_width_mm)} mm</span>
            </div>
          ) : (
            <div className="mdz-card__size">
              <span className="mdz-card__mm">{me.primary_size_category || '–'}</span>
            </div>
          )}
          {primary?.name && <div className="mdz-card__sub">{primary.name}</div>}
        </div>
        {showQr && me.qr_token && (
          <div className="mdz-card__qr">
            <QrCode value={me.qr_token} size={112} />
          </div>
        )}
      </div>
      {showQr && me.qr_token && <p className="mdz-card__foot">Tunjukkan QR ini ke kasir DOOZ, ukuranmu langsung terbaca.</p>}
    </section>
  )
}
