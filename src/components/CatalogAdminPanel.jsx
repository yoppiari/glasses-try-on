import { useState, useEffect, useCallback } from 'react'
import {
  SIZE_CHART_DEFAULT,
  CATALOG_FRAMES_DEFAULT,
  fetchSizeChart,
  fetchCatalogFrames,
  adminUpdateSizeChart,
  adminUpsertCatalogFrame,
  adminDeleteCatalogFrame,
  adminImportCatalog,
  mapWidthToSizeCategory,
} from '../sdk/doozCapture'

const EMPTY_FRAME_FORM = {
  sku: '',
  name: '',
  frame_width_mm: 138,
  bridge_mm: 18,
  temple_mm: 142,
  size_category: 'M',
  frame_style: 'rectangle',
  face_shapes_text: 'oval, round',
  color: 'Black',
  material: 'Acetate',
  price_idr: 299000,
  thumbnail_url: '/images/1.png',
  tryon_asset_url: '/images/1.png',
  stock_status: 'in_stock',
}

export default function CatalogAdminPanel({ onBack }) {
  const [sizeChart, setSizeChart] = useState(SIZE_CHART_DEFAULT)
  const [frames, setFrames] = useState(CATALOG_FRAMES_DEFAULT)
  const [filterSize, setFilterSize] = useState('')
  const [filterFace, setFilterFace] = useState('')
  const [filterStock, setFilterStock] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [staffRole, setStaffRole] = useState('owner')
  const [staffUserId, setStaffUserId] = useState('owner-dooz')

  const [editingFrame, setEditingFrame] = useState(null)
  const [frameForm, setFrameForm] = useState(EMPTY_FRAME_FORM)
  const [importJsonText, setImportJsonText] = useState('')
  const [statusMessage, setStatusMessage] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [scRes, frRes] = await Promise.all([
        fetchSizeChart({ forceRefresh: true }),
        fetchCatalogFrames({
          size: filterSize,
          face_shape: filterFace,
          stock: filterStock,
          q: searchQuery,
          include_inactive: true,
        }),
      ])
      if (Array.isArray(scRes?.size_chart) && scRes.size_chart.length > 0) {
        setSizeChart(scRes.size_chart)
      }
      if (Array.isArray(frRes?.frames)) {
        setFrames(frRes.frames)
      }
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memuat katalog.')
    } finally {
      setLoading(false)
    }
  }, [filterSize, filterFace, filterStock, searchQuery])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const handleSizeChartFieldChange = (index, field, value) => {
    setSizeChart((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [field]: field === 'min_mm' || field === 'max_mm' ? Number(value) : value,
            }
          : row
      )
    )
  }

  const handleSaveSizeChart = async (e) => {
    e.preventDefault()
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const res = await adminUpdateSizeChart(sizeChart, {
        userId: staffUserId,
        role: staffRole,
      })
      if (Array.isArray(res?.size_chart)) {
        setSizeChart(res.size_chart)
      }
      setStatusMessage('Standar ukuran XS–XL resmi DOOZ berhasil diperbarui & disimpan ke Single Source of Truth.')
      await loadCatalog()
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  const handleEditFrameClick = (frame) => {
    setEditingFrame(frame.sku)
    setFrameForm({
      sku: frame.sku,
      name: frame.name,
      frame_width_mm: frame.frame_width_mm,
      bridge_mm: frame.bridge_mm || 18,
      temple_mm: frame.temple_mm || 142,
      size_category: frame.size_category,
      frame_style: frame.frame_style || 'rectangle',
      face_shapes_text: Array.isArray(frame.face_shapes) ? frame.face_shapes.join(', ') : 'oval',
      color: frame.color || '',
      material: frame.material || '',
      price_idr: frame.price_idr || 299000,
      thumbnail_url: frame.thumbnail_url || '/images/1.png',
      tryon_asset_url: frame.tryon_asset_url || '/images/1.png',
      stock_status: frame.stock_status || 'in_stock',
    })
  }

  const handleSaveFrame = async (e) => {
    e.preventDefault()
    setStatusMessage(null)
    setErrorMessage(null)
    const widthNum = Number(frameForm.frame_width_mm)
    const payload = {
      sku: String(frameForm.sku || '').trim().toUpperCase(),
      name: String(frameForm.name || '').trim(),
      frame_width_mm: widthNum,
      bridge_mm: Number(frameForm.bridge_mm) || 18,
      temple_mm: Number(frameForm.temple_mm) || 142,
      size_category: frameForm.size_category || mapWidthToSizeCategory(widthNum, sizeChart),
      frame_style: frameForm.frame_style || 'rectangle',
      face_shapes: String(frameForm.face_shapes_text || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      color: frameForm.color,
      material: frameForm.material,
      price_idr: Number(frameForm.price_idr) || 299000,
      thumbnail_url: frameForm.thumbnail_url || '/images/1.png',
      tryon_asset_url: frameForm.tryon_asset_url || frameForm.thumbnail_url || '/images/1.png',
      stock_status: frameForm.stock_status || 'in_stock',
    }
    try {
      await adminUpsertCatalogFrame(payload, Boolean(editingFrame), {
        userId: staffUserId,
        role: staffRole,
      })
      setStatusMessage(
        editingFrame
          ? `SKU ${payload.sku} berhasil diperbarui.`
          : `SKU ${payload.sku} berhasil ditambahkan ke Katalog Bersama.`
      )
      setEditingFrame(null)
      setFrameForm(EMPTY_FRAME_FORM)
      await loadCatalog()
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  const handleDeleteFrame = async (sku) => {
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await adminDeleteCatalogFrame(sku, {
        userId: staffUserId,
        role: staffRole,
      })
      setStatusMessage(`SKU ${sku} dihapus dari katalog.`)
      await loadCatalog()
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  const handleBulkImport = async (e) => {
    e.preventDefault()
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const parsed = JSON.parse(importJsonText)
      const res = await adminImportCatalog(parsed, {
        userId: staffUserId,
        role: staffRole,
      })
      setStatusMessage(
        `Impor katalog berhasil (${res.imported_size_ranges || 0} rentang ukuran, ${res.imported_frames || 0} SKU frame).`
      )
      setImportJsonText('')
      await loadCatalog()
    } catch (err) {
      setErrorMessage(err.message || 'Format JSON impor tidak valid.')
    }
  }

  return (
    <div className="portal-page" style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 48px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#a5b4fc',
              background: 'rgba(99, 102, 241, 0.16)',
              padding: '4px 10px',
              borderRadius: 999,
              marginBottom: 6,
            }}
          >
            Single Source of Truth · Katalog Bersama DOOZ
          </span>
          <h2 style={{ margin: 0, fontSize: 22 }}>
            Manajemen Standar Ukuran (XS–XL) &amp; Katalog SKU Frame
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, color: '#94a3b8' }}>
            Role Akses:{' '}
            <select
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value)}
              style={{
                background: '#161824',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '6px 10px',
              }}
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="kasir">Kasir (Read-Only)</option>
            </select>
          </label>
          {onBack && (
            <button type="button" className="action-button secondary" onClick={onBack}>
              ← Kembali ke Try-On
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            color: '#86efac',
            padding: '12px 16px',
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ✓ {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ⚠ {errorMessage}
        </div>
      )}

      {/* 1. Size Chart Table (XS-XL) */}
      <section
        style={{
          background: 'rgba(22, 24, 36, 0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>1. Tabel Standar Ukuran Resmi DOOZ (XS–XL)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Endpoint publik: <code>GET /api/catalog/size-chart</code> · Digunakan bersama oleh{' '}
              <code>ukur-frame-dooz</code>, <code>glasses-try-on</code>, dan kasir outlet.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSizeChart}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Kategori</th>
                  <th style={{ padding: '8px' }}>Label</th>
                  <th style={{ padding: '8px' }}>Min (mm)</th>
                  <th style={{ padding: '8px' }}>Max (mm)</th>
                  <th style={{ padding: '8px' }}>Bridge Rec</th>
                  <th style={{ padding: '8px' }}>Temple Rec</th>
                  <th style={{ padding: '8px' }}>Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {sizeChart.map((row, idx) => (
                  <tr key={row.category} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#a5b4fc' }}>{row.category}</td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={row.label || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'label', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px', width: 90 }}>
                      <input
                        type="number"
                        value={row.min_mm}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'min_mm', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px', width: 90 }}>
                      <input
                        type="number"
                        value={row.max_mm}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'max_mm', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px', width: 120 }}>
                      <input
                        type="text"
                        value={row.bridge_mm_rec || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'bridge_mm_rec', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px', width: 120 }}>
                      <input
                        type="text"
                        value={row.temple_mm_rec || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'temple_mm_rec', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={row.description || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'description', e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f111a',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '6px 8px',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="action-button primary">
              💾 Simpan Size Chart Resmi (PUT /api/admin/catalog/size-chart)
            </button>
          </div>
        </form>
      </section>

      {/* 2. Frame Catalog List & Filters */}
      <section
        style={{
          background: 'rgba(22, 24, 36, 0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              2. Daftar SKU Frame DOOZ ({frames.length} SKU){loading ? ' · Memuat...' : ''}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Endpoint publik: <code>GET /api/catalog/frames?size=&amp;face_shape=&amp;stock=&amp;q=</code>
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select
              value={filterSize}
              onChange={(e) => setFilterSize(e.target.value)}
              style={{
                background: '#0f111a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
              }}
            >
              <option value="">Semua Ukuran (XS–XL)</option>
              <option value="XS">Size XS</option>
              <option value="S">Size S</option>
              <option value="M">Size M</option>
              <option value="L">Size L</option>
              <option value="XL">Size XL</option>
            </select>

            <select
              value={filterFace}
              onChange={(e) => setFilterFace(e.target.value)}
              style={{
                background: '#0f111a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
              }}
            >
              <option value="">Semua Bentuk Wajah</option>
              <option value="oval">Oval</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
              <option value="heart">Heart</option>
              <option value="oblong">Oblong</option>
            </select>

            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
              style={{
                background: '#0f111a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
              }}
            >
              <option value="">Semua Status Stok</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="preorder">Pre-Order</option>
            </select>

            <input
              type="search"
              placeholder="Cari SKU / nama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: '#0f111a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>SKU</th>
                <th style={{ padding: '8px' }}>Nama Frame</th>
                <th style={{ padding: '8px' }}>Dimensi (W-B-T)</th>
                <th style={{ padding: '8px' }}>Size</th>
                <th style={{ padding: '8px' }}>Bentuk Wajah</th>
                <th style={{ padding: '8px' }}>Harga</th>
                <th style={{ padding: '8px' }}>Stok</th>
                <th style={{ padding: '8px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => (
                <tr key={f.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700 }}>{f.sku}</td>
                  <td style={{ padding: '8px' }}>
                    <strong>{f.name}</strong>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {f.frame_style} · {f.color} · {f.material}
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {f.frame_width_mm} / {f.bridge_mm} / {f.temple_mm} mm
                  </td>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#a5b4fc' }}>{f.size_category}</td>
                  <td style={{ padding: '8px' }}>{(f.face_shapes || []).join(', ')}</td>
                  <td style={{ padding: '8px' }}>Rp {Number(f.price_idr || 0).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '8px' }}>{f.stock_status}</td>
                  <td style={{ padding: '8px', display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="action-button secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => handleEditFrameClick(f)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action-button secondary"
                      style={{ padding: '4px 10px', fontSize: 12, color: '#fca5a5' }}
                      onClick={() => handleDeleteFrame(f.sku)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Add / Edit Frame Form & Bulk Import */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <section
          style={{
            background: 'rgba(22, 24, 36, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
            {editingFrame ? `Edit SKU Frame: ${editingFrame}` : '3. Tambah SKU Frame Baru'}
          </h3>
          <form onSubmit={handleSaveFrame} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12 }}>
                Kode SKU *
                <input
                  type="text"
                  required
                  placeholder="DOOZ-CAT-006"
                  value={frameForm.sku}
                  disabled={Boolean(editingFrame)}
                  onChange={(e) => setFrameForm({ ...frameForm, sku: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Nama Model *
                <input
                  type="text"
                  required
                  placeholder="Cat-Eye Elegance"
                  value={frameForm.name}
                  onChange={(e) => setFrameForm({ ...frameForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Lebar (mm) *
                <input
                  type="number"
                  required
                  value={frameForm.frame_width_mm}
                  onChange={(e) =>
                    setFrameForm({
                      ...frameForm,
                      frame_width_mm: e.target.value,
                      size_category: mapWidthToSizeCategory(e.target.value, sizeChart),
                    })
                  }
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Bridge (mm)
                <input
                  type="number"
                  value={frameForm.bridge_mm}
                  onChange={(e) => setFrameForm({ ...frameForm, bridge_mm: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Temple (mm)
                <input
                  type="number"
                  value={frameForm.temple_mm}
                  onChange={(e) => setFrameForm({ ...frameForm, temple_mm: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Kategori
                <select
                  value={frameForm.size_category}
                  onChange={(e) => setFrameForm({ ...frameForm, size_category: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                >
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12 }}>
                Bentuk Wajah Cocok (pisahkan koma)
                <input
                  type="text"
                  value={frameForm.face_shapes_text}
                  onChange={(e) => setFrameForm({ ...frameForm, face_shapes_text: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Status Stok
                <select
                  value={frameForm.stock_status}
                  onChange={(e) => setFrameForm({ ...frameForm, stock_status: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    background: '#0f111a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '8px',
                  }}
                >
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="preorder">Pre-Order</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="submit" className="action-button primary">
                {editingFrame ? 'Simpan Perubahan SKU' : '+ Tambah SKU Frame'}
              </button>
              {editingFrame && (
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={() => {
                    setEditingFrame(null)
                    setFrameForm(EMPTY_FRAME_FORM)
                  }}
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>

        <section
          style={{
            background: 'rgba(22, 24, 36, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>4. Impor Massal Katalog (JSON)</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#94a3b8' }}>
            Endpoint: <code>POST /api/admin/catalog/import</code> · Mendukung impor tabel <code>size_chart</code>{' '}
            maupun daftar <code>frames</code> dari tim DOOZ sekaligus.
          </p>
          <form onSubmit={handleBulkImport}>
            <textarea
              rows={7}
              placeholder='{"frames": [{"sku": "DOOZ-TIT-007", "name": "Titanium Air", "frame_width_mm": 136, "stock_status": "in_stock"}]}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              style={{
                width: '100%',
                background: '#0f111a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="action-button secondary">
                📥 Impor JSON ke Customer Hub
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
