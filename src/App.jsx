import { useCallback, useEffect } from 'react'
import TryOnScreen from './components/TryOnScreen'
import MemberPortal from './components/MemberPortal'
import StaffApp from './components/staff/StaffApp'
import ObsLiveCounter from './components/ObsLiveCounter'
import { captureAttributionFromURL } from './sdk/doozCapture'
import { PATHS, navigate, useRoute } from './lib/routes'

const SIZE_CATEGORIES = ['XS', 'S', 'M', 'L', 'XL']
const STAFF_ROUTES = ['kasir', 'laporan', 'katalog']

// Tahap 1 DOOZ CRM: aplikasi staf pindah ke DOOZ CRM (wajib login). Kode staf lama di repo ini dibersihkan di tahap 3.
const CRM_URL = String(import.meta.env.VITE_CRM_URL ?? 'https://dooz-crm-pocco.fural.space').replace(/\/+$/, '')

/**
 * Aplikasi customer (Coba Kacamata + Kartu Member Saya) dan aplikasi staf (/staf) dipisah:
 * customer tidak pernah melihat menu internal.
 */
export default function App() {
    const route = useRoute()
    const isCustomer = route === 'tryon' || route === 'kartu'

    // Tangkap parameter atribusi bertanda tangan (?src=&host=&sesi=&outlet=&sig=) di aplikasi customer
    useEffect(() => {
        if (isCustomer) captureAttributionFromURL()
    }, [isCustomer])

    useEffect(() => {
        const titles = {
            tryon: 'Coba Kacamata — Kacamata DOOZ',
            kartu: 'Kartu Member Saya — Kacamata DOOZ',
            kasir: 'Kasir — Aplikasi Staf DOOZ',
            laporan: 'Laporan — Aplikasi Staf DOOZ',
            katalog: 'Katalog — Aplikasi Staf DOOZ',
            live: 'Overlay Live — Kacamata DOOZ',
        }
        document.title = titles[route] || titles.tryon
        document.body.classList.toggle('is-obs-overlay', route === 'live')
    }, [route])

    const openTryOn = useCallback(() => navigate(PATHS.tryon), [])

    const handleSelectFrameFromHistory = useCallback((payload) => {
        const sku = payload?.frame_sku ? String(payload.frame_sku) : ''
        navigate(PATHS.tryon, { params: sku ? { sku } : undefined })
    }, [])

    const handleApplyCustomerSizeFilter = useCallback(({ sizeCategory, widthMm }) => {
        const cat = String(sizeCategory || '').toUpperCase()
        navigate(PATHS.tryon, {
            params: SIZE_CATEGORIES.includes(cat) ? { size: cat, width_mm: widthMm || undefined } : undefined,
        })
    }, [])

    if (CRM_URL && (route === 'live' || STAFF_ROUTES.includes(route))) {
        if (typeof window !== 'undefined') {
            window.location.replace(`${CRM_URL}${window.location.pathname.replace(/^\/try-on/, '')}${window.location.search}`)
        }
        return null
    }
    if (route === 'live') return <ObsLiveCounter />
    if (STAFF_ROUTES.includes(route)) return <StaffApp route={route} />
    if (route === 'kartu') {
        return (
            <MemberPortal
                onBackToTryOn={openTryOn}
                onSelectFrameFromHistory={handleSelectFrameFromHistory}
                onApplyCustomerSizeFilter={handleApplyCustomerSizeFilter}
            />
        )
    }
    // `key` memastikan Try-On membaca ulang ukuran dari URL setelah navigasi dari Kartu Member
    return <TryOnScreen key={typeof window !== 'undefined' ? window.location.search : 'tryon'} />
}
