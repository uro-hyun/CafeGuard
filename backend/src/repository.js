// 저장소 계층. MongoDB가 연결돼 있으면 DB를, 아니면 메모리를 쓴다.
const { isDBReady } = require("./db");
const { Event } = require("./models/Event");
const { Settings, DEFAULT_SETTINGS } = require("./models/Settings");
const { Tag } = require("./models/Tag");

const MAX_MEMORY_EVENTS = 500;
const memory = { events: [], settings: {}, tags: {} };

async function addEvent(data) {
  if (isDBReady()) return (await Event.create(data)).toObject();
  const event = { ...data, _id: String(Date.now() + Math.random()), createdAt: new Date() };
  memory.events.unshift(event);
  memory.events.length = Math.min(memory.events.length, MAX_MEMORY_EVENTS);
  return event;
}

async function listEvents(limit) {
  if (isDBReady()) return Event.find().sort({ createdAt: -1 }).limit(limit).lean();
  return memory.events.slice(0, limit);
}

function pickSettings(doc) {
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (doc && doc[key] !== undefined && doc[key] !== null) result[key] = doc[key];
  }
  return result;
}

async function getSettings(gateId) {
  const doc = isDBReady() ? await Settings.findOne({ gateId }).lean() : memory.settings[gateId];
  return pickSettings(doc);
}

async function saveSettings(gateId, values) {
  if (isDBReady()) {
    const doc = await Settings.findOneAndUpdate({ gateId }, values, { upsert: true, new: true }).lean();
    return pickSettings(doc);
  }
  memory.settings[gateId] = { ...memory.settings[gateId], ...values };
  return pickSettings(memory.settings[gateId]);
}

async function getTagLabels() {
  if (isDBReady()) {
    const tags = await Tag.find().lean();
    return Object.fromEntries(tags.map((t) => [t.tagId, t.label]));
  }
  return { ...memory.tags };
}

async function saveTagLabel(tagId, label) {
  if (isDBReady()) await Tag.findOneAndUpdate({ tagId }, { label }, { upsert: true });
  else memory.tags[tagId] = label;
  return { tagId, label };
}

module.exports = { addEvent, listEvents, getSettings, saveSettings, getTagLabels, saveTagLabel };
