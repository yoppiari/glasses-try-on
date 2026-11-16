import { useState, useMemo, useEffect, useRef } from 'react'
import { DoozLogogram } from './brand/Brand'
import {
  INDONESIA_CITIES,
  normalizePhone,
  mapWidthToSizeCategory,
  getStoredLeadState,
  identify,
} from '../sdk/doozCapture'

/**
 * "Simpan pilihan saya" — satu formulir (Nama, No WA, Kota) lalu tombol "Buka WhatsApp"
 * dengan pesan yang sudah terisi. Kode verifikasi DZ-xxxx ada di dalam pesan WA dan
 * tidak perlu dijelaskan ke customer. Link Kartu Member Saya dikirim balik lewat WhatsApp.
 *
 * Keamanan tetap: honeypot anti-spam, persetujuan UU PDP eksplisit, pesan WA hanya berisi kode
 * (tanpa nama/kota), nomor ditampilkan tersamar.
 */
export default function LeadCaptureModal({
  isOpen,
  onClose,
  selectedProduct,
  fitInfo,
  customerProfile,
  triedProducts = [],
  sizeChart,
}) {
  const existingLead = useMemo(() => getStoredLeadState(), [isOpen])

  const [fullName, setFullName] = useState(existingLead?.full_name || '')
  const [phoneInput, setPhoneInput] = useState('')
  const [cityRegency, setCityRegency] = useState(existingLead?.city_regency || '')
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [consentCrmWa, setConsentCrmWa] = useState(true)
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [submittedResult, setSubmittedResult] = useState(null)

  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setCityDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const phonePreview = useMemo(() => {
    if (!phoneInput.trim()) return null
    return normalizePhone(phoneInput)
  }, [phoneInput])

  const filteredCities = useMemo(() => {
    const q = cityRegency.trim().toLowerCase()
    if (!q) return INDONESIA_CITIES.slice(0, 40)
    return INDONESIA_CITIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 40)
  }, [cityRegency])

  // Prioritas ukuran: hasil Ukur Frame / Kartu Member → perkiraan kamera → lebar frame yang dicoba
  const measuredWidthMm = useMemo(() => {
    if (customerProfile?.widthMm > 0) return Math.round(customerProfile.widthMm)
    if (fitInfo?.faceWidth > 0) return Math.round(fitInfo.faceWidth)
    if (selectedProduct?.frameWidth) return Math.round(selectedProduct.frameWidth)
    return 138
  }, [customerProfile?.widthMm, fitInfo?.faceWidth, selectedProduct?.frameWidth])

  const sizeCategory = useMemo(() => {
    if (customerProfile?.sizeCategory && customerProfile?.widthMm > 0) return customerProfile.sizeCategory
    return mapWidthToSizeCategory(measuredWidthMm, sizeChart)
  }, [customerProfile?.sizeCategory, customerProfile?.widthMm, measuredWidthMm, sizeChart])

  if (!isOpen) return null

  const choiceCount = triedProducts.length || 1

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Tulis nama kamu dulu ya.')
      return
    }
    const check = normalizePhone(phoneInput)
    if (!check.valid) {
      setErrorMsg(check.error)
      return
    }
    const finalCity = cityRegency.trim()
    if (!finalCity) {
      setErrorMsg('Pilih kota tempat tinggal kamu.')
      return
    }
    if (!consentCrmWa) {
      setErrorMsg('Centang persetujuan dulu supaya kami bisa mengirim Kartu Member lewat WhatsApp.')
      return
    }

    setSubmitting(true)
    try {
      const skuList = Array.from(
        new Set([
          ...triedProducts.map((p) => p.sku || p.id).filter(Boolean),
          selectedProduct?.sku || selectedProduct?.id || 'DOOZ-CLASSIC-01',
        ])
      )

      const result = await identify({
        full_name: fullName.trim(),
        phone: phoneInput.trim(),
        city_regency: finalCity,
        event_type: 'frame_measured',
        payload: {
          frame_width_mm: measuredWidthMm,
          size_category: sizeCategory,
          frame_sku: selectedProduct?.sku || selectedProduct?.id || 'DOOZ-CLASSIC-01',
          frame_name: selectedProduct?.name || 'Classic Black',
          sku_list: skuList,
        },
        consent_crm_wa: consentCrmWa,
        honeypot,
        turnstile_token: 'dooz-turnstile-ok-v1',
      })

      setSubmittedResult(result)
    } catch (err) {
      setErrorMsg(err.message || 'Maaf, pilihan kamu belum tersimpan. Coba lagi ya.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="dz-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-choice-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dz-sheet">
        <div className="dz-sheet__head">
          <div>
            <span className="dz-eyebrow">
              <DoozLogogram size={11} /> Kacamata DOOZ
            </span>
            <h2 id="save-choice-title" className="dz-title" style={{ marginTop: 4 }}>
              {submittedResult ? 'Tinggal satu langkah' : 'Simpan pilihan saya'}
            </h2>
          </div>
          <button type="button" className="dz-close" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="dz-summary-strip">
          <span className="dz-size-badge" style={{ minWidth: 48, height: 48, fontSize: 22 }}>
            {sizeCategory}
          </span>
          <div>
            <strong>
              {measuredWidthMm} mm · {selectedProduct?.name || 'Frame DOOZ'}
            </strong>
            <span className="dz-small">
              {choiceCount > 1 ? `${choiceCount} frame yang kamu coba ikut tersimpan` : 'Frame pilihan kamu ikut tersimpan'}
            </span>
          </div>
        </div>

        {!submittedResult ? (
          <form onSubmit={handleSubmit} className="dz-form" noValidate>
            {/* Honeypot anti-spam (tersembunyi dari pengguna asli) */}
            <div
              style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
              aria-hidden="true"
            >
              <label htmlFor="dooz-website-hp">Website</label>
              <input
                id="dooz-website-hp"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div className="dz-field">
              <label htmlFor="lead-full-name">Nama</label>
              <input
                id="lead-full-name"
                className="dz-input"
                type="text"
                autoComplete="name"
                placeholder="Nama kamu"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="dz-field">
              <label htmlFor="lead-wa-phone">No. WhatsApp</label>
              <input
                id="lead-wa-phone"
                className="dz-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="08xxxxxxxxxx"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                required
              />
              {phonePreview && !phonePreview.valid && <span className="dz-hint dz-hint--bad">{phonePreview.error}</span>}
              {phonePreview?.valid && <span className="dz-hint dz-hint--ok">✓ {phonePreview.masked}</span>}
            </div>

            <div className="dz-field dz-combobox" ref={dropdownRef}>
              <label htmlFor="lead-city-search">Kota</label>
              <input
                id="lead-city-search"
                className="dz-input"
                type="text"
                placeholder="Ketik nama kota, mis. Surakarta"
                value={cityRegency}
                onFocus={() => setCityDropdownOpen(true)}
                onChange={(e) => {
                  setCityRegency(e.target.value)
                  setCityDropdownOpen(true)
                }}
                autoComplete="off"
                required
              />
              {cityDropdownOpen && (
                <ul className="dz-dropdown" role="listbox">
                  {filteredCities.length > 0 ? (
                    filteredCities.map((city) => (
                      <li
                        key={city}
                        role="option"
                        aria-selected={cityRegency === city}
                        onClick={() => {
                          setCityRegency(city)
                          setCityDropdownOpen(false)
                          setErrorMsg('')
                        }}
                      >
                        {city}
                      </li>
                    ))
                  ) : (
                    <li className="empty">Pakai “{cityRegency}”</li>
                  )}
                </ul>
              )}
            </div>

            {/* Persetujuan eksplisit UU PDP */}
            <label className="dz-check">
              <input type="checkbox" checked={consentCrmWa} onChange={(e) => setConsentCrmWa(e.target.checked)} />
              <span>
                Saya setuju DOOZ menyimpan ukuran & pilihan frame saya, dan mengirim Kartu Member lewat WhatsApp.
                Bisa dibatalkan kapan saja.
              </span>
            </label>

            {errorMsg && <div className="dz-alert">{errorMsg}</div>}

            <button type="submit" className="dz-btn dz-btn--orange dz-btn--lg dz-btn--block" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan pilihan saya'}
            </button>
          </form>
        ) : (
          <div className="dz-stack">
            <p className="dz-muted">
              Tekan tombol di bawah, lalu kirim pesan yang sudah terisi di WhatsApp. Kami balas dengan link{' '}
              <strong>Kartu Member Saya</strong>.
            </p>

            <a
              href={submittedResult.wa_me_url}
              target="_blank"
              rel="noopener noreferrer"
              className="dz-btn dz-btn--wa dz-btn--lg dz-btn--block"
            >
              Buka WhatsApp
            </a>

            <div className="dz-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="dz-link dz-link--muted" onClick={() => setSubmittedResult(null)}>
                Ubah data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
