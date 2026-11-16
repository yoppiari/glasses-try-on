/** Primitif UI modul Member DOOZ. Gaya ada di `member-dooz.css` (kelas `mdz-*`), tidak butuh Tailwind. */
import { useEffect, useMemo, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import qrcode from 'qrcode-generator'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'ink' | 'orange' | 'outline' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

export function Button({
  variant = 'ink',
  size = 'md',
  block,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button
      type="button"
      className={cx('mdz-btn', `mdz-btn--${variant}`, `mdz-btn--${size}`, block && 'mdz-btn--block', className)}
      {...props}
    />
  )
}

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" aria-pressed={active} className={cx('mdz-chip', active && 'mdz-chip--active', className)} {...props} />
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="mdz-field">
      <label htmlFor={htmlFor} className="mdz-label">
        {label}
      </label>
      {children}
      {hint && <p className="mdz-hint">{hint}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('mdz-input', props.className)} />
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('mdz-notice', `mdz-notice--${tone}`)}>
      {children}
    </div>
  )
}

export function Spinner({ large }: { large?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('mdz-spin', large && 'mdz-spin--lg')} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Loading() {
  return (
    <div className="mdz-loading">
      <Spinner large />
    </div>
  )
}

/** Bottom sheet di atas panel: bisa di-scroll, tutup lewat latar/Esc. */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="mdz-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Tutup" className="mdz-sheet__backdrop" onClick={onClose} />
      <div className="mdz-sheet__body">
        <div className="mdz-sheet__head">
          <div className="mdz-sheet__grip" aria-hidden />
          <div className="mdz-row">
            <div className="mdz-grow">
              <h2 className="mdz-sheet__title">{title}</h2>
              {subtitle && <div className="mdz-sheet__sub">{subtitle}</div>}
            </div>
            <CloseButton onClick={onClose} />
          </div>
        </div>
        <div className="mdz-sheet__content">{children}</div>
      </div>
    </div>
  )
}

export function CloseButton({ onClick, light }: { onClick: () => void; light?: boolean }) {
  return (
    <button type="button" aria-label="Tutup" onClick={onClick} className={cx('mdz-close', light && 'mdz-close--light')}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.76 4.87-1.28A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-2.89.76.77-2.82-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.37-1.7c-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42h-.47a.9.9 0 0 0-.66.31 2.77 2.77 0 0 0-.86 2.06 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.22 3.73c.59.25 1.05.4 1.4.52.6.19 1.13.16 1.56.1.47-.07 1.46-.6 1.66-1.18.2-.58.2-1.07.15-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  )
}

export function MemberIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2.2" />
      <path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3" />
    </svg>
  )
}

/** QR asli (bisa di-scan Kasir L2) dari token Kartu Member dinamis. */
export function QrCode({ value, size = 128 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value || 'DOOZ')
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
    return { path: d, count: n + 4 }
  }, [value])
  return (
    <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="QR Kartu Member DOOZ">
      <rect width={count} height={count} fill="#FFFFFF" />
      <path d={path} fill="#252A2D" />
    </svg>
  )
}

/** Wordmark teks KACAMATA / DOOZ (fallback bila app tidak memberi logo sendiri lewat prop `brand`). */
export function TextWordmark() {
  return (
    <span className="mdz-wordmark" aria-label="Kacamata DOOZ">
      <span>KACAMATA</span>
      <b>DOOZ</b>
    </span>
  )
}
