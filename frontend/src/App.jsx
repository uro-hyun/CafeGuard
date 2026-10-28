import { useEffect } from 'react'
import { useMonitor, useNow, useSiren } from './hooks'
import { AlarmBanner, EventPanel, GatePanel, RegisterPanel, SettingsPanel, TagPanel } from './components'

export default function App() {
  const { state, connected } = useMonitor()
  const now = useNow()
  const alarmCount = state?.alarms.length ?? 0
  const siren = useSiren(alarmCount > 0)

  useEffect(() => {
    document.title = alarmCount ? `🚨(${alarmCount}) CafeGuard 관제` : 'CafeGuard 관제'
  }, [alarmCount])

  return (
    <div className={`app ${alarmCount ? 'is-alarm' : ''}`}>
      <header className="topbar">
        <h1>
          CafeGuard <span>관제</span>
        </h1>
        <div className="topbar-right">
          <span className={`conn ${connected ? 'conn-on' : 'conn-off'}`}>
            <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} />
            {connected ? '서버 연결됨' : '서버 연결 끊김'}
          </span>
          <button className="btn btn-ghost" onClick={siren.enabled ? siren.disable : siren.enable}>
            {siren.enabled ? '🔊 경고음 켜짐' : '🔇 경고음 켜기'}
          </button>
        </div>
      </header>

      {!state ? (
        <p className="loading">서버에 연결하는 중…</p>
      ) : (
        <main>
          <AlarmBanner alarms={state.alarms} tags={state.tags} gates={state.gates} />
          <GatePanel gates={state.gates} tags={state.tags} now={now} />
          <TagPanel tags={state.tags} gates={state.gates} settings={state.settings} now={now} />
          <div className="two-col">
            <RegisterPanel unknownTags={state.unknownTags} now={now} />
            <SettingsPanel settings={state.settings} />
          </div>
          <EventPanel events={state.events} />
        </main>
      )}
    </div>
  )
}
