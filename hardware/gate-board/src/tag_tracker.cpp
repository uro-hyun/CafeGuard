#include "tag_tracker.h"

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

namespace {

struct Tag {
  bool used = false;
  char id[16] = {};
  char mac[18] = {};
  RssiFilter filter;
  int lastRaw = -127;
  uint32_t lastSeen = 0;
  uint32_t weakSince = 0;  // alarmRssi 아래로 떨어진 시각 (0 = 해당 없음)
  TagState state = TagState::Normal;
};

Tag tags[MAX_TAGS];
FenceConfig config;
SemaphoreHandle_t mutex;

struct Lock {
  Lock() { xSemaphoreTake(mutex, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(mutex); }
};

Tag* findOrCreate(const char* id) {
  Tag* freeSlot = nullptr;
  for (auto& t : tags) {
    if (t.used && strcmp(t.id, id) == 0) return &t;
    if (!t.used && !freeSlot) freeSlot = &t;
  }
  if (!freeSlot) return nullptr;
  *freeSlot = Tag();
  freeSlot->used = true;
  strlcpy(freeSlot->id, id, sizeof(freeSlot->id));
  freeSlot->filter.setWindow(config.windowSize);
  return freeSlot;
}

// 현재 신호 상태만 보고 다음 상태와 그 원인을 정한다.
TagState nextState(Tag& t, uint32_t now, const char** reason) {
  uint32_t silent = now - t.lastSeen;
  float rssi = t.filter.value();

  // 1) 신호 유실: 전원 차단, 금속 차폐, 범위 밖으로 완전히 이탈
  if (silent >= config.alarmLostMs) {
    *reason = "SIGNAL_LOST";
    return TagState::Alarm;
  }

  // 2) 신호가 경보 임계값보다 약한 상태가 일정 시간 지속
  if (rssi < config.alarmRssi) {
    if (t.weakSince == 0) t.weakSince = now;
    *reason = "RSSI_LOW";
    return (now - t.weakSince >= config.alarmHoldMs) ? TagState::Alarm : TagState::Warning;
  }
  t.weakSince = 0;

  if (silent >= config.warnLostMs) {
    *reason = "SIGNAL_LOST";
    return TagState::Warning;
  }

  // 3) 경보/주의에서 정상으로 돌아올 때는 히스테리시스를 둬서 경계값에서 깜빡이지 않게 한다
  int recoverRssi = (t.state == TagState::Normal) ? config.warnRssi : config.warnRssi + HYSTERESIS_DB;
  if (rssi < recoverRssi) {
    *reason = "RSSI_LOW";
    return (t.state == TagState::Alarm) ? TagState::Alarm : TagState::Warning;
  }

  *reason = "RECOVERED";
  return TagState::Normal;
}

}  // namespace

const char* stateName(TagState s) {
  switch (s) {
    case TagState::Normal: return "NORMAL";
    case TagState::Warning: return "WARNING";
    case TagState::Alarm: return "ALARM";
  }
  return "UNKNOWN";
}

namespace tracker {

void begin() { mutex = xSemaphoreCreateMutex(); }

void addSample(const RssiSample& s, uint32_t now) {
  Lock lock;
  Tag* t = findOrCreate(s.id);
  if (!t) return;  // 슬롯이 꽉 참

  // 오래 끊겼다가 다시 잡히면 예전 값은 의미가 없으므로 필터를 비운다
  if (!t->filter.empty() && now - t->lastSeen >= config.warnLostMs) t->filter.reset();

  // 1차 필터: 직전 평균에서 너무 크게 튄 값은 잘라낸다
  int rssi = s.rssi;
  if (!t->filter.empty()) {
    int avg = (int)t->filter.value();
    rssi = constrain(rssi, avg - SPIKE_CLAMP_DB, avg + SPIKE_CLAMP_DB);
  }
  // 2차 필터: 가중 이동 평균
  t->filter.add(rssi);

  t->lastRaw = s.rssi;
  t->lastSeen = now;
  strlcpy(t->mac, s.mac, sizeof(t->mac));
}

void evaluate(uint32_t now, TransitionHandler onTransition) {
  TagEvent events[MAX_TAGS];
  int eventCount = 0;
  {
    Lock lock;
    for (auto& t : tags) {
      if (!t.used) continue;

      if (!config.armed && now - t.lastSeen >= FORGET_MS) {
        t.used = false;  // 경계 해제 중 사라진 태그는 정리 (손님이 가져간 경우)
        continue;
      }

      const char* reason = "";
      TagState next = nextState(t, now, &reason);
      if (!config.armed && next == TagState::Alarm) next = TagState::Warning;
      if (next == t.state) continue;

      TagEvent& e = events[eventCount++];
      strlcpy(e.id, t.id, sizeof(e.id));
      e.from = t.state;
      e.to = next;
      e.rssi = t.filter.value();
      strlcpy(e.reason, reason, sizeof(e.reason));
      t.state = next;
    }
  }
  // 핸들러는 잠금 밖에서 호출한다
  for (int i = 0; i < eventCount; i++) onTransition(events[i]);
}

TagState worstState(int* tagCount) {
  Lock lock;
  TagState worst = TagState::Normal;
  int count = 0;
  for (auto& t : tags) {
    if (!t.used) continue;
    count++;
    if (t.state > worst) worst = t.state;
  }
  if (tagCount) *tagCount = count;
  return worst;
}

int snapshot(TagSnapshot* out, int max, uint32_t now) {
  Lock lock;
  int n = 0;
  for (auto& t : tags) {
    if (!t.used || n >= max) continue;
    TagSnapshot& s = out[n++];
    strlcpy(s.id, t.id, sizeof(s.id));
    strlcpy(s.mac, t.mac, sizeof(s.mac));
    s.rawRssi = t.lastRaw;
    s.rssi = t.filter.value();
    s.lastSeenAgoMs = now - t.lastSeen;
    s.state = t.state;
  }
  return n;
}

FenceConfig getConfig() {
  Lock lock;
  return config;
}

void setConfig(const FenceConfig& cfg) {
  Lock lock;
  config = cfg;
  for (auto& t : tags) t.filter.setWindow(cfg.windowSize);
}

}  // namespace tracker
