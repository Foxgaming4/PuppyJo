/* ============================================================================
 * Puppy Runner — MAIN (bootstrap)
 * Loads the save, applies audio settings, boots the engine + UI, registers the
 * service worker for offline / installable PWA, and unlocks audio on first
 * user gesture (browser autoplay policy).
 * ==========================================================================*/
(function (global) {
  'use strict';

  function boot() {
    const SAVE = global.PR_SAVE;
    const AUDIO = global.PR_AUDIO;
    const GAME = global.PR_GAME;
    const UI = global.PR_UI;

    const save = SAVE.load();

    // start loading optional image/audio overrides (non-blocking; the game
    // runs on procedural art until any provided assets finish loading)
    if (global.PR_ASSETS) global.PR_ASSETS.preload();

    // apply saved audio levels (engine resumes on first gesture)
    AUDIO.ensure();
    AUDIO.setVolumes(save.settings.music / 100, save.settings.sfx / 100);

    // engine + interface
    const canvas = document.getElementById('game');
    GAME.init(canvas);
    UI.init();

    // unlock Web Audio on the first interaction anywhere
    const unlock = () => { AUDIO.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // reflect save changes on the menu — without ever forcing navigation
    // (doing so used to pop the menu open on top of a running game)
    SAVE.onChange(() => UI.onSaveChanged());

    // hide loader
    const loading = document.getElementById('loading');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);

    // PWA service worker (only over http/https — file:// can't register one)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.info('SW registration skipped:', e.message));
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
