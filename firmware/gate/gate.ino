/*
 * CafeGuard 게이트보드 (ESP32 NodeMCU-32S)
 *
 * 역할
 *  1. 주변 지급보드(BLE 이름이 "CG-"로 시작)의 광고 패킷을 계속 스캔해 RSSI 수집
 *  2. 1초마다 태그별 평균 RSSI를 서버에 보고 (POST /api/device/report)
 *  3. 서버 응답의 alarm=true 이면 부저/빨간 LED 경고
 *  4. 서버와 연결이 끊기면 마지막으로 받은 설정으로 자체 통과 판정 (fallback)
 *     → 서버 복구 시 그동안의 통과 기록(offlinePasses)을 함께 보고
 *
 * 필요 라이브러리 (Arduino IDE 라이브러리 매니저)
 *  - NimBLE-Arduino 2.x (h2zero)
 *  - ArduinoJson 7.x (Benoit Blanchon)
 * 보드: ESP32 Dev Module (esp32 by Espressif 3.x)
 *  - Tools > Partition Scheme: "Huge APP (3MB No OTA)" 권장 (WiFi + BLE 동시 사용으로 용량 큼)
 *
 * 배선 (Active Buzzer, LED는 220Ω 저항 직렬)
 *  - GPIO25 → Buzzer (+),   GND → Buzzer (-)
 *  - GPIO26 → Red LED      (경고)
 *  - GPIO27 → Green LED    (서버 연결 상태: 켜짐=정상, 깜빡임=연결 중/끊김)
 */

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.example.h 를 secrets.h 로 복사하고 Wi-Fi/서버 정보를 입력하세요"
#endif

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <map>
#include <set>
#include <vector>
#include <deque>

#define FIRMWARE_VERSION "gate-1.0.0"

// ───── 핀 ─────
constexpr int PIN_BUZZER = 25;
constexpr int PIN_LED_RED = 26;
constexpr int PIN_LED_GREEN = 27;

// ───── 동작 파라미터 ─────
constexpr char TAG_PREFIX[] = "CG-";
constexpr uint32_t REPORT_INTERVAL_MS = 1000;
constexpr uint32_t HTTP_TIMEOUT_MS = 1500;
constexpr int SERVER_FAIL_LIMIT = 3;  // 연속 실패 시 오프라인 모드

// ───── 스캔 결과 버퍼 (BLE 태스크 ↔ loop 태스크 공유) ─────
struct Acc {
  long sum = 0;
  int count = 0;
};
static std::map<std::string, Acc> g_acc;
static portMUX_TYPE g_mux = portMUX_INITIALIZER_UNLOCKED;

// ───── 서버에서 받은 설정 (오프라인 판정용) ─────
struct DetectConfig {
  int passThreshold = -55;
  uint32_t passHoldMs = 1500;
  int windowSize = 5;
  int rearmHysteresis = 5;
} g_cfg;
static std::set<std::string> g_armedTags;

// ───── 오프라인 판정 상태 ─────
struct LocalState {
  std::deque<int> samples;
  uint32_t nearSince = 0;
  bool nearActive = false;
  bool latched = false;
};
static std::map<std::string, LocalState> g_local;
static std::vector<std::string> g_offlinePasses;  // 서버 복구 시 보고할 통과 기록
static bool g_localAlarm = false;

static bool g_serverAlarm = false;
static int g_failCount = 0;
static uint32_t g_lastReport = 0;

// ─────────────────────────────────────────────

class ScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (!dev->haveName()) return;
    const std::string& name = dev->getName();
    if (name.rfind(TAG_PREFIX, 0) != 0 || name.size() > 32) return;
    int rssi = dev->getRSSI();
    portENTER_CRITICAL(&g_mux);
    Acc& a = g_acc[name];
    a.sum += rssi;
    a.count++;
    portEXIT_CRITICAL(&g_mux);
  }

  void onScanEnd(const NimBLEScanResults& results, int reason) override {
    // 연속 스캔이 어떤 이유로 끝나면 다시 시작
    NimBLEDevice::getScan()->start(0, false, true);
  }
} g_scanCallbacks;

void startScan() {
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&g_scanCallbacks, true);  // true: 같은 기기의 반복 광고도 콜백 (RSSI 연속 측정)
  scan->setActiveScan(false);                       // 광고 패킷만 수신 (태그 이름은 광고 데이터에 포함)
  scan->setInterval(100);
  scan->setWindow(90);  // Wi-Fi와 무선 자원을 나눠 쓰므로 100% 대신 90%
  scan->setMaxResults(0);  // 결과를 메모리에 쌓지 않음
  scan->start(0, false, true);  // 0 = 무기한 연속 스캔
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[WiFi] %s 연결 중...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    digitalWrite(PIN_LED_GREEN, !digitalRead(PIN_LED_GREEN));
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] 연결됨: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WiFi] 연결 실패 - 오프라인 모드로 동작");
  }
}

bool isOffline() { return g_failCount >= SERVER_FAIL_LIMIT; }

// ───── 오프라인 판정 (서버 detector.js와 같은 로직) ─────
void localIngest(const std::string& tagId, int rssi, uint32_t now) {
  LocalState& st = g_local[tagId];
  st.samples.push_back(rssi);
  while ((int)st.samples.size() > g_cfg.windowSize) st.samples.pop_front();

  long sum = 0;
  for (int v : st.samples) sum += v;
  float avg = (float)sum / st.samples.size();
  bool ready = (int)st.samples.size() >= min(g_cfg.windowSize, 3);
  bool near = ready && avg >= g_cfg.passThreshold;

  if (st.latched) {
    if (avg < g_cfg.passThreshold - g_cfg.rearmHysteresis) {
      st.latched = false;
      st.nearActive = false;
    }
  } else if (near) {
    if (!st.nearActive) {
      st.nearActive = true;
      st.nearSince = now;
    }
    if (now - st.nearSince >= g_cfg.passHoldMs) {
      st.latched = true;
      // 서버 연결 중에는 서버가 판정하므로 로컬 결과는 버린다 (중복 알람 방지)
      if (isOffline() && g_armedTags.count(tagId)) {
        g_localAlarm = true;
        g_offlinePasses.push_back(tagId);
        Serial.printf("[OFFLINE] %s 게이트 통과 감지 → 자체 알람\n", tagId.c_str());
      }
    }
  } else {
    st.nearActive = false;
  }
}

