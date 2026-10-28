import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

/** 서버 실시간 상태 구독 */
export function useMonitor() {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('state', setState)
    return () => socket.close()
  }, [])

  return { state, connected }
}

/** 1초마다 갱신되는 현재 시각 (마지막 수신 n초 전 표시용) */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/**
 * 알람 경고음 (Web Audio). 브라우저 정책상 사용자가 한 번 클릭해 켜야 소리가 난다.
 */
export function useSiren(active) {
  const [enabled, setEnabled] = useState(false)
  const ctxRef = useRef(null)

  const enable = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current.resume()
    setEnabled(true)
  }
  const disable = () => setEnabled(false)

  useEffect(() => {
    if (!enabled || !active || !ctxRef.current) return
    const ctx = ctxRef.current
    const beep = () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 1760
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.26)
    }
    beep()
    const t = setInterval(beep, 500)
    return () => clearInterval(t)
  }, [enabled, active])

  return { enabled, enable, disable }
}
