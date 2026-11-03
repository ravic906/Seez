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
  // The opening scene's score, scheduled against the scene's clock so it lines up with the picture:
  // engine hum, alien shots and impacts, a chain of explosions and a big boom, a choir for the lost
  // crew, the bot's launch, and a chime for the title.
  let intro = null, noiseBuffer = null;
  const getNoise = (a) => {
    if (!noiseBuffer) { noiseBuffer = a.createBuffer(1, a.sampleRate * 3, a.sampleRate); const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuffer;
  };
  const introStart = (offset = 0) => {
    if (!enabled() || intro) return;
    const a = ctx(); if (!a) return;
    if (a.state === 'suspended') a.resume();
    const out = a.createGain(); out.gain.value = 1; out.connect(a.destination);
    const nodes = [];
    const t0 = a.currentTime - offset;
    const begin = (s) => Math.max(t0 + s, a.currentTime + 0.001);
    const osc = (type, f0, f1, s, dur, gain, attack = 0.02) => {
      if (s + dur < offset) return;
      const st = begin(s), o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, st);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, st + dur);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(gain, st + attack); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(g).connect(out); o.start(st); o.stop(st + dur + 0.05); nodes.push(o);
    };
    const hiss = (s, dur, gain, f0, f1, q = 0.7, type = 'lowpass') => {
      if (s + dur < offset) return;
      const st = begin(s), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = getNoise(a); src.loop = true; f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, st); f.frequency.exponentialRampToValueAtTime(f1, st + dur);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(gain, st + Math.min(0.03, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      src.connect(f).connect(g).connect(out); src.start(st); src.stop(st + dur + 0.05); nodes.push(src);
    };
    // calm cruise
    osc('sawtooth', 55, 57, 0, 6.2, 0.028, 2.5); osc('sine', 110, 110, 0, 6.2, 0.03, 2.5); hiss(0, 6, 0.012, 900, 900);
    // the attack: each shot whooshes in and lands 0.75 s later
    [3.5, 3.9, 4.3, 4.7, 5.0].forEach((s) => {
      osc('sawtooth', 900, 180, s, 0.5, 0.045); hiss(s, 0.5, 0.04, 3000, 500, 1, 'bandpass');
      osc('sine', 110, 40, s + 0.75, 0.35, 0.16); hiss(s + 0.75, 0.25, 0.1, 1800, 200);
    });
    // the ship tears apart
    for (let i = 0; i < 12; i++) { const s = 5.5 + i * 0.17; hiss(s, 0.5, 0.12, 2200, 160); osc('sine', 80, 35, s, 0.4, 0.09); }
    hiss(6.3, 2.8, 0.3, 2600, 90); osc('sine', 60, 28, 6.3, 2.6, 0.32); hiss(6.6, 2.4, 0.07, 500, 120);
    // the crew's ghosts rise
    for (const f of [164.8, 246.9, 329.6, 392]) osc('sine', f, f, 6.9, 3.6, 0.022, 1.6);
    osc('sine', 1318.5, 1318.5, 7.4, 2.8, 0.008, 1.3);
    // the bot launches
    hiss(8.6, 1.7, 0.12, 300, 3500, 1.2, 'bandpass'); hiss(8.8, 2.6, 0.045, 1200, 800);
    osc('square', 600, 1200, 8.7, 0.12, 0.025); osc('square', 800, 1600, 8.95, 0.12, 0.025);
    // the title
    osc('sine', 65.4, 65.4, 11.5, 2.6, 0.08, 1.3);
    osc('sine', 523.25, 523.25, 11.8, 2.3, 0.07, 0.01); osc('sine', 784, 784, 11.85, 2.3, 0.05, 0.01); osc('sine', 1046.5, 1046.5, 11.9, 1.9, 0.03, 0.01);
    intro = { out, nodes };
  };
  const introStop = () => {
    if (!intro) return;
    const a = ctx(), { out, nodes } = intro;
    intro = null;
    out.gain.cancelScheduledValues(a.currentTime); out.gain.setValueAtTime(out.gain.value, a.currentTime); out.gain.linearRampToValueAtTime(0, a.currentTime + 0.25);
    setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } } try { out.disconnect(); } catch { /* gone */ } }, 400);
  };

  document.addEventListener('visibilitychange', () => { if (ac) (document.hidden ? ac.suspend() : ac.resume()).catch(() => {}); });

  return {
    ambientOn, ambientOff, introStart, introStop,
    join() { tone(392, 0.16, 'sine', 0.05); tone(294, 0.3, 'sine', 0.05, 0, 0.12); },
    // Brighter hiss during Nitro, muffled during Slow-mo.
    mood(kind) { if (amb) amb.lp.frequency.setTargetAtTime(kind === 'nitro' ? 2600 : kind === 'slowmo' ? 650 : 1400, ac.currentTime, 0.25); },
    state() { return { ambient: !!amb, intro: !!intro, context: ac ? ac.state : 'none' }; },
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
