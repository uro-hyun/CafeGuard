// CafeGuard 게이트 보드 (ESP32 NodeMCU-32S, 수신기)
// BLE 태그의 RSSI를 측정 → 이중 필터링 → 상태 머신(정상/주의/경보) → LED·부저 제어 + 서버 보고
#include <Arduino.h>
#include "ble_scanner.h"
#include "indicator.h"
#include "net.h"
#include "tag_tracker.h"

namespace {

QueueHandle_t sampleQueue;
constexpr uint32_t EVAL_INTERVAL_MS = 100;

void onTransition(const TagEvent& e) {
  Serial.printf("[fsm] %s: %s -> %s (%s, %.1f dBm)\n", e.id, stateName(e.from), stateName(e.to),
                e.reason, e.rssi);
  net::queueEvent(e);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.println("\n[CafeGuard] 게이트 보드 시작");

  indicator::begin();
  tracker::begin();
  sampleQueue = xQueueCreate(64, sizeof(RssiSample));
  ble_scanner::begin(sampleQueue);
  net::begin();
}

void loop() {
  uint32_t now = millis();

  RssiSample s;
  while (xQueueReceive(sampleQueue, &s, 0) == pdTRUE) tracker::addSample(s, now);

  static uint32_t lastEval = 0;
  if (now - lastEval >= EVAL_INTERVAL_MS) {
    lastEval = now;
    tracker::evaluate(now, onTransition);
  }

  // 임계값을 정할 수 있도록 태그별 RSSI를 매초 시리얼로 출력한다
  static uint32_t lastLog = 0;
  if (now - lastLog >= 1000) {
    lastLog = now;
    TagSnapshot snaps[MAX_TAGS];
    int n = tracker::snapshot(snaps, MAX_TAGS, now);
    for (int i = 0; i < n; i++) {
      Serial.printf("[rssi] %s raw=%d filtered=%.1f state=%s\n", snaps[i].id, snaps[i].rawRssi,
                    snaps[i].rssi, stateName(snaps[i].state));
    }
  }

  int tagCount = 0;
  TagState worst = tracker::worstState(&tagCount);
  indicator::update(worst, tagCount, now);

  delay(10);
}
