const mongoose = require('mongoose');

const { Schema } = mongoose;

/** 지급보드(노트북 부착 ESP32-C3 태그) */
const tagSchema = new Schema(
  {
    tagId: { type: String, required: true, unique: true, trim: true }, // BLE 광고 이름 (예: CG-TAG-01)
    name: { type: String, default: '', trim: true }, // 장비명 (예: 노트북 A)
    holder: { type: String, default: '', trim: true }, // 지급 대상자
    armed: { type: Boolean, default: true }, // 감시 여부. false면 게이트를 통과해도 알람 없음
    issuedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastGateId: { type: String, default: null },
    lastRssi: { type: Number, default: null },
  },
  { timestamps: true },
);

/** 게이트보드(출입구 ESP32 NodeMCU-32S 수신기) */
const gateSchema = new Schema(
  {
    gateId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '', trim: true },
    ip: { type: String, default: null },
    firmware: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** 게이트 통과 알람 */
const alarmSchema = new Schema(
  {
    tagId: { type: String, required: true, index: true },
    gateId: { type: String, required: true, index: true },
    rssiAvg: { type: Number, default: null },
    status: { type: String, enum: ['active', 'acked'], default: 'active', index: true },
    triggeredAt: { type: Date, default: Date.now },
    ackedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** 상태 변화 이력 (게이트 온라인/오프라인, 태그 연결/끊김, 통과, 알람 해제 등) */
const eventSchema = new Schema({
  type: { type: String, required: true, index: true },
  tagId: { type: String, default: null, index: true },
  gateId: { type: String, default: null },
  message: { type: String, default: '' },
  data: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

/** RSSI 측정 기록 — 양이 많으므로 TTL 인덱스로 일정 기간 후 자동 삭제 */
const rssiLogSchema = new Schema({
  gateId: { type: String, required: true },
  tagId: { type: String, required: true },
  rssi: { type: Number, required: true },
  avg: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});
rssiLogSchema.index({ tagId: 1, createdAt: -1 });
rssiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // 24시간 보관

/** 판정 설정 (단일 문서) */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    passThreshold: { type: Number, default: -55 }, // dBm, 이 값 이상이면 게이트 근접
    passHoldMs: { type: Number, default: 1500 }, // 근접 유지 시간 → 통과 판정
    windowSize: { type: Number, default: 5 }, // 이동 평균 샘플 수
    rearmHysteresis: { type: Number, default: 5 }, // dB, 재판정 허용 여유
    lostTimeoutMs: { type: Number, default: 5000 }, // 이 시간 동안 신호 없으면 연결 끊김
    gateOfflineMs: { type: Number, default: 10000 }, // 이 시간 동안 보고 없으면 게이트 오프라인
    logRssi: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = {
  Tag: mongoose.model('Tag', tagSchema),
  Gate: mongoose.model('Gate', gateSchema),
  Alarm: mongoose.model('Alarm', alarmSchema),
  Event: mongoose.model('Event', eventSchema),
  RssiLog: mongoose.model('RssiLog', rssiLogSchema),
  Settings: mongoose.model('Settings', settingsSchema),
};
