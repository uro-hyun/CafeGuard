#!/usr/bin/env node
/**
 * 게이트보드 시뮬레이터 — ESP32 없이 서버/대시보드를 테스트한다.
 *
 * 사용법:
 *   node scripts/simulate-gate.js [--url http://localhost:5000] [--gate GATE-01] [--key change-me]
 *
 * 실행 후 키 입력:
 *   1, 2, 3 ... : 해당 번호 지급보드가 게이트를 통과(접근 → 머묾 → 멀어짐)
 *   o           : 1번 지급보드 신호 끊김/복구 토글
 *   q           : 종료
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const URL_BASE = args.url || 'http://localhost:5000';
const GATE_ID = args.gate || 'GATE-01';
const KEY = args.key || process.env.DEVICE_KEY || '';
const TAG_COUNT = Number(args.tags) || 2;
const INTERVAL = 1000;

const SEATED_RSSI = -78; // 자리에 놓인 노트북
const PASS_PROFILE = [-72, -65, -56, -48, -44, -43, -45, -52, -63, -74, -82]; // 문 앞 통과

const tags = Array.from({ length: TAG_COUNT }, (_, i) => ({
  tagId: `CG-TAG-${String(i + 1).padStart(2, '0')}`,
  profile: [],
  offline: false,
}));

const jitter = () => Math.round((Math.random() - 0.5) * 6);

let lastAlarm = null;

async function tick() {
  const readings = [];
  for (const t of tags) {
    if (t.offline) continue;
    const base = t.profile.length ? t.profile.shift() : SEATED_RSSI;
    readings.push({ tagId: t.tagId, rssi: base + jitter() });
  }

  try {
    const res = await fetch(`${URL_BASE}/api/device/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { 'X-Device-Key': KEY } : {}) },
      body: JSON.stringify({ gateId: GATE_ID, ip: '127.0.0.1', firmware: 'simulator', readings }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.log(`[${res.status}] ${body.error}`);
      return;
    }
    const line = readings.map((r) => `${r.tagId}:${r.rssi}`).join('  ');
    console.log(`${body.alarm ? '🔔 BUZZER ON ' : '             '} ${line}`);
    if (body.alarm !== lastAlarm) {
      lastAlarm = body.alarm;
      if (body.alarm) console.log('   → 서버가 알람을 지시했습니다 (대시보드에서 해제하면 꺼집니다)');
    }
  } catch (err) {
    console.log(`서버 연결 실패: ${err.message}`);
  }
}

console.log(`게이트 시뮬레이터 ${GATE_ID} → ${URL_BASE}`);
console.log(`지급보드: ${tags.map((t, i) => `[${i + 1}] ${t.tagId}`).join(', ')}`);
console.log('키: 숫자=해당 지급보드 게이트 통과, o=1번 신호 끊김 토글, q=종료\n');

const timer = setInterval(tick, INTERVAL);
tick();

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    if (key === 'q' || key === '\u0003') {
      clearInterval(timer);
      process.exit(0);
    }
    if (key === 'o') {
      tags[0].offline = !tags[0].offline;
      console.log(`   → ${tags[0].tagId} 신호 ${tags[0].offline ? '끊김' : '복구'}`);
    }
    const n = Number(key);
    if (n >= 1 && n <= tags.length) {
      tags[n - 1].profile = [...PASS_PROFILE];
      console.log(`   → ${tags[n - 1].tagId} 게이트 통과 시작`);
    }
  });
} else if (args.pass) {
  // 비대화형 실행(예: CI): --pass 1 이면 3초 뒤 1번 지급보드 통과
  setTimeout(() => {
    tags[Number(args.pass) - 1].profile = [...PASS_PROFILE];
  }, 3000);
}
