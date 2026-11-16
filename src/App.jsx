import { useEffect } from 'react'
import { MemberDoozPanel, useMemberDooz } from '@dooz/member-dooz'
import TryOnScreen from './components/TryOnScreen'

/**
 * Try-On hanya punya satu tugas: coba kacamata. Aplikasi staf ada di DOOZ CRM; data member (Kartu Member,
 * Ukuran Saya, Riwayat, Profil) dibuka lewat tombol Member DOOZ di pojok kanan atas.
 *
 * Panel Member DOOZ dipasang TANPA `onJoin`: Try-On tidak punya ajakan simpan / jadi member — yang belum member
 * hanya melihat "Masuk lewat WhatsApp". Ajakan simpan ada di App Ukur.
 * "Ukur lagi" di Ukuran Saya membuka App Ukur dengan token serah-terima (login ikut terbawa).
 */
export default function App() {
    const { apps, openApp } = useMemberDooz()
    const ukurApp = apps.find((a) => a.app === 'ukur')
    useEffect(() => {
        document.title = 'Coba Kacamata — Kacamata DOOZ'
    }, [])

    return (
        <>
            <TryOnScreen />
            <MemberDoozPanel onMeasureAgain={ukurApp ? () => void openApp(ukurApp) : undefined} />
        </>
    )
}
