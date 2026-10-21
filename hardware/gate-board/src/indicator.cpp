#include "indicator.h"

namespace {

bool buzzerOn = false;

void setBuzzer(bool on) {
  if (on == buzzerOn) return;
  buzzerOn = on;
  if (BUZZER_PASSIVE) {
    if (on) tone(PIN_BUZZER, BUZZER_FREQ_HZ);
    else noTone(PIN_BUZZER);
  } else {
    digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
  }
}

void setLeds(bool green, bool yellow, bool red) {
  digitalWrite(PIN_LED_GREEN, green);
  digitalWrite(PIN_LED_YELLOW, yellow);
  digitalWrite(PIN_LED_RED, red);
}

}  // namespace

namespace indicator {

void begin() {
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  setLeds(false, false, false);
  digitalWrite(PIN_BUZZER, LOW);
}

void update(TagState worst, int tagCount, uint32_t now) {
  if (tagCount == 0) {
    setLeds((now / 1000) % 2 == 0, false, false);
    setBuzzer(false);
    return;
  }

  switch (worst) {
    case TagState::Normal:
      setLeds(true, false, false);
      setBuzzer(false);
      break;
    case TagState::Warning:
      setLeds(false, true, false);
      setBuzzer(false);
      break;
    case TagState::Alarm: {
      bool phase = (now / 250) % 2 == 0;  // 0.25초 간격 점멸
      setLeds(false, false, phase);
      setBuzzer(phase);
      break;
    }
  }
}

}  // namespace indicator
