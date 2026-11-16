/** Tipe data API Member DOOZ CRM (kontrak: repo dooz-crm `docs/api.md` & `docs/api-ukuran-saya.md`). */

export type Comfort = 'pas_nyaman' | 'kurang_nyaman' | 'tidak_pas'
export type MeasurementSource = 'self_measure' | 'outlet' | 'temple_label'

export interface Measurement {
  id: string
  customer_id?: string
  name: string
  note: string
  frame_width_mm: number
  size_category: string
  lens_mm: number | null
  bridge_mm: number | null
  temple_mm: number | null
  comfort: Comfort | null
  is_primary: boolean
  source: MeasurementSource
  created_at: string
  updated_at: string
}

export interface MeasurementList {
  measurements: Measurement[]
  primary_measurement: Measurement | null
  count: number
  max: number
}

export interface CreateMeasurementInput {
  name?: string
  note?: string
  frame_width_mm?: number
  source?: 'self_measure' | 'temple_label'
  temple_label?: string
  lens_mm?: number
  bridge_mm?: number
  temple_mm?: number
  comfort?: Comfort | null
  set_primary?: boolean
}

export interface MeasurementPatch {
  name?: string
  note?: string
  comfort?: Comfort | null
}

export interface EventPayload {
  frame_width_mm?: number
  bridge_mm?: number
  temple_mm?: number
  size_category?: string
  frame_sku?: string
  frame_name?: string
  outlet_id?: string
  voucher_code?: string
  notes?: string
}

export interface ContactEvent {
  id: string
  event_type: string
  src?: string
  payload: EventPayload
  created_at: string
}

export interface Consent {
  scope: string
  granted: boolean
  updated_at?: string
  granted_at?: string
}

export interface PortalMe {
  contact_id?: string
  access_scope: string
  requires_name_confirm: boolean
  member_code: string
  first_name_masked: string
  full_name?: string
  phone_masked: string
  city_regency?: string
  verification_status?: string
  primary_size_category?: string
  primary_measurement?: Measurement | null
  measurements?: Measurement[]
  tried_frames?: ContactEvent[]
  store_visits?: ContactEvent[]
  vouchers?: ContactEvent[]
  consents?: Consent[]
  qr_token?: string
  qr_token_expires_at?: string
}

export interface ProfilePatch {
  full_name?: string
  city_regency?: string
}

export interface MemberSession {
  session_token: string
  access_scope?: string
  member_code?: string
  first_name?: string
  expires_at?: string
}

/** Respons `POST /api/capture/verification-status`. */
export interface VerificationStatus {
  kind?: 'register' | 'login'
  status: 'pending' | 'verified' | 'expired' | 'link_sent' | 'not_member' | 'not_found' | string
  expires_at?: string
  wa_me_url?: string
  member_code?: string
  first_name_masked?: string
  session_token?: string
  access_scope?: string
  session_expires_at?: string
  session_claimed?: boolean
  login_required?: boolean
  existing_member?: boolean
  primary_measurement?: Measurement | null
}

export interface WhatsAppLoginRequest {
  login_code: string
  poll_token: string
  wa_me_url: string
  expires_at: string
  message?: string
}

export interface MagicLinkInfo {
  valid: boolean
  member_code: string
  first_name_masked: string
  requires_name_confirm: boolean
}

export interface SessionGrant {
  session_token: string
  access_scope: string
  requires_name_confirm?: boolean
  member_code: string
  expires_at: string
}

export interface HandoffResult {
  handoff_token: string
  target_app: string
  expires_at: string
  url: string
}

/** Token sekali pakai yang dibawa URL saat app dibuka (`?masuk=` dari WhatsApp, `?handoff=` dari app lain). */
export interface UrlTokens {
  magic?: string
  handoff?: string
}
