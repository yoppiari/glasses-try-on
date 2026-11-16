import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // Default "/" (server/serve.mjs melayani dist/ di root). GitHub Pages memakai VITE_BASE_PATH=/try-on/.
    base: process.env.VITE_BASE_PATH || '/',
    resolve: {
        alias: {
            // Modul Member DOOZ (salinan dari ukur-frame-dooz/packages/member-dooz — jangan edit, sinkron ulang)
            '@dooz/member-dooz': new URL('./src/vendor/member-dooz/src', import.meta.url).pathname,
        },
    },
    server: {
        host: true,
        port: 5173,
    },
    preview: {
        host: true,
        allowedHosts: true,
    },
})
