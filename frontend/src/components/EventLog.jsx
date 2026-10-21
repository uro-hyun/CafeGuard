const STATE_TEXT = { NORMAL: "정상", WARNING: "주의", ALARM: "경보" };
const REASON_TEXT = { RSSI_LOW: "신호 약함", SIGNAL_LOST: "신호 끊김", RECOVERED: "복귀" };

export default function EventLog({ events, labels }) {
  return (
    <section className="panel events">
      <h2>이벤트 기록</h2>
      {!events?.length ? (
        <p className="empty">아직 기록이 없습니다.</p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e._id} className={`event state-${e.to.toLowerCase()}`}>
              <time>{new Date(e.createdAt).toLocaleTimeString("ko-KR")}</time>
              <span className="event-tag">{labels[e.tagId] || e.tagId}</span>
              <span className="event-change">
                {STATE_TEXT[e.from]} → <strong>{STATE_TEXT[e.to]}</strong>
              </span>
              <span className="event-reason">
                {REASON_TEXT[e.reason] ?? e.reason}
                {e.rssi != null && ` · ${e.rssi} dBm`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
