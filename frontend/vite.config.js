import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 서버에서 /api, /socket.io 요청을 백엔드로 전달 (CORS 설정 없이 동작)
const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 같은 네트워크의 다른 기기(휴대폰 등)에서도 대시보드 접속 가능
    proxy: {
      '/api': BACKEND,
      '/socket.io': { target: BACKEND, ws: true },
    },
  },
})
