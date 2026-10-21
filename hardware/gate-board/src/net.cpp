#include "net.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
// 컴파일러 출력이 한글을 깨뜨리므로 경고 문구는 영어로 둔다
#warning "include/secrets.h not found - copy secrets.example.h to secrets.h and fill in Wi-Fi info"
#include "secrets.example.h"
#endif

namespace {

QueueHandle_t eventQueue;

bool postJson(const char* path, const JsonDocument& doc) {
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(String(SERVER_URL) + path);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  if (code < 200 || code >= 300) {
    Serial.printf("[net] POST %s 실패: %d\n", path, code);
    return false;
  }
  return true;
}

bool sendEvent(const TagEvent& e) {
  JsonDocument doc;
  doc["gateId"] = GATE_ID;
  doc["tagId"] = e.id;
  doc["from"] = stateName(e.from);
  doc["to"] = stateName(e.to);
  doc["reason"] = e.reason;
  doc["rssi"] = round(e.rssi * 10) / 10.0;
  return postJson("/api/alert", doc);
}

void sendStatus() {
  TagSnapshot snaps[MAX_TAGS];
  int n = tracker::snapshot(snaps, MAX_TAGS, millis());
  FenceConfig cfg = tracker::getConfig();

  JsonDocument doc;
  doc["gateId"] = GATE_ID;
  doc["armed"] = cfg.armed;
  doc["uptimeMs"] = millis();
  doc["wifiRssi"] = WiFi.RSSI();
  JsonArray arr = doc["tags"].to<JsonArray>();
  for (int i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["tagId"] = snaps[i].id;
    o["mac"] = snaps[i].mac;
    o["rawRssi"] = snaps[i].rawRssi;
    o["rssi"] = round(snaps[i].rssi * 10) / 10.0;
    o["lastSeenAgoMs"] = snaps[i].lastSeenAgoMs;
    o["state"] = stateName(snaps[i].state);
  }
  postJson("/api/status", doc);
}

void fetchConfig() {
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(String(SERVER_URL) + "/api/config/" + GATE_ID);
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err) return;

  // 서버에 없는 값은 현재 값을 유지한다
  FenceConfig cfg = tracker::getConfig();
  cfg.armed = doc["armed"] | cfg.armed;
  cfg.warnRssi = doc["warnRssi"] | cfg.warnRssi;
  cfg.alarmRssi = doc["alarmRssi"] | cfg.alarmRssi;
  cfg.windowSize = doc["windowSize"] | cfg.windowSize;
  cfg.alarmHoldMs = doc["alarmHoldMs"] | cfg.alarmHoldMs;
  cfg.warnLostMs = doc["warnLostMs"] | cfg.warnLostMs;
  cfg.alarmLostMs = doc["alarmLostMs"] | cfg.alarmLostMs;
  tracker::setConfig(cfg);
}

void netTask(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t lastStatus = 0, lastConfig = 0;
  bool wasConnected = false;
  TagEvent pending;
  bool hasPending = false;

  for (;;) {
    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected != wasConnected) {
      wasConnected = connected;
      if (connected) Serial.printf("[net] Wi-Fi 연결됨: %s\n", WiFi.localIP().toString().c_str());
      else Serial.println("[net] Wi-Fi 끊김, 재연결 대기");
    }
    if (!connected) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    // 이벤트는 전송에 성공할 때까지 붙잡고 있는다 (경보가 유실되지 않도록)
    if (!hasPending) hasPending = xQueueReceive(eventQueue, &pending, 0) == pdTRUE;
    if (hasPending && sendEvent(pending)) hasPending = false;

    uint32_t now = millis();
    if (now - lastConfig >= CONFIG_INTERVAL_MS) {
      lastConfig = now;
      fetchConfig();
    }
    if (now - lastStatus >= STATUS_INTERVAL_MS) {
      lastStatus = now;
      sendStatus();
    }
    vTaskDelay(pdMS_TO_TICKS(hasPending ? 500 : 50));
  }
}

}  // namespace

namespace net {

void begin() {
  eventQueue = xQueueCreate(16, sizeof(TagEvent));
  xTaskCreatePinnedToCore(netTask, "net", 8192, nullptr, 1, nullptr, 1);
}

void queueEvent(const TagEvent& e) { xQueueSend(eventQueue, &e, 0); }

}  // namespace net
