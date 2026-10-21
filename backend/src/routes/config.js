const express = require("express");
const { getSettings, saveSettings } = require("../repository");

const router = express.Router();

// 필드별 허용 범위 [최소, 최대]
const RANGES = {
  warnRssi: [-100, -30],
  alarmRssi: [-100, -30],
  windowSize: [1, 20],
  alarmHoldMs: [0, 30000],
  warnLostMs: [500, 60000],
  alarmLostMs: [1000, 120000],
};

function validate(body, current) {
  const values = {};
  if (body.armed !== undefined) {
    if (typeof body.armed !== "boolean") return { error: "armed는 true/false여야 합니다" };
    values.armed = body.armed;
  }
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${key}는 ${min}~${max} 사이 정수여야 합니다` };
    values[key] = n;
  }
  const merged = { ...current, ...values };
  if (merged.alarmRssi >= merged.warnRssi) return { error: "경보 임계값(alarmRssi)은 주의 임계값(warnRssi)보다 낮아야 합니다" };
  if (merged.alarmLostMs <= merged.warnLostMs) return { error: "alarmLostMs는 warnLostMs보다 커야 합니다" };
  return { values };
}

// 게이트·대시보드 → 서버: 펜스 설정 조회
router.get("/:gateId", async (req, res) => {
  res.json(await getSettings(req.params.gateId));
});

// 대시보드 → 서버: 펜스 설정 변경 (게이트는 5초 안에 가져가 적용)
router.put("/:gateId", async (req, res) => {
  const current = await getSettings(req.params.gateId);
  const { values, error } = validate(req.body ?? {}, current);
  if (error) return res.status(400).json({ error });
  res.json(await saveSettings(req.params.gateId, values));
});

module.exports = router;