// ───── 서버 보고 ─────
void report(const std::map<std::string, int>& readings) {
  if (WiFi.status() != WL_CONNECTED) {
    g_failCount = SERVER_FAIL_LIMIT;
    return;
  }

  JsonDocument doc;
  doc["gateId"] = GATE_ID;
  doc["ip"] = WiFi.localIP().toString();
  doc["firmware"] = FIRMWARE_VERSION;
  JsonArray arr = doc["readings"].to<JsonArray>();
  for (auto& kv : readings) {
    JsonObject o = arr.add<JsonObject>();
    o["tagId"] = kv.first;
    o["rssi"] = kv.second;
  }
  if (!g_offlinePasses.empty()) {
    JsonArray p = doc["offlinePasses"].to<JsonArray>();
    for (auto& t : g_offlinePasses) p.add(t);
  }
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(String(SERVER_URL) + "/api/device/report");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);

  if (code != 200) {
    if (code == 401) Serial.println("[HTTP] 401 - DEVICE_KEY가 서버와 다릅니다");
    else Serial.printf("[HTTP] 보고 실패: %d\n", code);
    http.end();
    if (g_failCount < SERVER_FAIL_LIMIT && ++g_failCount == SERVER_FAIL_LIMIT) {
      Serial.println("[MODE] 서버 연결 끊김 → 오프라인 자체 판정 시작");
    }
    return;
  }

  JsonDocument res;
  DeserializationError err = deserializeJson(res, http.getStream());
  http.end();
  if (err) {
    Serial.printf("[HTTP] 응답 파싱 실패: %s\n", err.c_str());
    return;
  }

  if (isOffline()) Serial.println("[MODE] 서버 연결 복구 → 서버 판정으로 전환");
  g_failCount = 0;
  g_offlinePasses.clear();  // 서버가 접수함
  g_localAlarm = false;     // 이후 알람 여부는 서버가 결정 (오프라인 통과분은 서버 알람으로 이어짐)
  g_serverAlarm = res["alarm"] | false;

  JsonObject c = res["config"];
  if (!c.isNull()) {
    g_cfg.passThreshold = c["passThreshold"] | g_cfg.passThreshold;
    g_cfg.passHoldMs = c["passHoldMs"] | g_cfg.passHoldMs;
    g_cfg.windowSize = constrain((int)(c["windowSize"] | g_cfg.windowSize), 1, 30);
    g_cfg.rearmHysteresis = c["rearmHysteresis"] | g_cfg.rearmHysteresis;
  }
  JsonArray armed = res["armedTags"];
  if (!armed.isNull()) {
    g_armedTags.clear();
    for (JsonVariant v : armed) g_armedTags.insert(v.as<std::string>());
  }
}

// ───── 알람 출력 ─────
void updateOutputs(uint32_t now) {
  bool alarm = g_serverAlarm || g_localAlarm;
  if (alarm) {
    bool on = (now / 200) % 2 == 0;  // 200ms 간격 단속음
    digitalWrite(PIN_BUZZER, on);
    digitalWrite(PIN_LED_RED, HIGH);
  } else {
    digitalWrite(PIN_BUZZER, LOW);
    digitalWrite(PIN_LED_RED, LOW);
  }
  // 초록 LED: 서버 정상이면 켜짐, 아니면 1초 깜빡임
  digitalWrite(PIN_LED_GREEN, isOffline() ? ((now / 500) % 2) : HIGH);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);

  // 부팅 확인용 짧은 비프
  digitalWrite(PIN_BUZZER, HIGH);
  delay(80);
  digitalWrite(PIN_BUZZER, LOW);

  Serial.printf("\nCafeGuard Gate %s (%s)\n", GATE_ID, FIRMWARE_VERSION);
  connectWiFi();

  NimBLEDevice::init("");
  startScan();
  Serial.println("[BLE] 연속 스캔 시작");
}

void loop() {
  uint32_t now = millis();

  if (now - g_lastReport >= REPORT_INTERVAL_MS) {
    g_lastReport = now;

    // 1초 동안 모은 RSSI → 태그별 평균
    std::map<std::string, int> readings;
    portENTER_CRITICAL(&g_mux);
    for (auto& kv : g_acc) {
      if (kv.second.count > 0) readings[kv.first] = (int)lround((double)kv.second.sum / kv.second.count);
    }
    g_acc.clear();
    portEXIT_CRITICAL(&g_mux);

    for (auto& kv : readings) {
      Serial.printf("  %s %d dBm\n", kv.first.c_str(), kv.second);
      localIngest(kv.first, kv.second, now);  // 항상 갱신해 두어야 오프라인 전환 즉시 판정 가능
    }

    if (WiFi.status() != WL_CONNECTED) {
      static uint32_t lastTry = 0;
      if (now - lastTry > 15000) {
        lastTry = now;
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);  // 비동기 재연결 (loop를 막지 않음)
      }
    }
    report(readings);

    if (!NimBLEDevice::getScan()->isScanning()) startScan();
  }

  updateOutputs(millis());
  delay(10);
}
