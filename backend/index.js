const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const config = require('./src/config');
const { createApp } = require('./src/app');
const { Monitor } = require('./src/services/monitor');

async function main() {
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`MongoDB connected: ${redact(config.mongodbUri)}`);

  const monitor = new Monitor({ tagPrefix: config.tagPrefix });
  await monitor.init();
  monitor.start();

  const app = createApp({ monitor, config });
  const server = http.createServer(app);

  // 대시보드 실시간 통신
  const io = new Server(server, { cors: { origin: config.corsOrigin } });
  io.on('connection', (socket) => {
    socket.emit('state', monitor.snapshot());
  });
  monitor.on('state', (snapshot) => io.emit('state', snapshot));
  monitor.on('alarm', (alarm) => io.emit('alarm', alarm));

  // 0.0.0.0으로 열어야 같은 Wi-Fi의 게이트보드가 접속 가능
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Server is running on port ${config.port}`);
    if (!config.deviceKey) console.warn('⚠️  DEVICE_KEY 미설정: 게이트 보고 인증 없이 동작합니다 (로컬 테스트용)');
  });

  const shutdown = async () => {
    monitor.stop();
    io.close();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function redact(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');
}

main().catch((err) => {
  console.error('서버 시작 실패:', err.message);
  process.exit(1);
});
