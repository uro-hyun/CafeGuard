const express = require("express");
const { updateGate, listGates } = require("../liveStatus");
const { getTagLabels } = require("../repository");

const router = express.Router();

// 게이트 → 서버: 현재 태그 상태 보고 (매초)
router.post("/", (req, res) => {
  const { gateId, armed, uptimeMs, wifiRssi, tags } = req.body ?? {};
  if (typeof gateId !== "string" || !Array.isArray(tags)) {
    return res.status(400).json({ error: "gateId(string)와 tags(array)가 필요합니다" });
  }
  updateGate({ gateId, armed, uptimeMs, wifiRssi, tags });
  res.json({ ok: true });
});

// 대시보드 → 서버: 모든 게이트의 실시간 상태 (태그 별칭 포함)
router.get("/", async (req, res) => {
  const labels = await getTagLabels();
  const gates = listGates().map((g) => ({
    ...g,
    tags: g.tags.map((t) => ({ ...t, label: labels[t.tagId] ?? "" })),
  }));
  res.json({ gates, serverTime: Date.now() });
});

module.exports = router;
