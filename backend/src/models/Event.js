const mongoose = require("mongoose");

const STATES = ["NORMAL", "WARNING", "ALARM"];

// 게이트가 보낸 태그 상태 전이 기록 (경보 로그)
const eventSchema = new mongoose.Schema(
  {
    gateId: { type: String, required: true },
    tagId: { type: String, required: true },
    from: { type: String, enum: STATES, required: true },
    to: { type: String, enum: STATES, required: true },
    reason: { type: String, default: "" },
    rssi: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

eventSchema.index({ createdAt: -1 });

module.exports = { Event: mongoose.model("Event", eventSchema), STATES };
