#pragma once
#include "tag_tracker.h"

// Wi-Fi 연결과 백엔드 통신을 별도 FreeRTOS 태스크에서 처리한다.
// HTTP 요청이 몇 초 걸려도 LED/부저/상태 판정(loop)이 멈추지 않게 하기 위함.
//   POST /api/status         매초 태그 상태 보고
//   POST /api/alert          상태 전이 이벤트 전송
//   GET  /api/config/:gateId 대시보드에서 바꾼 펜스 설정 가져오기
namespace net {
void begin();
void queueEvent(const TagEvent& e);
}
