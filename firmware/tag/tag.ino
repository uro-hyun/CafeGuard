/*
 * CafeGuard 지급보드 (ESP32-C3 SuperMini, 노트북 부착 태그)
 *
 * 역할: 고유 이름(TAG_ID)으로 BLE 광고 패킷을 주기적으로 송신한다.
 *       게이트보드는 이 이름으로 태그를 식별하고 RSSI를 측정한다.
 *
 * 필요 라이브러리: NimBLE-Arduino 2.x (h2zero)
 * 보드: ESP32C3 Dev Module (esp32 by Espressif 3.x)
 *  - Tools > USB CDC On Boot: Enabled (시리얼 모니터 사용 시)
 *
 * 태그마다 TAG_ID만 바꿔서 업로드하세요. (예: CG-TAG-01, CG-TAG-02)
 * 대시보드에서 같은 ID로 등록해야 감시 대상이 됩니다.
 */

#include <NimBLEDevice.h>

// ───── 태그별로 변경 ─────
#define TAG_ID "CG-TAG-01"  // 반드시 "CG-"로 시작, 32자 이내

// ───── 송신 설정 ─────
// 광고 간격: 짧을수록 게이트가 RSSI를 자주 받아 판정이 빠르고 안정적이지만 배터리 소모가 커짐
//  - 100ms: 테스트/시연용 (기본)
//  - 300~500ms: 배터리 우선 (게이트 passHoldMs를 2000ms 이상으로 늘리는 것을 권장)
constexpr uint16_t ADV_INTERVAL_MS = 100;
constexpr int TX_POWER_DBM = 9;  // ESP32-C3 최대. 낮추면 감지 거리↓ 배터리↑

constexpr int PIN_LED = 8;  // SuperMini 내장 LED (LOW = 켜짐)

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);

  NimBLEDevice::init(TAG_ID);
  NimBLEDevice::setPower(TX_POWER_DBM);

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setName(TAG_ID);           // 광고 데이터에 이름 포함 (게이트는 passive scan이라 scan response를 안 읽음)
  adv->enableScanResponse(false);
  adv->setConnectableMode(BLE_GAP_CONN_MODE_NON);  // 연결 불필요 → 광고 전용
  const uint16_t units = ADV_INTERVAL_MS * 1000 / 625;  // 0.625ms 단위
  adv->setMinInterval(units);
  adv->setMaxInterval(units + 16);  // 약간의 여유 (다른 기기와 충돌 완화)
  adv->start();

  Serial.printf("CafeGuard Tag %s advertising (interval %ums, %ddBm)\n", TAG_ID, ADV_INTERVAL_MS, TX_POWER_DBM);
}

void loop() {
  // 동작 확인용: 3초마다 LED 짧게 점멸
  digitalWrite(PIN_LED, LOW);
  delay(30);
  digitalWrite(PIN_LED, HIGH);
  delay(2970);
}
