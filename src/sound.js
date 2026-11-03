// Tiny synthesised sounds. Browsers only allow audio after a touch, so the context is created on first use.
export function makeSound(enabled) {
  let ac = null;
  const ctx = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = false; } }
    return ac || null;
  };
  const tone = (freq, dur, type = 'sine', gain = 0.06, slide = 0, delay = 0) => {
    if (!enabled()) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, gain = 0.08, delay = 0) => {
    if (!enabled()) return;
    const a = ctx(); if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = gain; s.connect(g).connect(a.destination); s.start(a.currentTime + delay);
  };
  return {
    unlock() { const a = ctx(); if (a?.state === 'suspended') a.resume(); },
    pass() { tone(520, 0.06, 'sine', 0.04); },
    graze() { tone(880, 0.1, 'triangle', 0.06, 440); },
    die() { tone(220, 0.35, 'sawtooth', 0.07, -170); noise(0.4, 0.07); },
    hurt() { tone(300, 0.2, 'square', 0.06, -180); noise(0.12, 0.05); },
    absorb() { tone(660, 0.14, 'triangle', 0.06, 440); },
    power() { tone(520, 0.08, 'sine', 0.05); tone(780, 0.1, 'sine', 0.05, 0, 0.07); tone(1040, 0.14, 'sine', 0.05, 0, 0.14); },
    heal() { tone(440, 0.1, 'sine', 0.05); tone(660, 0.18, 'sine', 0.05, 0, 0.09); },
    fire() { tone(180, 0.12, 'sawtooth', 0.03, 120); },
    boom() { noise(0.35, 0.09); tone(90, 0.3, 'sine', 0.08, -50); },
  };
}
