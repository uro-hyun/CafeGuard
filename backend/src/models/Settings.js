const mongoose = require("mongoose");

// 게이트별 가상 펜스 설정. 게이트 펌웨어의 FenceConfig와 필드가 같다.
const DEFAULT_SETTINGS = {
  armed: true,
  warnRssi: -65,
  alarmRssi: -75,
  windowSize: 10,
  alarmHoldMs: 2000,
  warnLostMs: 3000,
  alarmLostMs: 8000,
};

const settingsSchema = new mongoose.Schema(
  {
    gateId: { type: String, required: true, unique: true },
    armed: Boolean,
    warnRssi: Number,
    alarmRssi: Number,
    windowSize: Number,
    alarmHoldMs: Number,
    warnLostMs: Number,
    alarmLostMs: Number,
  },
  { timestamps: true }
);

module.exports = { Settings: mongoose.model("Settings", settingsSchema), DEFAULT_SETTINGS };
