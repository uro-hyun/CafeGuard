import { useState } from 'react'
import { api } from './api'

// ───────────────────────── 공통 유틸 ─────────────────────────

function ago(ts, now) {
  if (!ts) return '-'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}초 전`
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return new Date(ts).toLocaleString()
}

function clock(ts) {
  const d = new Date(ts)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** 실패 시 alert로 알리는 비동기 액션 래퍼 */
function useAction() {
  const [busy, setBusy] = useState(false)
  const run = async (fn) => {
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}

// ───────────────────────── 알람 배너 ─────────────────────────

export function AlarmBanner({ alarms, tags, gates }) {
  const [busy, run] = useAction()
  if (!alarms.length) return null
  const tagOf = (id) => tags.find((t) => t.tagId === id)
  const gateOf = (id) => gates.find((g) => g.gateId === id)

  return (
    <section className="alarm-banner" role="alert">
      <div className="alarm-head">
        <strong>🚨 게이트 통과 경보 {alarms.length}건</strong>
        {alarms.length > 1 && (
          <button className="btn btn-light" disabled={busy} onClick={() => run(api.ackAll)}>
            전체 해제
          </button>
        )}
      </div>
      <ul>
        {alarms.map((a) => {
          const t = tagOf(a.tagId)
          return (
            <li key={a.id}>
              <div>
                <b>{t?.name || a.tagId}</b>
                <span className="mono"> {a.tagId}</span>
                {t?.holder && <span> · 지급: {t.holder}</span>}
                <div className="alarm-sub">
                  {gateOf(a.gateId)?.name || a.gateId} 통과 · {clock(a.triggeredAt)}
                  {a.rssiAvg != null && ` · 평균 ${a.rssiAvg} dBm`}
                </div>
              </div>
              <button className="btn btn-light" disabled={busy} onClick={() => run(() => api.ackAlarm(a.id))}>
                알람 해제
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ───────────────────────── 게이트 ─────────────────────────

export function GatePanel({ gates, tags, now }) {
  const [busy, run] = useAction()

  const rename = (g) => {
    const name = prompt('게이트 이름', g.name)
    if (name !== null) run(() => api.updateGate(g.gateId, { name }))
  }
  const remove = (g) => {
    if (confirm(`${g.name} 게이트를 목록에서 삭제할까요? (다시 보고가 오면 자동 등록됩니다)`)) {
      run(() => api.deleteGate(g.gateId))
    }
  }

  return (
    <section className="panel">
      <h2>게이트보드</h2>
      {!gates.length && (
        <p className="empty">아직 보고한 게이트가 없습니다. 게이트보드 전원과 Wi-Fi/서버 주소 설정을 확인하세요.</p>
      )}
      <div className="gate-grid">
        {gates.map((g) => {
          const seen = tags.filter((t) => t.connected && t.gateId === g.gateId)
          return (
            <article key={g.gateId} className={`gate-card ${g.online ? 'on' : 'off'}`}>
              <header>
                <span className={`dot ${g.online ? 'dot-on' : 'dot-off'}`} />
                <b>{g.name}</b>
                <span className="mono muted">{g.gateId}</span>
              </header>
              <dl>
                <dt>상태</dt>
                <dd>{g.online ? '연결됨' : '응답 없음'}</dd>
                <dt>마지막 보고</dt>
                <dd>{ago(g.lastSeenAt, now)}</dd>
                <dt>IP / FW</dt>
                <dd className="mono">
                  {g.ip || '-'} / {g.firmware || '-'}
                </dd>
                <dt>감지 중</dt>
                <dd>
                  {seen.length ? seen.map((t) => <span key={t.tagId} className="chip">{t.name || t.tagId}</span>) : '없음'}
                </dd>
              </dl>
              <footer>
                <button className="btn" disabled={busy || !g.online} onClick={() => run(() => api.testGate(g.gateId))}>
                  {g.testing ? '울리는 중…' : '부저 테스트'}
                </button>
                <button className="btn btn-ghost" onClick={() => rename(g)}>
                  이름 변경
                </button>
                <button className="btn btn-ghost" onClick={() => remove(g)}>
                  삭제
                </button>
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}

// ───────────────────────── 지급보드 ─────────────────────────

function SignalBar({ value, threshold }) {
  const MIN = -100
  const MAX = -30
  const pct = (v) => Math.min(100, Math.max(0, ((v - MIN) / (MAX - MIN)) * 100))
  return (
    <div className="signal" title={value == null ? '' : `${value} dBm`}>
      <div className="signal-fill" style={{ width: value == null ? 0 : `${pct(value)}%` }} />
      <div className="signal-mark" style={{ left: `${pct(threshold)}%` }} title={`통과 임계값 ${threshold} dBm`} />
    </div>
  )
}

function tagStatus(t, gates) {
  if (t.alarmActive) return { cls: 'st-alarm', text: '통과 경보' }
  if (!t.connected) {
    const gate = gates.find((g) => g.gateId === t.gateId)
    if (gate && !gate.online) return { cls: 'st-off', text: '게이트 오프라인' }
    return { cls: 'st-off', text: '신호 없음' }
  }
  if (t.near) return { cls: 'st-near', text: '게이트 근접' }
  return { cls: 'st-ok', text: '연결됨' }
}

export function TagPanel({ tags, gates, settings, now }) {
  const [busy, run] = useAction()
  const [editing, setEditing] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    await run(() => api.updateTag(editing, { name: f.get('name'), holder: f.get('holder') }))
    setEditing(null)
  }

  return (
    <section className="panel">
      <h2>
        지급보드 <span className="muted">{tags.filter((t) => t.connected).length}/{tags.length} 연결</span>
      </h2>
      {!tags.length && <p className="empty">등록된 지급보드가 없습니다. 아래에서 등록하세요.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>상태</th>
              <th>지급보드</th>
              <th>지급 대상</th>
              <th>신호 (이동평균)</th>
              <th>마지막 수신</th>
              <th>감시</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => {
              const st = tagStatus(t, gates)
              const isEditing = editing === t.tagId
              return (
                <tr key={t.tagId} className={t.alarmActive ? 'row-alarm' : ''}>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.text}</span>
                  </td>
                  {isEditing ? (
                    <td colSpan={2}>
                      <form className="inline-form" onSubmit={save}>
                        <input name="name" defaultValue={t.name} placeholder="장비명" />
                        <input name="holder" defaultValue={t.holder} placeholder="지급 대상" />
                        <button className="btn" disabled={busy}>
                          저장
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                          취소
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td>
                        <b>{t.name || '-'}</b>
                        <div className="mono muted">{t.tagId}</div>
                      </td>
                      <td>
                        {t.holder || <span className="muted">미지급</span>}
                        {t.issuedAt && <div className="muted small">{new Date(t.issuedAt).toLocaleString()}</div>}
                      </td>
                    </>
                  )}
                  <td>
                    <SignalBar value={t.connected ? t.avg ?? t.rssi : null} threshold={settings.passThreshold} />
                    <div className="mono small">
                      {t.connected ? `${t.avg ?? '-'} dBm (현재 ${t.rssi})` : '-'}
                    </div>
                  </td>
                  <td>{ago(t.lastSeenAt, now)}</td>
                  <td>
                    <label className="switch" title={t.armed ? '감시 중: 게이트 통과 시 알람' : '감시 해제: 통과해도 알람 없음'}>
                      <input
                        type="checkbox"
                        checked={t.armed}
                        disabled={busy}
                        onChange={(e) => run(() => api.updateTag(t.tagId, { armed: e.target.checked }))}
                      />
                      <span>{t.armed ? 'ON' : 'OFF'}</span>
                    </label>
                  </td>
                  <td className="actions">
                    <button className="btn btn-ghost" onClick={() => setEditing(t.tagId)}>
                      수정
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => confirm(`${t.tagId}를 삭제할까요?`) && run(() => api.deleteTag(t.tagId))}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function RegisterPanel({ unknownTags, now }) {
  const [busy, run] = useAction()
  const [tagId, setTagId] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const ok = await run(() =>
      api.createTag({ tagId: f.get('tagId'), name: f.get('name'), holder: f.get('holder'), armed: f.get('armed') === 'on' }),
    )
    if (ok) {
      form.reset()
      setTagId('')
    }
  }

  return (
    <section className="panel">
      <h2>지급보드 등록</h2>
      {unknownTags.length > 0 && (
        <div className="unknown">
          <span>미등록 감지:</span>
          {unknownTags.map((u) => (
            <button key={u.tagId} className="chip chip-btn" onClick={() => setTagId(u.tagId)} title={`${u.rssi} dBm · ${ago(u.lastSeenAt, now)}`}>
              + {u.tagId} <span className="muted">{u.rssi}dBm</span>
            </button>
          ))}
        </div>
      )}
      <form className="register" onSubmit={submit}>
        <input name="tagId" required placeholder="태그 ID (예: CG-TAG-01)" value={tagId} onChange={(e) => setTagId(e.target.value)} />
        <input name="name" placeholder="장비명 (예: 노트북 A)" />
        <input name="holder" placeholder="지급 대상 (선택)" />
        <label className="check">
          <input type="checkbox" name="armed" defaultChecked /> 감시
        </label>
        <button className="btn" disabled={busy}>
          등록
        </button>
      </form>
    </section>
  )
}

// ───────────────────────── 설정 ─────────────────────────

const FIELDS = [
  { key: 'passThreshold', label: '통과 임계값 (dBm)', help: '이동평균 RSSI가 이 값 이상이면 게이트 근접. 값을 키울수록(예: -50) 더 가까이 와야 판정', step: 1 },
  { key: 'passHoldMs', label: '근접 유지 시간 (ms)', help: '근접 상태가 이 시간 이상 지속되면 통과로 판정', step: 100 },
  { key: 'windowSize', label: '이동평균 샘플 수', help: '클수록 안정적이지만 반응이 느려짐 (게이트 보고 1초당 1샘플)', step: 1 },
  { key: 'rearmHysteresis', label: '재판정 여유 (dB)', help: '통과 판정 후 (임계값 - 여유) 아래로 멀어져야 다시 판정', step: 1 },
  { key: 'lostTimeoutMs', label: '신호 끊김 판정 (ms)', help: '이 시간 동안 수신이 없으면 신호 없음', step: 500 },
  { key: 'gateOfflineMs', label: '게이트 오프라인 판정 (ms)', help: '이 시간 동안 게이트 보고가 없으면 오프라인', step: 1000 },
]

export function SettingsPanel({ settings }) {
  const [busy, run] = useAction()
  const [open, setOpen] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const patch = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(f.get(key))]))
    patch.logRssi = f.get('logRssi') === 'on'
    run(() => api.updateSettings(patch))
  }

  return (
    <section className="panel">
      <h2 className="clickable" onClick={() => setOpen(!open)}>
        판정 설정 {open ? '▾' : '▸'}{' '}
        <span className="muted small">
          임계값 {settings.passThreshold} dBm · 유지 {settings.passHoldMs} ms
        </span>
      </h2>
      {open && (
        // key: 다른 곳에서 설정이 바뀌면 폼 기본값도 갱신
        <form key={JSON.stringify(settings)} className="settings" onSubmit={submit}>
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <input type="number" name={f.key} defaultValue={settings[f.key]} step={f.step} required />
              <small>{f.help}</small>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" name="logRssi" defaultChecked={settings.logRssi} /> RSSI 기록 저장 (24시간 보관)
          </label>
          <div>
            <button className="btn" disabled={busy}>
              저장
            </button>
          </div>
          <p className="muted small">
            튜닝 방법: 지급보드를 평소 자리에 두고 신호값을 확인한 뒤, 문 앞(게이트 바로 옆)에서의 값과의 중간쯤으로 임계값을 잡으세요.
          </p>
        </form>
      )}
    </section>
  )
}

// ───────────────────────── 이력 ─────────────────────────

const EVENT_CLS = {
  pass_detected: 'ev-alarm',
  gate_offline: 'ev-warn',
  tag_lost: 'ev-warn',
  alarm_acked: 'ev-ok',
  gate_online: 'ev-ok',
  tag_connected: 'ev-ok',
}

export function EventPanel({ events }) {
  return (
    <section className="panel">
      <h2>최근 이력</h2>
      <ul className="events">
        {events.map((e, i) => (
          <li key={e.id || `${e.createdAt}-${i}`} className={EVENT_CLS[e.type] || ''}>
            <time className="mono">{clock(e.createdAt)}</time>
            <span>{e.message}</span>
          </li>
        ))}
        {!events.length && <li className="muted">이력이 없습니다.</li>}
      </ul>
    </section>
  )
}
