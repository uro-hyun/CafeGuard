const mongoose = require("mongoose");

// 태그 별칭 (예: CG-TAG-A1B2 → "3번 테이블 노트북")
const tagSchema = new mongoose.Schema(
  {
    tagId: { type: String, required: true, unique: true },
    label: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = { Tag: mongoose.model("Tag", tagSchema) };
