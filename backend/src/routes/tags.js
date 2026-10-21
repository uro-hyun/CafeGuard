const express = require("express");
const { getTagLabels, saveTagLabel } = require("../repository");

const router = express.Router();

router.get("/", async (req, res) => {
  res.json(await getTagLabels());
});

// 태그 별칭 지정
router.put("/:tagId", async (req, res) => {
  const label = String(req.body?.label ?? "").trim().slice(0, 40);
  res.json(await saveTagLabel(req.params.tagId, label));
});

module.exports = router;
