-- DOOZ Omnichannel CRM (Customer Hub) - Shared Catalog (Single Source of Truth)
-- Task #BORNN: Endpoint Katalog Bersama (Standar Ukuran XS–XL & SKU Frame DOOZ)

CREATE TABLE IF NOT EXISTS catalog_size_chart (
    category VARCHAR(8) PRIMARY KEY CHECK (category IN ('XS', 'S', 'M', 'L', 'XL')),
    label VARCHAR(64) NOT NULL,
    name_id VARCHAR(64) NOT NULL DEFAULT '',
    min_mm NUMERIC(6,2) NOT NULL CHECK (min_mm > 0),
    max_mm NUMERIC(6,2) NOT NULL CHECK (max_mm >= min_mm),
    bridge_mm_rec VARCHAR(32) NOT NULL DEFAULT '',
    temple_mm_rec VARCHAR(32) NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_size_chart_order ON catalog_size_chart(sort_order ASC);

CREATE TABLE IF NOT EXISTS catalog_frames (
    sku VARCHAR(64) PRIMARY KEY,
    id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    frame_width_mm NUMERIC(6,2) NOT NULL CHECK (frame_width_mm > 0),
    bridge_mm NUMERIC(6,2) NOT NULL DEFAULT 18,
    temple_mm NUMERIC(6,2) NOT NULL DEFAULT 142,
    size_category VARCHAR(8) NOT NULL REFERENCES catalog_size_chart(category),
    frame_style VARCHAR(64) NOT NULL DEFAULT 'rectangle',
    face_shapes JSONB NOT NULL DEFAULT '[]',
    color VARCHAR(128) NOT NULL DEFAULT '',
    material VARCHAR(128) NOT NULL DEFAULT '',
    price_idr BIGINT NOT NULL DEFAULT 0,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    tryon_asset_url TEXT NOT NULL DEFAULT '',
    tryon_sprites JSONB NULL,
    tryon_config JSONB NOT NULL DEFAULT '{}',
    stock_status VARCHAR(32) NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'preorder')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_frames_size_category ON catalog_frames(size_category);
CREATE INDEX IF NOT EXISTS idx_catalog_frames_stock_status ON catalog_frames(stock_status);
CREATE INDEX IF NOT EXISTS idx_catalog_frames_active_order ON catalog_frames(is_active, sort_order ASC);

-- Seed Official DOOZ Size Chart (XS-XL Single Source of Truth)
INSERT INTO catalog_size_chart (category, label, name_id, min_mm, max_mm, bridge_mm_rec, temple_mm_rec, description, sort_order)
VALUES
    ('XS', 'Extra Small (XS)', 'Sangat kecil', 115, 127, '15–17 mm', '135–138 mm', 'Wajah mungil / remaja', 1),
    ('S',  'Small (S)',        'Kecil',        128, 133, '16–18 mm', '138–140 mm', 'Wajah ramping', 2),
    ('M',  'Medium (M)',       'Sedang',       134, 139, '17–19 mm', '140–145 mm', 'Ukuran standar mayoritas dewasa', 3),
    ('L',  'Large (L)',        'Besar',        140, 145, '18–20 mm', '143–148 mm', 'Wajah lebar', 4),
    ('XL', 'Extra Large (XL)', 'Sangat besar', 146, 165, '19–22 mm', '145–152 mm', 'Wajah ekstra lebar', 5)
ON CONFLICT (category) DO NOTHING;
