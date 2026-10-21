#pragma once
// 이 파일을 같은 폴더에 secrets.h 로 복사한 뒤 값을 채운다. secrets.h는 git에 올라가지 않는다.

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// 백엔드 서버 주소. ESP32와 같은 네트워크에서 접속 가능한 PC의 IP를 적는다 (localhost 불가)
#define SERVER_URL "http://192.168.0.10:5000"
