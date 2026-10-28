const test = require('node:test');
const assert = require('node:assert/strict');
const { Detector } = require('../src/services/detector');

const opts = { windowSize: 5, passThreshold: -55, passHoldMs: 1500, rearmHysteresis: 5, lostTimeoutMs: 5000 };

/** 1초 간격으로 RSSI 시퀀스를 넣고 통과 판정된 시점(인덱스)을 돌려준다 */
function run(det, seq, { start = 0, step = 1000, gate = 'G1', tag = 'T1' } = {}) {
  const passes = [];
  seq.forEach((rssi, i) => {
    if (rssi === null) return; // 신호 없음
    const r = det.ingest(gate, tag, rssi, start + i * step);
    if (r.passed) passes.push(i);
  });
  return passes;
}

test('자리에 앉아 있는 태그(약한 신호)는 통과로 판정하지 않는다', () => {
  const det = new Detector(opts);
  assert.deepEqual(run(det, Array(20).fill(-75)), []);
});

test('게이트에 접근해 일정 시간 머물면 한 번만 통과로 판정한다', () => {
  const det = new Detector(opts);
  const seq = [-75, -72, -65, -55, -48, -45, -44, -45, -46, -50, -62, -75, -80];
  const passes = run(det, seq);
  assert.equal(passes.length, 1);
});

test('순간적인 RSSI 튐 1회는 이동 평균으로 걸러진다', () => {
  const det = new Detector(opts);
  const seq = [-75, -75, -75, -40, -75, -75, -75, -75];
  assert.deepEqual(run(det, seq), []);
});

test('근접 상태가 passHoldMs보다 짧으면 통과로 판정하지 않는다', () => {
  const det = new Detector({ ...opts, passHoldMs: 3000 });
  // 평균이 임계값 위로 올라가는 구간이 2초 남짓
  const seq = [-75, -70, -40, -40, -40, -75, -80, -80, -80];
  assert.deepEqual(run(det, seq), []);
});

test('통과 후 멀어졌다가 다시 접근하면 다시 판정한다 (latch 해제)', () => {
  const det = new Detector(opts);
  const approach = [-60, -50, -45, -45, -45, -45, -45];
  const leave = [-70, -80, -85, -85, -85, -85];
  const passes = run(det, [...approach, ...leave, ...approach]);
  assert.equal(passes.length, 2);
});

test('게이트 앞에 계속 머물러도 반복 판정하지 않는다', () => {
  const det = new Detector(opts);
  assert.equal(run(det, Array(30).fill(-45)).length, 1);
});

test('신호가 lostTimeoutMs 이상 끊기면 sweep으로 정리된다', () => {
  const det = new Detector(opts);
  det.ingest('G1', 'T1', -60, 0);
  assert.deepEqual(det.sweep(4000), []);
  assert.deepEqual(det.sweep(6000), [{ gateId: 'G1', tagId: 'T1' }]);
  assert.equal(det.get('G1', 'T1'), null);
});

test('설정 변경(임계값)이 즉시 반영된다', () => {
  const det = new Detector(opts);
  assert.equal(run(det, Array(6).fill(-60)).length, 0);
  det.updateSettings({ passThreshold: -65 });
  assert.equal(run(det, Array(6).fill(-60), { start: 6000 }).length, 1);
});
