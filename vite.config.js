import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const hubTarget = process.env.VITE_HUB_PROXY_TARGET || 'http://127.0.0.1:8089'

export default defineConfig({
    plugins: [react()],
    // VITE_BASE_PATH overrides the base (e.g. "/" when served at a domain root);
    // default keeps the original GitHub Pages sub-path behaviour.
    base: process.env.VITE_BASE_PATH || (process.env.NODE_ENV === 'production' ? '/try-on/' : '/'),
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
