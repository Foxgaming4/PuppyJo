/* ============================================================================
 * Puppy Runner — STORAGE
 * LocalStorage-backed persistence with a clean default schema, safe merge on
 * load (so new fields added later don't break old saves), and a tiny event so
 * the UI can refresh when the save changes. Cloud-save ready: swap save()/load()
 * to async and keep the same shape.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const KEY = 'puppyRunner.save.v1';
  const D = global.PR_DATA;

  function defaults() {
    return {
      // currency & progression
      bones: 0,            // spendable
      coins: 0,            // spendable secondary
      level: 1,
      xp: 0,

      // lifetime stats (for achievements)
      totalBones: 0,
      totalCoins: 0,
      totalPaws: 0,
      mysteryBoxes: 0,
      totalDistance: 0,
      bestDistance: 0,
      highScore: 0,
      runs: 0,
      obstaclesDodged: 0,
      powerupsUsed: 0,
      purchases: 0,
      worldsVisited: { meadows: true },

      // ownership / equip
      owned: {
        skin: ['classic'],
        hat: ['none'],
        glasses: ['none'],
        trail: ['dust'],
      },
      equipped: { skin: 'classic', hat: 'none', glasses: 'none', trail: 'dust' },
      worldUnlocked: ['meadows'],
      selectedWorld: 'meadows',

      achievements: {},      // id -> true when claimed/earned

      // daily rewards
      dailyStreak: 0,
      lastClaim: null,       // 'YYYY-MM-DD'

      // leaderboard (local). entries: {name, score, level, dist, ts}
      scores: [],

      // settings
      settings: {
        music: 60, sfx: 80, shake: true, particles: true, fps: false,
        name: 'Player',
      },

      created: Date.now(),
    };
  }

  // recursive default-fill so new schema keys appear on old saves
  function fill(target, def) {
    for (const k in def) {
      if (!(k in target)) {
        target[k] = clone(def[k]);
      } else if (isPlainObject(def[k]) && isPlainObject(target[k])) {
        fill(target[k], def[k]);
      }
    }
    return target;
  }
  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  let state = defaults();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = fill(JSON.parse(raw), defaults());
      else state = defaults();
    } catch (e) {
      console.warn('Save load failed, starting fresh.', e);
      state = defaults();
    }
    // derive convenience stat
    state.skinsOwned = state.owned.skin.length;
    return state;
  }

  let saveTimer = null;
  function save() {
    state.skinsOwned = state.owned.skin.length;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Save failed (storage full or blocked).', e);
    }
    emit();
  }
  // debounce frequent saves
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (_) {} }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function reset() {
    state = defaults();
    save();
  }

  /* ----------------------------- helpers ----------------------------- */
  const get = () => state;

  function addBones(n) { state.bones += n; if (n > 0) state.totalBones += n; }
  function addCoins(n) { state.coins += n; if (n > 0) state.totalCoins += n; }

  function spend(n, currency = 'bones') {
    if (state[currency] < n) return false;
    state[currency] -= n;
    save();
    return true;
  }

  function own(cat, id) { return state.owned[cat] && state.owned[cat].includes(id); }
  function addOwned(cat, id) {
    if (!state.owned[cat]) state.owned[cat] = [];
    if (!state.owned[cat].includes(id)) state.owned[cat].push(id);
  }
  function equip(cat, id) { state.equipped[cat] = id; save(); }

  function unlockWorld(id) {
    if (!state.worldUnlocked.includes(id)) state.worldUnlocked.push(id);
  }
  function worldIsUnlocked(id) { return state.worldUnlocked.includes(id); }

  /* --------------------------- XP / leveling ------------------------- */
  // Returns { leveled:[..levels..], unlockedWorlds:[ids] }
  function addXP(amount) {
    const out = { leveled: [], unlockedWorlds: [] };
    state.xp += amount;
    let need = D.xpForLevel(state.level);
    while (state.xp >= need) {
      state.xp -= need;
      state.level += 1;
      out.leveled.push(state.level);
      // unlock any world whose requirement is now met
      D.WORLDS.forEach((w) => {
        if (w.unlock === state.level && !worldIsUnlocked(w.id)) {
          unlockWorld(w.id);
          out.unlockedWorlds.push(w.id);
        }
      });
      need = D.xpForLevel(state.level);
    }
    return out;
  }
  function xpProgress() {
    const need = D.xpForLevel(state.level);
    return { cur: state.xp, need, pct: Math.max(0, Math.min(1, state.xp / need)) };
  }

  /* ----------------------------- scores ------------------------------ */
  function recordScore(entry) {
    entry.ts = Date.now();
    state.scores.push(entry);
    // keep most recent 200 to bound storage
    state.scores.sort((a, b) => b.score - a.score);
    if (state.scores.length > 200) state.scores.length = 200;
  }

  global.PR_SAVE = {
    load, save, saveSoon, reset, get, onChange,
    addBones, addCoins, spend, own, addOwned, equip,
    unlockWorld, worldIsUnlocked, addXP, xpProgress, recordScore,
  };
})(window);
