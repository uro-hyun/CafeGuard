/**
 * 게이트 통과 감지기 (순수 로직, DB/네트워크 의존 없음 → 단위 테스트 대상)
 *
 * 게이트 1대 기준 판정 방식
 *  - (gateId, tagId) 쌍마다 최근 RSSI windowSize개로 이동 평균을 계산
 *  - 이동 평균이 passThreshold 이상(= 게이트에 가까움)인 상태가 passHoldMs 이상 지속되면 "통과"
 *  - 한 번 통과로 판정되면 latch 상태가 되어, 이동 평균이
 *    (passThreshold - rearmHysteresis) 아래로 내려가거나 신호가 끊길 때까지 재판정하지 않음
 *    → 게이트 앞에 머무는 동안 같은 통과가 반복 감지되는 것을 방지
 */

const DEFAULTS = {
  windowSize: 5,
  passThreshold: -55,
  passHoldMs: 1500,
  rearmHysteresis: 5,
  lostTimeoutMs: 5000,
};

class Detector {
  constructor(settings = {}) {
    this.settings = { ...DEFAULTS, ...settings };
    /** @type {Map<string, {samples:number[], avg:number|null, nearSince:number|null, latched:boolean, lastSeenAt:number}>} */
    this.states = new Map();
  }

  updateSettings(settings) {
    const prevWindow = this.settings.windowSize;
    this.settings = { ...this.settings, ...settings };
    if (this.settings.windowSize !== prevWindow) {
      for (const st of this.states.values()) {
        st.samples = st.samples.slice(-this.settings.windowSize);
        st.avg = average(st.samples);
      }
    }
  }

  static key(gateId, tagId) {
    return `${gateId}|${tagId}`;
  }

  /**
   * RSSI 샘플 1개를 반영한다.
   * @returns {{avg:number, near:boolean, passed:boolean}}
   */
  ingest(gateId, tagId, rssi, now = Date.now()) {
    const { windowSize, passThreshold, passHoldMs, rearmHysteresis, lostTimeoutMs } = this.settings;
    const k = Detector.key(gateId, tagId);
    let st = this.states.get(k);

    // 신호가 오래 끊겼다가 다시 잡히면 이전 샘플은 버린다 (다른 상황의 값이 섞이지 않도록)
    if (st && now - st.lastSeenAt > lostTimeoutMs) {
      this.states.delete(k);
      st = undefined;
    }
    if (!st) {
      st = { samples: [], avg: null, nearSince: null, latched: false, lastSeenAt: now };
      this.states.set(k, st);
    }

    st.samples.push(rssi);
    if (st.samples.length > windowSize) st.samples.shift();
    st.avg = average(st.samples);
    st.lastSeenAt = now;

    // 샘플이 충분히 모이기 전에는 판정하지 않음 (순간 튐 방지)
    const ready = st.samples.length >= Math.min(windowSize, 3);
    const near = ready && st.avg >= passThreshold;
    let passed = false;

    if (st.latched) {
      if (st.avg < passThreshold - rearmHysteresis) {
        st.latched = false;
        st.nearSince = null;
      }
    } else if (near) {
      if (st.nearSince === null) st.nearSince = now;
      if (now - st.nearSince >= passHoldMs) {
        passed = true;
        st.latched = true;
      }
    } else {
      st.nearSince = null;
    }

    return { avg: round1(st.avg), near, passed };
  }

  /** 신호가 끊긴 쌍을 정리하고, 끊긴 키 목록을 돌려준다. */
  sweep(now = Date.now()) {
    const lost = [];
    for (const [k, st] of this.states) {
      if (now - st.lastSeenAt > this.settings.lostTimeoutMs) {
        this.states.delete(k);
        const [gateId, tagId] = k.split('|');
        lost.push({ gateId, tagId });
      }
    }
    return lost;
  }

  forgetTag(tagId) {
    for (const k of this.states.keys()) {
      if (k.endsWith(`|${tagId}`)) this.states.delete(k);
    }
  }

  get(gateId, tagId) {
    return this.states.get(Detector.key(gateId, tagId)) || null;
  }
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round1(n) {
  return n === null ? null : Math.round(n * 10) / 10;
}

module.exports = { Detector, DEFAULTS };
