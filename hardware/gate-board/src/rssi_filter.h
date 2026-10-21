#pragma once
#include "config.h"

// 최근 N개 RSSI의 가중 이동 평균(WMA). 최신 샘플일수록 가중치가 크다 (N, N-1, ..., 1).
class RssiFilter {
 public:
  void setWindow(uint8_t n) {
    n = constrain(n, 1, MAX_WINDOW);
    if (n != window_) {
      window_ = n;
      reset();
    }
  }

  void reset() {
    count_ = 0;
    head_ = 0;
  }

  void add(int rssi) {
    buf_[head_] = rssi;
    head_ = (head_ + 1) % window_;
    if (count_ < window_) count_++;
  }

  bool empty() const { return count_ == 0; }

  float value() const {
    if (count_ == 0) return -127;
    float sum = 0, weightSum = 0;
    for (int i = 0; i < count_; i++) {  // i = 0이 가장 최근 샘플
      int idx = (head_ - 1 - i + window_) % window_;
      float w = count_ - i;
      sum += buf_[idx] * w;
      weightSum += w;
    }
    return sum / weightSum;
  }

 private:
  int buf_[MAX_WINDOW] = {};
  int window_ = 10;
  int count_ = 0;
  int head_ = 0;
};
