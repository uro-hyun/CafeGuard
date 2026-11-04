#include <Arduino.h>
#include <NimBLEDevice.h>

// 지급용 태그 이름
const char* TAG_NAME = "CAFE_GUARD_TAG";

void setup() {

    Serial.begin(115200);
    delay(500);

    // BLE 초기화
    NimBLEDevice::init(TAG_NAME);

    // BLE 광고 설정
    NimBLEAdvertising* advertising =
        NimBLEDevice::getAdvertising();

    NimBLEAdvertisementData data;

    // 메인보드가 검색할 이름
    data.setName(TAG_NAME);

    advertising->setAdvertisementData(data);

    // BLE 신호 송신 시작
    advertising->start();

    Serial.println("======================");
    Serial.println("CAFE GUARD TAG BOARD");
    Serial.println("지급용 C3 BLE 송신 시작");
    Serial.println("======================");
}

void loop() {

    delay(1000);
}
