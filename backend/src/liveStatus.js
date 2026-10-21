// 게이트가 매초 보내는 실시간 상태. 계속 덮어쓰는 값이라 DB가 아닌 메모리에 둔다.
const OFFLINE_AFTER_MS = 5000;

const gates = new Map();

function updateGate(report) {
  gates.set(report.gateId, { ...report, receivedAt: Date.now() });
}

function listGates() {
  const now = Date.now();
  return [...gates.values()].map((g) => ({
    ...g,
    online: now - g.receivedAt < OFFLINE_AFTER_MS,
    lastReportAgoMs: now - g.receivedAt,
  }));
}

module.exports = { updateGate, listGates };
