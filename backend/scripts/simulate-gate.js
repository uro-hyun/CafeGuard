// 하드웨어 없이 대시보드를 시험하기 위한 가짜 게이트 보드.
// 태그 2개를 흉내 낸다: CG-TAG-SIM1은 계속 가까이, CG-TAG-SIM2는 40초 주기로 멀어졌다 돌아온다.
// 사용법: node scripts/simulate-gate.js [서버주소]   (기본 http://localhost:5000)
const SERVER = process.argv[2] ?? "http://localhost:5000";
const GATE_ID = "gate-01";

let config = { armed: true, warnRssi: -65, alarmRssi: -75, alarmHoldMs: 2000 };
const tags = [
  { tagId: "CG-TAG-SIM1", mac: "aa:bb:cc:00:00:01", state: "NORMAL", weakSince: 0, rssi: -55, raw: -55 },
  { tagId: "CG-TAG-SIM2", mac: "aa:bb:cc:00:00:02", state: "NORMAL", weakSince: 0, rssi: -55, raw: -55 },
];
const start = Date.now();

async function post(path, body) {
  const res = await fetch(SERVER + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`POST ${path} → ${res.status}`);
}

function nextState(tag, now) {
  if (tag.rssi < config.alarmRssi) {
    tag.weakSince ||= now;
    if (now - tag.weakSince >= config.alarmHoldMs) return config.armed ? "ALARM" : "WARNING";
    return "WARNING";
  }
  tag.weakSince = 0;
  return tag.rssi < config.warnRssi ? "WARNING" : "NORMAL";
}

async function tick() {
  const now = Date.now();
  const t = (now - start) / 1000;
  const targets = [-52, -60 - 28 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 40))];

  for (const [i, tag] of tags.entries()) {
    tag.raw = Math.round(targets[i] + (Math.random() - 0.5) * 12); // 노이즈 섞인 원시값
    tag.rssi = Math.round((tag.rssi * 0.7 + tag.raw * 0.3) * 10) / 10; // 간단한 평활화
    const next = nextState(tag, now);
    if (next !== tag.state) {
      const reason = next === "NORMAL" ? "RECOVERED" : "RSSI_LOW";
      console.log(`${tag.tagId}: ${tag.state} → ${next} (${tag.rssi} dBm)`);
      await post("/api/alert", { gateId: GATE_ID, tagId: tag.tagId, from: tag.state, to: next, reason, rssi: tag.rssi });
      tag.state = next;
    }
  }

  await post("/api/status", {
    gateId: GATE_ID,
    armed: config.armed,
    uptimeMs: now - start,
    wifiRssi: -48,
    tags: tags.map((tag) => ({
      tagId: tag.tagId,
      mac: tag.mac,
      rawRssi: tag.raw,
      rssi: tag.rssi,
      lastSeenAgoMs: 80,
      state: tag.state,
    })),
  });
}

async function refreshConfig() {
  try {
    config = await (await fetch(`${SERVER}/api/config/${GATE_ID}`)).json();
  } catch {
    // 서버가 아직 안 떠 있으면 다음에 다시 시도
  }
}

console.log(`가짜 게이트 시작 → ${SERVER}`);
refreshConfig();
setInterval(refreshConfig, 5000);
setInterval(() => tick().catch((err) => console.error(err.message)), 1000);
