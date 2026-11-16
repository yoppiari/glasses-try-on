import { useEffect, useRef } from 'react'
import { MEMBER_TABS, useMemberDooz, type MemberView } from './MemberDoozProvider.tsx'
import { CloseButton, cx } from './ui.tsx'
import { DeletedView, JoinView, LoginView, MagicView } from './views/AuthViews.tsx'
import { KartuTab } from './views/KartuTab.tsx'
import { ProfilTab } from './views/ProfilTab.tsx'
import { RiwayatTab } from './views/RiwayatTab.tsx'
import { UkuranTab, type UnsavedMeasurement } from './views/UkuranTab.tsx'
import type { Measurement } from '../types.ts'

export interface MemberDoozPanelProps {
  /**
   * Ajakan "Jadi Member" untuk yang belum member (App Ukur: buka alur simpan ukuran).
   * Tanpa prop ini (mis. Try-On) yang belum member hanya melihat "Masuk lewat WhatsApp".
   */
  onJoin?: () => void
  /** Ukuran Saya → + Tambah ukuran → "Ukur lagi" (hanya app yang bisa mengukur). */
  onMeasureAgain?: () => void
  /** Hasil ukur terakhir di HP ini yang belum disimpan → tombol "Simpan" di Ukuran Saya. */
  unsavedMeasurement?: UnsavedMeasurement | null
  onUnsavedSaved?: (m: Measurement) => void
  /** Setelah masuk lewat magic link WhatsApp. */
  onSignedIn?: () => void
  /** Setelah keluar / hapus data. */
  onSignedOut?: () => void
}

const TAB_LABEL: Record<string, string> = {
  kartu: 'Kartu Member',
  ukuran: 'Ukuran Saya',
  riwayat: 'Riwayat',
  profil: 'Profil & Privasi',
}
const TITLE: Partial<Record<MemberView, string>> = {
  join: 'Jadi Member',
  login: 'Masuk lewat WhatsApp',
  magic: 'Masuk Member',
  deleted: 'Data dihapus',
}

/**
 * Panel Member DOOZ (layar penuh di atas app). Pasang SEKALI di root app, di dalam <MemberDoozProvider>.
 * Isi untuk member: Kartu Member (QR) · Ukuran Saya · Riwayat · Profil & Privasi.
 */
export function MemberDoozPanel({ onJoin, onMeasureAgain, unsavedMeasurement, onUnsavedSaved, onSignedIn, onSignedOut }: MemberDoozPanelProps) {
  const { panelOpen, view, setView, close, isMember, magicToken, notice, setCanJoin } = useMemberDooz()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCanJoin(!!onJoin)
  }, [onJoin, setCanJoin])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.mdz-sheet') && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, close])

  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 })
  }, [view])

  // Sesi berakhir saat panel member terbuka → tawarkan masuk lagi.
  useEffect(() => {
    if (panelOpen && !isMember && MEMBER_TABS.includes(view)) setView('login')
  }, [panelOpen, isMember, view, setView])

  if (!panelOpen) return null

  const join = onJoin
    ? () => {
        close()
        onJoin()
      }
    : undefined
  const isTab = isMember && MEMBER_TABS.includes(view)
  const title = isTab ? 'Member DOOZ' : (TITLE[view] ?? 'Member DOOZ')

  return (
    <div className="mdz-root mdz-panel" role="dialog" aria-modal="true" aria-label={title}>
      <header className="mdz-panel__head">
        <div className="mdz-grow mdz-min0">
          <div className="mdz-panel__kicker">Kacamata DOOZ</div>
          <div className="mdz-panel__title">{title}</div>
        </div>
        <CloseButton light onClick={close} />
      </header>
      {isTab && (
        <nav className="mdz-tabs" aria-label="Menu Member DOOZ">
          {MEMBER_TABS.map((t) => (
            <button key={t} type="button" aria-current={view === t ? 'page' : undefined} className={cx('mdz-tab', view === t && 'mdz-tab--active')} onClick={() => setView(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>
      )}
      <div className="mdz-panel__body" ref={bodyRef}>
        <div className="mdz-panel__inner">
          {view === 'kartu' && isMember && <KartuTab />}
          {view === 'ukuran' && isMember && (
            <UkuranTab
              onMeasureAgain={
                onMeasureAgain
                  ? () => {
                      close()
                      onMeasureAgain()
                    }
                  : undefined
              }
              unsavedMeasurement={unsavedMeasurement}
              onUnsavedSaved={onUnsavedSaved}
            />
          )}
          {view === 'riwayat' && isMember && <RiwayatTab />}
          {view === 'profil' && isMember && <ProfilTab onSignedOut={onSignedOut} />}
          {view === 'join' && (join ? <JoinView onJoin={join} /> : <LoginView />)}
          {view === 'login' && <LoginView onJoin={join} />}
          {view === 'magic' && magicToken && <MagicView token={magicToken} onSignedIn={onSignedIn} />}
          {view === 'deleted' && <DeletedView onClose={close} />}
        </div>
      </div>
      {notice && (
        <div role="status" className="mdz-toast">
          {notice}
        </div>
      )}
    </div>
  )
}
