// 경보음을 Web Audio로 직접 만든다 (별도 음원 파일 불필요).
// 브라우저 정책상 사용자가 한 번 클릭한 뒤에야 소리가 난다.
let ctx = null;
let timer = null;

function beep() {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 2200;
  gain.gain.value = 0.08;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

export function unlockSound() {
  ctx ??= new AudioContext();
  ctx.resume();
}

export function setAlarmSound(on) {
  if (on && !timer && ctx) {
    beep();
    timer = setInterval(beep, 500);
  } else if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
}
