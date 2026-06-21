/* ============================================================================
 * Puppy Runner — AUDIO
 * Procedural Web Audio: no asset files, fully offline. A small synth plays an
 * adaptive chiptune loop per world plus one-shot SFX. Honors the volume / mute
 * settings from the save and auto-resumes on first user gesture (autoplay).
 * ==========================================================================*/
(function (global) {
  'use strict';

  const A = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    musicVol: 0.6,
    sfxVol: 0.8,
    started: false,
    seq: null,           // music scheduler handle
    profile: null,       // current world music profile
    nextNoteTime: 0,
    step: 0,
  };

  function ensure() {
    if (A.ctx) return;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = A.musicVol * 0.5; A.musicGain.connect(A.master);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = A.sfxVol; A.sfxGain.connect(A.master);
  }

  function resume() {
    ensure();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    A.started = true;
  }

  function setVolumes(music, sfx) {
    A.musicVol = music; A.sfxVol = sfx;
    if (A.musicGain) A.musicGain.gain.value = music * 0.5;
    if (A.sfxGain) A.sfxGain.gain.value = sfx;
  }

  /* ------------------------------- SFX ------------------------------- */
  // Generic tone with envelope.
  function tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + delay;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.25, hp = 800) {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime;
    const n = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, n, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = A.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(A.sfxGain);
    src.start(t0);
  }

  const SFX = {
    jump()    { tone(420, 0.18, 'square', 0.25, 760); },
    djump()   { tone(620, 0.16, 'square', 0.22, 1020); },
    slide()   { noise(0.18, 0.18, 1200); },
    coin()    { tone(880, 0.08, 'square', 0.22, 1320); tone(1320, 0.10, 'square', 0.18, null, 0.06); },
    bone()    { tone(540, 0.07, 'triangle', 0.28, 720); tone(820, 0.09, 'triangle', 0.22, null, 0.05); },
    paw()     { tone(700, 0.10, 'sine', 0.25, 1100); },
    mystery() { tone(500, 0.1, 'square', 0.2, 900); tone(900, 0.1, 'square', 0.2, 1300, 0.08); tone(1300, 0.12, 'square', 0.2, 1700, 0.16); },
    power()   { tone(440, 0.12, 'sawtooth', 0.25, 880); tone(660, 0.14, 'sawtooth', 0.22, 1320, 0.08); },
    hit()     { tone(180, 0.3, 'sawtooth', 0.35, 60); noise(0.25, 0.3, 300); },
    shield()  { tone(300, 0.18, 'sine', 0.3, 900); noise(0.12, 0.15, 2000); },
    smash()   { noise(0.18, 0.35, 400); tone(120, 0.18, 'square', 0.25, 60); },
    levelup() { [0, 4, 7, 12].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.16, 'triangle', 0.28, null, i * 0.09)); },
    achieve() { [0, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.18, 'square', 0.24, null, i * 0.08)); },
    button()  { tone(660, 0.05, 'square', 0.15, 880); },
    gameover(){ [0, -2, -5, -9].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.28, 'triangle', 0.28, null, i * 0.16)); },
    countdown(){ tone(700, 0.12, 'square', 0.25); },
    go()      { tone(900, 0.25, 'square', 0.3, 1300); },
  };

  function play(name) {
    if (!A.started || A.sfxVol <= 0) return;
    // use a provided audio clip if one exists, else fall back to the synth
    if (global.PR_ASSETS && global.PR_ASSETS.playSfx(name, A.sfxVol)) return;
    const fn = SFX[name];
    if (fn) fn();
  }

  /* ------------------------------ MUSIC ------------------------------ */
  // A lightweight step sequencer: bass + arpeggio derived from the world's
  // scale. Scheduled slightly ahead of time for glitch-free playback.
  function startMusic(profile) {
    A.profile = profile || A.profile;
    if (!A.ctx || !A.profile) return;
    stopMusic();
    A.step = 0;
    A.nextNoteTime = A.ctx.currentTime + 0.05;
    A.seq = setInterval(scheduleAhead, 25);
  }
  function stopMusic() {
    if (A.seq) { clearInterval(A.seq); A.seq = null; }
  }

  function scheduleAhead() {
    if (!A.ctx || !A.profile) return;
    const p = A.profile;
    const spb = 60 / p.tempo;          // seconds per beat
    const stepDur = spb / 2;           // eighth notes
    while (A.nextNoteTime < A.ctx.currentTime + 0.12) {
      playStep(A.step, A.nextNoteTime, p, stepDur);
      A.nextNoteTime += stepDur;
      A.step = (A.step + 1) % 16;
    }
  }

  function midiFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function playStep(step, time, p, stepDur) {
    if (A.musicVol <= 0) return;
    const scale = p.scale;
    const rootMidi = 48 + p.root; // bass register
    // bass on beats
    if (step % 4 === 0) {
      const deg = (step / 4) % scale.length;
      const f = midiFreq(rootMidi + scale[deg]);
      schedTone(f, stepDur * 1.8, 'triangle', 0.22, time);
    }
    // arpeggio melody
    if (step % 2 === 0 || step % 8 === 5) {
      const idx = (step * 3) % scale.length;
      const oct = step % 8 < 4 ? 12 : 24;
      const f = midiFreq(rootMidi + 12 + scale[idx] + oct);
      schedTone(f, stepDur * 0.9, p.wave || 'square', 0.10, time);
    }
    // soft hat
    if (step % 2 === 1) schedNoise(0.03, 0.04, time, 4000);
  }

  function schedTone(freq, dur, type, vol, t0) {
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.musicGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function schedNoise(dur, vol, t0, hp) {
    const n = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, n, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = A.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(A.musicGain);
    src.start(t0);
  }

  global.PR_AUDIO = {
    resume, ensure, setVolumes, play, startMusic, stopMusic,
    get started() { return A.started; },
  };
})(window);
