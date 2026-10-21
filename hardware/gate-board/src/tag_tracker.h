#pragma once
#include "config.h"
#include "rssi_filter.h"

enum class TagState : uint8_t { Normal, Warning, Alarm };

const char* stateName(TagState s);

// BLE 스캔 콜백이 넘겨주는 원시 샘플
struct RssiSample {
  char id[16];
  char mac[18];
  int rssi;
};

// 서버 보고용 스냅샷
struct TagSnapshot {
  char id[16];
  char mac[18];
  int rawRssi;
  float rssi;
  uint32_t lastSeenAgoMs;
  TagState state;
};

// 상태 전이 이벤트 (서버의 /api/alert 로 전송)
struct TagEvent {
  char id[16];
  TagState from;
  TagState to;
  float rssi;
  char reason[16];  // RSSI_LOW, SIGNAL_LOST, RECOVERED
};

using TransitionHandler = void (*)(const TagEvent&);

// 태그별 필터와 상태 머신. loop()와 네트워크 태스크가 함께 쓰므로 내부에서 뮤텍스로 보호한다.
namespace tracker {
void begin();
void addSample(const RssiSample& s, uint32_t now);
void evaluate(uint32_t now, TransitionHandler onTransition);
TagState worstState(int* tagCount);
int snapshot(TagSnapshot* out, int max, uint32_t now);
FenceConfig getConfig();
void setConfig(const FenceConfig& cfg);
}  // namespace tracker
