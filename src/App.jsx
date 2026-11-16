import { useState, useCallback, useRef, useEffect } from 'react'
import TryOnCanvas from './components/TryOnCanvas'
import LeadCaptureModal from './components/LeadCaptureModal'
import MemberPortal from './components/MemberPortal'
import { getFitColor, getFitEmoji } from './utils/fitCalculator'
import {
    captureAttributionFromURL,
    mapWidthToSizeCategory,
    track,
} from './sdk/doozCapture'

// Product catalog with comprehensive metadata for fit calculations
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`

const PRODUCTS = [
    {
        id: 'glasses-1',
        sku: 'DOOZ-CLS-001',
        name: 'Classic Black',
        image: `${BASE}images/1.png`,
        frameWidth: 138,              // mm - standard medium frame
        frameStyle: 'rectangle',
        sizeCategory: 'M',
        bestForFaces: ['oval', 'round'],
        color: 'Black',
        material: 'Acetate',
        config: {
            widthMultiplier: 1.4,
            verticalOffset: 0.015,
            bridgeOffset: 0
        }
    },
    {
        id: 'glasses-2',
        sku: 'DOOZ-AVI-002',
        name: 'Modern Aviator',
        image: `${BASE}images/2.png`,
        frameWidth: 142,              // mm - large aviator
        frameStyle: 'aviator',
        sizeCategory: 'L',
        bestForFaces: ['oval', 'heart', 'square'],
        color: 'Gold/Black',
        material: 'Metal',
        config: {
            widthMultiplier: 1.35,
            verticalOffset: 0.02,
            bridgeOffset: 0
        }
    },
    {
        id: 'glasses-3',
        sku: 'DOOZ-RND-003',
        name: 'Retro Round',
        image: `${BASE}images/3.png`,
        // Multi-angle sprites for 2.5D rendering
        sprites: {
            0: `${BASE}images/3/0.png`,
            15: `${BASE}images/3/15.png`,
            30: `${BASE}images/3/30.png`,
            45: `${BASE}images/3/45.png`
        },
        frameWidth: 132,              // mm - small round frame
        frameStyle: 'round',
        sizeCategory: 'S',
        bestForFaces: ['square', 'oval', 'oblong'],
        color: 'Silver',
        material: 'Metal',
        config: {
            widthMultiplier: 1.3,
            verticalOffset: 0.015,
            bridgeOffset: 0
        }
    },
    {
        id: 'glasses-4',
        sku: 'DOOZ-SPT-004',
        name: 'Sport Wrap',
        image: `${BASE}images/4.png`,
        frameWidth: 148,              // mm - XL wraparound
        frameStyle: 'wraparound',
        sizeCategory: 'XL',
        bestForFaces: ['oval', 'round', 'square'],
        color: 'Black',
        material: 'TR90/Nylon',
        config: {
            widthMultiplier: 1.45,
            verticalOffset: 0.02,
            bridgeOffset: 0
        }
    },
    {
        id: 'glasses-5',
        sku: 'DOOZ-BRW-005',
        name: 'Designer Browline',
        image: `${BASE}images/5.png`,
        frameWidth: 126,              // mm - XS/petite browline
        frameStyle: 'browline',
        sizeCategory: 'XS',
        bestForFaces: ['oval', 'square', 'heart'],
        color: 'Havana/Gold',
        material: 'Acetate/Metal',
        config: {
            widthMultiplier: 1.35,
            verticalOffset: 0.018,
            bridgeOffset: 0
        }
    }
]

function detectInitialView() {
    if (typeof window === 'undefined') return 'tryon'
    const path = window.location.pathname || ''
    const params = new URLSearchParams(window.location.search)
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
    const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0])
    const [triedProducts, setTriedProducts] = useState([PRODUCTS[0]])
    const [showLeadModal, setShowLeadModal] = useState(false)
    const [showDebug, setShowDebug] = useState(false)
    const [showHud, setShowHud] = useState(true)
    const [sizingMode, setSizingMode] = useState('aesthetic')  // 'aesthetic' or 'trueSize'
    const [fitInfo, setFitInfo] = useState(null)
    const canvasRef = useRef(null)

    // Capture signed attribution parameters (?src=&host=&sesi=&outlet=&sig=) on mount
    useEffect(() => {
        captureAttributionFromURL()
    }, [])

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

    const handleProductChange = useCallback((product) => {
        setSelectedProduct(product)
        setTriedProducts((prev) => {
            if (prev.some((p) => p.id === product.id)) return prev
            return [...prev, product]
        })
        track('frame_tried', {
            frame_sku: product.sku || product.id,
            frame_name: product.name,
            frame_width_mm: product.frameWidth,
            size_category: product.sizeCategory || mapWidthToSizeCategory(product.frameWidth),
        })
    }, [])

    const handlePrevious = useCallback(() => {
        const currentIndex = PRODUCTS.findIndex(p => p.id === selectedProduct.id)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : PRODUCTS.length - 1
        handleProductChange(PRODUCTS[prevIndex])
    }, [selectedProduct, handleProductChange])

    const handleNext = useCallback(() => {
        const currentIndex = PRODUCTS.findIndex(p => p.id === selectedProduct.id)
        const nextIndex = currentIndex < PRODUCTS.length - 1 ? currentIndex + 1 : 0
        handleProductChange(PRODUCTS[nextIndex])
    }, [selectedProduct, handleProductChange])

    const handleFitCalculated = useCallback((info) => {
        setFitInfo(info)
    }, [])

    const handleSelectFrameFromHistory = useCallback((payload) => {
        if (payload) {
            const match = PRODUCTS.find(
                (p) =>
                    p.id === payload.frame_sku ||
                    p.sku === payload.frame_sku ||
                    p.name?.toLowerCase() === payload.frame_name?.toLowerCase()
            )
            if (match) {
                setSelectedProduct(match)
            }
        }
        setActiveView('tryon')
    }, [])

    return (
        <div className="app">
            {/* Header */}
            <header className="header dooz-app-header">
                <div className="header-brand">
                    <h1>Kacamata DOOZ</h1>
                    <span className="version-badge">Omnichannel CRM</span>
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
                        💬 Simpan Ukuran ke WA
                    </button>
                    <button
                        type="button"
                        className={`header-nav-btn ${activeView === 'portal' ? 'active' : ''}`}
                        onClick={() => setActiveView('portal')}
                    >
                        👤 Data Saya
                    </button>
                </nav>
            </header>

            {activeView === 'portal' ? (
                <MemberPortal
                    onBackToTryOn={() => setActiveView('tryon')}
                    onSelectFrameFromHistory={handleSelectFrameFromHistory}
                />
            ) : (
                <>
                    {/* Main try-on area */}
                    <main className="main-content">
                        <TryOnCanvas
                            ref={canvasRef}
                            selectedProduct={selectedProduct}
                            products={PRODUCTS}
                            onProductChange={handleProductChange}
                            onFitCalculated={handleFitCalculated}
                            showDebug={showDebug}
                            showHud={showHud}
                            sizingMode={sizingMode}
                        />
                    </main>

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
                            {PRODUCTS.map((product) => (
                                <button
                                    key={product.id}
                                    className={`product-thumb ${selectedProduct.id === product.id ? 'active' : ''}`}
                                    onClick={() => handleProductChange(product)}
                                    aria-label={`Select ${product.name}`}
                                >
                                    <img src={product.image} alt={product.name} />
                                </button>
                            ))}
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
                        <h2>{selectedProduct.name}</h2>

                        {/* Fit indicator */}
                        {fitInfo && fitInfo.fitScore > 0 && (
                            <div className="fit-indicator" style={{ color: getFitColor(fitInfo.fitScore) }}>
                                <span className="fit-emoji">{getFitEmoji(fitInfo.fitScore)}</span>
                                <span className="fit-label">{fitInfo.fitLabel}</span>
                            </div>
                        )}

                        {/* Product details */}
                        <div className="product-details">
                            <span className="product-style">{selectedProduct.frameStyle}</span>
                            <span className="product-size">
                                {selectedProduct.frameWidth} mm • Size {selectedProduct.sizeCategory}
                            </span>
                        </div>

                        <p className="product-index">
                            {PRODUCTS.findIndex(p => p.id === selectedProduct.id) + 1} of {PRODUCTS.length}
                        </p>
                    </div>

                    {/* Footer actions */}
                    <footer className="footer">
                        <button
                            className={`action-button secondary ${showHud ? 'active-hud' : ''}`}
                            onClick={() => setShowHud(h => !h)}
                            title="Toggle Real-Time Spatial Biometrics HUD"
                        >
                            {showHud ? '🔬 HUD ON' : '🔬 HUD OFF'}
                        </button>
                        <button
                            className="action-button secondary"
                            onClick={() => setSizingMode(m => m === 'aesthetic' ? 'trueSize' : 'aesthetic')}
                            title="Aesthetic: Looks good on all faces. True Size: Shows actual frame size."
                        >
                            {sizingMode === 'aesthetic' ? '🌟 Aesthetic' : '📏 True Size'}
                        </button>
                        <button className="action-button secondary" onClick={handleScreenshot}>
                            Share 📸
                        </button>
                        <button className="action-button secondary" onClick={() => setShowDebug(!showDebug)}>
                            {showDebug ? 'Hide Debug' : 'Debug'}
                        </button>
                        <button
                            className="action-button primary"
                            onClick={() => setShowLeadModal(true)}
                        >
                            💬 Simpan Hasil ke WA Saya
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
