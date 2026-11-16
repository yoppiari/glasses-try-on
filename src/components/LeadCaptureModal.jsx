import { useState, useMemo, useEffect, useRef } from 'react'
import {
  INDONESIA_CITIES,
  normalizePhone,
  mapWidthToSizeCategory,
  getStoredAttribution,
  getStoredLeadState,
  identify,
} from '../sdk/doozCapture'

export default function LeadCaptureModal({
  isOpen,
  onClose,
  selectedProduct,
  fitInfo,
  triedProducts = [],
  onOpenPortal,
}) {
  const existingLead = getStoredLeadState()
  const attribution = getStoredAttribution()

  const [fullName, setFullName] = useState(existingLead?.full_name || '')
  const [phoneInput, setPhoneInput] = useState('')
  const [cityRegency, setCityRegency] = useState(existingLead?.city_regency || '')
  const [citySearch, setCitySearch] = useState(existingLead?.city_regency || '')
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [consentCrmWa, setConsentCrmWa] = useState(true)
  const [honeypot, setHoneypot] = useState('')
  const [humanVerified, setHumanVerified] = useState(true)
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
    const q = citySearch.trim().toLowerCase()
    if (!q) return INDONESIA_CITIES.slice(0, 40)
    return INDONESIA_CITIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 40)
  }, [citySearch])

  const measuredWidthMm = useMemo(() => {
    if (fitInfo?.faceWidth && fitInfo.faceWidth > 0) return Math.round(fitInfo.faceWidth)
    if (selectedProduct?.frameWidth) return Math.round(selectedProduct.frameWidth)
    return 138
  }, [fitInfo, selectedProduct])

  const sizeCategory = useMemo(() => {
    return mapWidthToSizeCategory(measuredWidthMm)
  }, [measuredWidthMm])

  if (!isOpen) return null

  const handleSelectCity = (city) => {
    setCityRegency(city)
    setCitySearch(city)
    setCityDropdownOpen(false)
    setErrorMsg('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Mohon isi Nama Lengkap Anda (minimal 2 karakter).')
      return
    }
    const check = normalizePhone(phoneInput)
    if (!check.valid) {
      setErrorMsg(check.error)
      return
    }
    const finalCity = cityRegency.trim() || citySearch.trim()
    if (!finalCity) {
      setErrorMsg('Mohon pilih Kota/Kabupaten domisili Anda.')
      return
    }
    if (!consentCrmWa) {
      setErrorMsg('Mohon centang persetujuan penyimpanan hasil ukur & pengiriman tautan WhatsApp.')
      return
    }
    if (!humanVerified) {
      setErrorMsg('Mohon centang verifikasi anti-spam terlebih dahulu.')
      return
    }

    setSubmitting(true)
    try {
      const skuList = Array.from(
        new Set([
          ...(triedProducts.map((p) => p.sku || p.id).filter(Boolean)),
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
        turnstile_token: humanVerified ? 'dooz-turnstile-ok-v1' : '',
      })

      setSubmittedResult(result)
    } catch (err) {
      setErrorMsg(err.message || 'Terjadi kendala saat menyimpan hasil ukur.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dooz-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
      <div className="dooz-modal-card">
        <div className="dooz-modal-header">
          <div>
            <span className="dooz-chip">DOOZ Omnichannel CRM</span>
            <h2 id="lead-modal-title">Simpan Ukuran & Kartu Member WA</h2>
          </div>
          <button
            type="button"
            className="dooz-close-btn"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Ringkasan Hasil Ukur / Try-On */}
        <div className="dooz-measurement-banner">
          <div className="dooz-meas-stat">
            <span className="dooz-meas-label">Estimasi Lebar Frame</span>
            <strong className="dooz-meas-val">{measuredWidthMm} mm</strong>
          </div>
          <div className="dooz-meas-divider" />
          <div className="dooz-meas-stat">
            <span className="dooz-meas-label">Kategori Ukuran DOOZ</span>
            <strong className="dooz-meas-val highlight">Size {sizeCategory}</strong>
          </div>
          <div className="dooz-meas-divider" />
          <div className="dooz-meas-stat">
            <span className="dooz-meas-label">Frame Dicoba</span>
            <strong className="dooz-meas-val">{selectedProduct?.name || 'Classic Black'}</strong>
          </div>
        </div>

        {(attribution?.host || attribution?.sesi || attribution?.outlet) && (
          <div className="dooz-attribution-pill">
            <span>🔗 Sesi Terhubung:</span>
            {attribution.src && <strong>{attribution.src}</strong>}
            {attribution.host && <span>• Host: {attribution.host}</span>}
            {attribution.sesi && <span>• Sesi: {attribution.sesi}</span>}
            {attribution.outlet && <span>• Outlet: {attribution.outlet}</span>}
            {attribution.sig && <span className="sig-verified">✓ Signed</span>}
          </div>
        )}

        {!submittedResult ? (
          <form onSubmit={handleSubmit} className="dooz-lead-form" noValidate>
            {/* Honeypot anti-spam (hidden from real users) */}
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
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

            <div className="dooz-field">
              <label htmlFor="lead-full-name">Nama Lengkap *</label>
              <input
                id="lead-full-name"
                type="text"
                placeholder="Contoh: Rina Kartika"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="dooz-field">
              <label htmlFor="lead-wa-phone">Nomor WhatsApp Aktif *</label>
              <input
                id="lead-wa-phone"
                type="tel"
                placeholder="Contoh: 081234567890 atau +62812..."
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                required
              />
              {phonePreview && (
                <div className={`dooz-phone-hint ${phonePreview.valid ? 'valid' : 'invalid'}`}>
                  {phonePreview.valid ? (
                    <>
                      <span>✓ Format kanonik: <strong>{phonePreview.normalized}</strong></span>
                      <span>Privasi: {phonePreview.masked}</span>
                    </>
                  ) : (
                    <span>⚠ {phonePreview.error}</span>
                  )}
                </div>
              )}
            </div>

            <div className="dooz-field" ref={dropdownRef}>
              <label htmlFor="lead-city-search">Kota / Kabupaten (Ketik untuk mencari) *</label>
              <div className="dooz-combobox">
                <input
                  id="lead-city-search"
                  type="text"
                  placeholder="Cari Kota / Kabupaten (misal: Surakarta, Sukoharjo, Bandung...)"
                  value={citySearch}
                  onFocus={() => setCityDropdownOpen(true)}
                  onChange={(e) => {
                    setCitySearch(e.target.value)
                    setCityRegency(e.target.value)
                    setCityDropdownOpen(true)
                  }}
                  autoComplete="off"
                  required
                />
                <button
                  type="button"
                  className="dooz-combobox-toggle"
                  onClick={() => setCityDropdownOpen((o) => !o)}
                  aria-label="Buka daftar kota"
                >
                  ▾
                </button>
              </div>
              {cityDropdownOpen && (
                <ul className="dooz-city-dropdown" role="listbox">
                  {filteredCities.length > 0 ? (
                    filteredCities.map((city) => (
                      <li
                        key={city}
                        role="option"
                        aria-selected={cityRegency === city}
                        className={cityRegency === city ? 'selected' : ''}
                        onClick={() => handleSelectCity(city)}
                      >
                        {city}
                      </li>
                    ))
                  ) : (
                    <li className="empty">
                      Gunakan "{citySearch}" sebagai Kota/Kabupaten
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Anti-Bot / Turnstile Ringan */}
            <div className="dooz-turnstile-box">
              <label className="dooz-checkbox-label">
                <input
                  type="checkbox"
                  checked={humanVerified}
                  onChange={(e) => setHumanVerified(e.target.checked)}
                />
                <span>Verifikasi Keamanan: Saya manusia (Proteksi Anti-Spam Turnstile DOOZ)</span>
              </label>
              <span className="turnstile-badge">🛡️ Protected</span>
            </div>

            {/* Consent Eksplisit UU PDP */}
            <div className="dooz-consent-box">
              <label className="dooz-checkbox-label">
                <input
                  type="checkbox"
                  checked={consentCrmWa}
                  onChange={(e) => setConsentCrmWa(e.target.checked)}
                />
                <span>
                  Saya menyetujui penyimpanan ukuran frame, riwayat try-on, dan pengiriman tautan{' '}
                  <strong>Kartu Member Digital & Voucher DOOZ</strong> melalui WhatsApp sesuai Kebijakan Privasi (UU PDP).
                </span>
              </label>
            </div>

            {errorMsg && <div className="dooz-error-alert">{errorMsg}</div>}

            <div className="dooz-form-actions">
              <button type="button" className="dooz-btn-secondary" onClick={onClose}>
                Nanti Saja
              </button>
              <button type="submit" className="dooz-btn-primary" disabled={submitting}>
                {submitting ? 'Membuat Kode Verifikasi...' : 'Lanjut Verifikasi WA →'}
              </button>
            </div>
          </form>
        ) : (
          <div className="dooz-verify-step">
            <div className="dooz-uniform-notice">
              <span className="notice-icon">✅</span>
              <p>{submittedResult.message}</p>
            </div>

            <div className="dooz-dz-code-box">
              <span className="dz-label">Kode Verifikasi Sekali Pakai (Berlaku 30 Menit)</span>
              <strong className="dz-code">{submittedResult.verification_code}</strong>
              <span className="dz-sub">
                Minimisasi Privasi: Pesan WhatsApp hanya memuat kode <strong>{submittedResult.verification_code}</strong> tanpa menyertakan nama atau kota Anda di chat.
              </span>
            </div>

            <a
              href={submittedResult.wa_me_url}
              target="_blank"
              rel="noopener noreferrer"
              className="dooz-wa-cta-button"
            >
              <span>💬 Kirim hasil ke WA saya</span>
            </a>

            <div className="dooz-verify-footer-actions">
              <button
                type="button"
                className="dooz-btn-secondary"
                onClick={() => setSubmittedResult(null)}
              >
                ← Ubah Data Input
              </button>
              {onOpenPortal && (
                <button
                  type="button"
                  className="dooz-btn-outline"
                  onClick={() => {
                    onClose()
                    onOpenPortal()
                  }}
                >
                  👤 Buka Portal "Data Saya"
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
