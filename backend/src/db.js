const mongoose = require("mongoose");

// 연결 전/실패 시 쿼리가 무한정 대기하지 않고 바로 에러가 나게 한다 (메모리 저장으로 대체하기 위함)
mongoose.set("bufferCommands", false);

async function connectDB(uri) {
  if (!uri) {
    console.warn("[db] MONGODB_URI가 없어 메모리 저장소로 동작합니다 (서버 재시작 시 기록 삭제)");
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("[db] MongoDB 연결됨");
  } catch (err) {
    console.warn(`[db] MongoDB 연결 실패, 메모리 저장소로 동작합니다: ${err.message}`);
  }
}

function isDBReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDBReady };
