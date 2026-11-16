-- DOOZ Omnichannel CRM (Customer Hub) - Core Database Schema (PostgreSQL & SQLite Compatible)
-- Task #BMMMV: Customer Hub Backend & Database (Go + PostgreSQL) + Adapter Fonnte

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY,
    member_code VARCHAR(32) NOT NULL UNIQUE, -- DOOZ-xxxxx (display label only, not QR secret)
    phone_normalized VARCHAR(24) NOT NULL UNIQUE, -- canonical 628...
    full_name VARCHAR(255) NOT NULL,
    city_regency VARCHAR(128) NOT NULL,
    verification_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'unverified')),
    deletion_requested_at TIMESTAMPTZ NULL,
    last_active_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON contacts(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_last_active_at ON contacts(last_active_at);

CREATE TABLE IF NOT EXISTS contact_events (
    id UUID PRIMARY KEY,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('frame_measured', 'frame_tried', 'store_visit', 'voucher_claimed', 'purchase')),
    payload JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(64) NOT NULL DEFAULT '',
    host_code VARCHAR(64) NOT NULL DEFAULT '',
    session_code VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_events_contact_id ON contact_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_type ON contact_events(event_type);
CREATE INDEX IF NOT EXISTS idx_contact_events_attribution ON contact_events(source, host_code, session_code);

CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    scope VARCHAR(64) NOT NULL CHECK (scope IN ('crm_wa', 'health_prescription')),
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_consents_contact_scope ON consents(contact_id, scope);

CREATE TABLE IF NOT EXISTS verification_codes (
    code VARCHAR(24) PRIMARY KEY, -- DZ-xxxx
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone_input VARCHAR(24) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, -- TTL 30 minutes
    used_at TIMESTAMPTZ NULL, -- single-use
    used_by_phone VARCHAR(24) NULL, -- actual sender phone from Fonnte webhook
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_contact_id ON verification_codes(contact_id);

CREATE TABLE IF NOT EXISTS magic_links (
    token VARCHAR(128) PRIMARY KEY,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    requires_name_confirm BOOLEAN NOT NULL DEFAULT FALSE, -- true when contact inactive > 6 months (recycled number protection)
    expires_at TIMESTAMPTZ NOT NULL, -- TTL 10-15 minutes
    used_at TIMESTAMPTZ NULL, -- one-time POST exchange
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_links_contact_id ON magic_links(contact_id);

CREATE TABLE IF NOT EXISTS member_sessions (
    session_token VARCHAR(128) PRIMARY KEY,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    access_scope VARCHAR(32) NOT NULL DEFAULT 'full' CHECK (access_scope IN ('full', 'basic_recycled_pending')),
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL, -- max TTL 30 days
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_sessions_contact_id ON member_sessions(contact_id);

CREATE TABLE IF NOT EXISTS attribution_links (
    id UUID PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    host_code VARCHAR(64) NOT NULL,
    session_code VARCHAR(64) NOT NULL,
    outlet_id VARCHAR(64) NOT NULL DEFAULT '',
    base_url TEXT NOT NULL,
    signature VARCHAR(128) NOT NULL,
    signed_url TEXT NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    actor_user_id VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,
    outlet_id VARCHAR(64) NOT NULL DEFAULT '',
    target_contact_id VARCHAR(64) NOT NULL DEFAULT '',
    action VARCHAR(64) NOT NULL,
    access_level VARCHAR(32) NOT NULL CHECK (access_level IN ('level_1_lookup', 'level_2_qr', 'admin_export', 'admin_catalog', 'system_retention')),
    details TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, role);
