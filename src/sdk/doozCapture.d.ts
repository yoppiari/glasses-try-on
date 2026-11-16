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
