/* ============================================================================
 * Puppy Runner — DATA
 * Central, declarative configuration: tuning constants, worlds, cosmetics,
 * achievements, daily rewards. Everything else reads from here.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* --------------------------- Core tuning --------------------------- */
  const CONFIG = {
    WORLD_H: 720,            // logical render height (px). Canvas scales to fit.
    groundRatio: 0.83,       // ground line as fraction of WORLD_H
    playerXRatio: 0.24,      // puppy horizontal position as fraction of width

    gravity: 2650,           // px/s^2
    jumpVel: -930,           // initial jump velocity
    doubleJumpVel: -820,     // second jump velocity
    maxFall: 1700,
    slideTime: 0.62,         // seconds
    coyoteTime: 0.10,        // grace after leaving ground
    jumpBuffer: 0.12,        // grace before landing

    baseSpeed: 470,          // starting scroll speed (px/s)
    maxSpeed: 1180,          // speed cap
    speedPerMeter: 0.30,     // speed gained per meter travelled
    metersPerPx: 0.04,       // distance conversion (px -> meters)

    spawnBase: 1.35,         // base seconds between obstacles
    spawnMin: 0.62,          // minimum gap at high speed

    magnetRadius: 240,
    comboDecay: 2.4,         // seconds without pickup before combo cools

    // power-up durations (seconds)
    dur: { magnet: 9, shield: 0, speed: 6, slowmo: 6, double: 10, giant: 8 },
  };

  /* ------------------------------ Worlds ----------------------------- */
  // Each world is a palette + weather + music profile. The active world is
  // derived from the player's level; it transitions smoothly mid-run.
  const WORLDS = [
    {
      id: 'meadows', name: 'Green Meadows', unlock: 1, weather: 'leaves',
      sky: ['#7fd4ff', '#cdf3c9'], far: '#9bd98f', mid: '#6fc06a', near: '#4fa356',
      ground: '#6b4a2f', groundTop: '#7ec96f', accent: '#ffd966',
      music: { root: 0, scale: [0, 2, 4, 7, 9], tempo: 116, wave: 'triangle' },
    },
    {
      id: 'forest', name: 'Sunny Forest', unlock: 2, weather: 'leaves',
      sky: ['#a8e6cf', '#ffd3a5'], far: '#5a9b6b', mid: '#3f7d52', near: '#2f5e3d',
      ground: '#4a3322', groundTop: '#3f7d52', accent: '#ffe08a',
      music: { root: 2, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 120, wave: 'triangle' },
    },
    {
      id: 'snow', name: 'Snow Land', unlock: 3, weather: 'snow',
      sky: ['#bfe3ff', '#eef6ff'], far: '#cfe2f2', mid: '#aecbe6', near: '#d8ebfb',
      ground: '#9fb6cc', groundTop: '#f4fbff', accent: '#7fc8ff',
      music: { root: 4, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 104, wave: 'sine' },
    },
    {
      id: 'desert', name: 'Desert Run', unlock: 4, weather: 'sand',
      sky: ['#ffd89b', '#ff9a76'], far: '#e6a86b', mid: '#d8924f', near: '#c97c38',
      ground: '#a86438', groundTop: '#e2b169', accent: '#fff0b3',
      music: { root: 5, scale: [0, 1, 4, 5, 7, 8, 11], tempo: 124, wave: 'sawtooth' },
    },
    {
      id: 'candy', name: 'Candy World', unlock: 5, weather: 'bubbles',
      sky: ['#ffc8f0', '#c9b6ff'], far: '#ff9ad8', mid: '#ff7fc4', near: '#ff5fb0',
      ground: '#a85aa0', groundTop: '#ffa6e0', accent: '#fff27a',
      music: { root: 7, scale: [0, 2, 4, 7, 9], tempo: 132, wave: 'square' },
    },
    {
      id: 'volcano', name: 'Volcano Zone', unlock: 6, weather: 'embers',
      sky: ['#ff7a5c', '#3a1622'], far: '#7a2b2b', mid: '#5a1f24', near: '#3c161c',
      ground: '#2a1015', groundTop: '#7a2b2b', accent: '#ffae3b',
      music: { root: 9, scale: [0, 1, 3, 5, 6, 8, 10], tempo: 128, wave: 'sawtooth' },
    },
    {
      id: 'cyber', name: 'Cyber City', unlock: 7, weather: 'rain',
      sky: ['#1b2a6b', '#0a0f2e'], far: '#22306e', mid: '#161e4a', near: '#0d1230',
      ground: '#0a0c1c', groundTop: '#27e0ff', accent: '#ff4fd8',
      music: { root: 2, scale: [0, 3, 5, 7, 10], tempo: 138, wave: 'square' },
    },
    {
      id: 'space', name: 'Space Station', unlock: 8, weather: 'stars',
      sky: ['#1a1140', '#05030f'], far: '#241a52', mid: '#160f33', near: '#0b0820',
      ground: '#08060f', groundTop: '#6f5cff', accent: '#7fffe0',
      music: { root: 0, scale: [0, 2, 4, 6, 8, 10], tempo: 110, wave: 'sine' },
    },
  ];

  /* ----------------------- Obstacle definitions ---------------------- */
  // type, size (logical px), behaviour. Unlock = min level the type appears.
  const OBSTACLES = [
    { id: 'crate',  w: 64,  h: 64,  kind: 'ground', unlock: 1, color: '#b07a42' },
    { id: 'rock',   w: 74,  h: 56,  kind: 'ground', unlock: 1, color: '#8d8d96' },
    { id: 'stump',  w: 70,  h: 78,  kind: 'ground', unlock: 2, color: '#7a5230' },
    { id: 'fence',  w: 96,  h: 96,  kind: 'tall',   unlock: 2, color: '#caa472' },
    { id: 'barrel', w: 70,  h: 70,  kind: 'roll',   unlock: 4, color: '#c0552e' },
    { id: 'spikes', w: 110, h: 44,  kind: 'ground', unlock: 5, color: '#d0d4dc' },
    { id: 'drone',  w: 76,  h: 56,  kind: 'fly',    unlock: 6, color: '#39e6ff' },
    { id: 'saw',    w: 84,  h: 84,  kind: 'roll',   unlock: 7, color: '#cfd6e0' },
  ];

  /* -------------------------- Power-up types ------------------------- */
  const POWERUPS = [
    { id: 'magnet', name: 'Magnet',       icon: '🧲', color: '#ff5d8f' },
    { id: 'shield', name: 'Shield',       icon: '🛡️', color: '#3ad1ff' },
    { id: 'speed',  name: 'Speed Boost',  icon: '⚡', color: '#ffd23a' },
    { id: 'slowmo', name: 'Slow Motion',  icon: '🐢', color: '#9b8cff' },
    { id: 'double', name: 'Double Score', icon: '✖️2', color: '#5dff9b' },
    { id: 'giant',  name: 'Giant Puppy',  icon: '🐘', color: '#ff8a3a' },
  ];

  /* --------------------------- Cosmetics ----------------------------- */
  // Skins drive the puppy's colours. body/belly/ear + optional special flag.
  const SKINS = [
    { id: 'classic', name: 'Classic Puppy', cost: 0,    body: '#e0a96d', belly: '#f6dcc0', ear: '#c98a4f', nose: '#3a2a22' },
    { id: 'snow',    name: 'Snow Pup',      cost: 250,  body: '#f4f7fb', belly: '#ffffff', ear: '#d6e2ee', nose: '#caa6c0' },
    { id: 'shadow',  name: 'Shadow',        cost: 400,  body: '#3a3f55', belly: '#565d7a', ear: '#2a2e40', nose: '#11131c' },
    { id: 'golden',  name: 'Golden Puppy',  cost: 900,  body: '#ffcf3a', belly: '#fff0a8', ear: '#e0a800', nose: '#7a5500', shine: true },
    { id: 'ninja',   name: 'Ninja Puppy',   cost: 1200, body: '#2b2f3a', belly: '#3c4150', ear: '#1c1f28', nose: '#0a0c12', mask: '#e23b4e' },
    { id: 'pirate',  name: 'Pirate Puppy',  cost: 1400, body: '#b9763f', belly: '#e8c79a', ear: '#8a5326', nose: '#3a2a22' },
    { id: 'robot',   name: 'Robot Puppy',   cost: 2000, body: '#9aa6b8', belly: '#c4cedd', ear: '#7c8799', nose: '#2a3140', robot: true },
    { id: 'super',   name: 'Super Puppy',   cost: 2600, body: '#3a7bff', belly: '#bcd4ff', ear: '#2a5fd0', nose: '#1a2a55', cape: '#ff3b5b' },
  ];

  const HATS = [
    { id: 'none',   name: 'None',        cost: 0,    draw: null },
    { id: 'cap',    name: 'Ball Cap',    cost: 120,  draw: 'cap',   color: '#e2474f' },
    { id: 'party',  name: 'Party Hat',   cost: 200,  draw: 'party', color: '#ffd23a' },
    { id: 'tophat', name: 'Top Hat',     cost: 450,  draw: 'tophat',color: '#23262f' },
    { id: 'crown',  name: 'Royal Crown', cost: 1500, draw: 'crown', color: '#ffd23a' },
    { id: 'halo',   name: 'Halo',        cost: 1800, draw: 'halo',  color: '#fff6a8' },
  ];

  const GLASSES = [
    { id: 'none',  name: 'None',         cost: 0,   draw: null },
    { id: 'shades',name: 'Cool Shades',  cost: 150, draw: 'shades' },
    { id: 'nerd',  name: 'Smarty Specs', cost: 150, draw: 'nerd' },
    { id: 'eye',   name: 'Eye Patch',    cost: 300, draw: 'eye' },
    { id: 'visor', name: 'Cyber Visor',  cost: 700, draw: 'visor' },
  ];

  const TRAILS = [
    { id: 'dust',    name: 'Dusty Trail', cost: 0,    colors: ['#d9c4a8'], style: 'dust' },
    { id: 'sparkle', name: 'Sparkles',    cost: 200,  colors: ['#fff7a8', '#ffd23a'], style: 'spark' },
    { id: 'rainbow', name: 'Rainbow',     cost: 600,  colors: ['#ff5d5d','#ffb03a','#ffe23a','#5dff9b','#3ad1ff','#9b8cff'], style: 'spark' },
    { id: 'fire',    name: 'Blazing',     cost: 800,  colors: ['#ff3b1f','#ff8a1f','#ffd23a'], style: 'fire' },
    { id: 'bubbles', name: 'Bubbles',     cost: 500,  colors: ['#bff0ff','#7fdcff'], style: 'bubble' },
    { id: 'stars',   name: 'Stardust',    cost: 1000, colors: ['#fff','#9b8cff','#7fffe0'], style: 'star' },
  ];

  const COSMETICS = { skin: SKINS, hat: HATS, glasses: GLASSES, trail: TRAILS };

  /* ------------------------- Daily rewards --------------------------- */
  const DAILY_REWARDS = [
    { day: 1, bones: 50,  coins: 0,  icon: '🦴' },
    { day: 2, bones: 80,  coins: 0,  icon: '🦴' },
    { day: 3, bones: 0,   coins: 30, icon: '🪙' },
    { day: 4, bones: 150, coins: 0,  icon: '🦴' },
    { day: 5, bones: 0,   coins: 60, icon: '🪙' },
    { day: 6, bones: 250, coins: 0,  icon: '🎁' },
    { day: 7, bones: 500, coins: 100,icon: '👑', cosmetic: true },
  ];

  /* --------------------------- Leaderboard --------------------------- */
  // Names used to seed the simulated "global" board for flavour.
  const BOT_NAMES = [
    'RexRunner', 'BellaBolt', 'MaxSpeed', 'LunaLeap', 'CocoDash', 'BuddyBlitz',
    'DaisyDart', 'RockyRush', 'MillieMile', 'ZeusZoom', 'NaliaNitro', 'TobyTurbo',
    'GingerGo', 'ScoutSprint', 'PepperPace', 'OllieOrbit', 'RubyRocket', 'CharlieChase',
  ];

  /* --------------------------- XP / Levels --------------------------- */
  function xpForLevel(level) {
    // Smoothly increasing curve.
    return Math.floor(120 * Math.pow(level, 1.45) + 80 * level);
  }

  /* --------------------------- Achievements -------------------------- */
  // Built from compact tier specs so we comfortably exceed 50 entries while
  // staying data-driven. Each becomes { id, name, desc, icon, reward, check }.
  function buildAchievements() {
    const list = [];
    const add = (id, name, desc, icon, reward, check) =>
      list.push({ id, name, desc, icon, reward, check });

    // -- one-off milestones --
    add('first_run', 'First Steps', 'Finish your first run', '🐾', 50, s => s.runs >= 1);
    add('perfect', 'Perfect Runner', 'Run 1000m without a single hit', '💎', 300, (s, r) => r && r.noHit && r.distance >= 1000);
    add('speed_demon', 'Speed Demon', 'Reach maximum running speed', '🔥', 250, (s, r) => r && r.maxedSpeed);
    add('shopper', 'Window Shopper', 'Buy something from the shop', '🛍️', 60, s => s.purchases >= 1);
    add('collector', 'Fashionista', 'Own 4 different skins', '👗', 200, s => s.skinsOwned >= 4);
    add('stylist', 'Trendsetter', 'Own every skin', '🌟', 800, s => s.skinsOwned >= SKINS.length);
    add('magnetic', 'Magnetic', 'Collect 40 items in one magnet', '🧲', 150, (s, r) => r && r.magnetMax >= 40);
    add('giant_steps', 'Giant Steps', 'Stomp 10 obstacles as Giant Puppy', '🐘', 150, (s, r) => r && r.giantStomps >= 10);
    add('night_owl', 'Night Owl', 'Play the Cyber City world', '🌃', 120, s => s.worldsVisited && s.worldsVisited.cyber);
    add('space_cadet', 'Space Cadet', 'Reach the Space Station', '🚀', 400, s => s.worldsVisited && s.worldsVisited.space);
    add('mystery_lover', 'Lucky Paws', 'Open 25 mystery boxes', '🎁', 200, s => s.mysteryBoxes >= 25);
    add('comeback', 'Daily Devotion', 'Reach a 7-day login streak', '📅', 400, s => s.dailyStreak >= 7);

    // -- tiered milestones --
    const tier = (key, label, icon, vals, statFn, reward) =>
      vals.forEach((v, i) =>
        add(`${key}_${v}`, `${label} ${['I','II','III','IV','V'][i] || ''}`.trim(),
          `${label}: ${v.toLocaleString()}`, icon, reward(v),
          (s, r) => statFn(s, r) >= v));

    tier('bones', 'Bone Hoarder', '🦴', [50, 500, 2500, 10000, 50000], s => s.totalBones, v => Math.round(v / 20));
    tier('coins', 'Coin Counter', '🪙', [100, 1000, 5000], s => s.totalCoins, v => Math.round(v / 25));
    tier('dist1', 'Marathoner', '🏃', [500, 1500, 3000, 6000, 12000], (s, r) => r ? r.distance : 0, v => Math.round(v / 10));
    tier('distT', 'Globe Trotter', '🌍', [10000, 50000, 200000], s => s.totalDistance, v => Math.round(v / 100));
    tier('level', 'Rising Star', '⭐', [3, 5, 7, 9, 10], s => s.level, v => v * 30);
    tier('runs', 'Persistent Pup', '🎮', [5, 25, 100, 250], s => s.runs, v => v * 4);
    tier('combo', 'Combo King', '🔗', [10, 25, 50, 100], (s, r) => r ? r.bestCombo : 0, v => v * 6);
    tier('survive', 'Survivor', '⏱️', [60, 180, 300, 600], (s, r) => r ? r.time : 0, v => v);
    tier('dodge', 'Dodger', '🤸', [100, 1000, 5000], s => s.obstaclesDodged, v => Math.round(v / 5));
    tier('power', 'Power Player', '✨', [10, 50, 200], s => s.powerupsUsed, v => v * 3);

    return list;
  }

  const ACHIEVEMENTS = buildAchievements();

  global.PR_DATA = {
    CONFIG, WORLDS, OBSTACLES, POWERUPS,
    SKINS, HATS, GLASSES, TRAILS, COSMETICS,
    DAILY_REWARDS, BOT_NAMES, ACHIEVEMENTS, xpForLevel,
  };
})(window);
