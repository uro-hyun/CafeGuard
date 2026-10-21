const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDB } = require("./src/db");

// 환경변수 설정 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 미들웨어 설정
app.use(cors());
app.use(express.json()); // JSON 데이터 파싱용

// 기본 테스트 라우트
app.get("/", (req, res) => {
  res.send("CafeGuard Backend Server is Running!");
});

// API 라우트
app.use("/api/status", require("./src/routes/status"));
app.use("/api/alert", require("./src/routes/alert"));
app.use("/api/config", require("./src/routes/config"));
app.use("/api/tags", require("./src/routes/tags"));

// 에러 처리 (Express 5는 async 핸들러의 에러도 여기로 넘겨준다)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다" });
});

// 서버 시작. 0.0.0.0으로 열어야 같은 Wi-Fi의 ESP32가 접속할 수 있다
connectDB(process.env.MONGODB_URI).then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
