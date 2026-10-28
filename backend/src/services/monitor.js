const { EventEmitter } = require('events');
const { Detector } = require('./detector');
const { Tag, Gate, Alarm, Event, RssiLog, Settings } = require('../models');

const TAG_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DB_TOUCH_INTERVAL_MS = 10_000; // lastSeenAt DB 반영 주기 (매 보고마다 쓰지 않도록)
const UNKNOWN_TTL_MS = 30_000;
const RECENT_EVENTS = 50;

/** 설정 키별 허용 범위 */
const SETTING_RULES = {
  passThreshold: { type: 'number', min: -100, max: -20 },
  passHoldMs: { type: 'number', min: 0, max: 30_000 },
  windowSize: { type: 'number', min: 1, max: 30, integer: true },
  rearmHysteresis: { type: 'number', min: 0, max: 30 },
  lostTimeoutMs: { type: 'number', min: 1000, max: 120_000 },
  gateOfflineMs: { type: 'number', min: 2000, max: 300_000 },
  logRssi: { type: 'boolean' },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * 관제 런타임 상태를 관리한다.
 * - 영속 데이터(태그, 게이트, 알람, 이력, 설정)는 MongoDB
 * - 실시간 상태(연결 여부, RSSI, 이동 평균)는 메모리
 * 변경 시 'state' 이벤트(스냅샷), 알람 발생 시 'alarm' 이벤트를 발생시킨다.
 */
class Monitor extends EventEmitter {
  constructor({ tagPrefix = 'CG-' } = {}) {
    super();
    this.tagPrefix = tagPrefix;
    this.settings = null;
    this.detector = null;
    this.tags = new Map(); // tagId -> { ...doc, live }
    this.gates = new Map(); // gateId -> { gateId, name, ip, firmware, lastSeenAt, online, testUntil, dbTouchedAt }
    this.unknown = new Map(); // 미등록 태그 감지 목록
    this.alarms = new Map(); // 활성 알람: id -> alarm
    this.alarmPending = new Set();
    this.events = [];
    this.emitTimer = null;
  }

  async init() {
    const s = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { key: 'global' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    this.settings = pickSettings(s);
    this.detector = new Detector(this.settings);

    for (const t of await Tag.find().lean()) this.tags.set(t.tagId, toTag(t));
    for (const g of await Gate.find().lean()) {
      this.gates.set(g.gateId, {
        gateId: g.gateId,
        name: g.name,
        ip: g.ip,
        firmware: g.firmware,
        lastSeenAt: g.lastSeenAt ? g.lastSeenAt.getTime() : null,
        online: false,
        testUntil: 0,
        dbTouchedAt: 0,
      });
    }
    for (const a of await Alarm.find({ status: 'active' }).lean()) this.alarms.set(String(a._id), toAlarm(a));
    const recent = await Event.find().sort({ createdAt: -1 }).limit(RECENT_EVENTS).lean();
    this.events = recent.map(toEvent);
  }

  start(intervalMs = 1000) {
    this.tickTimer = setInterval(() => this.tick(), intervalMs);
    this.tickTimer.unref?.();
  }

  stop() {
    clearInterval(this.tickTimer);
    clearTimeout(this.emitTimer);
  }

  // ───────────────────────── 게이트 보고 처리 ─────────────────────────

  /**
   * 게이트보드의 주기 보고를 처리하고, 게이트에 돌려줄 응답(알람 여부, 판정 설정)을 반환한다.
   * @param {{gateId:string, ip?:string, firmware?:string, readings?:{tagId:string, rssi:number}[]}} body
   */
  async handleReport(body, now = Date.now()) {
    const gateId = typeof body?.gateId === 'string' ? body.gateId.trim() : '';
    if (!TAG_ID_RE.test(gateId)) throw new HttpError(400, 'gateId가 올바르지 않습니다');
    const readings = Array.isArray(body.readings) ? body.readings.slice(0, 100) : [];

    await this.touchGate(gateId, body, now);

    const logs = [];
    for (const r of readings) {
      const tagId = typeof r?.tagId === 'string' ? r.tagId.trim() : '';
      const rssi = Number(r?.rssi);
      if (!TAG_ID_RE.test(tagId) || !Number.isFinite(rssi) || rssi < -127 || rssi > 20) continue;

      const tag = this.tags.get(tagId);
      if (!tag) {
        if (tagId.startsWith(this.tagPrefix)) {
          const prev = this.unknown.get(tagId);
          if (!prev) this.addEvent('unknown_tag', { tagId, gateId, message: `미등록 지급보드 감지: ${tagId}` });
          this.unknown.set(tagId, { tagId, gateId, rssi, lastSeenAt: now });
        }
        continue;
      }

      const { avg, near, passed } = this.detector.ingest(gateId, tagId, rssi, now);
      const wasConnected = tag.live.connected;
      tag.live = { gateId, rssi, avg, near, lastSeenAt: now, connected: true };
      if (!wasConnected) {
        this.addEvent('tag_connected', { tagId, gateId, message: `${label(tag)} 연결됨 (${gateId})` });
      }
      if (now - (tag.dbTouchedAt || 0) > DB_TOUCH_INTERVAL_MS) {
        tag.dbTouchedAt = now;
        Tag.updateOne({ tagId }, { lastSeenAt: new Date(now), lastGateId: gateId, lastRssi: rssi }).catch(logErr);
      }
      if (passed) await this.onPass(tag, gateId, avg);
      if (this.settings.logRssi) logs.push({ gateId, tagId, rssi, avg, createdAt: new Date(now) });
    }

    // 게이트가 서버와 끊겨 있던 동안 자체 판정한 통과 기록
    const offlinePasses = Array.isArray(body.offlinePasses) ? body.offlinePasses.slice(0, 20) : [];
    for (const tagId of new Set(offlinePasses)) {
      const tag = typeof tagId === 'string' ? this.tags.get(tagId) : null;
      if (tag) await this.onPass(tag, gateId, null, { offline: true });
    }

    if (logs.length) RssiLog.insertMany(logs, { ordered: false }).catch(logErr);
    this.scheduleEmit();
    return this.gateResponse(gateId, now);
  }

  async touchGate(gateId, body, now) {
    let gate = this.gates.get(gateId);
    const ip = typeof body.ip === 'string' ? body.ip.slice(0, 64) : null;
    const firmware = typeof body.firmware === 'string' ? body.firmware.slice(0, 32) : null;

    if (!gate) {
      await Gate.updateOne(
        { gateId },
        { $set: { ip, firmware, lastSeenAt: new Date(now) }, $setOnInsert: { name: gateId } },
        { upsert: true },
      );
      gate = { gateId, name: gateId, ip, firmware, lastSeenAt: now, online: true, testUntil: 0, dbTouchedAt: now };
      this.gates.set(gateId, gate);
      this.addEvent('gate_online', { gateId, message: `새 게이트 등록 및 연결: ${gateId}` });
      return;
    }

    if (!gate.online) this.addEvent('gate_online', { gateId, message: `게이트 연결됨: ${gate.name}` });
    gate.online = true;
    gate.lastSeenAt = now;
    const changed = (ip && ip !== gate.ip) || (firmware && firmware !== gate.firmware);
    if (ip) gate.ip = ip;
    if (firmware) gate.firmware = firmware;
    if (changed || now - gate.dbTouchedAt > DB_TOUCH_INTERVAL_MS) {
      gate.dbTouchedAt = now;
      Gate.updateOne({ gateId }, { ip: gate.ip, firmware: gate.firmware, lastSeenAt: new Date(now) }).catch(logErr);
    }
  }

  async onPass(tag, gateId, avg, { offline = false } = {}) {
    if (!tag.armed) {
      this.addEvent('pass_ignored', {
        tagId: tag.tagId,
        gateId,
        message: `${label(tag)} 게이트 통과 (감시 해제 상태라 알람 없음)`,
        data: { avg },
      });
      return;
    }
    const tagId = tag.tagId;
    const already = [...this.alarms.values()].some((a) => a.tagId === tagId);
    if (already || this.alarmPending.has(tagId)) return;

    this.alarmPending.add(tagId);
    try {
      const doc = await Alarm.create({ tagId, gateId, rssiAvg: avg, triggeredAt: new Date() });
      const alarm = toAlarm(doc.toObject());
      this.alarms.set(alarm.id, alarm);
      this.addEvent('pass_detected', {
        tagId,
        gateId,
        message: `🚨 ${label(tag)} 게이트 통과 감지${tag.holder ? ` (지급: ${tag.holder})` : ''}${
          offline ? ' [게이트 오프라인 중 감지]' : ''
        }`,
        data: { avg, alarmId: alarm.id, offline },
      });
      this.emit('alarm', { ...alarm, tag: publicTag(tag, this.settings) });
    } finally {
      this.alarmPending.delete(tagId);
    }
  }

  gateResponse(gateId, now = Date.now()) {
    const gate = this.gates.get(gateId);
    const alarm =
      [...this.alarms.values()].some((a) => a.gateId === gateId) || (gate && gate.testUntil > now);
    const { passThreshold, passHoldMs, windowSize, rearmHysteresis } = this.settings;
    return {
      ok: true,
      alarm,
      serverTime: now,
      // 서버 연결이 끊겼을 때 게이트가 자체 판정에 쓸 설정
      config: { passThreshold, passHoldMs, windowSize, rearmHysteresis },
      armedTags: [...this.tags.values()].filter((t) => t.armed).map((t) => t.tagId),
    };
  }

  // ───────────────────────── 주기 점검 ─────────────────────────

  tick(now = Date.now()) {
    let changed = false;

    for (const gate of this.gates.values()) {
      if (gate.online && gate.lastSeenAt && now - gate.lastSeenAt > this.settings.gateOfflineMs) {
        gate.online = false;
        changed = true;
        this.addEvent('gate_offline', { gateId: gate.gateId, message: `게이트 응답 없음: ${gate.name}` });
      }
      if (gate.testUntil && gate.testUntil <= now) {
        gate.testUntil = 0;
        changed = true;
      }
    }

    this.detector.sweep(now);
    for (const tag of this.tags.values()) {
      if (tag.live.connected && now - tag.live.lastSeenAt > this.settings.lostTimeoutMs) {
        tag.live = { ...tag.live, connected: false, near: false };
        changed = true;
        this.addEvent('tag_lost', { tagId: tag.tagId, gateId: tag.live.gateId, message: `${label(tag)} 신호 끊김` });
      }
    }

    for (const [id, u] of this.unknown) {
      if (now - u.lastSeenAt > UNKNOWN_TTL_MS) {
        this.unknown.delete(id);
        changed = true;
      }
    }

    if (changed) this.scheduleEmit();
  }

  // ───────────────────────── 관리 기능 ─────────────────────────

  async createTag(body) {
    const tagId = typeof body?.tagId === 'string' ? body.tagId.trim() : '';
    if (!TAG_ID_RE.test(tagId)) throw new HttpError(400, 'tagId는 영문/숫자/-/_ 1~32자여야 합니다');
    if (this.tags.has(tagId)) throw new HttpError(409, '이미 등록된 지급보드입니다');

    const doc = await Tag.create({
      tagId,
      name: str(body.name),
      holder: str(body.holder),
      armed: body.armed === undefined ? true : Boolean(body.armed),
      issuedAt: str(body.holder) ? new Date() : null,
    });
    const tag = toTag(doc.toObject());
    const unk = this.unknown.get(tagId);
    if (unk) {
      tag.live = { ...tag.live, gateId: unk.gateId, rssi: unk.rssi, lastSeenAt: unk.lastSeenAt, connected: true };
      this.unknown.delete(tagId);
    }
    this.tags.set(tagId, tag);
    this.addEvent('tag_registered', { tagId, message: `지급보드 등록: ${label(tag)}` });
    this.scheduleEmit();
    return publicTag(tag, this.settings);
  }

  async updateTag(tagId, body) {
    const tag = this.tags.get(tagId);
    if (!tag) throw new HttpError(404, '등록되지 않은 지급보드입니다');

    const patch = {};
    if (body.name !== undefined) patch.name = str(body.name);
    if (body.holder !== undefined) {
      patch.holder = str(body.holder);
      patch.issuedAt = patch.holder ? (tag.holder === patch.holder ? tag.issuedAt : new Date()) : null;
    }
    if (body.armed !== undefined) patch.armed = Boolean(body.armed);
    if (!Object.keys(patch).length) return publicTag(tag, this.settings);

    await Tag.updateOne({ tagId }, patch);
    Object.assign(tag, patch);
    if (patch.armed !== undefined) {
      this.addEvent(patch.armed ? 'tag_armed' : 'tag_disarmed', {
        tagId,
        message: `${label(tag)} 감시 ${patch.armed ? '시작' : '해제'}`,
      });
    }
    this.scheduleEmit();
    return publicTag(tag, this.settings);
  }

  async deleteTag(tagId) {
    const tag = this.tags.get(tagId);
    if (!tag) throw new HttpError(404, '등록되지 않은 지급보드입니다');
    await Tag.deleteOne({ tagId });
    for (const a of [...this.alarms.values()]) if (a.tagId === tagId) await this.ackAlarm(a.id);
    this.tags.delete(tagId);
    this.detector.forgetTag(tagId);
    this.addEvent('tag_deleted', { tagId, message: `지급보드 삭제: ${label(tag)}` });
    this.scheduleEmit();
  }

  async updateGate(gateId, body) {
    const gate = this.gates.get(gateId);
    if (!gate) throw new HttpError(404, '등록되지 않은 게이트입니다');
    if (body.name !== undefined) {
      gate.name = str(body.name) || gateId;
      await Gate.updateOne({ gateId }, { name: gate.name });
    }
    this.scheduleEmit();
    return publicGate(gate);
  }

  async deleteGate(gateId) {
    if (!this.gates.has(gateId)) throw new HttpError(404, '등록되지 않은 게이트입니다');
    await Gate.deleteOne({ gateId });
    this.gates.delete(gateId);
    this.scheduleEmit();
  }

  /** 게이트 부저 테스트: 다음 보고 응답부터 seconds 동안 alarm=true */
  testGateAlarm(gateId, seconds = 3) {
    const gate = this.gates.get(gateId);
    if (!gate) throw new HttpError(404, '등록되지 않은 게이트입니다');
    gate.testUntil = Date.now() + Math.min(Math.max(Number(seconds) || 3, 1), 10) * 1000;
    this.addEvent('gate_test', { gateId, message: `게이트 부저 테스트: ${gate.name}` });
    this.scheduleEmit();
  }

  async ackAlarm(id) {
    const alarm = this.alarms.get(id);
    if (!alarm) throw new HttpError(404, '활성 알람이 아닙니다');
    await Alarm.updateOne({ _id: id }, { status: 'acked', ackedAt: new Date() });
    this.alarms.delete(id);
    const tag = this.tags.get(alarm.tagId);
    this.addEvent('alarm_acked', {
      tagId: alarm.tagId,
      gateId: alarm.gateId,
      message: `알람 해제: ${tag ? label(tag) : alarm.tagId}`,
    });
    this.scheduleEmit();
  }

  async ackAll() {
    for (const id of [...this.alarms.keys()]) await this.ackAlarm(id);
  }

  async updateSettings(body) {
    const patch = {};
    for (const [k, rule] of Object.entries(SETTING_RULES)) {
      if (body?.[k] === undefined) continue;
      const v = body[k];
      if (rule.type === 'boolean') {
        if (typeof v !== 'boolean') throw new HttpError(400, `${k}는 boolean이어야 합니다`);
        patch[k] = v;
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < rule.min || n > rule.max || (rule.integer && !Number.isInteger(n))) {
        throw new HttpError(400, `${k}는 ${rule.min}~${rule.max} 범위여야 합니다`);
      }
      patch[k] = n;
    }
    if (!Object.keys(patch).length) return this.settings;

    const s = await Settings.findOneAndUpdate({ key: 'global' }, patch, { new: true }).lean();
    this.settings = pickSettings(s);
    this.detector.updateSettings(this.settings);
    this.addEvent('settings_changed', { message: '판정 설정 변경', data: patch });
    this.scheduleEmit();
    return this.settings;
  }

  // ───────────────────────── 스냅샷 / 이벤트 ─────────────────────────

  snapshot(now = Date.now()) {
    return {
      serverTime: now,
      settings: this.settings,
      gates: [...this.gates.values()].map(publicGate),
      tags: [...this.tags.values()]
        .map((t) => ({ ...publicTag(t, this.settings), alarmActive: [...this.alarms.values()].some((a) => a.tagId === t.tagId) }))
        .sort((a, b) => a.tagId.localeCompare(b.tagId)),
      alarms: [...this.alarms.values()].sort((a, b) => b.triggeredAt - a.triggeredAt),
      unknownTags: [...this.unknown.values()],
      events: this.events,
    };
  }

  addEvent(type, { tagId = null, gateId = null, message = '', data = null } = {}) {
    const ev = { id: null, type, tagId, gateId, message, data, createdAt: Date.now() };
    this.events = [ev, ...this.events].slice(0, RECENT_EVENTS);
    Event.create({ type, tagId, gateId, message, data, createdAt: new Date(ev.createdAt) })
      .then((doc) => {
        ev.id = String(doc._id);
      })
      .catch(logErr);
    this.scheduleEmit();
  }

  scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit('state', this.snapshot());
    }, 200);
  }
}

// ───────────────────────── helpers ─────────────────────────

function pickSettings(s) {
  const out = {};
  for (const k of Object.keys(SETTING_RULES)) out[k] = s[k];
  return out;
}

function toTag(doc) {
  return {
    tagId: doc.tagId,
    name: doc.name || '',
    holder: doc.holder || '',
    armed: doc.armed !== false,
    issuedAt: doc.issuedAt ? new Date(doc.issuedAt).getTime() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : null,
    dbTouchedAt: 0,
    live: {
      gateId: doc.lastGateId || null,
      rssi: doc.lastRssi ?? null,
      avg: null,
      near: false,
      lastSeenAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).getTime() : null,
      connected: false,
    },
  };
}

function publicTag(t) {
  return {
    tagId: t.tagId,
    name: t.name,
    holder: t.holder,
    armed: t.armed,
    issuedAt: t.issuedAt,
    connected: t.live.connected,
    gateId: t.live.gateId,
    rssi: t.live.rssi,
    avg: t.live.avg,
    near: t.live.near,
    lastSeenAt: t.live.lastSeenAt,
  };
}

function publicGate(g) {
  return {
    gateId: g.gateId,
    name: g.name,
    ip: g.ip,
    firmware: g.firmware,
    online: g.online,
    lastSeenAt: g.lastSeenAt,
    testing: g.testUntil > Date.now(),
  };
}

function toAlarm(a) {
  return {
    id: String(a._id),
    tagId: a.tagId,
    gateId: a.gateId,
    rssiAvg: a.rssiAvg,
    status: a.status,
    triggeredAt: new Date(a.triggeredAt).getTime(),
  };
}

function toEvent(e) {
  return {
    id: String(e._id),
    type: e.type,
    tagId: e.tagId,
    gateId: e.gateId,
    message: e.message,
    data: e.data,
    createdAt: new Date(e.createdAt).getTime(),
  };
}

function label(tag) {
  return tag.name ? `${tag.name}(${tag.tagId})` : tag.tagId;
}

function str(v) {
  return typeof v === 'string' ? v.trim().slice(0, 64) : '';
}

function logErr(err) {
  console.error('[monitor]', err.message);
}

module.exports = { Monitor, HttpError };
