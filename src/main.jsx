import React from 'react'
import ReactDOM from 'react-dom/client'
import { createMemberClient, MemberDoozProvider } from '@dooz/member-dooz'
import '@dooz/member-dooz/member-dooz.css'
import App from './App'
import { DoozWordmark } from './components/brand/Brand'
import { CRM_URL, UKUR_URL } from './lib/catalog'
import { INDONESIA_CITIES } from './lib/cities'
import { resolveLegacyRedirect } from '../server/redirects.mjs'
import './styles/index.css'

const BASE = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

/**
 * Link lama (/staf/*, /kasir, /kartu-member, ?view=…) — server statis sudah mengalihkan, tapi hosting tanpa server
 * (GitHub Pages / vite dev) ditangani di sini sebelum render.
 * @returns {boolean} true bila halaman sedang pindah ke app lain.
 */
function applyLegacyRedirect() {
    const r = resolveLegacyRedirect(window.location.pathname, window.location.search, {
        crmUrl: CRM_URL,
        ukurUrl: UKUR_URL,
        base: BASE,
    })
    if (!r) return false
    if (r.external) {
        window.location.replace(r.location)
        return true
    }
    window.history.replaceState(window.history.state, '', `${BASE}${r.location}`)
    return false
}

/** Data lama dari Try-On versi sebelumnya (formulir simpan pilihan, event lokal) tidak dipakai lagi → hapus dari HP. */
function clearLegacyStorage() {
    for (const key of ['dooz_lead_state_v1', 'dooz_local_events_v1', 'dooz_attribution_v1']) {
        try {
            window.localStorage?.removeItem(key)
            window.sessionStorage?.removeItem(key)
        } catch {
            /* abaikan */
        }
    }
}

/**
 * Klien Member DOOZ (server: DOOZ CRM). `?masuk=` = magic link WhatsApp untuk Try-On;
 * `token` menjaga magic link lama (/kartu-member?token=) tetap jalan.
 */
const memberClient = createMemberClient({ apiBase: CRM_URL, app: 'tryon', magicParams: ['masuk', 'token'] })

/** Mini app DOOZ lain di panel Member DOOZ (dibuka dengan token serah-terima → tetap masuk). */
const MEMBER_APPS = [
    { app: 'ukur', label: 'Ukur frame (App Ukur)', hint: 'Ukur lebar frame di layar HP', fallbackUrl: UKUR_URL },
]

if (!applyLegacyRedirect()) {
    clearLegacyStorage()
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <MemberDoozProvider
                client={memberClient}
                apps={MEMBER_APPS}
                cities={INDONESIA_CITIES}
                brand={<DoozWordmark variant="reverse" height={26} />}
            >
                <App />
            </MemberDoozProvider>
        </React.StrictMode>
    )
}
