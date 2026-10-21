import { useState } from "react";
import { saveConfig } from "../api";

const FIELDS = [
  { key: "warnRssi", label: "주의 임계값", unit: "dBm", min: -100, max: -30, step: 1,
    help: "필터 RSSI가 이보다 약하면 주의" },
  { key: "alarmRssi", label: "경보 임계값", unit: "dBm", min: -100, max: -30, step: 1,
    help: "이보다 약한 상태가 유지되면 경보" },
  { key: "windowSize", label: "이동 평균 샘플 수", unit: "개", min: 1, max: 20, step: 1,
    help: "클수록 안정적이지만 반응이 느려짐" },
  { key: "alarmHoldMs", label: "경보 확정 시간", unit: "ms", min: 0, max: 10000, step: 500,
    help: "약한 신호가 이만큼 지속돼야 경보" },
  { key: "warnLostMs", label: "신호 유실 → 주의", unit: "ms", min: 500, max: 30000, step: 500 },
  { key: "alarmLostMs", label: "신호 유실 → 경보", unit: "ms", min: 1000, max: 60000, step: 500 },
];

// 가상 펜스 감도 조절. 저장하면 게이트가 5초 안에 가져가 적용한다.
export default function SettingsPanel({ gateId, config, onSaved }) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState(null);

  // 서버 설정이 바뀌면(게이트 전환, 저장, 경계 토글) 편집 중인 값을 새 값으로 맞춘다
  const [prevConfig, setPrevConfig] = useState(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    setDraft(config);
  }

  if (!draft) return null;

  const dirty = FIELDS.some((f) => draft[f.key] !== config[f.key]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const values = Object.fromEntries(FIELDS.map((f) => [f.key, draft[f.key]]));
      onSaved(await saveConfig(gateId, values));
      setMessage({ ok: true, text: "저장했습니다. 게이트에 곧 반영됩니다." });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  return (
    <form className="panel settings" onSubmit={submit}>
      <h2>가상 펜스 감도</h2>
      {FIELDS.map((f) => (
        <label key={f.key} className="slider-row">
          <span className="slider-label">
            {f.label}
            <strong>
              {draft[f.key]} {f.unit}
            </strong>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={draft[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
          />
          {f.help && <small>{f.help}</small>}
        </label>
      ))}
      <div className="settings-actions">
        <button type="button" disabled={!dirty} onClick={() => setDraft(config)}>
          되돌리기
        </button>
        <button type="submit" className="primary" disabled={!dirty}>
          저장
        </button>
      </div>
      {message && <p className={message.ok ? "msg-ok" : "msg-error"}>{message.text}</p>}
    </form>
  );
}
