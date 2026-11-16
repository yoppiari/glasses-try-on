import { useMemberDooz } from './MemberDoozProvider.tsx'
import { MemberIcon, cx } from './ui.tsx'

/**
 * Tombol "Member DOOZ" untuk pojok kanan atas header mini app.
 * - Sudah member: inisial + "Member" → panel Kartu Member.
 * - Belum member: "Jadi Member" (app dengan ajakan simpan, mis. App Ukur) atau "Masuk" (app lain).
 */
export function MemberDoozButton({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  const { isMember, session, me, open, canJoin } = useMemberDooz()
  const name = me?.full_name || me?.first_name_masked || session?.first_name || ''
  const initial = (name.trim()[0] || 'D').toUpperCase()
  return (
    <button
      type="button"
      onClick={() => open()}
      className={cx('mdz-root mdz-trigger', `mdz-trigger--${tone}`, isMember && 'mdz-trigger--member', className)}
      aria-label={isMember ? 'Member DOOZ: Kartu Member, Ukuran Saya, Riwayat, Profil' : canJoin ? 'Jadi Member DOOZ' : 'Masuk Member DOOZ'}
      data-member-dooz-button=""
    >
      {isMember ? (
        <>
          <span className="mdz-trigger__avatar" aria-hidden>
            {initial}
          </span>
          <span className="mdz-trigger__label">Member</span>
        </>
      ) : (
        <>
          <MemberIcon />
          <span className="mdz-trigger__label">{canJoin ? 'Jadi Member' : 'Masuk'}</span>
        </>
      )}
    </button>
  )
}
