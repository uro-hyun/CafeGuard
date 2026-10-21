#include "ble_scanner.h"

#include <NimBLEDevice.h>

#include "tag_tracker.h"

namespace {

QueueHandle_t queue;

class ScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (!dev->haveName()) return;
    const std::string& name = dev->getName();
    if (name.rfind(TAG_NAME_PREFIX, 0) != 0) return;

    RssiSample s;
    strlcpy(s.id, name.c_str(), sizeof(s.id));
    strlcpy(s.mac, dev->getAddress().toString().c_str(), sizeof(s.mac));
    s.rssi = dev->getRSSI();
    xQueueSend(queue, &s, 0);  // 큐가 꽉 차면 이번 샘플은 버린다
  }

  void onScanEnd(const NimBLEScanResults&, int reason) override {
    // 무한 스캔이지만 혹시 멈추면 다시 시작
    NimBLEDevice::getScan()->start(0, false, true);
  }
};

ScanCallbacks callbacks;

}  // namespace

namespace ble_scanner {

void begin(QueueHandle_t sampleQueue) {
  queue = sampleQueue;
  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  // wantDuplicates=true: 같은 태그의 광고도 매번 받아야 RSSI를 계속 측정할 수 있다
  scan->setScanCallbacks(&callbacks, true);
  scan->setActiveScan(false);  // 이름은 광고 패킷에 들어 있으므로 스캔 응답 요청 불필요
  // Wi-Fi와 안테나를 나눠 쓰므로 창(window)을 간격(interval)보다 작게 둔다 (단위 ms)
  scan->setInterval(100);
  scan->setWindow(70);
  scan->setMaxResults(0);  // 결과를 메모리에 쌓지 않고 콜백만 받는다
  scan->start(0, false, true);
}

}  // namespace ble_scanner
