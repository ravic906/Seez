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
  // A bed of soft white noise, low-passed so it reads as the hiss of the void, breathing slowly,
  // with a faint low hum under it. Quiet on purpose: it should be felt more than heard.
  let amb = null;
  const AMB_GAIN = 0.032;
  const ambientOn = () => {
    if (!enabled() || amb) return;
    const a = ctx(); if (!a) return;
    if (a.state === 'suspended') a.resume();
    const buf = a.createBuffer(2, a.sampleRate * 4, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.4;
    const g = a.createGain(); g.gain.value = 0;
    const lfo = a.createOscillator(); lfo.frequency.value = 0.07; const lfoG = a.createGain(); lfoG.gain.value = 380;
    lfo.connect(lfoG).connect(lp.frequency);
    const hum = a.createOscillator(); hum.type = 'sine'; hum.frequency.value = 52; const humG = a.createGain(); humG.gain.value = 0.35;
    hum.connect(humG).connect(g);
    src.connect(hp).connect(lp).connect(g).connect(a.destination);
    g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(AMB_GAIN, a.currentTime + 2.5);
    src.start(); lfo.start(); hum.start();
    amb = { src, lfo, hum, g, lp };
  };
  const ambientOff = () => {
    if (!amb) return;
    const a = ctx(), { src, lfo, hum, g } = amb;
    amb = null;
    g.gain.cancelScheduledValues(a.currentTime); g.gain.setValueAtTime(g.gain.value, a.currentTime); g.gain.linearRampToValueAtTime(0, a.currentTime + 0.4);
    setTimeout(() => { for (const n of [src, lfo, hum]) { try { n.stop(); } catch { /* already stopped */ } } }, 600);
  };
  document.addEventListener('visibilitychange', () => { if (ac) (document.hidden ? ac.suspend() : ac.resume()).catch(() => {}); });

  return {
    ambientOn, ambientOff,
    // Brighter hiss during Nitro, muffled during Slow-mo.
    mood(kind) { if (amb) amb.lp.frequency.setTargetAtTime(kind === 'nitro' ? 2600 : kind === 'slowmo' ? 650 : 1400, ac.currentTime, 0.25); },
    state() { return { ambient: !!amb, context: ac ? ac.state : 'none' }; },
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
