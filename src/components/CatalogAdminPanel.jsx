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

const STOCK_LABEL = {
  in_stock: 'Tersedia',
  low_stock: 'Stok terbatas',
  out_of_stock: 'Habis',
  preorder: 'Pre-order',
}

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

export default function CatalogAdminPanel() {
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
      setStatusMessage('Tabel ukuran tersimpan dan langsung dipakai semua aplikasi.')
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
          ? `Frame ${payload.sku} diperbarui.`
          : `Frame ${payload.sku} ditambahkan ke katalog.`
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
      setStatusMessage(`Frame ${sku} dihapus dari katalog.`)
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
        `Impor selesai: ${res.imported_size_ranges || 0} ukuran, ${res.imported_frames || 0} frame.`
      )
      setImportJsonText('')
      await loadCatalog()
    } catch (err) {
      setErrorMessage(err.message || 'Format JSON impor tidak valid.')
    }
  }

  return (
    <div className="dz-stack">
      <div className="staff-section-head">
        <div>
          <span className="dz-eyebrow">Katalog</span>
          <h1 className="dz-title">Ukuran & model frame</h1>
          <p className="dz-muted">Dipakai bersama oleh Ukur Frame, Coba Kacamata, dan kasir outlet.</p>
        </div>
        <div className="staff-context">
          <label className="dz-label" htmlFor="katalog-role">
            Peran
          </label>
          <select id="katalog-role" className="dz-input--sm" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="kasir">Kasir (hanya lihat)</option>
          </select>
        </div>
      </div>

      {statusMessage && (
        <div className="dz-banner" role="status">
          <span>✓ {statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="dz-alert" role="alert">
          {errorMessage}
        </div>
      )}

      {/* 1. Size Chart Table (XS-XL) */}
      <section className="dz-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>Tabel ukuran (XS–XL)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dz-text-3)' }}>
              Perubahan langsung dipakai di Ukur Frame, Coba Kacamata, dan kasir outlet.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveSizeChart}>
          <div className="dz-table-wrap">
            <table className="dz-table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Label</th>
                  <th>Min (mm)</th>
                  <th>Max (mm)</th>
                  <th>Jembatan hidung</th>
                  <th>Gagang</th>
                  <th>Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {sizeChart.map((row, idx) => (
                  <tr key={row.category}>
                    <td style={{ fontWeight: 700, color: 'var(--dz-orange-text)' }}>{row.category}</td>
                    <td>
                      <input
                        type="text"
                        value={row.label || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'label', e.target.value)}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        value={row.min_mm}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'min_mm', e.target.value)}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        value={row.max_mm}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'max_mm', e.target.value)}
                      />
                    </td>
                    <td style={{ width: 120 }}>
                      <input
                        type="text"
                        value={row.bridge_mm_rec || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'bridge_mm_rec', e.target.value)}
                      />
                    </td>
                    <td style={{ width: 120 }}>
                      <input
                        type="text"
                        value={row.temple_mm_rec || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'temple_mm_rec', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.description || ''}
                        onChange={(e) => handleSizeChartFieldChange(idx, 'description', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="dz-btn dz-btn--orange">
              Simpan tabel ukuran
            </button>
          </div>
        </form>
      </section>

      {/* 2. Frame Catalog List & Filters */}
      <section className="dz-card">
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
              Model frame ({frames.length}){loading ? ' · Memuat...' : ''}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dz-text-3)' }}>
              Frame yang tampil di Coba Kacamata & rekomendasi Ukur Frame.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select
              value={filterSize}
              onChange={(e) => setFilterSize(e.target.value)}
            >
              <option value="">Semua ukuran</option>
              <option value="XS">XS</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
            </select>

            <select
              value={filterFace}
              onChange={(e) => setFilterFace(e.target.value)}
            >
              <option value="">Semua bentuk wajah</option>
              <option value="oval">Oval</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
              <option value="heart">Heart</option>
              <option value="oblong">Oblong</option>
            </select>

            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
            >
              <option value="">Semua stok</option>
              <option value="in_stock">Tersedia</option>
              <option value="low_stock">Stok terbatas</option>
              <option value="out_of_stock">Habis</option>
              <option value="preorder">Pre-order</option>
            </select>

            <input
              type="search"
              placeholder="Cari kode / nama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="dz-table-wrap">
          <table className="dz-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Lebar · jembatan · gagang</th>
                <th>Ukuran</th>
                <th>Bentuk Wajah</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => (
                <tr key={f.sku}>
                  <td style={{ fontWeight: 700 }}>{f.sku}</td>
                  <td>
                    <strong>{f.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--dz-text-3)' }}>
                      {f.frame_style} · {f.color} · {f.material}
                    </div>
                  </td>
                  <td>
                    {f.frame_width_mm} / {f.bridge_mm} / {f.temple_mm} mm
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--dz-orange-text)' }}>{f.size_category}</td>
                  <td>{(f.face_shapes || []).join(', ')}</td>
                  <td>Rp {Number(f.price_idr || 0).toLocaleString('id-ID')}</td>
                  <td>{STOCK_LABEL[f.stock_status] || f.stock_status}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="dz-btn dz-btn--outline dz-btn--sm"
                      onClick={() => handleEditFrameClick(f)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="dz-btn dz-btn--danger-outline dz-btn--sm"
                      onClick={() => handleDeleteFrame(f.sku)}
                    >
                      Hapus
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Add / Edit Frame Form & Bulk Import */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <section className="dz-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
            {editingFrame ? `Ubah frame ${editingFrame}` : 'Tambah model frame'}
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
                  onChange={(e) => setFrameForm({ ...frameForm, sku: e.target.value })} style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Nama Model *
                <input
                  type="text"
                  required
                  placeholder="Cat-Eye Elegance"
                  value={frameForm.name}
                  onChange={(e) => setFrameForm({ ...frameForm, name: e.target.value })} style={{ marginTop: 4 }}
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
                  } style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Bridge (mm)
                <input
                  type="number"
                  value={frameForm.bridge_mm}
                  onChange={(e) => setFrameForm({ ...frameForm, bridge_mm: e.target.value })} style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Temple (mm)
                <input
                  type="number"
                  value={frameForm.temple_mm}
                  onChange={(e) => setFrameForm({ ...frameForm, temple_mm: e.target.value })} style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Kategori
                <select
                  value={frameForm.size_category}
                  onChange={(e) => setFrameForm({ ...frameForm, size_category: e.target.value })} style={{ marginTop: 4 }}
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
                  onChange={(e) => setFrameForm({ ...frameForm, face_shapes_text: e.target.value })} style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Status Stok
                <select
                  value={frameForm.stock_status}
                  onChange={(e) => setFrameForm({ ...frameForm, stock_status: e.target.value })} style={{ marginTop: 4 }}
                >
                  <option value="in_stock">Tersedia</option>
                  <option value="low_stock">Stok terbatas</option>
                  <option value="out_of_stock">Habis</option>
                  <option value="preorder">Pre-order</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="submit" className="dz-btn dz-btn--orange">
                {editingFrame ? 'Simpan perubahan' : 'Tambah frame'}
              </button>
              {editingFrame && (
                <button
                  type="button"
                  className="dz-btn dz-btn--outline"
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

        <section className="dz-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Impor banyak frame sekaligus (JSON)</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--dz-text-3)' }}>
            Tempel data JSON berisi <code>frames</code> dan/atau <code>size_chart</code>.
          </p>
          <form onSubmit={handleBulkImport}>
            <textarea
              rows={7}
              placeholder='{"frames": [{"sku": "DOOZ-TIT-007", "name": "Titanium Air", "frame_width_mm": 136, "stock_status": "in_stock"}]}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)} style={{ marginTop: 4 }}
            />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="dz-btn dz-btn--outline">
                Impor
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
