const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const config = {
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cafeguard',
  // 게이트보드가 X-Device-Key 헤더로 보내는 공유 키. 비워두면 인증 없이 허용(로컬 테스트용)
  deviceKey: process.env.DEVICE_KEY || '',
  // 대시보드 접속 허용 Origin (쉼표 구분). 비워두면 모두 허용
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : true,
  // 지급보드 BLE 이름 접두어. 이 접두어로 시작하는 기기만 태그로 취급
  tagPrefix: process.env.TAG_PREFIX || 'CG-',
};

module.exports = config;
