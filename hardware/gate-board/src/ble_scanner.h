#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// 주변 BLE 광고를 계속 스캔해서 태그(이름이 TAG_NAME_PREFIX로 시작)의 RSSI를 큐에 넣는다.
// 콜백은 NimBLE 태스크에서 돌기 때문에 처리는 loop()에서 큐를 비우면서 한다.
namespace ble_scanner {
void begin(QueueHandle_t sampleQueue);
}
