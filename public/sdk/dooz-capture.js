/**
 * DOOZ Shared Capture SDK (Standalone Embeddable Bundle v1.0)
 * Exposes `window.DoozCaptureSDK` for any DOOZ mini-app or outlet kiosk.
 */
;(function (global) {
  'use strict'

  var STORAGE_KEYS = {
    ATTRIBUTION: 'dooz_attribution_v1',
    LEAD_STATE: 'dooz_lead_state_v1',
    PORTAL_SESSION: 'dooz_member_session_v1',
    LOCAL_EVENTS: 'dooz_local_events_v1',
  }

  var DEFAULT_OFFICIAL_WA = '6281122334455'

  var INDONESIA_CITIES = [
    'Kota Surakarta (Solo)',
    'Kab. Sukoharjo',
    'Kab. Karanganyar',
    'Kab. Boyolali',
    'Kab. Klaten',
    'Kab. Sragen',
    'Kab. Wonogiri',
    'Kota Yogyakarta',
    'Kab. Sleman',
    'Kab. Bantul',
    'Kota Semarang',
    'Kab. Semarang',
    'Kota Salatiga',
    'Kota Magelang',
    'Kab. Banyumas (Purwokerto)',
    'Kota Jakarta Selatan',
    'Kota Jakarta Pusat',
    'Kota Jakarta Barat',
    'Kota Jakarta Timur',
    'Kota Jakarta Utara',
    'Kota Bogor',
    'Kota Depok',
    'Kota Tangerang',
    'Kota Tangerang Selatan',
    'Kota Bekasi',
    'Kota Bandung',
    'Kota Cirebon',
    'Kota Surabaya',
    'Kab. Sidoarjo',
    'Kab. Gresik',
    'Kota Malang',
    'Kota Madiun',
    'Kota Kediri',
    'Kota Denpasar',
    'Kota Medan',
    'Kota Padang',
    'Kota Pekanbaru',
    'Kota Batam',
    'Kota Palembang',
    'Kota Bandar Lampung',
    'Kota Pontianak',
    'Kota Banjarmasin',
    'Kota Balikpapan',
    'Kota Samarinda',
    'Kota Makassar',
    'Kota Manado',
    'Kota Mataram',
    'Kota Kupang',
    'Kota Jayapura',
  ]

  function maskPhoneDisplay(phone) {
    if (!phone) return '08******'
    var digits = String(phone).replace(/\D+/g, '')
    var local = digits.indexOf('62') === 0 ? '0' + digits.slice(2) : digits
    if (local.length < 8) return '08******'
    return local.slice(0, 4) + '****' + local.slice(-4)
  }

  function normalizePhone(raw) {
    if (!raw || typeof raw !== 'string') {
      return { valid: false, normalized: '', masked: '', error: 'Nomor WhatsApp wajib diisi' }
    }
    var digits = raw.replace(/\D+/g, '')
    if (digits.indexOf('08') === 0) {
      digits = '62' + digits.slice(1)
    } else if (digits.indexOf('8') === 0) {
      digits = '62' + digits
    } else if (digits.indexOf('00628') === 0) {
      digits = digits.slice(2)
    }
    if (digits.indexOf('628') !== 0 || digits.length < 10 || digits.length > 15) {
      return {
        valid: false,
        normalized: digits,
        masked: '',
        error: 'Format nomor WhatsApp Indonesia tidak valid (contoh: 081234567890)',
      }
    }
    return { valid: true, normalized: digits, masked: maskPhoneDisplay(digits) }
  }

  function mapWidthToSizeCategory(widthMm) {
    var n = Number(widthMm)
    if (!isFinite(n) || n <= 0) return 'M'
    if (n <= 127) return 'XS'
    if (n <= 133) return 'S'
    if (n <= 139) return 'M'
    if (n <= 145) return 'L'
    return 'XL'
  }

  function buildWAMeVerifyURL(dzCode, officialWANumber) {
    var cleanCode = String(dzCode || 'DZ-0000').trim().toUpperCase()
    var cleanWA = String(officialWANumber || DEFAULT_OFFICIAL_WA).replace(/\D+/g, '') || DEFAULT_OFFICIAL_WA
    var text = 'Halo DOOZ, verifikasi hasil ukur saya kode: ' + cleanCode
    return 'https://wa.me/' + cleanWA + '?text=' + encodeURIComponent(text)
  }

  function captureAttributionFromURL(searchString) {
    var qs = typeof searchString === 'string' ? searchString : (global.location ? global.location.search : '')
    if (!qs) return getStoredAttribution()
    var params = new URLSearchParams(qs)
    var src = (params.get('src') || '').trim()
    var host = (params.get('host') || '').trim()
    var sesi = (params.get('sesi') || '').trim()
    var outlet = (params.get('outlet') || '').trim()
    var sig = (params.get('sig') || '').trim()
    if (!src && !host && !sesi && !outlet && !sig) return getStoredAttribution()
    var attr = {
      src: src || 'direct_web',
      host: host,
      sesi: sesi,
      outlet: outlet,
      sig: sig,
      captured_at: new Date().toISOString(),
    }
    try {
      global.sessionStorage && global.sessionStorage.setItem(STORAGE_KEYS.ATTRIBUTION, JSON.stringify(attr))
      global.localStorage && global.localStorage.setItem(STORAGE_KEYS.ATTRIBUTION, JSON.stringify(attr))
    } catch (e) {}
    return attr
  }

  function getStoredAttribution() {
    try {
      var raw =
        (global.sessionStorage && global.sessionStorage.getItem(STORAGE_KEYS.ATTRIBUTION)) ||
        (global.localStorage && global.localStorage.getItem(STORAGE_KEYS.ATTRIBUTION))
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return { src: 'direct_web', host: '', sesi: '', outlet: '', sig: '' }
  }

  function identify(input, options) {
    options = options || {}
    var base = (options.apiBase || global.DOOZ_HUB_API_BASE || '').replace(/\/+$/, '')
    var fullName = String((input && (input.full_name || input.fullName)) || '').trim()
    var rawPhone = String((input && (input.phone || input.phoneRaw)) || '').trim()
    var cityRegency = String((input && (input.city_regency || input.cityRegency)) || '').trim()
    var phoneCheck = normalizePhone(rawPhone)
    if (!fullName || fullName.length < 2) {
      return Promise.reject(new Error('Nama lengkap wajib diisi minimal 2 karakter.'))
    }
    if (!phoneCheck.valid) {
      return Promise.reject(new Error(phoneCheck.error))
    }
    if (!cityRegency) {
      return Promise.reject(new Error('Silakan pilih Kota/Kabupaten terlebih dahulu.'))
    }
    var attr = getStoredAttribution()
    var body = {
      full_name: fullName,
      phone: phoneCheck.normalized,
      city_regency: cityRegency,
      event_type: (input && input.event_type) || 'frame_measured',
      payload: (input && input.payload) || {},
      src: (input && input.src) || attr.src || 'mini_app',
      host: (input && input.host) || attr.host || '',
      sesi: (input && input.sesi) || attr.sesi || '',
      sig: (input && input.sig) || attr.sig || '',
      consent_crm_wa: Boolean(input && input.consent_crm_wa !== false),
      consent_health_prescription: Boolean(input && input.consent_health_prescription),
      honeypot: String((input && input.honeypot) || ''),
      turnstile_token: String((input && input.turnstile_token) || 'dooz-turnstile-verified-v1'),
    }
    return fetch(base + '/api/capture/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Gagal menyimpan data.')
        try {
          global.localStorage && global.localStorage.setItem(STORAGE_KEYS.LEAD_STATE, JSON.stringify(data))
        } catch (e) {}
        return data
      })
    })
  }

  function track(eventType, payload, options) {
    options = options || {}
    var base = (options.apiBase || global.DOOZ_HUB_API_BASE || '').replace(/\/+$/, '')
    var attr = getStoredAttribution()
    var contactId = options.contact_id || ''
    if (!contactId) {
      try {
        var st = JSON.parse(global.localStorage.getItem(STORAGE_KEYS.LEAD_STATE) || '{}')
        contactId = st.contact_id || ''
      } catch (e) {}
    }
    return fetch(base + '/api/capture/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contactId,
        event_type: eventType,
        payload: payload || {},
        src: options.src || attr.src || 'mini_app',
        host: options.host || attr.host || '',
        sesi: options.sesi || attr.sesi || '',
      }),
    }).then(function (r) {
      return r.json()
    })
  }

  global.DoozCaptureSDK = {
    normalizePhone: normalizePhone,
    maskPhoneDisplay: maskPhoneDisplay,
    mapWidthToSizeCategory: mapWidthToSizeCategory,
    buildWAMeVerifyURL: buildWAMeVerifyURL,
    captureAttributionFromURL: captureAttributionFromURL,
    getStoredAttribution: getStoredAttribution,
    identify: identify,
    track: track,
    INDONESIA_CITIES: INDONESIA_CITIES,
  }
})(typeof window !== 'undefined' ? window : this)
