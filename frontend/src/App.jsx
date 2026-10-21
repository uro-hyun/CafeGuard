import { useEffect, useState } from "react";
import { getConfig, getEvents, getStatus, saveConfig } from "./api";
import { setAlarmSound, unlockSound } from "./alarmSound";
import { usePolling } from "./usePolling";
import TagCard from "./components/TagCard";
import SettingsPanel from "./components/SettingsPanel";
import EventLog from "./components/EventLog";
import "./App.css";

const DEFAULT_GATE_ID = "gate-01";

function App() {
  const { data: status, error: statusError } = usePolling(getStatus, 1000);
  const { data: events } = usePolling(getEvents, 2000);

  const gates = status?.gates ?? [];
  const [selectedGateId, setSelectedGateId] = useState(null);
  const gateId = selectedGateId ?? gates[0]?.gateId ?? DEFAULT_GATE_ID;
  const gate = gates.find((g) => g.gateId === gateId);
  const tags = gate?.tags ?? [];

  const [config, setConfig] = useState(null);
  useEffect(() => {
    getConfig(gateId).then(setConfig).catch(() => setConfig(null));
  }, [gateId]);

  const [soundOn, setSoundOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const alarmTags = gate?.online ? tags.filter((t) => t.state === "ALARM") : [];
  const alarming = alarmTags.length > 0;

  // 경보가 끝나면 음소거를 풀어서 다음 경보는 다시 울리게 한다
  const [prevAlarming, setPrevAlarming] = useState(alarming);
  if (alarming !== prevAlarming) {
    setPrevAlarming(alarming);
    if (!alarming) setMuted(false);
  }

  useEffect(() => {
    setAlarmSound(alarming && soundOn && !muted);
    document.title = alarming ? "🚨 경보 - CafeGuard" : "CafeGuard";
  }, [alarming, soundOn, muted]);

  useEffect(() => () => setAlarmSound(false), []);

  const enableSound = () => {
    unlockSound();
    setSoundOn(true);
  };

  const toggleArmed = async () => {
    setConfig(await saveConfig(gateId, { armed: !config.armed }));
  };

  const labels = Object.fromEntries(gates.flatMap((g) => g.tags.map((t) => [t.tagId, t.label])));

  return (
    <div className={`app ${alarming ? "alarming" : ""}`}>
      {alarming && (
        <div className="alarm-banner" role="alert">
          <strong>🚨 도난 경보</strong>
          <span>{alarmTags.map((t) => t.label || t.tagId).join(", ")} 이(가) 구역을 벗어났습니다</span>
          {soundOn && !muted && <button onClick={() => setMuted(true)}>소리 끄기</button>}
        </div>
      )}

      <header className="topbar">
        <div>
          <h1>CafeGuard</h1>
          <p>BLE 가상 펜싱 소지품 보호 대시보드</p>
        </div>
        <div className="topbar-actions">
          {gates.length > 1 && (
            <select value={gateId} onChange={(e) => setSelectedGateId(e.target.value)}>
              {gates.map((g) => (
                <option key={g.gateId} value={g.gateId}>
                  {g.gateId}
                </option>
              ))}
            </select>
          )}
          {!soundOn && <button onClick={enableSound}>🔔 경보음 켜기</button>}
          {config && (
            <button className={`arm-toggle ${config.armed ? "armed" : ""}`} onClick={toggleArmed}>
              {config.armed ? "경계 중" : "경계 해제됨"}
            </button>
          )}
        </div>
      </header>

      <section className="gate-status">
        <span className={`dot ${gate?.online ? "online" : "offline"}`} />
        {statusError ? (
          <span>서버에 연결할 수 없습니다 ({statusError.message})</span>
        ) : gate ? (
          <span>
            {gate.gateId} {gate.online ? "온라인" : `오프라인 (${Math.round(gate.lastReportAgoMs / 1000)}초 전 마지막 보고)`}
            {gate.online && ` · Wi-Fi ${gate.wifiRssi} dBm · 태그 ${tags.length}개`}
          </span>
        ) : (
          <span>게이트 보드의 보고를 기다리는 중...</span>
        )}
      </section>

      <main className="layout">
        <section className="tags">
          {tags.length === 0 ? (
            <div className="panel empty">감지된 태그가 없습니다. 태그 보드의 전원을 켜 주세요.</div>
          ) : (
            tags.map((t) => <TagCard key={t.tagId} tag={t} config={config} />)
          )}
        </section>
        <aside className="side">
          <SettingsPanel gateId={gateId} config={config} onSaved={setConfig} />
          <EventLog events={events} labels={labels} />
        </aside>
      </main>
    </div>
  );
}

export default App;
