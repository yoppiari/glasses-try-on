import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const hubTarget = process.env.VITE_HUB_PROXY_TARGET || 'http://127.0.0.1:8089'

export default defineConfig({
    plugins: [react()],
    // Default "/" (Customer Hub Go melayani dist/ di root: /, /kartu-member, /staf/*).
    // GitHub Pages memakai VITE_BASE_PATH=/try-on/ (lihat .github/workflows/deploy.yml).
    base: process.env.VITE_BASE_PATH || '/',
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': {
                target: hubTarget,
                changeOrigin: true
            }
        }
    },
    preview: {
        host: true,
        allowedHosts: true
    }
})
