#pragma once
#include <Arduino.h>

// ───────── 기기 식별 ─────────
constexpr const char* GATE_ID = "gate-01";          // 서버에서 이 게이트를 구분하는 ID
constexpr const char* TAG_NAME_PREFIX = "CG-TAG";   // 이 이름으로 시작하는 BLE 기기만 태그로 인식

// ───────── 핀 배치 (NodeMCU-32S) ─────────
// GPIO 2는 부팅용 핀이라 업로드가 실패하면 부저를 GPIO 33 등으로 옮기고 여기만 바꾸면 된다
constexpr int PIN_BUZZER = 2;
constexpr int PIN_LED_GREEN = 25;
constexpr int PIN_LED_YELLOW = 26;
constexpr int PIN_LED_RED = 27;

// 패시브 부저면 true (PWM 톤 출력), 액티브 부저면 false (HIGH/LOW로 켜고 끔)
constexpr bool BUZZER_PASSIVE = false;
constexpr int BUZZER_FREQ_HZ = 2700;

// ───────── 추적/필터 한도 ─────────
constexpr int MAX_TAGS = 8;          // 동시에 추적할 최대 태그 수
constexpr int MAX_WINDOW = 20;       // 이동 평균 창 크기 최대값
constexpr int SPIKE_CLAMP_DB = 10;   // 1차 필터: 한 번에 이만큼 넘게 튀는 값은 잘라낸다
constexpr int HYSTERESIS_DB = 3;     // 상태 복귀 시 임계값보다 이만큼 더 강해야 함 (깜빡임 방지)
constexpr uint32_t FORGET_MS = 30000; // 경계 해제 중 이 시간 동안 안 보이는 태그는 목록에서 삭제

// ───────── 통신 주기 ─────────
constexpr uint32_t STATUS_INTERVAL_MS = 1000;
constexpr uint32_t CONFIG_INTERVAL_MS = 5000;
constexpr uint32_t HTTP_TIMEOUT_MS = 2000;

// ───────── 가상 펜스 설정 (서버 대시보드에서 바꿀 수 있음) ─────────
struct FenceConfig {
  bool armed = true;            // 경계 모드. false면 경보(부저)를 울리지 않는다
  int warnRssi = -65;           // 이보다 약하면 주의
  int alarmRssi = -75;          // 이보다 약한 상태가 alarmHoldMs 동안 이어지면 경보
  uint8_t windowSize = 10;      // 이동 평균에 쓰는 최근 샘플 수 N
  uint32_t alarmHoldMs = 2000;  // 약한 신호가 이만큼 지속돼야 경보 (순간 튐 무시)
  uint32_t warnLostMs = 3000;   // 신호가 이만큼 끊기면 주의
  uint32_t alarmLostMs = 8000;  // 신호가 이만큼 끊기면 경보 (전원 차단/강제 이탈)
};
