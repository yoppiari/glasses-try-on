import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import TryOnCanvas from './components/TryOnCanvas'
import LeadCaptureModal from './components/LeadCaptureModal'
import MemberPortal from './components/MemberPortal'
import CatalogAdminPanel from './components/CatalogAdminPanel'
import KasirOutletPanel from './components/KasirOutletPanel'
import CrmAdminDashboard from './components/CrmAdminDashboard'
import ObsLiveCounter from './components/ObsLiveCounter'
import { getFitColor, getFitEmoji } from './utils/fitCalculator'
import {
    DEFAULT_PRODUCTS,
    SIZE_CHART_DEFAULT,
    syncSharedCatalog,
    resolveCustomerSizeProfile,
} from './data/glassesData'
import {
    captureAttributionFromURL,
    fetchPortalMe,
    getLocalTrackedEvents,
    getStoredLeadState,
    getStoredPortalSession,
    mapWidthToSizeCategory,
    track,
} from './sdk/doozCapture'

const SIZE_CATEGORIES = ['XS', 'S', 'M', 'L', 'XL']

function formatRupiah(idr) {
    const n = Number(idr)
    if (!Number.isFinite(n) || n <= 0) return ''
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n)
}

function detectInitialView() {
    if (typeof window === 'undefined') return 'tryon'
    const path = window.location.pathname || ''
    const params = new URLSearchParams(window.location.search)
    if (
        path.endsWith('/kasir') ||
        path.endsWith('/kasir/') ||
        params.get('view') === 'kasir'
    ) {
        return 'kasir'
    }
    if (
        path.endsWith('/admin/crm') ||
        path.endsWith('/admin/crm/') ||
        params.get('view') === 'crm-admin'
    ) {
        return 'crm-admin'
    }
    if (
        path.endsWith('/live-counter') ||
        path.endsWith('/live-counter/') ||
        params.get('view') === 'live-counter'
    ) {
        return 'live-counter'
    }
    if (
        path.endsWith('/admin/catalog') ||
        path.endsWith('/admin/catalog/') ||
        params.get('view') === 'catalog-admin'
    ) {
        return 'catalog-admin'
    }
    if (
        path.endsWith('/data-saya') ||
        path.endsWith('/data-saya/') ||
        params.get('view') === 'portal' ||
        params.get('token')
    ) {
        return 'portal'
    }
    return 'tryon'
}

