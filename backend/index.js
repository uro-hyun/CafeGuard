const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

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

// 서버 시작
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
