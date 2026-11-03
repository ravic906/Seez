// Tiny synthesised sounds. Browsers only allow audio after a touch, so the context is created on first use.
export function makeSound(enabled) {
  let ac = null;
  const ctx = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = false; } }
    return ac || null;
  };
  const tone = (freq, dur, type = 'sine', gain = 0.06, slide = 0) => {
    if (!enabled()) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    unlock() { const a = ctx(); if (a?.state === 'suspended') a.resume(); },
    pass() { tone(520, 0.06, 'sine', 0.04); },
    graze() { tone(880, 0.1, 'triangle', 0.06, 440); },
    die() { tone(220, 0.35, 'sawtooth', 0.07, -170); },
  };
}
