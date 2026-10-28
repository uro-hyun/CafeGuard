// 이 파일을 같은 폴더에 secrets.h 로 복사한 뒤 값을 채우세요. (secrets.h는 git에 올라가지 않습니다)
#pragma once

#define WIFI_SSID   "your-wifi-ssid"
#define WIFI_PASS   "your-wifi-password"

// 백엔드 서버 주소 (PC의 같은 Wi-Fi 내부 IP). localhost는 ESP32에서 동작하지 않습니다.
#define SERVER_URL  "http://192.168.0.10:5000"

// backend/.env 의 DEVICE_KEY 와 동일하게
#define DEVICE_KEY  "change-me"

// 게이트 식별자 (영문/숫자/-/_). 게이트가 여러 대면 각각 다르게
#define GATE_ID     "GATE-01"
