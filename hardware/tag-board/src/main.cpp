// CafeGuard 태그 보드 (ESP32-C3 SuperMini, 송신기)
// 고유 이름(CG-TAG-XXXX)을 담은 BLE 광고 패킷을 일정한 세기·간격으로 계속 송출한다.
// 게이트 보드는 이 패킷의 RSSI로 거리를 추정한다.
#include <Arduino.h>
#include <NimBLEDevice.h>

namespace {

constexpr int PIN_LED = 8;                   // SuperMini 내장 파란 LED (LOW일 때 켜짐)
constexpr int TX_POWER_DBM = 0;              // 송신 세기를 고정해야 RSSI-거리 관계가 일정하다
constexpr uint16_t ADV_INTERVAL = 160;       // 광고 간격 (0.625ms 단위, 160 = 100ms)
constexpr uint32_t HEARTBEAT_MS = 3000;      // 동작 확인용 LED 깜빡임 주기

char tagName[16];

}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);

  // 칩 고유 MAC 끝 2바이트로 태그 이름을 자동 생성 → 여러 개를 따로 설정할 필요 없음
  uint64_t mac = ESP.getEfuseMac();
  snprintf(tagName, sizeof(tagName), "CG-TAG-%02X%02X", (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));

  NimBLEDevice::init(tagName);
  NimBLEDevice::setPower(TX_POWER_DBM);

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setName(tagName);                              // 게이트가 이름으로 태그를 식별
  adv->setConnectableMode(BLE_GAP_CONN_MODE_NON);     // 연결 없이 광고만 (비콘)
  adv->setMinInterval(ADV_INTERVAL);
  adv->setMaxInterval(ADV_INTERVAL);
  adv->start();

  Serial.printf("[CafeGuard] 태그 광고 시작: %s\n", tagName);
}

void loop() {
  digitalWrite(PIN_LED, LOW);
  delay(30);
  digitalWrite(PIN_LED, HIGH);
  delay(HEARTBEAT_MS - 30);
}