export default function App() {
    const [activeView, setActiveView] = useState(detectInitialView)
    const [products, setProducts] = useState(DEFAULT_PRODUCTS)
    const [sizeChart, setSizeChart] = useState(SIZE_CHART_DEFAULT)
    const [catalogSyncStatus, setCatalogSyncStatus] = useState('syncing') // 'syncing' | 'live' | 'offline'

    const [selectedProduct, setSelectedProduct] = useState(DEFAULT_PRODUCTS[0])
    const [triedProducts, setTriedProducts] = useState(() => {
        const localTried = getLocalTrackedEvents()
            .filter((e) => e.event_type === 'frame_tried' && e.payload?.frame_sku)
            .map((e) => {
                const found = DEFAULT_PRODUCTS.find(
                    (p) =>
                        p.sku.toUpperCase() === String(e.payload.frame_sku).toUpperCase() ||
                        p.id === e.payload.frame_sku
                )
                return (
                    found || {
                        id: e.payload.frame_sku,
                        sku: e.payload.frame_sku,
                        name: e.payload.frame_name || e.payload.frame_sku,
                        frameWidth: e.payload.frame_width_mm || 138,
                        sizeCategory: e.payload.size_category || 'M',
                    }
                )
            })
        return localTried.length > 0 ? localTried : [DEFAULT_PRODUCTS[0]]
    })

    const [portalProfile, setPortalProfile] = useState(null)
    const [manualSizeProfile, setManualSizeProfile] = useState(null)
    const [sizeFilter, setSizeFilter] = useState('ALL') // 'ALL' | 'RECOMMENDED' | 'XS' | 'S' | 'M' | 'L' | 'XL'
    const [autoFilterApplied, setAutoFilterApplied] = useState(false)

    const [showLeadModal, setShowLeadModal] = useState(false)
    const [showDebug, setShowDebug] = useState(false)
    const [showHud, setShowHud] = useState(true)
    const [sizingMode, setSizingMode] = useState('aesthetic') // 'aesthetic' or 'trueSize'
    const [fitInfo, setFitInfo] = useState(null)

    const canvasRef = useRef(null)
    const initialTrackedRef = useRef(false)

    // Capture signed attribution parameters (?src=&host=&sesi=&outlet=&sig=) on mount
    useEffect(() => {
        captureAttributionFromURL()
    }, [])

    // Load active Member Portal profile if a session token is stored
    useEffect(() => {
        const storedSess = getStoredPortalSession()
        if (!storedSess?.session_token) return
        if (String(storedSess.session_token).startsWith('demo-sess-')) {
            setPortalProfile({
                member_code: storedSess.member_code || 'DOOZ-48219',
                latest_measurement: storedSess.latest_measurement || {
                    frame_width_mm: 138,
                    bridge_mm: 18,
                    temple_mm: 142,
                    size_category: 'M',
                },
            })
            return
        }
        fetchPortalMe(storedSess.session_token)
            .then((view) => {
                if (view) setPortalProfile(view)
            })
            .catch(() => {
                // ignore expired session on background check
            })
    }, [activeView])

    // Resolve customer's recommended size category & width from URL, Portal "Data Saya", LeadState, or Camera
    const customerProfile = useMemo(() => {
        if (manualSizeProfile?.sizeCategory) {
            return manualSizeProfile
        }
        return resolveCustomerSizeProfile({
            portalProfile,
            leadState: getStoredLeadState(),
            cameraFaceWidthMm: fitInfo?.faceWidth,
            sizeChart,
        })
    }, [manualSizeProfile, portalProfile, fitInfo?.faceWidth, sizeChart])

    // Record a `frame_tried` event to Customer Hub (`POST /api/capture/events`) and local history
    const recordFrameTried = useCallback(
        (product, triggerSource = 'carousel_select') => {
            if (!product) return
            setTriedProducts((prev) => {
                const exists = prev.some(
                    (p) =>
                        p.id === product.id ||
                        (p.sku && product.sku && p.sku.toUpperCase() === product.sku.toUpperCase())
                )
                if (exists) return prev
                return [product, ...prev]
            })

            void track('frame_tried', {
                frame_sku: product.sku || product.id,
                frame_name: product.name,
                frame_width_mm: product.frameWidth || product.frame_width_mm || 138,
                bridge_mm: product.bridgeMm || product.bridge_mm || 18,
                temple_mm: product.templeMm || product.temple_mm || 142,
                size_category:
                    product.sizeCategory ||
                    product.size_category ||
                    mapWidthToSizeCategory(product.frameWidth, sizeChart),
                frame_style: product.frameStyle || product.frame_style || 'rectangle',
                color: product.color || 'Black',
                material: product.material || 'Acetate',
                price_idr: product.priceIdr || product.price_idr || 299000,
                customer_size_category: customerProfile?.sizeCategory || undefined,
                customer_width_mm: customerProfile?.widthMm || undefined,
                trigger: triggerSource,
            })
        },
        [sizeChart, customerProfile?.sizeCategory, customerProfile?.widthMm]
    )

    // Synchronize Shared Catalog (`GET /api/catalog/size-chart` & `GET /api/catalog/frames`)
    const loadSharedCatalog = useCallback(async () => {
        setCatalogSyncStatus('syncing')
        try {
            const { products: syncedProducts, sizeChart: syncedChart, offlineFallback } =
                await syncSharedCatalog()
            setSizeChart(syncedChart)
            setProducts(syncedProducts)
            setCatalogSyncStatus(offlineFallback ? 'offline' : 'live')

            // Keep selectedProduct updated with latest catalog metadata
            setSelectedProduct((prev) => {
                if (!prev) return syncedProducts[0] || DEFAULT_PRODUCTS[0]
                const updated = syncedProducts.find(
                    (p) =>
                        p.sku.toUpperCase() === String(prev.sku || '').toUpperCase() ||
                        p.id === prev.id
                )
                return updated || syncedProducts[0] || prev
            })
        } catch {
            setCatalogSyncStatus('offline')
        }
    }, [])

    useEffect(() => {
        if (activeView === 'tryon') {
            loadSharedCatalog()
        }
    }, [activeView, loadSharedCatalog])

    // Auto-apply size filter & initial frame selection when customer profile or URL query is present
    useEffect(() => {
        if (autoFilterApplied || products.length === 0) return

        const params =
            typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const urlSku = (params?.get('sku') || params?.get('frame_sku') || '').trim().toUpperCase()
        const urlSize = (params?.get('size') || params?.get('size_category') || '').trim().toUpperCase()
        const urlWidth = Number(params?.get('width_mm') || 0)

        // 1. If a specific SKU was requested in the URL (e.g. from `ukur-frame-dooz`), select & track it
        if (urlSku) {
            const matchedBySku = products.find(
                (p) => p.sku.toUpperCase() === urlSku || p.id.toUpperCase() === urlSku
            )
            if (matchedBySku) {
                setSelectedProduct(matchedBySku)
                if (SIZE_CATEGORIES.includes(urlSize)) {
                    setSizeFilter('RECOMMENDED')
                }
                setAutoFilterApplied(true)
                if (!initialTrackedRef.current) {
                    initialTrackedRef.current = true
                    recordFrameTried(matchedBySku, 'url_deep_link')
                }
                return
            }
        }

        // 2. If size or width_mm was passed via URL, or available from Portal "Data Saya" / LeadState
        const targetCategory =
            SIZE_CATEGORIES.includes(urlSize)
                ? urlSize
                : urlWidth > 0
                  ? mapWidthToSizeCategory(urlWidth, sizeChart)
                  : customerProfile?.source === 'portal_session' || customerProfile?.source === 'lead_state'
                    ? customerProfile.sizeCategory
                    : null

        if (targetCategory && SIZE_CATEGORIES.includes(targetCategory)) {
            if (SIZE_CATEGORIES.includes(urlSize) || urlWidth > 0) {
                setSizeFilter('RECOMMENDED')
            }
            const matchingFrame = products.find((p) => p.sizeCategory === targetCategory)
            if (matchingFrame) {
                setSelectedProduct(matchingFrame)
                if (!initialTrackedRef.current) {
                    initialTrackedRef.current = true
                    recordFrameTried(matchingFrame, 'auto_size_match')
                }
            }
            setAutoFilterApplied(true)
        }
    }, [autoFilterApplied, products, sizeChart, customerProfile, recordFrameTried])

    // Compute filtered products based on active sizeFilter
    const activeFilterCategory = useMemo(() => {
        if (sizeFilter === 'ALL') return null
        if (sizeFilter === 'RECOMMENDED') {
            return customerProfile?.sizeCategory || 'M'
        }
        return sizeFilter
    }, [sizeFilter, customerProfile?.sizeCategory])

    const filteredProducts = useMemo(() => {
        if (!activeFilterCategory) return products
        const exact = products.filter((p) => p.sizeCategory === activeFilterCategory)
        return exact.length > 0 ? exact : products
    }, [products, activeFilterCategory])

    const recommendedCount = useMemo(() => {
        const recCat = customerProfile?.sizeCategory
        if (!recCat) return 0
        return products.filter((p) => p.sizeCategory === recCat).length
    }, [products, customerProfile?.sizeCategory])

    const handleScreenshot = useCallback(async () => {
        if (!canvasRef.current) return

        const image = await canvasRef.current.takeScreenshot()
        if (image) {
            const link = document.createElement('a')
            link.href = image
            link.download = `try-on-${selectedProduct.name}-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }, [selectedProduct])

    const handleProductChange = useCallback(
        (product, triggerSource = 'carousel_select') => {
            if (!product) return
            setSelectedProduct(product)
            recordFrameTried(product, triggerSource)
        },
        [recordFrameTried]
    )

    const handleSelectSizeFilter = useCallback(
        (nextFilter) => {
            setSizeFilter(nextFilter)
            const targetCat =
                nextFilter === 'ALL'
                    ? null
                    : nextFilter === 'RECOMMENDED'
                      ? customerProfile?.sizeCategory || 'M'
                      : nextFilter
            if (targetCat) {
                const matching = products.filter((p) => p.sizeCategory === targetCat)
                if (
                    matching.length > 0 &&
                    !matching.some((m) => m.id === selectedProduct?.id || m.sku === selectedProduct?.sku)
                ) {
                    handleProductChange(matching[0], `filter_size_${targetCat}`)
                }
            }
        },
        [customerProfile?.sizeCategory, products, selectedProduct, handleProductChange]
    )

    const handlePrevious = useCallback(() => {
        const list = filteredProducts.length > 0 ? filteredProducts : products
        const currentIndex = list.findIndex((p) => p.id === selectedProduct.id || p.sku === selectedProduct.sku)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1
        handleProductChange(list[prevIndex], 'carousel_prev')
    }, [filteredProducts, products, selectedProduct, handleProductChange])

    const handleNext = useCallback(() => {
        const list = filteredProducts.length > 0 ? filteredProducts : products
        const currentIndex = list.findIndex((p) => p.id === selectedProduct.id || p.sku === selectedProduct.sku)
        const nextIndex = currentIndex < list.length - 1 ? currentIndex + 1 : 0
        handleProductChange(list[nextIndex], 'carousel_next')
    }, [filteredProducts, products, selectedProduct, handleProductChange])

    const handleFitCalculated = useCallback((info) => {
        setFitInfo(info)
    }, [])

    const handleSelectFrameFromHistory = useCallback(
        (payload) => {
            if (payload) {
                const match = products.find(
                    (p) =>
                        p.id === payload.frame_sku ||
                        p.sku.toUpperCase() === String(payload.frame_sku || '').toUpperCase() ||
                        p.name?.toLowerCase() === payload.frame_name?.toLowerCase()
                )
                if (match) {
                    setSelectedProduct(match)
                    setSizeFilter('ALL')
                    recordFrameTried(match, 'portal_history_retry')
                }
            }
            setActiveView('tryon')
        },
        [products, recordFrameTried]
    )

    const handleApplyCustomerSizeFilterFromPortal = useCallback(
        ({ sizeCategory, widthMm }) => {
            if (sizeCategory && SIZE_CATEGORIES.includes(String(sizeCategory).toUpperCase())) {
                const cleanCat = String(sizeCategory).toUpperCase()
                setManualSizeProfile({
                    sizeCategory: cleanCat,
                    widthMm: widthMm || 138,
                    source: 'portal_session',
                    sourceLabel: 'Portal Data Saya',
                })
                setSizeFilter('RECOMMENDED')
                const match = products.find((p) => p.sizeCategory === cleanCat)
                if (match) {
                    setSelectedProduct(match)
                    recordFrameTried(match, 'portal_size_filter')
                }
            }
            setActiveView('tryon')
        },
        [products, recordFrameTried]
    )

    const isRecommendedForCustomer = Boolean(
        customerProfile?.sizeCategory &&
            selectedProduct?.sizeCategory === customerProfile.sizeCategory
    )

    return (
        <div className="app">
            {/* Header */}
            <header className="header dooz-app-header">
                <div className="header-brand">
                    <h1>Kacamata DOOZ</h1>
                    <span className="version-badge">Omnichannel CRM</span>
                    <span
                        className={`catalog-sync-pill ${catalogSyncStatus}`}
                        title="Status sinkronisasi Katalog Bersama (GET /api/catalog/frames & size-chart)"
                    >
                        {catalogSyncStatus === 'live'
                            ? `● Live Katalog SSOT (${products.length} SKU)`
                            : catalogSyncStatus === 'syncing'
                              ? '◌ Sinkronisasi Katalog...'
                              : `● Katalog SSOT (${products.length} SKU)`}
                    </span>
                </div>

                <nav className="header-nav" aria-label="Navigasi Utama DOOZ">
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'tryon' ? 'active' : ''}`}
                        onClick={() => setActiveView('tryon')}
                    >
                        👓 Virtual Try-On
                    </button>
                    <button
                        type="button"
                        className="header-nav-btn capture-btn"
                        onClick={() => setShowLeadModal(true)}
                    >
                        💬 Simpan Ukuran ke WA ({triedProducts.length} Dicoba)
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'portal' ? 'active' : ''}`}
                        onClick={() => setActiveView('portal')}
                    >
                        👤 Data Saya
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'kasir' ? 'active' : ''}`}
                        onClick={() => setActiveView('kasir')}
                    >
                        🏪 Kasir Outlet
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'crm-admin' ? 'active' : ''}`}
                        onClick={() => setActiveView('crm-admin')}
                    >
                        📊 Dashboard CRM
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'live-counter' ? 'active' : ''}`}
                        onClick={() => setActiveView('live-counter')}
                    >
                        🔴 OBS Live
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'catalog-admin' ? 'active' : ''}`}
                        onClick={() => setActiveView('catalog-admin')}
                    >
                        🗂️ Katalog SSOT
                    </button>
                </nav>
            </header>

            {activeView === 'kasir' ? (
                <KasirOutletPanel onBack={() => setActiveView('tryon')} />
            ) : activeView === 'crm-admin' ? (
                <CrmAdminDashboard
                    onBack={() => setActiveView('tryon')}
                    onOpenLiveCounter={() => setActiveView('live-counter')}
                />
            ) : activeView === 'live-counter' ? (
                <ObsLiveCounter onBack={() => setActiveView('tryon')} />
            ) : activeView === 'catalog-admin' ? (
                <CatalogAdminPanel onBack={() => setActiveView('tryon')} />
            ) : activeView === 'portal' ? (
                <MemberPortal
                    onBackToTryOn={() => setActiveView('tryon')}
                    onSelectFrameFromHistory={handleSelectFrameFromHistory}
                    onApplyCustomerSizeFilter={handleApplyCustomerSizeFilterFromPortal}
                />
            ) : (
                <>
                    {/* Main try-on area */}
                    <main className="main-content">
                        <TryOnCanvas
                            ref={canvasRef}
                            selectedProduct={selectedProduct}
                            products={filteredProducts}
                            onProductChange={handleProductChange}
                            onFitCalculated={handleFitCalculated}
                            showDebug={showDebug}
                            showHud={showHud}
                            sizingMode={sizingMode}
                        />
                    </main>

                    {/* Automatic Size Filter & Shared Catalog Bar */}
                    <section className="dooz-size-filter-bar" aria-label="Filter Ukuran Otomatis Katalog Bersama">
                        <div className="size-filter-meta">
                            <span className="size-filter-title">📏 Filter Ukuran Frame:</span>
                            {customerProfile?.sizeCategory ? (
                                <span className="customer-size-chip">
                                    🎯 Ukuran Kamu: <strong>Size {customerProfile.sizeCategory}</strong>
                                    {customerProfile.widthMm ? ` (${customerProfile.widthMm} mm)` : ''}
                                    {customerProfile.sourceLabel ? ` • ${customerProfile.sourceLabel}` : ''}
                                </span>
                            ) : (
                                <span className="customer-size-chip muted">
                                    Pilih kategori XS–XL atau izinkan kamera mendeteksi lebar wajah otomatis
                                </span>
                            )}
                        </div>

                        <div className="size-filter-pills" role="group" aria-label="Kategori Ukuran XS hingga XL">
                            <button
                                type="button"
                                className={`size-filter-pill ${sizeFilter === 'ALL' ? 'active' : ''}`}
                                onClick={() => handleSelectSizeFilter('ALL')}
                            >
                                Semua ({products.length})
                            </button>

                            {customerProfile?.sizeCategory && (
                                <button
                                    type="button"
                                    className={`size-filter-pill recommended ${sizeFilter === 'RECOMMENDED' ? 'active' : ''}`}
                                    onClick={() => handleSelectSizeFilter('RECOMMENDED')}
                                >
                                    ✨ Pas Buat Kamu · Size {customerProfile.sizeCategory} ({recommendedCount})
                                </button>
                            )}

                            {SIZE_CATEGORIES.map((cat) => {
                                const chartEntry = sizeChart.find((c) => c.category === cat)
                                const countForCat = products.filter((p) => p.sizeCategory === cat).length
                                const isCustomerCat = customerProfile?.sizeCategory === cat
                                const rangeText = chartEntry ? `${chartEntry.min_mm}–${chartEntry.max_mm} mm` : ''
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        className={`size-filter-pill ${sizeFilter === cat ? 'active' : ''} ${isCustomerCat ? 'customer-match' : ''}`}
                                        onClick={() => handleSelectSizeFilter(cat)}
                                        title={
                                            chartEntry
                                                ? `${chartEntry.label} (${rangeText}) — Bridge ${chartEntry.bridge_mm_rec}`
                                                : `Size ${cat}`
                                        }
                                    >
                                        <span>{cat}</span>
                                        {rangeText && <small className="pill-mm">{rangeText}</small>}
                                        <span className="pill-count">{countForCat}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {/* Product selector */}
                    <section className="product-selector">
                        <button
                            className="nav-button prev"
                            onClick={handlePrevious}
                            aria-label="Previous product"
                        >
                            ‹
                        </button>

                        <div className="product-carousel">
                            {filteredProducts.map((product) => {
                                const isMatch =
                                    customerProfile?.sizeCategory &&
                                    product.sizeCategory === customerProfile.sizeCategory
                                const isSelected =
                                    selectedProduct.id === product.id ||
                                    selectedProduct.sku === product.sku
                                return (
                                    <button
                                        key={product.sku || product.id}
                                        className={`product-thumb ${isSelected ? 'active' : ''} ${isMatch ? 'recommended-thumb' : ''}`}
                                        onClick={() => handleProductChange(product, 'carousel_thumb')}
                                        aria-label={`Select ${product.name} (${product.sku})`}
                                        title={`${product.name} (${product.sku}) • ${product.frameWidth} mm • Size ${product.sizeCategory}`}
                                    >
                                        <img src={product.thumbnailUrl || product.image} alt={product.name} />
                                        <span className="thumb-size-tag">{product.sizeCategory}</span>
                                        {isMatch && <span className="thumb-fit-dot" title="Pas Buat Kamu">★</span>}
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            className="nav-button next"
                            onClick={handleNext}
                            aria-label="Next product"
                        >
                            ›
                        </button>
                    </section>

                    {/* Product info */}
                    <div className="product-info">
                        <div className="product-title-line">
                            <h2>{selectedProduct.name}</h2>
                            <span className="product-sku-badge">{selectedProduct.sku}</span>
                            {isRecommendedForCustomer && (
                                <span className="product-recommended-badge">★ Pas Buat Kamu</span>
                            )}
                        </div>

                        {/* Fit indicator */}
                        {fitInfo && fitInfo.fitScore > 0 && (
                            <div className="fit-indicator" style={{ color: getFitColor(fitInfo.fitScore) }}>
                                <span className="fit-emoji">{getFitEmoji(fitInfo.fitScore)}</span>
                                <span className="fit-label">
                                    {fitInfo.fitLabel}
                                    {fitInfo.faceWidth
                                        ? ` • Wajah ${fitInfo.faceWidth} mm (Size ${fitInfo.faceSizeCategory || mapWidthToSizeCategory(fitInfo.faceWidth, sizeChart)})`
                                        : ''}
                                </span>
                            </div>
                        )}

                        {/* Product details from Shared Catalog */}
                        <div className="product-details">
                            <span className="product-style">{selectedProduct.frameStyle}</span>
                            <span className="product-size">
                                {selectedProduct.frameWidth} mm • Bridge {selectedProduct.bridgeMm || 18} mm • Temple {selectedProduct.templeMm || 142} mm • Size {selectedProduct.sizeCategory}
                            </span>
                            {selectedProduct.priceIdr > 0 && (
                                <span className="product-price-tag">
                                    {formatRupiah(selectedProduct.priceIdr)}
                                </span>
                            )}
                            <span
                                className={`product-stock-tag ${selectedProduct.stockStatus === 'low_stock' ? 'low' : 'in'}`}
                            >
                                {selectedProduct.stockStatus === 'low_stock'
                                    ? 'Stok Terbatas'
                                    : selectedProduct.stockStatus === 'out_of_stock'
                                      ? 'Stok Habis'
                                      : 'Tersedia'}
                            </span>
                        </div>

                        <p className="product-index">
                            {filteredProducts.findIndex(
                                (p) => p.id === selectedProduct.id || p.sku === selectedProduct.sku
                            ) + 1}{' '}
                            of {filteredProducts.length} frame ditampilkan • Riwayat dicoba sesi ini:{' '}
                            <strong>{triedProducts.length} frame</strong>
                        </p>
                    </div>

                    {/* Footer actions */}
                    <footer className="footer">
                        <button
                            className={`action-button secondary ${showHud ? 'active-hud' : ''}`}
                            onClick={() => setShowHud((h) => !h)}
                            title="Toggle Real-Time Spatial Biometrics HUD"
                        >
                            {showHud ? '🔬 HUD ON' : '🔬 HUD OFF'}
                        </button>
                        <button
                            className="action-button secondary"
                            onClick={() =>
                                setSizingMode((m) => (m === 'aesthetic' ? 'trueSize' : 'aesthetic'))
                            }
                            title="Aesthetic: Looks good on all faces. True Size: Shows actual frame size."
                        >
                            {sizingMode === 'aesthetic' ? '🌟 Aesthetic' : '📏 True Size'}
                        </button>
                        <button className="action-button secondary" onClick={handleScreenshot}>
                            Share 📸
                        </button>
                        <button
                            className="action-button secondary"
                            onClick={() => setShowDebug(!showDebug)}
                        >
                            {showDebug ? 'Hide Debug' : 'Debug'}
                        </button>
                        <button
                            className="action-button primary"
                            onClick={() => setShowLeadModal(true)}
                        >
                            💬 Simpan Hasil & {triedProducts.length} Frame ke WA
                        </button>
                    </footer>
                </>
            )}

            <LeadCaptureModal
                isOpen={showLeadModal}
                onClose={() => setShowLeadModal(false)}
                selectedProduct={selectedProduct}
                fitInfo={fitInfo}
                triedProducts={triedProducts}
                onOpenPortal={() => setActiveView('portal')}
            />
        </div>
    )
}
