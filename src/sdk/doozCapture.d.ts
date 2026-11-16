export interface PhoneNormalizationResult {
  valid: boolean
  normalized: string
  masked: string
  error?: string
}

export interface AttributionData {
  src: string
  host: string
  sesi: string
  outlet?: string
  sig?: string
  captured_at?: string
}

export interface EventPayload {
  frame_width_mm?: number
  bridge_mm?: number
  temple_mm?: number
  size_category?: 'XS' | 'S' | 'M' | 'L' | 'XL' | string
  frame_sku?: string
  frame_name?: string
  sku_list?: string[]
  outlet_id?: string
  voucher_code?: string
  amount_idr?: number
  notes?: string
}

export interface IdentifyLeadInput {
  full_name: string
  phone: string
  city_regency: string
  event_type?: 'frame_measured' | 'frame_tried' | 'store_visit' | 'voucher_claimed' | 'purchase'
  payload?: EventPayload
  src?: string
  host?: string
  sesi?: string
  sig?: string
  consent_crm_wa?: boolean
  consent_health_prescription?: boolean
  honeypot?: string
  turnstile_token?: string
  /** "Ukuran Saya": disimpan sebagai ukuran utama setelah verifikasi WA (lihat docs/api-ukuran-saya.md) */
  measurement?: MeasurementInput
  app?: 'ukur'
}

export type MeasurementSource = 'self_measure' | 'outlet' | 'temple_label'
export type MeasurementComfort = 'pas_nyaman' | 'kurang_nyaman' | 'tidak_pas'

export interface MeasurementInput {
  name?: string
  note?: string
  frame_width_mm?: number
  lens_mm?: number
  bridge_mm?: number
  temple_mm?: number
  temple_label?: string
  comfort?: MeasurementComfort | null
  source?: Exclude<MeasurementSource, 'outlet'>
  set_primary?: boolean
}

export interface Measurement {
  id: string
  customer_id: string
  name: string
  note: string
  frame_width_mm: number
  size_category: 'XS' | 'S' | 'M' | 'L' | 'XL'
  lens_mm: number | null
  bridge_mm: number | null
  temple_mm: number | null
  comfort: MeasurementComfort | null
  is_primary: boolean
  source: MeasurementSource
  created_at: string
  updated_at: string
}

export interface VerificationStatus {
  kind?: 'register' | 'login'
  status: 'pending' | 'verified' | 'expired' | 'link_sent' | 'not_member' | 'not_found'
  expires_at?: string
  member_code?: string
  first_name_masked?: string
  existing_member?: boolean
  login_required?: boolean
  session_claimed?: boolean
  session_token?: string
  access_scope?: 'full' | 'basic_recycled_pending'
  session_expires_at?: string
  primary_measurement?: Measurement
  message?: string
}

export interface IdentifyLeadResult {
  contact_id: string
  verification_code: string
  expires_at: string
  wa_me_url: string
  message: string
  phone_masked?: string
  full_name?: string
  city_regency?: string
}

export declare const DEFAULT_OFFICIAL_WA: string
export declare const INDONESIA_CITIES: string[]
export declare function normalizePhone(raw: string): PhoneNormalizationResult
export declare function normalizePhoneString(raw: string): string
export declare function maskPhoneDisplay(phone: string): string
export declare function mapWidthToSizeCategory(widthMm: number): 'XS' | 'S' | 'M' | 'L' | 'XL'
export declare function buildWAMeVerifyURL(dzCode: string, officialWANumber?: string): string
export declare function captureAttributionFromURL(searchString?: string): AttributionData
export declare function getStoredAttribution(): AttributionData
export declare function clearStoredAttribution(): void
export declare function identify(input: IdentifyLeadInput, options?: { apiBase?: string; officialWANumber?: string; allowOfflineFallback?: boolean }): Promise<IdentifyLeadResult>
export declare function track(eventType: string, payload?: EventPayload, options?: { apiBase?: string; contact_id?: string }): Promise<{ ok: boolean; event: unknown }>
export declare function listMeasurements(sessionToken?: string, options?: { apiBase?: string }): Promise<{ measurements: Measurement[]; primary_measurement: Measurement | null; count: number; max: number }>
export declare function createMeasurement(input: MeasurementInput, sessionToken?: string, options?: { apiBase?: string }): Promise<{ ok: boolean; measurement: Measurement }>
export declare function updateMeasurement(id: string, patch: { name?: string; note?: string; comfort?: MeasurementComfort | null }, sessionToken?: string, options?: { apiBase?: string }): Promise<{ ok: boolean; measurement: Measurement }>
export declare function deleteMeasurement(id: string, sessionToken?: string, options?: { apiBase?: string }): Promise<{ ok: boolean; deleted_id: string; primary_measurement: Measurement | null }>
export declare function setPrimaryMeasurement(id: string, sessionToken?: string, options?: { apiBase?: string }): Promise<{ ok: boolean; measurement: Measurement }>
export declare function pollVerificationStatus(verificationCode: string, pollToken: string, options?: { apiBase?: string }): Promise<VerificationStatus>
export declare function requestWhatsAppLogin(app?: 'ukur', options?: { apiBase?: string }): Promise<{ login_code: string; poll_token: string; wa_me_url: string; expires_at: string; message: string }>
