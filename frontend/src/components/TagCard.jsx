import { useState } from "react";
import { saveTagLabel } from "../api";

const STATE_TEXT = { NORMAL: "정상", WARNING: "주의", ALARM: "경보" };
const RSSI_MIN = -100;
const RSSI_MAX = -30;

// RSSI(dBm)를 막대 위치(%)로 변환
const toPercent = (rssi) =>
  Math.max(0, Math.min(100, ((rssi - RSSI_MIN) / (RSSI_MAX - RSSI_MIN)) * 100));

export default function TagCard({ tag, config }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);
  const lost = tag.lastSeenAgoMs >= (config?.warnLostMs ?? 3000);

  const submitLabel = async (e) => {
    e.preventDefault();
    await saveTagLabel(tag.tagId, label);
    setEditing(false);
  };

  return (
    <article className={`tag-card state-${tag.state.toLowerCase()}`}>
      <header>
        <div>
          {editing ? (
            <form onSubmit={submitLabel} className="label-form">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 3번 테이블 노트북"
                maxLength={40}
              />
              <button type="submit">저장</button>
            </form>
          ) : (
            <h3
              onClick={() => {
                setLabel(tag.label);
                setEditing(true);
              }}
              title="클릭해서 이름 변경"
            >
              {tag.label || "이름 없음"} <span className="edit-hint">✎</span>
            </h3>
          )}
          <p className="tag-id">{tag.tagId}</p>
        </div>
        <span className="state-badge">{STATE_TEXT[tag.state] ?? tag.state}</span>
      </header>

      <div className="rssi-bar" aria-label={`신호 세기 ${tag.rssi} dBm`}>
        <div className="rssi-fill" style={{ width: `${lost ? 0 : toPercent(tag.rssi)}%` }} />
        {config && (
          <>
            <div className="rssi-mark alarm" style={{ left: `${toPercent(config.alarmRssi)}%` }} />
            <div className="rssi-mark warn" style={{ left: `${toPercent(config.warnRssi)}%` }} />
          </>
        )}
      </div>

      <dl className="tag-stats">
        <div>
          <dt>필터 RSSI</dt>
          <dd>{lost ? "—" : `${tag.rssi} dBm`}</dd>
        </div>
        <div>
          <dt>원시 RSSI</dt>
          <dd>{lost ? "—" : `${tag.rawRssi} dBm`}</dd>
        </div>
        <div>
          <dt>마지막 수신</dt>
          <dd>{(tag.lastSeenAgoMs / 1000).toFixed(1)}초 전</dd>
        </div>
      </dl>
    </article>
  );
}
