/* ============================================================================
 * Puppy Runner — ASSETS
 * Optional image/audio overrides with graceful procedural/synth fallback.
 * Drop files into /assets using the names in ASSETS.md and they're picked up
 * automatically; anything missing simply falls back to the built-in art/audio.
 *
 * - Obstacle sprites:   assets/obstacles/<id>.png         (transparent)
 * - Puppy run cycle:    assets/puppy/<skin>.frames.png    (uniform strip;
 *                       produced from an AI sheet via tools/slice-puppy.js)
 * - SFX overrides:      assets/audio/<name>.mp3
 * ==========================================================================*/
(function (global) {
  'use strict';

  const D = global.PR_DATA;
  const hasImage = typeof global.Image !== 'undefined';
  const hasAudio = typeof global.Audio !== 'undefined';

  const imgs = {};          // key -> HTMLImageElement
  const audioEls = {};      // name -> base HTMLAudioElement
  const audioReady = {};    // name -> bool

  // puppy run-cycle strips: skin id -> { src, frames }
  const PUPPY = {
    classic: { src: 'assets/puppy/classic.frames.png', frames: 10 },
  };
  // SFX clip overrides (synth used when absent): name -> src
  const SFX_SRC = {
    gameover: 'assets/audio/gameover.mp3',
    go: 'assets/audio/go.mp3',
  };

  function loadImage(key, src) {
    if (!hasImage) return;
    const im = new global.Image();
    im.decoding = 'async';
    im.onerror = () => { delete imgs[key]; };
    im.src = src;
    imgs[key] = im;
  }

  function loadAudio(name, src) {
    if (!hasAudio) return;
    try {
      const a = new global.Audio();
      a.preload = 'auto';
      a.addEventListener('canplaythrough', () => { audioReady[name] = true; }, { once: true });
      a.addEventListener('error', () => { audioReady[name] = false; });
      a.src = src;
      audioEls[name] = a;
    } catch (e) { /* ignore */ }
  }

  function preload() {
    // obstacle sprites for every known obstacle id (missing ones just fail)
    (D.OBSTACLES || []).forEach((o) => loadImage('obs:' + o.id, 'assets/obstacles/' + o.id + '.png'));
    // puppy run strips
    Object.keys(PUPPY).forEach((id) => loadImage('puppy:' + id, PUPPY[id].src));
    // sfx overrides
    Object.keys(SFX_SRC).forEach((n) => loadAudio(n, SFX_SRC[n]));
  }

  // a loaded, usable image or null
  function img(key) {
    const im = imgs[key];
    return im && im.complete && im.naturalWidth > 0 ? im : null;
  }

  // puppy strip info or null: { img, frames, fw, fh }
  function puppy(skinId) {
    const meta = PUPPY[skinId];
    if (!meta) return null;
    const im = img('puppy:' + skinId);
    if (!im) return null;
    return { img: im, frames: meta.frames, fw: im.naturalWidth / meta.frames, fh: im.naturalHeight };
  }

  // play an SFX override; returns true if handled (so synth is skipped)
  function playSfx(name, vol) {
    if (!hasAudio || !audioReady[name]) return false;
    const base = audioEls[name];
    if (!base) return false;
    try {
      const node = base.cloneNode(true);
      node.volume = Math.max(0, Math.min(1, vol));
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
      return true;
    } catch (e) { return false; }
  }

  global.PR_ASSETS = { preload, img, puppy, playSfx };
})(window);
