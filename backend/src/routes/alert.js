const express = require("express");
const { STATES } = require("../models/Event");
const { addEvent, listEvents } = require("../repository");

const router = express.Router();

// 게이트 → 서버: 태그 상태 전이 이벤트 (경보 발생/해제 등)
router.post("/", async (req, res) => {
  const { gateId, tagId, from, to, reason, rssi } = req.body ?? {};
  if (typeof gateId !== "string" || typeof tagId !== "string" || !STATES.includes(from) || !STATES.includes(to)) {
    return res.status(400).json({ error: `gateId, tagId, from/to(${STATES.join("|")})가 필요합니다` });
  }
  const event = await addEvent({ gateId, tagId, from, to, reason, rssi });
  if (to === "ALARM") console.warn(`[alert] 🚨 ${gateId}/${tagId} 경보 (${reason}, ${rssi} dBm)`);
  res.status(201).json(event);
});

// 대시보드 → 서버: 최근 이벤트 로그
router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(await listEvents(limit));
});

module.exports = router;
