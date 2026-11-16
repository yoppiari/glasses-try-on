/**
 * Komponen brand Kacamata DOOZ (Brand Guidelines v1.0) — disalin dari mini app Ukur Frame
 * (`ukur-frame-dooz/src/components/BrandMark.tsx` & `Header.tsx`) agar semua layar seragam.
 */

/**
 * Wordmark resmi "KACAMATA DOOZ" bertumpuk 2 baris: baris atas "KACAMATA" (tracking lebar),
 * baris bawah "DOOZ" dengan logogram dua lensa "OO". Area aman 0,5x tinggi logo.
 */
export function DoozWordmark({ variant = 'primary', height = 32, clearSpace = true, className = '' }) {
  const color = variant === 'reverse' ? '#FFFFFF' : '#EC6702'
  const pad = clearSpace ? Math.round(height * 0.5) : 0
  const width = Math.round((height * 170) / 62)
  return (
    <span className={`dz-wordmark ${className}`} style={{ padding: pad, color }}>
      <svg viewBox="0 0 170 62" width={width} height={height} fill="none" role="img" aria-label="Kacamata DOOZ">
        <text
          x="85"
          y="13.5"
          textAnchor="middle"
          textLength="112"
          lengthAdjust="spacing"
          fill="currentColor"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="12.5"
          fontWeight="600"
        >
          KACAMATA
        </text>
        <path
          d="M11 24.8H19.5C28.5 24.8 32 30.5 32 40C32 49.5 28.5 55.2 19.5 55.2H11Z"
          stroke="currentColor"
          strokeWidth="5.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M39.5 37.5H45" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
        <circle cx="62" cy="40" r="15.2" stroke="currentColor" strokeWidth="5.6" />
        <path d="M77.5 37.5Q84 34.8 90.5 37.5" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
        <circle cx="106" cy="40" r="15.2" stroke="currentColor" strokeWidth="5.6" />
        <path d="M123 37.5H128.5" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
        <path
          d="M136.5 24.8H158.5L136.5 55.2H158.5"
          stroke="currentColor"
          strokeWidth="5.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** Logogram dua lensa "OO" sebagai elemen pendamping (badge / label). */
export function DoozLogogram({ variant = 'primary', size = 14, className = '' }) {
  const stroke = variant === 'reverse' ? '#FFFFFF' : '#EC6702'
  return (
    <svg
      viewBox="0 0 44 20"
      width={Math.round((size * 44) / 20)}
      height={size}
      fill="none"
      className={`dz-logogram ${className}`}
      aria-hidden="true"
    >
      <path d="M2.5 9.2H5.5" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12.5" cy="10" r="6.5" stroke={stroke} strokeWidth="2.5" />
      <path d="M19 9.2Q22 7.8 25 9.2" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="31.5" cy="10" r="6.5" stroke={stroke} strokeWidth="2.5" />
      <path d="M38.5 9.2H41.5" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

/** Bahasa grafis resmi: Sudut Membingkai (corner brackets). Induk harus `position: relative`. */
export function CornerBrackets({ tone = 'orange' }) {
  return (
    <span className={`dz-brackets dz-brackets--${tone}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/** Header Night Ink (#252A2D) dengan wordmark reversi putih — sama dengan Ukur Frame. */
export function AppHeader({ subtitle, actions, homeHref }) {
  const mark = <DoozWordmark variant="reverse" height={24} clearSpace />
  return (
    <header className="dz-header">
      <div className="dz-header__brand">
        {homeHref ? (
          <a href={homeHref} className="dz-header__home" aria-label="Kacamata DOOZ — beranda">
            {mark}
          </a>
        ) : (
          mark
        )}
        {subtitle && <span className="dz-header__subtitle">{subtitle}</span>}
      </div>
      {actions && <div className="dz-header__actions">{actions}</div>}
    </header>
  )
}
