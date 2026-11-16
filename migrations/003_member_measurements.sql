-- DOOZ Omnichannel CRM (Customer Hub) - "Ukuran Saya" (multi-ukuran member)
-- Task #MPNLL. Spesifikasi: Knowledge "Flow App Ukur: Simpan Ukuran & Member Kacamata DOOZ" bagian "Data di CRM".
-- Kontrak API: docs/api-ukuran-saya.md
-- PostgreSQL & SQLite compatible (partial index didukung keduanya).

CREATE TABLE IF NOT EXISTS member_measurements (
    id UUID PRIMARY KEY,
    -- UU PDP: menghapus member (hapus data / retensi) ikut menghapus semua ukurannya.
    customer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,                       -- "Ukuran pertama saya", "Kerja", "Baca", ...
    note VARCHAR(280) NOT NULL DEFAULT '',
    frame_width_mm NUMERIC(5,1) NOT NULL CHECK (frame_width_mm BETWEEN 90 AND 200),
    -- Selalu dihitung server dari frame_width_mm + catalog_size_chart (Katalog Bersama, SSOT).
    size_category VARCHAR(8) NOT NULL REFERENCES catalog_size_chart(category),
    lens_mm NUMERIC(4,1) NULL CHECK (lens_mm IS NULL OR lens_mm BETWEEN 30 AND 75),        -- opsional (angka gagang 52□18-140)
    bridge_mm NUMERIC(4,1) NULL CHECK (bridge_mm IS NULL OR bridge_mm BETWEEN 10 AND 30),
    temple_mm NUMERIC(4,1) NULL CHECK (temple_mm IS NULL OR temple_mm BETWEEN 100 AND 170),
    comfort VARCHAR(16) NULL CHECK (comfort IS NULL OR comfort IN ('pas_nyaman', 'kurang_nyaman', 'tidak_pas')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(16) NOT NULL CHECK (source IN ('self_measure', 'outlet', 'temple_label')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_measurements_customer ON member_measurements(customer_id, created_at DESC);

-- Tepat satu ukuran utama per member:
--  * MAKSIMAL satu: dijaga DB lewat partial unique index ini.
--  * MINIMAL satu (bila member punya >=1 ukuran): dijaga logika store dalam transaksi yang sama
--    (ukuran pertama otomatis utama; set-primary menukar flag; hapus ukuran utama -> ukuran terbaru dipromosikan).
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_measurements_one_primary
    ON member_measurements(customer_id) WHERE is_primary;

-- Identify App Ukur membawa ukuran yang disimpan setelah verifikasi WA DZ-xxxx + polling status (Layar 5).
ALTER TABLE verification_codes ADD COLUMN poll_token_hash VARCHAR(64) NULL;      -- sha256(poll_token)
ALTER TABLE verification_codes ADD COLUMN app VARCHAR(16) NULL;                  -- 'ukur'
ALTER TABLE verification_codes ADD COLUMN pending_measurement JSONB NULL;        -- MeasurementInput tervalidasi
ALTER TABLE verification_codes ADD COLUMN full_name_input VARCHAR(255) NULL;
ALTER TABLE verification_codes ADD COLUMN city_input VARCHAR(128) NULL;
ALTER TABLE verification_codes ADD COLUMN consent_crm_wa_input BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE verification_codes ADD COLUMN verified_contact_id UUID NULL REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE verification_codes ADD COLUMN verified_at TIMESTAMPTZ NULL;
ALTER TABLE verification_codes ADD COLUMN new_member BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE verification_codes ADD COLUMN recycled_pending BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE verification_codes ADD COLUMN session_claimed_at TIMESTAMPTZ NULL; -- sesi hasil polling hanya diberikan sekali

-- "Masuk lewat WhatsApp" untuk member di HP lain (kontak ditentukan dari nomor pengirim WA).
CREATE TABLE IF NOT EXISTS whatsapp_login_requests (
    code VARCHAR(24) PRIMARY KEY,                    -- DZ-xxxx (unik bersama verification_codes.code)
    poll_token_hash VARCHAR(64) NOT NULL,
    app VARCHAR(16) NULL,
    expires_at TIMESTAMPTZ NOT NULL,                 -- TTL 15 menit
    used_at TIMESTAMPTZ NULL,                        -- sekali pakai
    result VARCHAR(16) NULL CHECK (result IS NULL OR result IN ('link_sent', 'not_member')),
    verified_contact_id UUID NULL REFERENCES contacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_login_requests_expires ON whatsapp_login_requests(expires_at);
