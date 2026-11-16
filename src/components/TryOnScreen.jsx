import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { MemberDoozButton, useMemberDooz } from '@dooz/member-dooz'
import TryOnCanvas from './TryOnCanvas'
import { AppHeader } from './brand/Brand'
import { getFitColor } from '../utils/fitCalculator'
import {
    DEFAULT_PRODUCTS,
    SIZE_CHART_DEFAULT,
    syncSharedCatalog,
    resolveCustomerSizeProfile,
} from '../data/glassesData'
import { UKUR_URL, mapWidthToSizeCategory } from '../lib/catalog'

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

function sameProduct(a, b) {
    if (!a || !b) return false
    return a.id === b.id || (a.sku && b.sku && String(a.sku).toUpperCase() === String(b.sku).toUpperCase())
}

function isDebugMode() {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('debug') === '1'
}

export default function TryOnScreen() {
    const debugMode = useMemo(isDebugMode, [])
    const [products, setProducts] = useState(DEFAULT_PRODUCTS)
    const [sizeChart, setSizeChart] = useState(SIZE_CHART_DEFAULT)

    const [selectedProduct, setSelectedProduct] = useState(DEFAULT_PRODUCTS[0])
    const { client: memberClient, isMember, me } = useMemberDooz()

    const [sizeFilter, setSizeFilter] = useState('ALL') // 'ALL' | 'RECOMMENDED' | 'XS' | 'S' | 'M' | 'L' | 'XL'
    const [autoFilterApplied, setAutoFilterApplied] = useState(false)

    const [showDebug, setShowDebug] = useState(false)
    const [showHud, setShowHud] = useState(false)
    const [sizingMode, setSizingMode] = useState('aesthetic') // 'aesthetic' | 'trueSize'
    const [fitInfo, setFitInfo] = useState(null)

    const canvasRef = useRef(null)
    const initialTrackedRef = useRef(false)

    // Ukuran utama Member DOOZ (Ukuran Saya) bila sudah masuk
    const memberMeasurement = useMemo(() => {
        if (!isMember || !me) return null
        if (me.primary_measurement) return me.primary_measurement
        return me.primary_size_category ? { size_category: me.primary_size_category } : null
    }, [isMember, me])

    // Ukuran customer: dari link App Ukur (?size=&width_mm=), ukuran utama Member DOOZ, atau kamera
    const customerProfile = useMemo(
        () =>
            resolveCustomerSizeProfile({
                memberMeasurement,
                cameraFaceWidthMm: fitInfo?.faceWidth,
                sizeChart,
            }),
        [memberMeasurement, fitInfo?.faceWidth, sizeChart]
    )

    // Catat `frame_tried` ke Riwayat Member DOOZ di CRM (`POST /api/capture/events`, hanya member yang masuk).
    // Server melengkapi nama, lebar & kategori frame dari Katalog. SKU yang sama berturut-turut dicatat sekali.
    const lastTrackedSkuRef = useRef('')
    const recordFrameTried = useCallback(
        (product) => {
            const sku = String(product?.sku || product?.id || '')
            if (!sku || !memberClient.isMember() || lastTrackedSkuRef.current === sku) return
            lastTrackedSkuRef.current = sku
            memberClient.trackEvent('frame_tried', { frame_sku: sku }, 'glasses_try_on').catch(() => {
                lastTrackedSkuRef.current = ''
            })
        },
        [memberClient]
    )

    // Katalog frame dari DOOZ CRM (`GET /api/catalog/size-chart` & `GET /api/catalog/frames`)
    useEffect(() => {
        let active = true
        syncSharedCatalog()
            .then(({ products: syncedProducts, sizeChart: syncedChart }) => {
                if (!active) return
                setSizeChart(syncedChart)
                setProducts(syncedProducts)
                setSelectedProduct((prev) => {
                    if (!prev) return syncedProducts[0] || DEFAULT_PRODUCTS[0]
                    return syncedProducts.find((p) => sameProduct(p, prev)) || syncedProducts[0] || prev
                })
            })
            .catch(() => {
                // tetap pakai katalog bawaan
            })
        return () => {
            active = false
        }
    }, [])

    // Filter ukuran otomatis + pilih frame awal dari link Ukur Frame / Kartu Member
    useEffect(() => {
        if (autoFilterApplied || products.length === 0) return

        const params = new URLSearchParams(window.location.search)
        const urlSku = (params.get('sku') || params.get('frame_sku') || '').trim().toUpperCase()
        const urlSize = (params.get('size') || params.get('size_category') || '').trim().toUpperCase()
        const urlWidth = Number(params.get('width_mm') || 0)

        if (urlSku) {
            const matchedBySku = products.find(
                (p) => p.sku.toUpperCase() === urlSku || p.id.toUpperCase() === urlSku
            )
            if (matchedBySku) {
                setSelectedProduct(matchedBySku)
                if (SIZE_CATEGORIES.includes(urlSize) || urlWidth > 0) setSizeFilter('RECOMMENDED')
                setAutoFilterApplied(true)
                if (!initialTrackedRef.current) {
                    initialTrackedRef.current = true
                    recordFrameTried(matchedBySku)
                }
                return
            }
        }

        const targetCategory = SIZE_CATEGORIES.includes(urlSize)
            ? urlSize
            : urlWidth > 0
              ? mapWidthToSizeCategory(urlWidth, sizeChart)
              : customerProfile?.source === 'member'
                ? customerProfile.sizeCategory
                : null

        if (targetCategory && SIZE_CATEGORIES.includes(targetCategory)) {
            setSizeFilter('RECOMMENDED')
            const matchingFrame = products.find((p) => p.sizeCategory === targetCategory)
            if (matchingFrame) {
                setSelectedProduct(matchingFrame)
                if (!initialTrackedRef.current) {
                    initialTrackedRef.current = true
                    recordFrameTried(matchingFrame)
                }
            }
            setAutoFilterApplied(true)
        }
    }, [autoFilterApplied, products, sizeChart, customerProfile, recordFrameTried])

    const activeFilterCategory = useMemo(() => {
        if (sizeFilter === 'ALL') return null
        if (sizeFilter === 'RECOMMENDED') return customerProfile?.sizeCategory || 'M'
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

    const handleProductChange = useCallback(
        (product) => {
            if (!product) return
            setSelectedProduct(product)
            recordFrameTried(product)
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
                if (matching.length > 0 && !matching.some((m) => sameProduct(m, selectedProduct))) {
                    handleProductChange(matching[0])
                }
            }
        },
        [customerProfile?.sizeCategory, products, selectedProduct, handleProductChange]
    )

    const stepProduct = useCallback(
        (delta) => {
            const list = filteredProducts.length > 0 ? filteredProducts : products
            const currentIndex = list.findIndex((p) => sameProduct(p, selectedProduct))
            const nextIndex = (currentIndex + delta + list.length) % list.length
            handleProductChange(list[nextIndex])
        },
        [filteredProducts, products, selectedProduct, handleProductChange]
    )

    const handleScreenshot = useCallback(async () => {
        if (!canvasRef.current) return
        const image = await canvasRef.current.takeScreenshot()
        if (image) {
            const link = document.createElement('a')
            link.href = image
            link.download = `kacamata-dooz-${selectedProduct.name}-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }, [selectedProduct])

    const handleFitCalculated = useCallback((info) => {
        setFitInfo(info)
    }, [])

    const isFitForCustomer = Boolean(
        customerProfile?.sizeCategory && selectedProduct?.sizeCategory === customerProfile.sizeCategory
    )
    const hasMeasurement = ['url_param', 'member'].includes(customerProfile?.source)
    const cameraEstimate = customerProfile?.source === 'camera_biometric'

    return (
        <div className="app">
            <AppHeader subtitle="Coba Kacamata" actions={<MemberDoozButton />} />

            {/* Ukuran customer & filter frame */}
            <section className="tryon-sizebar" aria-label="Filter ukuran frame">
                <div className="tryon-sizebar__line">
                    {hasMeasurement ? (
                        <span>
                            Ukuran kamu:{' '}
                            <strong>
                                {customerProfile.widthMm ? `${customerProfile.widthMm} mm · ` : ''}
                                {customerProfile.sizeCategory}
                            </strong>
                        </span>
                    ) : cameraEstimate ? (
                        <span className="dz-muted">
                            Perkiraan kamera: <strong>{customerProfile.sizeCategory}</strong>
                        </span>
                    ) : (
                        <span className="dz-muted">Belum tahu ukuran frame kamu?</span>
                    )}
                    {!hasMeasurement && (
                        <a className="dz-link" href={UKUR_URL}>
                            Ukur dulu
                        </a>
                    )}
                </div>
                <div className="tryon-pills" role="group" aria-label="Pilih ukuran frame">
                    {customerProfile?.sizeCategory && (
                        <button
                            type="button"
                            className={`tryon-pill tryon-pill--fit ${sizeFilter === 'RECOMMENDED' ? 'is-active' : ''}`}
                            onClick={() => handleSelectSizeFilter('RECOMMENDED')}
                        >
                            Pas untuk kamu <small>{recommendedCount}</small>
                        </button>
                    )}
                    <button
                        type="button"
                        className={`tryon-pill ${sizeFilter === 'ALL' ? 'is-active' : ''}`}
                        onClick={() => handleSelectSizeFilter('ALL')}
                    >
                        Semua <small>{products.length}</small>
                    </button>
                    {SIZE_CATEGORIES.map((cat) => {
                        const chartEntry = sizeChart.find((c) => c.category === cat)
                        const count = products.filter((p) => p.sizeCategory === cat).length
                        return (
                            <button
                                key={cat}
                                type="button"
                                className={`tryon-pill ${sizeFilter === cat ? 'is-active' : ''}`}
                                onClick={() => handleSelectSizeFilter(cat)}
                                title={chartEntry ? `${chartEntry.min_mm}–${chartEntry.max_mm} mm` : `Ukuran ${cat}`}
                            >
                                {cat} <small>{count}</small>
                            </button>
                        )
                    })}
                </div>
            </section>

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

            <section className="product-selector">
                <button className="nav-button" onClick={() => stepProduct(-1)} aria-label="Frame sebelumnya">
                    ‹
                </button>
                <div className="product-carousel">
                    {filteredProducts.map((product) => {
                        const isMatch =
                            customerProfile?.sizeCategory && product.sizeCategory === customerProfile.sizeCategory
                        return (
                            <button
                                key={product.sku || product.id}
                                className={`product-thumb ${sameProduct(selectedProduct, product) ? 'active' : ''}`}
                                onClick={() => handleProductChange(product)}
                                aria-label={`Coba ${product.name}`}
                                title={`${product.name} · ${product.frameWidth} mm · ${product.sizeCategory}`}
                            >
                                <img src={product.thumbnailUrl || product.image} alt={product.name} />
                                <span className="thumb-size-tag">{product.sizeCategory}</span>
                                {isMatch && (
                                    <span className="thumb-fit-dot" title="Pas untuk kamu">
                                        ★
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
                <button className="nav-button" onClick={() => stepProduct(1)} aria-label="Frame berikutnya">
                    ›
                </button>
            </section>

            <div className="product-info">
                <h2>{selectedProduct.name}</h2>
                <p className="product-meta">
                    {selectedProduct.frameWidth} mm · Ukuran <strong>{selectedProduct.sizeCategory}</strong>
                    {selectedProduct.priceIdr > 0 && (
                        <>
                            {' '}
                            · <strong>{formatRupiah(selectedProduct.priceIdr)}</strong>
                        </>
                    )}
                    {selectedProduct.stockStatus === 'low_stock' && ' · Stok terbatas'}
                    {selectedProduct.stockStatus === 'out_of_stock' && ' · Stok habis'}
                </p>
                {isFitForCustomer ? (
                    <span className="fit-indicator" style={{ color: 'var(--dz-orange-text)' }}>
                        ★ Pas dengan ukuran kamu
                    </span>
                ) : (
                    fitInfo &&
                    fitInfo.fitScore > 0 && (
                        <span className="fit-indicator" style={{ color: getFitColor(fitInfo.fitScore) }}>
                            {fitInfo.fitLabel}
                        </span>
                    )
                )}
            </div>

            {debugMode && (
                <div className="dz-debug-tools">
                    <button className="dz-btn dz-btn--outline dz-btn--sm" onClick={() => setShowHud((h) => !h)}>
                        HUD {showHud ? 'ON' : 'OFF'}
                    </button>
                    <button
                        className="dz-btn dz-btn--outline dz-btn--sm"
                        onClick={() => setSizingMode((m) => (m === 'aesthetic' ? 'trueSize' : 'aesthetic'))}
                    >
                        {sizingMode === 'aesthetic' ? 'Aesthetic' : 'True Size'}
                    </button>
                    <button className="dz-btn dz-btn--outline dz-btn--sm" onClick={() => setShowDebug((d) => !d)}>
                        Debug {showDebug ? 'ON' : 'OFF'}
                    </button>
                </div>
            )}

            <footer className="footer">
                <button className="dz-btn dz-btn--outline dz-btn--lg" onClick={handleScreenshot} title="Simpan foto ke HP">
                    📸 Simpan foto
                </button>
            </footer>
        </div>
    )
}
