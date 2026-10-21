import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api 요청을 백엔드(5000번 포트)로 넘겨서 CORS 없이 개발
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
