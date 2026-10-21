#pragma once
#include "tag_tracker.h"

// LED 3색과 부저로 현재 상태를 표시한다.
//   태그 없음: 초록 LED 천천히 깜빡임 (동작 중 표시)
//   정상: 초록 LED 켜짐
//   주의: 노란 LED 켜짐
//   경보: 빨간 LED 점멸 + 부저 단속음
namespace indicator {
void begin();
void update(TagState worst, int tagCount, uint32_t now);
}
