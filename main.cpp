#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ===== 여기만 내 환경에 맞게 수정 =====
//const char* WIFI_SSID     = "와이파이이름";             // 2.4GHz 와이파이
//const char* WIFI_PASSWORD = "와이파이비밀번호";
//const char* SERVER_URL    = "http://192.168.0.10:5000"; // 백엔드를 켠 PC의 IP (ipconfig로 확인)
//const char* GATE_ID       = "gate-01";
// ====================================

#define BUZZER_PIN 25
const bool ACTIVE_LOW = false;          // 부저 극성 (아까 울린 값으로)
const int ON_LEVEL  = ACTIVE_LOW ? LOW  : HIGH;
const int OFF_LEVEL = ACTIVE_LOW ? HIGH : LOW;

const char* TAG_NAME = "CAFE_GUARD_TAG";

const int ALARM_ON_RSSI  = -63;         // 이 이상(가까움)이면 즉시 울림
const int ALARM_OFF_RSSI = -65;         // 이 이하(멀어짐)면 즉시 꺼짐
const unsigned long LOST_TIME = 1000;   // 이 시간 신호 없으면 꺼짐

const int N = 5;
int samples[N];
int sampleCount = 0;
int sampleIdx = 0;
unsigned long lastSeen = 0;
portMUX_TYPE bleMux = portMUX_INITIALIZER_UNLOCKED;

// 네트워크 태스크와 공유하는 상태
volatile bool g_alarm = false;
volatile int g_rssi = -100;
volatile unsigned long g_seenAt = 0;

class TagScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* device) override {
    if (device->getName() == TAG_NAME) {
      int r = device->getRSSI();
      unsigned long now = millis();
      portENTER_CRITICAL(&bleMux);
      if (now - lastSeen > LOST_TIME) { sampleCount = 0; sampleIdx = 0; }
      samples[sampleIdx] = r;
      sampleIdx = (sampleIdx + 1) % N;
      if (sampleCount < N) sampleCount++;
      lastSeen = now;
      portEXIT_CRITICAL(&bleMux);
    }
  }
};
TagScanCallbacks scanCallbacks;

bool postJson(const String& path, const String& body) {
  HTTPClient http;
  http.setTimeout(2000);
  http.begin(String(SERVER_URL) + path);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  if (code < 200 || code >= 300) {
    Serial.printf("[net] POST %s 실패: %d\n", path.c_str(), code);
    return false;
  }
  return true;
}

// 서버로 상태를 보내는 태스크 (부저 제어와 분리해서 통신이 느려도 부저는 바로 반응)
void netTask(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  bool prevAlarm = false;
  bool wasConnected = false;

  for (;;) {
    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected != wasConnected) {
      wasConnected = connected;
      if (connected) Serial.printf("[net] Wi-Fi 연결됨: %s\n", WiFi.localIP().toString().c_str());
      else Serial.println("[net] Wi-Fi 끊김");
    }
    if (!connected) { vTaskDelay(pdMS_TO_TICKS(500)); continue; }

    bool alarm = g_alarm;
    int rssi = g_rssi;
    unsigned long seenAt = g_seenAt;
    unsigned long now = millis();

    String body = String("{\"gateId\":\"") + GATE_ID + "\",\"armed\":true,\"uptimeMs\":" + now +
                  ",\"wifiRssi\":" + WiFi.RSSI() + ",\"tags\":[";
    if (seenAt != 0) {
      body += String("{\"tagId\":\"") + TAG_NAME + "\",\"mac\":\"\",\"rawRssi\":" + rssi +
              ",\"rssi\":" + rssi + ",\"lastSeenAgoMs\":" + (now - seenAt) +
              ",\"state\":\"" + (alarm ? "ALARM" : "NORMAL") + "\"}";
    }
    body += "]}";
    postJson("/api/status", body);

    // 상태가 바뀔 때 이벤트 기록 (실패하면 다음 주기에 다시 시도)
    if (alarm != prevAlarm) {
      String ev = String("{\"gateId\":\"") + GATE_ID + "\",\"tagId\":\"" + TAG_NAME +
                  "\",\"from\":\"" + (prevAlarm ? "ALARM" : "NORMAL") +
                  "\",\"to\":\"" + (alarm ? "ALARM" : "NORMAL") +
                  "\",\"reason\":\"" + (alarm ? "TAG_NEAR" : "TAG_AWAY") +
                  "\",\"rssi\":" + rssi + "}";
      if (postJson("/api/alert", ev)) prevAlarm = alarm;
    }

    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, OFF_LEVEL);

  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&scanCallbacks, true);
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(100);
  scan->start(0, false);

  xTaskCreate(netTask, "net", 8192, NULL, 1, NULL);

  Serial.println("CAFE GUARD GATE: 태그 검색 시작");
}

void loop() {
  unsigned long now = millis();

  int buf[N]; int n; unsigned long seenAt;
  portENTER_CRITICAL(&bleMux);
  n = sampleCount; seenAt = lastSeen;
  for (int i = 0; i < n; i++) buf[i] = samples[i];
  portEXIT_CRITICAL(&bleMux);

  bool seen = (seenAt != 0) && (now - seenAt < LOST_TIME) && (n >= 3);

  int rssi = -100;
  if (seen) {
    for (int i = 0; i < n - 1; i++)
      for (int j = i + 1; j < n; j++)
        if (buf[j] < buf[i]) { int t = buf[i]; buf[i] = buf[j]; buf[j] = t; }
    rssi = buf[n / 2];
    g_rssi = rssi;
  }
  g_seenAt = seenAt;

  static bool alarm = false;
  if (seen && rssi >= ALARM_ON_RSSI) alarm = true;
  else if (!seen || rssi <= ALARM_OFF_RSSI) alarm = false;

  g_alarm = alarm;
  digitalWrite(BUZZER_PIN, alarm ? ON_LEVEL : OFF_LEVEL);

  static unsigned long lastPrint = 0;
  if (now - lastPrint >= 500) {
    lastPrint = now;
    if (!seen) Serial.println("태그 감지 안 됨");
    else Serial.printf("RSSI %d dBm | %s\n", rssi, alarm ? "접근! 부저 ON" : "정상");
  }
  delay(5);
}