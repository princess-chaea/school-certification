// 별도 파일 없이 Web Audio 로 만드는 효과음
let ctx: AudioContext | null = null;
function ac() {
  ctx ??= new AudioContext();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.25) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

/** 띵동! (선생님 확인) */
export function playDingDong() {
  try {
    tone(1318.5, 0, 0.6, "sine", 0.3);
    tone(1046.5, 0.32, 0.9, "sine", 0.3);
  } catch {
    /* 소리 재생 불가 기기 무시 */
  }
}

export function playCorrect() {
  try {
    tone(880, 0, 0.12, "triangle", 0.2);
    tone(1320, 0.1, 0.2, "triangle", 0.2);
  } catch {
    /* noop */
  }
}

export function playWrong() {
  try {
    tone(220, 0, 0.25, "square", 0.08);
  } catch {
    /* noop */
  }
}

export function playFanfare() {
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.5, "triangle", 0.2));
  } catch {
    /* noop */
  }
}
