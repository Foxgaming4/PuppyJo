/* ============================================================================
 * Puppy Runner — GAME ENGINE
 * Canvas 2D endless runner: player physics, adaptive spawner, collisions,
 * power-ups, particles, screen shake, and fully procedural rendering of the
 * puppy and 8 themed parallax worlds with weather. Resolution-independent
 * (renders in a fixed logical height, scales to any canvas size, DPR-aware).
 * ==========================================================================*/
(function (global) {
  'use strict';

  const D = global.PR_DATA;
  const C = D.CONFIG;
  const SAVE = global.PR_SAVE;
  const AUDIO = global.PR_AUDIO;
  const ASSETS = global.PR_ASSETS;

  /* ----------------------------- utilities --------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lerpColor(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
  }

  /* ----------------------------- engine state ------------------------ */
  const G = {
    canvas: null, ctx: null, dpr: 1,
    cssW: 0, cssH: 0, scale: 1, logicalW: 1280, groundY: 0,
    mode: 'attract',         // attract | countdown | play | paused | dead
    last: 0, acc: 0,
    listeners: {},
    fps: 0, fpsAcc: 0, fpsFrames: 0,
    palette: null, targetPalette: null, paletteT: 1, worldId: null,
    weather: [], bgScroll: 0, bgScrollMid: 0, bgScrollNear: 0,
    shake: 0, flash: 0, flashColor: '255,255,255',
    particles: [], floaters: [],
    countdownT: 0, countdownShown: null,
    hudTimer: 0,
  };

  /* run-scoped state */
  let player, obstacles, collectibles, powerups, run, active, world, speed;
  let spawnTimer, collectTimer, powerTimer, distancePx, runTime, scoreParts;

  /* ----------------------------- events ------------------------------ */
  function on(ev, fn) { (G.listeners[ev] || (G.listeners[ev] = [])).push(fn); }
  function emit(ev, data) { (G.listeners[ev] || []).forEach((fn) => fn(data)); }

  /* ----------------------------- init / resize ----------------------- */
  function init(canvas) {
    G.canvas = canvas;
    G.ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    setWorldById(SAVE.get().selectedWorld || 'meadows', true);
    G.mode = 'attract';
    setupAttract();
    G.last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    const r = G.canvas.getBoundingClientRect();
    G.cssW = r.width || global.innerWidth;
    G.cssH = r.height || global.innerHeight;
    G.dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    G.canvas.width = Math.round(G.cssW * G.dpr);
    G.canvas.height = Math.round(G.cssH * G.dpr);
    G.scale = G.cssH / C.WORLD_H;
    G.logicalW = G.cssW / G.scale;
    G.groundY = C.WORLD_H * C.groundRatio;
    if (player) player.x = G.logicalW * C.playerXRatio;
  }

  /* ----------------------------- world / palette --------------------- */
  function resolvePalette(w) {
    return {
      sky0: w.sky[0], sky1: w.sky[1], far: w.far, mid: w.mid, near: w.near,
      ground: w.ground, groundTop: w.groundTop, accent: w.accent,
    };
  }
  function setWorldById(id, instant) {
    const w = D.WORLDS.find((x) => x.id === id) || D.WORLDS[0];
    world = w; G.worldId = id;
    const pal = resolvePalette(w);
    if (instant || !G.palette) { G.palette = pal; G.targetPalette = pal; G.paletteT = 1; }
    else { G.targetPalette = pal; G.paletteT = 0; }
    seedWeather(w.weather);
    emit('worldchange', w);
  }
  // current interpolated palette value for a key
  function pal(k) {
    if (G.paletteT >= 1) return G.palette[k];
    return lerpColor(G.palette[k], G.targetPalette[k], G.paletteT);
  }

  // world driven by player level: highest world whose unlock <= level
  function worldForLevel(level) {
    let w = D.WORLDS[0];
    for (const x of D.WORLDS) if (level >= x.unlock) w = x;
    return w;
  }

  /* ----------------------------- weather ----------------------------- */
  function seedWeather(kind) {
    G.weather = [];
    if (kind === 'none') return;
    const n = kind === 'stars' ? 90 : kind === 'rain' ? 120 : 70;
    for (let i = 0; i < n; i++) G.weather.push(newWeatherParticle(kind, true));
  }
  function newWeatherParticle(kind, anywhere) {
    const x = anywhere ? rand(0, G.logicalW) : rand(0, G.logicalW + 200);
    const base = { kind, x, y: rand(-50, C.WORLD_H), r: 1, vx: 0, vy: 0, a: 1, spin: rand(0, 6.28) };
    switch (kind) {
      case 'snow': base.r = rand(1.5, 4); base.vx = rand(-25, -8); base.vy = rand(28, 70); base.a = rand(0.5, 1); break;
      case 'leaves': base.r = rand(4, 8); base.vx = rand(-90, -40); base.vy = rand(20, 55); base.a = rand(0.6, 1); break;
      case 'sand': base.r = rand(1, 3); base.vx = rand(-220, -120); base.vy = rand(-12, 12); base.a = rand(0.2, 0.5); break;
      case 'embers': base.r = rand(1.5, 3.5); base.vx = rand(-60, -20); base.vy = rand(-90, -40); base.a = rand(0.4, 0.9); break;
      case 'rain': base.r = rand(6, 12); base.vx = rand(-260, -200); base.vy = rand(620, 760); base.a = rand(0.25, 0.5); break;
      case 'bubbles': base.r = rand(4, 12); base.vx = rand(-50, -10); base.vy = rand(-70, -30); base.a = rand(0.3, 0.6); break;
      case 'stars': base.r = rand(0.6, 2.2); base.vx = rand(-10, -2); base.vy = 0; base.a = rand(0.3, 1); base.tw = rand(0, 6.28); break;
    }
    return base;
  }
  function updateWeather(dt, spd) {
    const drift = spd * 0.12;
    for (const p of G.weather) {
      p.x += (p.vx - drift) * dt;
      p.y += p.vy * dt;
      p.spin += dt * 2;
      if (p.kind === 'stars') p.tw += dt * 3;
      if (p.x < -20 || p.y > C.WORLD_H + 20 || p.y < -60) {
        Object.assign(p, newWeatherParticle(p.kind, false));
        p.x = G.logicalW + rand(0, 200);
        if (p.kind === 'embers' || p.kind === 'bubbles') p.y = C.WORLD_H + rand(0, 40);
        if (p.kind === 'stars') { p.x = rand(0, G.logicalW); p.y = rand(0, C.WORLD_H * 0.7); }
      }
    }
  }

  /* ----------------------------- attract mode ------------------------ */
  function setupAttract() {
    speed = C.baseSpeed * 0.7;
    player = makePlayer();
    obstacles = []; collectibles = []; powerups = [];
    G.particles = []; G.floaters = [];
    active = { magnet: 0, speed: 0, slowmo: 0, double: 0, giant: 0, shield: false };
    distancePx = 0;
  }

  /* ----------------------------- player ------------------------------ */
  function makePlayer() {
    return {
      x: G.logicalW * C.playerXRatio, y: G.groundY, vy: 0,
      grounded: true, jumps: 2, sliding: false, slideT: 0,
      coyote: 0, buffer: 0, runPhase: 0, state: 'run',
      w: 70, hStand: 96, hSlide: 56, giant: 1, invuln: 0, dead: false,
      blink: 0, tail: 0,
    };
  }

  /* ----------------------------- run lifecycle ----------------------- */
  function startRun(opts) {
    opts = opts || {};
    const s = SAVE.get();
    // start in the selected (unlocked) world, but level still drives transitions
    setWorldById(s.selectedWorld || worldForLevel(s.level).id, true);

    player = makePlayer();
    obstacles = []; collectibles = []; powerups = [];
    G.particles = []; G.floaters = [];
    active = { magnet: 0, speed: 0, slowmo: 0, double: 0, giant: 0, shield: false };
    speed = C.baseSpeed;
    distancePx = 0; runTime = 0;
    spawnTimer = 1.1; collectTimer = 1.6; powerTimer = rand(12, 18);
    scoreParts = { dist: 0, bonus: 0 };
    G.shake = 0; G.flash = 0;
    G.runLevel = s.level;
    // rotate the unlocked-world list so the chosen world plays first, then the
    // theme cycles through the rest as distance grows (mid-run progression).
    const startId = s.selectedWorld || world.id;
    const unlocked = s.worldUnlocked.slice();
    const si = Math.max(0, unlocked.indexOf(startId));
    G.worldOrder = unlocked.slice(si).concat(unlocked.slice(0, si));
    run = {
      distance: 0, time: 0, bones: 0, coins: 0, paws: 0, mystery: 0,
      score: 0, comboCount: 0, comboMax: 1, bestCombo: 0, comboTimer: 0,
      noHit: true, maxedSpeed: false, obstaclesDodged: 0,
      magnetCount: 0, magnetMax: 0, giantStomps: 0,
      worldsVisited: {}, xpEarned: 0, levelStart: s.level,
    };
    run.worldsVisited[world.id] = true;

    G.mode = 'countdown';
    G.countdownT = 3.0; G.countdownShown = null;
    emit('runstart');
    AUDIO.startMusic(world.music);
  }

  function beginPlay() {
    G.mode = 'play';
    emit('countdown', 'GO');
    AUDIO.play('go');
  }

  function pause() { if (G.mode === 'play') { G.mode = 'paused'; emit('pause'); AUDIO.stopMusic(); } }
  function resume() {
    if (G.mode === 'paused') {
      G.mode = 'countdown'; G.countdownT = 1.5; G.countdownShown = null;
      AUDIO.startMusic(world.music);
    }
  }
  function quit() {
    G.mode = 'attract'; setupAttract(); AUDIO.stopMusic();
    setWorldById(SAVE.get().selectedWorld || 'meadows', true);
    emit('quit');
  }

  function die() {
    if (player.dead) return;
    player.dead = true;
    G.mode = 'dead';
    G.shake = 16; G.flash = 0.7; G.flashColor = '255,80,80';
    AUDIO.play('hit'); AUDIO.play('gameover'); AUDIO.stopMusic();
    burst(player.x, player.y - 50, 26, ['#ff6b6b', '#ffd23a', '#fff'], 320);
    run.score = Math.floor(scoreParts.dist + scoreParts.bonus);
    run.distance = Math.floor(distancePx * C.metersPerPx);
    run.time = Math.floor(runTime);
    run.bestCombo = run.comboMax;
    emit('gameover', run);
  }

  /* ----------------------------- input ------------------------------- */
  function inputJump() {
    if (G.mode !== 'play') return;
    player.buffer = C.jumpBuffer;
  }
  function inputSlideDown() {
    if (G.mode !== 'play') return;
    if (player.grounded) { startSlide(); }
    else { player.vy = Math.max(player.vy, 900); player.slamming = true; } // fast-fall
  }
  function inputSlideUp() {
    if (player.sliding && player.slideHeld) { player.slideHeld = false; player.slideT = Math.min(player.slideT, 0.08); }
  }
  function startSlide() {
    player.sliding = true; player.slideT = C.slideTime; player.slideHeld = true;
    player.state = 'slide';
    AUDIO.play('slide');
    if (settings().particles) for (let i = 0; i < 6; i++)
      G.particles.push(dust(player.x - 20, player.y, -1));
  }

  function doJump() {
    if (player.sliding) { player.sliding = false; player.slideT = 0; }
    if (player.jumps <= 0 && player.coyote <= 0) return;
    const first = player.grounded || player.coyote > 0;
    player.vy = first ? C.jumpVel : C.doubleJumpVel;
    player.grounded = false; player.coyote = 0;
    player.jumps = first ? 1 : 0;
    player.state = 'jump';
    AUDIO.play(first ? 'jump' : 'djump');
    if (settings().particles) for (let i = 0; i < 8; i++)
      G.particles.push(dust(player.x, player.y, 0));
  }

  /* ----------------------------- spawning ---------------------------- */
  function eligibleObstacles() {
    const lvl = SAVE.get().level;
    return D.OBSTACLES.filter((o) => o.unlock <= lvl);
  }
  // Keep every gap clearable: a full jump travels (airtime * speed) horizontally,
  // so always leave more than that (plus margin) between obstacles. Scales with
  // speed automatically, so it stays fair as the game speeds up.
  function nextObstacleDelay() {
    const airtime = 2 * Math.abs(C.jumpVel) / C.gravity;   // ~0.70s hang time
    const minGap = speed * airtime * 1.25 + 130;
    return (minGap * rand(1.0, 1.55)) / speed;
  }

  function spawnObstacle() {
    const opts = eligibleObstacles();
    const def = pick(opts);
    const lvl = SAVE.get().level;
    const x = G.logicalW + 60;
    let o = { id: def.id, kind: def.kind, w: def.w, h: def.h, color: def.color, x, passed: false, t: 0 };
    if (def.kind === 'ground' || def.kind === 'tall') {
      o.y = G.groundY - o.h;
    } else if (def.kind === 'fly') {
      // bird/drone at a height that demands sliding or staying grounded
      o.y = G.groundY - rand(115, 175);
      o.bobBase = o.y; o.bob = rand(0, 6.28);
    } else if (def.kind === 'roll') {
      o.y = G.groundY - o.h;
      o.spin = 0; o.extra = rand(30, 80); // rolls slightly faster
    }
    obstacles.push(o);

    // occasional TIGHT cluster — two low obstacles close enough to clear in a
    // single jump (never a gap you can't land in). Returns the cluster's width
    // so the spawner spaces the next obstacle from its right edge.
    let extent = def.w;
    if (lvl >= 4 && def.kind === 'ground' && Math.random() < 0.22) {
      const def2 = pick(opts.filter((d) => d.kind === 'ground'));
      const gap = rand(6, 36);
      obstacles.push({ id: def2.id, kind: def2.kind, w: def2.w, h: def2.h, color: def2.color,
        x: x + def.w + gap, y: G.groundY - def2.h, passed: false, t: 0 });
      extent = def.w + gap + def2.w;
    }
    return extent;
  }

  function spawnCollectibles() {
    const x0 = G.logicalW + 50;
    const r = Math.random();
    let type = 'bone';
    if (r < 0.10) type = 'mystery';
    else if (r < 0.28) type = 'coin';
    else if (r < 0.40) type = 'paw';
    const value = { bone: 10, coin: 5, paw: 25, mystery: 0 }[type];

    if (type === 'mystery' || type === 'paw') {
      // single floating special
      collectibles.push(mkCollect(type, x0, G.groundY - rand(120, 220), value));
      return;
    }
    // arc or line cluster of bones/coins
    const count = randi(4, 7);
    const arc = Math.random() < 0.6;
    for (let i = 0; i < count; i++) {
      let y;
      if (arc) {
        const t = i / (count - 1);
        y = G.groundY - 70 - Math.sin(t * Math.PI) * rand(120, 190);
      } else {
        y = G.groundY - rand(60, 90);
      }
      collectibles.push(mkCollect(type, x0 + i * 52, y, value));
    }
  }

  function mkCollect(type, x, y, value) {
    return { type, x, y, baseY: y, value, r: type === 'mystery' ? 24 : type === 'paw' ? 18 : 15,
      bob: rand(0, 6.28), got: false, spin: rand(0, 6.28) };
  }

  function spawnPowerup() {
    const def = pick(D.POWERUPS);
    powerups.push({ id: def.id, icon: def.icon, color: def.color,
      x: G.logicalW + 50, y: G.groundY - rand(120, 210), r: 26, bob: rand(0, 6.28), got: false });
  }

  /* ----------------------------- power-ups --------------------------- */
  function activatePower(id) {
    AUDIO.play('power');
    SAVE.get().powerupsUsed = (SAVE.get().powerupsUsed || 0) + 1;
    const def = D.POWERUPS.find((p) => p.id === id);
    if (id === 'shield') { active.shield = true; }
    else if (id === 'magnet') { active.magnet = C.dur.magnet; run.magnetCount = 0; }
    else { active[id] = C.dur[id]; }
    if (id === 'giant') run.giantStomps = run.giantStomps || 0;
    floatText(player.x, player.y - 120, def.name + '!', def.color);
    G.flash = 0.4; G.flashColor = '255,255,255';
    emit('powerstart', def);
  }
  function isInvincible() { return active.speed > 0 || active.giant > 0 || player.invuln > 0; }

  /* ----------------------------- particles --------------------------- */
  function dust(x, y, dir) {
    return { x, y, vx: rand(-40, 40) + dir * 60, vy: rand(-120, -30),
      life: rand(0.3, 0.6), max: 0.6, size: rand(3, 7), color: pal('groundTop'), g: 380, type: 'dust' };
  }
  function burst(x, y, n, colors, spread) {
    if (!settings().particles) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), sp = rand(spread * 0.3, spread);
      G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.4, 0.9), max: 0.9, size: rand(3, 7), color: pick(colors), g: 520, type: 'spark' });
    }
  }
  function floatText(x, y, text, color) {
    G.floaters.push({ x, y, text, color, life: 1, max: 1, vy: -60 });
  }
  function spawnTrail() {
    if (!settings().particles) return;
    const eq = SAVE.get().equipped.trail;
    const def = D.TRAILS.find((t) => t.id === eq) || D.TRAILS[0];
    if (player.grounded && Math.random() < 0.5 && def.style === 'dust') {
      G.particles.push(dust(player.x - 22 * player.giant, player.y, -1));
      return;
    }
    if (def.style !== 'dust' && Math.random() < 0.7) {
      const bx = player.x - 26 * player.giant, by = player.y - 46 * player.giant;
      const col = pick(def.colors);
      const sizeMul = def.style === 'fire' ? 1.4 : 1;
      G.particles.push({ x: bx + rand(-6, 6), y: by + rand(-10, 10),
        vx: rand(-120, -40), vy: def.style === 'bubble' ? rand(-50, -10) : rand(-30, 30),
        life: rand(0.35, 0.7), max: 0.7, size: rand(3, 6) * sizeMul, color: col,
        g: def.style === 'bubble' ? -60 : 60, type: def.style === 'star' ? 'star' : 'spark' });
    }
  }
  function updateParticles(dt) {
    const ps = G.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) ps.splice(i, 1);
    }
    if (ps.length > 300) ps.splice(0, ps.length - 300);
    for (let i = G.floaters.length - 1; i >= 0; i--) {
      const f = G.floaters[i];
      f.y += f.vy * dt; f.life -= dt * 0.9;
      if (f.life <= 0) G.floaters.splice(i, 1);
    }
  }

  /* ----------------------------- settings ---------------------------- */
  const settings = () => SAVE.get().settings;

  /* ----------------------------- main loop --------------------------- */
  function loop(now) {
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (dt > 0.05) dt = 0.05; // clamp to avoid tunneling on lag spikes

    // fps meter
    G.fpsAcc += dt; G.fpsFrames++;
    if (G.fpsAcc >= 0.5) { G.fps = Math.round(G.fpsFrames / G.fpsAcc); G.fpsAcc = 0; G.fpsFrames = 0; }

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // palette transition
    if (G.paletteT < 1) {
      G.paletteT = clamp(G.paletteT + dt / 1.6, 0, 1);
      if (G.paletteT >= 1) G.palette = G.targetPalette;
    }

    if (G.mode === 'attract') return updateAttract(dt);
    if (G.mode === 'paused') return;
    if (G.mode === 'dead') { updateParticles(dt); decayFx(dt); return; }

    if (G.mode === 'countdown') {
      updateWeather(dt, speed);
      updateParticles(dt);
      const prev = Math.ceil(G.countdownT);
      G.countdownT -= dt;
      const cur = Math.ceil(G.countdownT);
      if (cur !== prev && cur >= 1) { emit('countdown', cur); AUDIO.play('countdown'); }
      if (G.countdownT <= 0) beginPlay();
      // gentle idle run during countdown
      player.runPhase += dt * 10;
      return;
    }

    /* ---- PLAY ---- */
    runTime += dt;

    // speed: ramp with distance, modified by power-ups
    const meters = distancePx * C.metersPerPx;
    let target = clamp(C.baseSpeed + meters * C.speedPerMeter, C.baseSpeed, C.maxSpeed);
    if (target >= C.maxSpeed - 1 && !run.maxedSpeed) run.maxedSpeed = true;
    let curSpeed = target;
    if (active.speed > 0) curSpeed *= 1.55;
    if (active.slowmo > 0) curSpeed *= 0.55;
    speed = curSpeed;

    distancePx += speed * dt;
    scoreParts.dist += speed * dt * C.metersPerPx;

    // power-up timers
    for (const k of ['magnet', 'speed', 'slowmo', 'double', 'giant']) {
      if (active[k] > 0) {
        active[k] -= dt;
        if (active[k] <= 0) { active[k] = 0; emit('powerend', k); }
      }
    }
    // giant scale lerp
    const wantGiant = active.giant > 0 ? 1.7 : 1;
    player.giant = lerp(player.giant, wantGiant, clamp(dt * 6, 0, 1));

    updatePlayer(dt);
    updateWeather(dt, speed);
    spawnTrail();

    // spawners (distance-paced)
    spawnTimer -= dt;
    if (spawnTimer <= 0) { const extent = spawnObstacle(); spawnTimer = nextObstacleDelay() + extent / speed; }
    collectTimer -= dt;
    if (collectTimer <= 0) { spawnCollectibles(); collectTimer = rand(0.9, 1.8); }
    powerTimer -= dt;
    if (powerTimer <= 0) { spawnPowerup(); powerTimer = rand(15, 26); }

    updateObstacles(dt);
    updateCollectibles(dt);
    updatePowerups(dt);
    updateParticles(dt);
    decayFx(dt);

    // combo cool-down
    if (run.comboCount > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) run.comboCount = 0;
    }

    // mid-run world progression: advance the theme every ~700m through the
    // player's unlocked worlds, with a smooth palette/weather/music transition.
    if (G.worldOrder && G.worldOrder.length > 1) {
      const m = Math.floor(distancePx * C.metersPerPx);
      const idx = Math.floor(m / 700) % G.worldOrder.length;
      const wantId = G.worldOrder[idx];
      if (wantId !== G.worldId) {
        setWorldById(wantId);
        run.worldsVisited[wantId] = true;
        SAVE.get().worldsVisited[wantId] = true;
        emit('toast', '🗺️ ' + world.name);
        AUDIO.startMusic(world.music);
      }
    }

    // HUD throttle
    G.hudTimer -= dt;
    if (G.hudTimer <= 0) { emit('hud', hudData()); G.hudTimer = 0.06; }
  }

  function decayFx(dt) {
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2);
  }

  function updateAttract(dt) {
    speed = C.baseSpeed * 0.7;
    distancePx += speed * dt;
    player.runPhase += dt * (speed / 60);
    player.tail += dt * 8;
    player.blink -= dt;
    if (player.blink < -0.1) player.blink = rand(2, 5);
    updateWeather(dt, speed);
    spawnTrail();
    updateParticles(dt);
  }

  function hudData() {
    const sp = SAVE.xpProgress();
    const lvl = SAVE.get().level;
    const mult = comboMult();
    return {
      score: Math.floor(scoreParts.dist + scoreParts.bonus),
      combo: run.comboCount, mult,
      bones: run.bones, distance: Math.floor(distancePx * C.metersPerPx),
      level: lvl, levelName: world.name, xpPct: sp.pct,
      powerups: powerBar(),
    };
  }
  function comboMult() { return Math.min(8, 1 + Math.floor(run.comboCount / 6)); }
  function powerBar() {
    const out = [];
    const map = { magnet: C.dur.magnet, speed: C.dur.speed, slowmo: C.dur.slowmo, double: C.dur.double, giant: C.dur.giant };
    for (const k in map) if (active[k] > 0) {
      const def = D.POWERUPS.find((p) => p.id === k);
      out.push({ id: k, icon: def.icon, color: def.color, pct: active[k] / map[k] });
    }
    if (active.shield) { const def = D.POWERUPS.find((p) => p.id === 'shield'); out.push({ id: 'shield', icon: def.icon, color: def.color, pct: 1 }); }
    return out;
  }

  /* ----------------------------- player update ----------------------- */
  function updatePlayer(dt) {
    const p = player;
    p.runPhase += dt * (speed / 55);
    p.tail += dt * 10;
    p.blink -= dt; if (p.blink < -0.12) p.blink = rand(2.5, 5.5);
    if (p.invuln > 0) p.invuln -= dt;

    // buffered jump + coyote
    if (p.coyote > 0) p.coyote -= dt;
    if (p.buffer > 0) { p.buffer -= dt; if (p.grounded || p.coyote > 0) { doJump(); p.buffer = 0; } }

    // slide timer
    if (p.sliding) {
      p.slideT -= dt;
      if (p.slideT <= 0) { p.sliding = false; p.state = p.grounded ? 'run' : 'jump'; }
    }

    // gravity
    p.vy += C.gravity * dt;
    if (p.vy > C.maxFall) p.vy = C.maxFall;
    p.y += p.vy * dt;

    if (p.y >= G.groundY) {
      if (!p.grounded) { // landed
        if (settings().particles) for (let i = 0; i < 6; i++) G.particles.push(dust(p.x, G.groundY, 0));
        if (p.slamming) { G.shake = Math.max(G.shake, 4); p.slamming = false; if (!p.sliding) startSlide(); }
      }
      p.y = G.groundY; p.vy = 0; p.grounded = true; p.coyote = C.coyoteTime; p.jumps = 2;
      if (!p.sliding) p.state = 'run';
    } else {
      p.grounded = false;
      if (!p.sliding) p.state = 'jump';
    }
  }

  // current player AABB (logical)
  function playerBox() {
    const p = player;
    const h = (p.sliding ? p.hSlide : p.hStand) * p.giant;
    const w = p.w * p.giant * (p.sliding ? 1.15 : 1);
    return { x: p.x - w / 2, y: p.y - h, w, h };
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ----------------------------- obstacles update -------------------- */
  function updateObstacles(dt) {
    const pbox = playerBox();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.t = (o.t || 0) + dt;
      const sp = speed + (o.extra || 0);
      o.x -= sp * dt;
      if (o.kind === 'fly') o.y = o.bobBase + Math.sin(o.t * 4 + o.bob) * 16;
      if (o.kind === 'roll') o.spin = (o.spin || 0) + dt * (sp / 30);

      // tighter hitbox than visual for fairness
      const inset = 0.16;
      const hb = { x: o.x + o.w * inset, y: o.y + o.h * inset, w: o.w * (1 - inset * 2), h: o.h * (1 - inset * 2) };

      if (!o.passed && o.x + o.w < player.x) {
        o.passed = true;
        run.obstaclesDodged++; SAVE.get().obstaclesDodged = (SAVE.get().obstaclesDodged || 0) + 1;
        addCombo(1);
        scoreParts.bonus += 2 * comboMult();
      }

      if (!o.hit && aabb(pbox, hb)) {
        if (isInvincible()) {
          o.hit = true;
          smashObstacle(o);
          if (active.giant > 0) run.giantStomps++;
          obstacles.splice(i, 1);
          continue;
        } else if (active.shield) {
          active.shield = false; player.invuln = 1.3;
          AUDIO.play('shield'); G.flash = 0.5; G.flashColor = '120,220,255'; G.shake = 8;
          floatText(player.x, player.y - 130, 'Shield!', '#3ad1ff');
          burst(o.x + o.w / 2, o.y + o.h / 2, 18, ['#3ad1ff', '#fff'], 280);
          o.hit = true; obstacles.splice(i, 1);
          run.comboCount = 0;
          continue;
        } else {
          run.noHit = false;
          die();
          return;
        }
      }
      if (o.x + o.w < -80) obstacles.splice(i, 1);
    }
  }
  function smashObstacle(o) {
    AUDIO.play('smash');
    G.shake = Math.max(G.shake, 6);
    burst(o.x + o.w / 2, o.y + o.h / 2, 16, [o.color, '#fff', pal('accent')], 300);
    scoreParts.bonus += 15 * comboMult();
    floatText(o.x, o.y, '+' + 15 * comboMult(), pal('accent'));
  }

  function addCombo(n) {
    run.comboCount += n;
    run.comboTimer = C.comboDecay;
    const m = comboMult();
    if (m > run.comboMax) run.comboMax = m;
  }

  /* ----------------------------- collectibles update ----------------- */
  function updateCollectibles(dt) {
    const pbox = playerBox();
    const pcx = player.x, pcy = player.y - 50 * player.giant;
    for (let i = collectibles.length - 1; i >= 0; i--) {
      const c = collectibles[i];
      c.x -= speed * dt;
      c.bob += dt * 4; c.spin += dt * 3;
      let cy = c.baseY + Math.sin(c.bob) * 6;

      // magnet attraction
      if (active.magnet > 0) {
        const dx = pcx - c.x, dy = pcy - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < C.magnetRadius) {
          const pull = (1 - dist / C.magnetRadius) * 900;
          c.x += (dx / dist) * pull * dt;
          c.baseY += (dy / dist) * pull * dt;
          cy = c.baseY;
        }
      }
      c.cy = cy;

      const cb = { x: c.x - c.r, y: cy - c.r, w: c.r * 2, h: c.r * 2 };
      if (!c.got && aabb(pbox, cb)) { collect(c); collectibles.splice(i, 1); continue; }
      if (c.x < -60) collectibles.splice(i, 1);
    }
  }
  function collect(c) {
    addCombo(1);
    const m = comboMult();
    const dbl = active.double > 0 ? 2 : 1;
    if (active.magnet > 0) { run.magnetCount++; if (run.magnetCount > run.magnetMax) run.magnetMax = run.magnetCount; }

    if (c.type === 'bone') {
      run.bones++; SAVE.addBones(1); scoreParts.bonus += 10 * m * dbl; AUDIO.play('bone');
      burst(c.x, c.cy, 5, ['#fff', pal('accent')], 120);
    } else if (c.type === 'coin') {
      run.coins++; SAVE.addCoins(1); scoreParts.bonus += 5 * m * dbl; AUDIO.play('coin');
      burst(c.x, c.cy, 5, ['#ffd23a', '#fff'], 120);
    } else if (c.type === 'paw') {
      run.paws++; scoreParts.bonus += 25 * m * dbl; AUDIO.play('paw');
      SAVE.get().totalPaws = (SAVE.get().totalPaws || 0) + 1;
      floatText(c.x, c.cy, '+25', '#ff8ad8');
      burst(c.x, c.cy, 8, ['#ff8ad8', '#fff'], 160);
    } else if (c.type === 'mystery') {
      const reward = mysteryReward();
      AUDIO.play('mystery'); run.mystery++;
      SAVE.get().mysteryBoxes = (SAVE.get().mysteryBoxes || 0) + 1;
      floatText(c.x, c.cy - 10, reward.label, '#9b8cff');
      burst(c.x, c.cy, 16, ['#9b8cff', '#fff', '#5dff9b'], 240);
      reward.apply();
    }
    SAVE.saveSoon();
  }
  function mysteryReward() {
    const r = Math.random();
    if (r < 0.35) { const n = randi(10, 30); return { label: '+' + n + ' 🦴', apply: () => { run.bones += n; SAVE.addBones(n); } }; }
    if (r < 0.6) { const n = randi(10, 25); return { label: '+' + n + ' 🪙', apply: () => { run.coins += n; SAVE.addCoins(n); } }; }
    if (r < 0.85) { const p = pick(D.POWERUPS); return { label: p.icon + ' ' + p.name, apply: () => activatePower(p.id) }; }
    const n = randi(80, 200); return { label: '+' + n + ' pts', apply: () => { scoreParts.bonus += n; } };
  }

  /* ----------------------------- powerups update --------------------- */
  function updatePowerups(dt) {
    const pbox = playerBox();
    for (let i = powerups.length - 1; i >= 0; i--) {
      const pu = powerups[i];
      pu.x -= speed * dt; pu.bob += dt * 4;
      const cy = pu.y + Math.sin(pu.bob) * 8;
      pu.cy = cy;
      const cb = { x: pu.x - pu.r, y: cy - pu.r, w: pu.r * 2, h: pu.r * 2 };
      if (!pu.got && aabb(pbox, cb)) { activatePower(pu.id); powerups.splice(i, 1); continue; }
      if (pu.x < -60) powerups.splice(i, 1);
    }
  }

  /* ============================ RENDERING ============================ */
  function render() {
    const ctx = G.ctx;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.cssW, G.cssH);
    ctx.save();
    ctx.scale(G.scale, G.scale);

    // screen shake
    let sx = 0, sy = 0;
    if (G.shake > 0 && settings().shake) {
      sx = rand(-G.shake, G.shake); sy = rand(-G.shake, G.shake);
    }
    ctx.translate(sx, sy);

    drawBackground(ctx);
    drawGround(ctx);
    drawWeatherBehind(ctx);

    // entities
    if (G.mode !== 'attract') {
      collectibles.forEach((c) => drawCollectible(ctx, c));
      powerups.forEach((pu) => drawPowerup(ctx, pu));
      obstacles.forEach((o) => drawObstacle(ctx, o));
    }

    drawParticles(ctx);
    if (player) drawPuppyEntity(ctx);
    drawFloaters(ctx);
    drawWeatherFront(ctx);

    ctx.restore();

    // flash overlay (screen space)
    if (G.flash > 0) {
      ctx.fillStyle = `rgba(${G.flashColor},${G.flash * 0.5})`;
      ctx.fillRect(0, 0, G.cssW, G.cssH);
    }

    if (settings().fps) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(8, 8, 86, 26);
      ctx.fillStyle = '#7fffcaa0'; ctx.font = '14px monospace';
      ctx.fillText('FPS ' + G.fps, 16, 26);
    }
  }

  /* ----------------------------- background -------------------------- */
  function drawBackground(ctx) {
    const W = G.logicalW, H = C.WORLD_H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal('sky0')); g.addColorStop(1, pal('sky1'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // sun / moon glow
    const accent = pal('accent');
    ctx.save();
    ctx.globalAlpha = 0.5;
    const gx = W * 0.78, gy = H * 0.24, gr = 130;
    const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, gr);
    rg.addColorStop(0, accent); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 6.28); ctx.fill();
    ctx.restore();

    G.bgScroll -= speed * 0.05 * 0.016;
    drawHillLayer(ctx, pal('far'), 0.10, H * 0.62, 120, 'far');
    drawHillLayer(ctx, pal('mid'), 0.22, H * 0.70, 150, 'mid');
    drawHillLayer(ctx, pal('near'), 0.4, H * 0.78, 90, 'near');
  }

  function drawHillLayer(ctx, color, par, baseY, amp, key) {
    const W = G.logicalW;
    const off = (distancePx * par) % 400;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-100, C.WORLD_H);
    for (let x = -100; x <= W + 100; x += 40) {
      const wx = x + off;
      const y = baseY + Math.sin((wx) * 0.006) * amp * 0.4 + Math.sin((wx) * 0.013) * amp * 0.25;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 100, C.WORLD_H); ctx.closePath(); ctx.fill();
    drawWorldProps(ctx, par, baseY, off, key);
  }

  // themed silhouettes per world, parallax-scrolled
  function drawWorldProps(ctx, par, baseY, off, key) {
    const W = G.logicalW;
    const id = world.id;
    const spacing = key === 'near' ? 230 : 360;
    const propOff = (distancePx * par) % spacing;
    for (let i = -1; i < W / spacing + 2; i++) {
      const x = i * spacing - propOff + 60;
      const y = baseY + Math.sin((x + off) * 0.006) * 12;
      ctx.save(); ctx.translate(x, y);
      drawProp(ctx, id, key, x);
      ctx.restore();
    }
  }
  function drawProp(ctx, id, key, seed) {
    const big = key === 'near';
    const s = big ? 1 : 0.6;
    const accent = pal('accent');
    const dark = 'rgba(0,0,0,0.12)';
    switch (id) {
      case 'meadows': case 'forest': // trees
        ctx.fillStyle = id === 'forest' ? '#2f5e3d' : '#3f8a45';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26 * s, 0); ctx.lineTo(0, -90 * s); ctx.lineTo(26 * s, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -30 * s); ctx.lineTo(-22 * s, -30 * s); ctx.lineTo(0, -110 * s); ctx.lineTo(22 * s, -30 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6b4a2f'; ctx.fillRect(-5 * s, -6 * s, 10 * s, 14 * s);
        break;
      case 'snow': // pines + mountain
        if (big) { ctx.fillStyle = '#cdd9e6'; ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(0, -150); ctx.lineTo(90, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-26, -42); ctx.lineTo(0, -150); ctx.lineTo(26, -42); ctx.lineTo(10,-30); ctx.lineTo(0,-44); ctx.lineTo(-10,-30); ctx.closePath(); ctx.fill(); }
        else { ctx.fillStyle = '#8fb1c9'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-20, 0); ctx.lineTo(0, -76); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(-12, -36); ctx.lineTo(0, -76); ctx.lineTo(12, -36); ctx.closePath(); ctx.fill(); }
        break;
      case 'desert': // cactus + dune
        ctx.fillStyle = big ? '#3f7d52' : '#4f8d62';
        ctx.fillRect(-8 * s, -70 * s, 16 * s, 70 * s);
        ctx.fillRect(-26 * s, -50 * s, 14 * s, 8 * s); ctx.fillRect(-26 * s, -50 * s, 8 * s, 30 * s);
        ctx.fillRect(14 * s, -58 * s, 14 * s, 8 * s); ctx.fillRect(20 * s, -58 * s, 8 * s, 26 * s);
        break;
      case 'candy': // lollipops
        ctx.fillStyle = '#fff'; ctx.fillRect(-3 * s, -60 * s, 6 * s, 60 * s);
        ctx.fillStyle = (seed | 0) % 2 ? '#ff6bd0' : '#7fd0ff';
        ctx.beginPath(); ctx.arc(0, -70 * s, 22 * s, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(0, -70 * s, 12 * s, 0, 4); ctx.stroke();
        break;
      case 'volcano': // jagged rocks
        ctx.fillStyle = big ? '#3c161c' : '#5a1f24';
        ctx.beginPath(); ctx.moveTo(-40 * s, 0); ctx.lineTo(-10 * s, -70 * s); ctx.lineTo(8 * s, -30 * s); ctx.lineTo(30 * s, -90 * s); ctx.lineTo(48 * s, 0); ctx.closePath(); ctx.fill();
        if (big) { ctx.fillStyle = '#ffae3b'; ctx.fillRect(20 * s, -88 * s, 8, 30); }
        break;
      case 'cyber': // buildings + neon
        const bh = 90 + (Math.abs((seed * 53) % 120));
        ctx.fillStyle = big ? '#0d1230' : '#161e4a';
        ctx.fillRect(-30 * s, -bh * s, 60 * s, bh * s);
        ctx.fillStyle = accent;
        for (let wy = -bh + 12; wy < -10; wy += 18)
          for (let wx = -20; wx < 20; wx += 16)
            if ((wx + wy + seed) % 3 === 0) ctx.fillRect(wx * s, wy * s, 5 * s, 7 * s);
        break;
      case 'space': // planets / station bits
        ctx.fillStyle = big ? '#6f5cff' : '#3a2f7a';
        ctx.beginPath(); ctx.arc(0, -60 * s, 26 * s, 0, 6.28); ctx.fill();
        ctx.strokeStyle = 'rgba(127,255,224,0.5)'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.ellipse(0, -60 * s, 40 * s, 12 * s, 0.4, 0, 6.28); ctx.stroke();
        break;
    }
    ctx.fillStyle = dark;
  }

  /* ----------------------------- ground ------------------------------ */
  function drawGround(ctx) {
    const W = G.logicalW, gy = G.groundY, H = C.WORLD_H;
    // top strip
    ctx.fillStyle = pal('groundTop');
    ctx.fillRect(0, gy, W, 18);
    // body
    ctx.fillStyle = pal('ground');
    ctx.fillRect(0, gy + 18, W, H - gy);
    // moving texture stripes
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#000';
    const off = distancePx % 80;
    for (let x = -off; x < W; x += 80) ctx.fillRect(x, gy + 18, 40, H - gy);
    ctx.restore();
    // accent line
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, gy, W, 3);
  }

  /* ----------------------------- weather draw ------------------------ */
  function drawWeatherBehind(ctx) {
    // stars/rain drawn behind; others (leaves/snow) in front for depth
    for (const p of G.weather) {
      if (p.kind === 'stars') {
        ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.tw || 0));
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
      } else if (p.kind === 'rain') {
        ctx.globalAlpha = p.a; ctx.strokeStyle = '#bcd6ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawWeatherFront(ctx) {
    for (const p of G.weather) {
      if (p.kind === 'stars' || p.kind === 'rain') continue;
      ctx.globalAlpha = p.a;
      if (p.kind === 'snow' || p.kind === 'sand' || p.kind === 'embers') {
        ctx.fillStyle = p.kind === 'snow' ? '#fff' : p.kind === 'sand' ? '#e2c089' : '#ff9a3a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
      } else if (p.kind === 'leaves') {
        ctx.fillStyle = pick(['#7fbf4f', '#e0a000', '#d06a2a']);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 6.28); ctx.fill(); ctx.restore();
      } else if (p.kind === 'bubbles') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ----------------------------- particles draw ---------------------- */
  function drawParticles(ctx) {
    for (const p of G.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.type === 'star') {
        ctx.fillStyle = p.color; drawStar(ctx, p.x, p.y, p.size, p.size * 0.5, 5);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.type === 'dust' ? a : 1), 0, 6.28); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFloaters(ctx) {
    ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui, sans-serif';
    for (const f of G.floaters) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(f.text, f.x + 2, f.y + 2);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function drawStar(ctx, cx, cy, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (points * 2)) * 6.2832 - 1.5708;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }

  /* ----------------------------- collectibles draw ------------------- */
  function drawCollectible(ctx, c) {
    const y = c.cy != null ? c.cy : c.baseY;
    ctx.save(); ctx.translate(c.x, y);
    const glow = 0.5 + 0.5 * Math.sin(c.bob * 1.5);
    if (c.type === 'bone') {
      ctx.rotate(Math.sin(c.spin) * 0.3);
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 8 * glow;
      drawBone(ctx, 0, 0, c.r);
    } else if (c.type === 'coin') {
      ctx.shadowColor = '#ffd23a'; ctx.shadowBlur = 10 * glow;
      const sq = Math.cos(c.spin);
      ctx.fillStyle = '#ffb800'; ctx.beginPath(); ctx.ellipse(0, 0, c.r * Math.abs(sq), c.r, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.ellipse(0, 0, c.r * 0.6 * Math.abs(sq), c.r * 0.6, 0, 0, 6.28); ctx.fill();
    } else if (c.type === 'paw') {
      ctx.shadowColor = '#ff8ad8'; ctx.shadowBlur = 10 * glow;
      drawPaw(ctx, c.r, '#ff6bce');
    } else if (c.type === 'mystery') {
      ctx.shadowColor = '#9b8cff'; ctx.shadowBlur = 14 * glow;
      ctx.rotate(Math.sin(c.bob) * 0.15);
      const r = c.r;
      ctx.fillStyle = '#6c5ce7'; roundRect(ctx, -r, -r, r * 2, r * 2, 6); ctx.fill();
      ctx.fillStyle = '#a29bfe'; roundRect(ctx, -r, -r, r * 2, r * 0.7, 6); ctx.fill();
      ctx.fillStyle = '#ffd23a'; ctx.font = 'bold ' + (r * 1.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
  function drawBone(ctx, x, y, r) {
    ctx.fillStyle = '#fff7e6';
    const s = r / 15;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(-12, -6, 6, 0, 6.28); ctx.arc(-12, 6, 6, 0, 6.28);
    ctx.arc(12, -6, 6, 0, 6.28); ctx.arc(12, 6, 6, 0, 6.28);
    ctx.fill();
    ctx.fillRect(-12, -5, 24, 10);
    ctx.restore();
  }
  function drawPaw(ctx, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.7, r * 0.6, 0, 0, 6.28); ctx.fill();
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * 0.5, -r * 0.4, r * 0.26, 0, 6.28); ctx.fill(); }
    ctx.beginPath(); ctx.arc(r * 0.75, 0, r * 0.22, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.75, 0, r * 0.22, 0, 6.28); ctx.fill();
  }

  /* ----------------------------- powerup draw ------------------------ */
  function drawPowerup(ctx, pu) {
    const y = pu.cy != null ? pu.cy : pu.y;
    ctx.save(); ctx.translate(pu.x, y);
    const glow = 0.5 + 0.5 * Math.sin(pu.bob * 2);
    ctx.shadowColor = pu.color; ctx.shadowBlur = 18 * glow;
    // capsule bubble
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(0, 0, pu.r + 6, 0, 6.28); ctx.fill();
    ctx.fillStyle = pu.color;
    ctx.beginPath(); ctx.arc(0, 0, pu.r, 0, 6.28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = (pu.r * 1.1) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.icon, 0, 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /* ----------------------------- obstacle draw ----------------------- */
  function drawObstacle(ctx, o) {
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, G.groundY + 6, o.w * 0.5, 8, 0, 0, 6.28); ctx.fill();

    const x = o.x, y = o.y, w = o.w, h = o.h;

    // use a provided sprite if available, else draw procedurally
    const oi = ASSETS && ASSETS.img('obs:' + o.id);
    if (oi) {
      if (o.kind === 'roll') {
        ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.spin || 0);
        ctx.drawImage(oi, -w / 2, -h / 2, w, h);
      } else {
        ctx.drawImage(oi, x, y, w, h);
      }
      ctx.restore();
      return;
    }

    switch (o.id) {
      case 'crate':
        ctx.fillStyle = o.color; roundRect(ctx, x, y, w, h, 6); ctx.fill();
        ctx.strokeStyle = '#7a5226'; ctx.lineWidth = 4;
        ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w - 6, y + h - 6); ctx.moveTo(x + w - 6, y + 6); ctx.lineTo(x + 6, y + h - 6); ctx.stroke();
        break;
      case 'rock':
        ctx.fillStyle = o.color; ctx.beginPath();
        ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.15, y + h * 0.3); ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.8, y + h * 0.25); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.55, y + h * 0.4); ctx.lineTo(x + w * 0.3, y + h * 0.5); ctx.closePath(); ctx.fill();
        break;
      case 'puddle':
        ctx.fillStyle = 'rgba(40,120,180,0.85)';
        ctx.beginPath(); ctx.ellipse(x + w / 2, G.groundY, w / 2, h, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(x + w * 0.35, G.groundY - 4, w * 0.18, h * 0.4, 0, 0, 6.28); ctx.fill();
        break;
      case 'stump':
        ctx.fillStyle = o.color; roundRect(ctx, x + 6, y + 18, w - 12, h - 18, 6); ctx.fill();
        ctx.fillStyle = '#9c6b3e'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + 18, (w - 12) / 2, 12, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2;
        for (let rr = 4; rr < w / 2 - 6; rr += 6) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + 18, rr, rr * 0.5, 0, 0, 6.28); ctx.stroke(); }
        break;
      case 'fence':
        ctx.fillStyle = o.color;
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 6 + i * (w - 12) / 3, y, 12, h);
        ctx.fillRect(x, y + h * 0.25, w, 10); ctx.fillRect(x, y + h * 0.6, w, 10);
        break;
      case 'bird': case 'drone':
        drawFlyer(ctx, o);
        break;
      case 'barrel':
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.spin || 0);
        ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#7a3318'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, w / 2 - 3, 0, 6.28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.moveTo(0, -w / 2); ctx.lineTo(0, w / 2); ctx.stroke();
        ctx.restore();
        break;
      case 'spikes':
        ctx.fillStyle = o.color;
        const n = Math.floor(w / 18);
        for (let i = 0; i < n; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * 18, G.groundY); ctx.lineTo(x + i * 18 + 9, G.groundY - h); ctx.lineTo(x + i * 18 + 18, G.groundY); ctx.closePath(); ctx.fill();
        }
        break;
      case 'saw':
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.spin || 0);
        ctx.fillStyle = o.color;
        const teeth = 12, R = w / 2;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) { const rr = i % 2 ? R : R * 0.78; const a = (i / (teeth * 2)) * 6.2832; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7c8799'; ctx.beginPath(); ctx.arc(0, 0, R * 0.4, 0, 6.28); ctx.fill();
        ctx.restore();
        break;
      default:
        ctx.fillStyle = o.color; roundRect(ctx, x, y, w, h, 6); ctx.fill();
    }
    ctx.restore();
  }
  function drawFlyer(ctx, o) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2);
    const flap = Math.sin((o.t || 0) * 16) * 0.6;
    if (o.id === 'bird') {
      ctx.fillStyle = o.color;
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.32, h * 0.4, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-w * 0.4, -h * (0.4 + flap), -w * 0.5, 0); ctx.quadraticCurveTo(-w * 0.4, h * 0.1, -4, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(w * 0.4, -h * (0.4 + flap), w * 0.5, 0); ctx.quadraticCurveTo(w * 0.4, h * 0.1, 4, 0); ctx.fill();
      ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.moveTo(w * 0.3, -2); ctx.lineTo(w * 0.45, 0); ctx.lineTo(w * 0.3, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.16, -3, 3, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(w * 0.17, -3, 1.5, 0, 6.28); ctx.fill();
    } else { // drone
      ctx.fillStyle = o.color; roundRect(ctx, -w * 0.3, -h * 0.2, w * 0.6, h * 0.4, 6); ctx.fill();
      ctx.fillStyle = '#0a0c12'; ctx.fillRect(-w * 0.3, -h * 0.2, w * 0.6, h * 0.4);
      ctx.fillStyle = o.color; roundRect(ctx, -w * 0.3, -h * 0.2, w * 0.6, h * 0.16, 4); ctx.fill();
      ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.2); ctx.lineTo(-w * 0.5, -h * 0.35);
      ctx.moveTo(w * 0.3, -h * 0.2); ctx.lineTo(w * 0.5, -h * 0.35); ctx.stroke();
      ctx.fillStyle = 'rgba(207,214,224,0.6)';
      ctx.beginPath(); ctx.ellipse(-w * 0.5, -h * 0.35, w * 0.18, 3, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w * 0.5, -h * 0.35, w * 0.18, 3, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ff3b5b'; ctx.beginPath(); ctx.arc(0, h * 0.05, 4, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  /* ============================ PUPPY ============================ */
  function drawPuppyEntity(ctx) {
    const p = player;
    const eq = SAVE.get().equipped;
    const skin = D.SKINS.find((s) => s.id === eq.skin) || D.SKINS[0];

    // ground shadow (shrinks with jump height)
    const airT = clamp((G.groundY - p.y) / 260, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, G.groundY + 8, (44 - airT * 18) * p.giant, (10 - airT * 4) * p.giant, 0, 0, 6.28);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.giant, p.giant);

    // invincibility flicker
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    if (active && active.shield) drawShieldBubble(ctx);

    // use a provided sprite sheet for this skin if present, else procedural art
    const sheet = ASSETS && ASSETS.puppy(skin.id);
    if (sheet) drawPuppyImage(ctx, sheet, p);
    else drawPuppy(ctx, skin, eq, p);
    ctx.restore();
  }

  // Render the puppy from a uniform run-cycle strip (feet at y=0, facing right).
  const PUPPY_DRAW_H = 140;             // on-screen height of a frame cell
  function drawPuppyImage(ctx, sheet, p) {
    let idx;
    if (p.state === 'jump') idx = p.vy < 0 ? 2 : 6;       // ascend / descend pose
    else idx = Math.floor(p.runPhase * 1.5) % sheet.frames;
    if (idx < 0) idx = 0;

    const scale = PUPPY_DRAW_H / sheet.fh;
    const dw = sheet.fw * scale, dh = PUPPY_DRAW_H;
    const sx = idx * sheet.fw;

    ctx.save();
    if (p.state === 'slide') {
      // squash low to the ground for the slide
      ctx.scale(1.12, 0.62);
      ctx.translate(0, 14);
    } else if (p.state === 'run') {
      ctx.rotate(Math.sin(p.runPhase * 2) * 0.03);        // subtle gallop bob
    } else if (p.state === 'jump') {
      ctx.rotate(p.vy < 0 ? -0.14 : 0.1);
    }
    // feet (cell bottom) just below the ground line; horizontally centred
    ctx.drawImage(sheet.img, sx, 0, sheet.fw, sheet.fh, -dw / 2, 6 - dh, dw, dh);
    ctx.restore();
  }

  function drawShieldBubble(ctx) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.strokeStyle = 'rgba(58,209,255,0.8)'; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(58,209,255,0.12)';
    ctx.beginPath(); ctx.arc(-6, -52, 72, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(-6 + Math.cos(t * 2) * 60, -52 + Math.sin(t * 2) * 60, 4, 0, 6.28);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }

  // The puppy is built from layered rounded shapes; legs/tail/ears animate.
  function drawPuppy(ctx, skin, eq, p) {
    const run = Math.sin(p.runPhase);
    const run2 = Math.sin(p.runPhase + Math.PI);
    const state = p.state;
    const bodyTilt = state === 'slide' ? 0.0 : (state === 'jump' ? (p.vy < 0 ? -0.18 : 0.12) : Math.sin(p.runPhase * 2) * 0.03);

    ctx.save();
    ctx.rotate(bodyTilt);

    const isSlide = state === 'slide';
    const bodyY = isSlide ? -28 : -46;
    const bodyW = isSlide ? 92 : 78;
    const bodyH = isSlide ? 30 : 40;

    // ---- back legs ---- (draw behind body)
    drawLegs(ctx, skin, p, isSlide, true);

    // ---- tail ---- (behind body)
    drawTail(ctx, skin, p, isSlide);

    // ---- cape (super puppy) ----
    if (skin.cape) drawCape(ctx, skin, p);

    // ---- body ----
    ctx.fillStyle = skin.body;
    roundEllipse(ctx, -6, bodyY, bodyW / 2, bodyH / 2, 16);
    // belly patch
    ctx.fillStyle = skin.belly;
    roundEllipse(ctx, -2, bodyY + bodyH * 0.18, bodyW * 0.32, bodyH * 0.36, 12);
    if (skin.shine) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundEllipse(ctx, -14, bodyY - 8, 16, 8, 8); }
    if (skin.robot) drawRobotPanels(ctx, bodyY, bodyW, bodyH);

    // ---- front legs ----
    drawLegs(ctx, skin, p, isSlide, false);

    // ---- head ----
    const headX = isSlide ? 34 : 30;
    const headY = isSlide ? -34 : -64;
    const hbob = state === 'run' ? Math.sin(p.runPhase * 2) * 1.5 : 0;
    drawHead(ctx, skin, eq, p, headX, headY + hbob, isSlide);

    ctx.restore();
  }

  function drawLegs(ctx, skin, p, isSlide, back) {
    ctx.strokeStyle = skin.ear;
    ctx.fillStyle = skin.ear;
    const lw = 11;
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    const baseY = isSlide ? -10 : -16;
    const ground = 0;
    const phase = back ? p.runPhase + Math.PI : p.runPhase;
    const set = back ? [-26, -4] : [10, 30];

    if (p.state === 'jump') {
      // tucked legs
      for (const hx of set) {
        ctx.beginPath(); ctx.moveTo(hx, baseY);
        ctx.lineTo(hx + (back ? -8 : 8), baseY + 14);
        ctx.stroke();
      }
      return;
    }
    if (isSlide) {
      // legs stretched back along ground
      for (const hx of set) {
        ctx.beginPath(); ctx.moveTo(hx, baseY); ctx.lineTo(hx - 14, ground); ctx.stroke();
      }
      return;
    }
    // running cycle
    let i = 0;
    for (const hx of set) {
      const ph = phase + i * Math.PI;
      const swing = Math.sin(ph);
      const lift = Math.max(0, Math.cos(ph)) * 14;
      const footX = hx + swing * 14;
      const footY = ground - lift;
      ctx.globalAlpha = back ? 0.85 : 1;
      ctx.beginPath();
      ctx.moveTo(hx, baseY);
      ctx.quadraticCurveTo(hx + swing * 6, (baseY + footY) / 2, footX, footY);
      ctx.stroke();
      // paw
      ctx.beginPath(); ctx.arc(footX, footY, 6, 0, 6.28); ctx.fill();
      i++;
    }
    ctx.globalAlpha = 1;
  }

  function drawTail(ctx, skin, p, isSlide) {
    ctx.save();
    const wag = Math.sin(p.tail) * 0.5;
    const baseX = -42, baseY = isSlide ? -24 : -50;
    ctx.translate(baseX, baseY); ctx.rotate(-0.6 + wag + (isSlide ? 0.6 : 0));
    ctx.strokeStyle = skin.body; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, -6, -26, -22); ctx.stroke();
    ctx.fillStyle = skin.belly; ctx.beginPath(); ctx.arc(-26, -22, 7, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  function drawCape(ctx, skin, p) {
    ctx.save();
    const wave = Math.sin(p.runPhase * 2) * 6;
    ctx.fillStyle = skin.cape;
    ctx.beginPath();
    ctx.moveTo(-10, -64);
    ctx.quadraticCurveTo(-50, -50 + wave, -60, -10 + wave);
    ctx.quadraticCurveTo(-40, -24, -20, -30);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawRobotPanels(ctx, bodyY, bodyW, bodyH) {
    ctx.strokeStyle = 'rgba(40,55,80,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(-30, bodyY - 6, 24, 18);
    ctx.fillStyle = '#39e6ff'; ctx.fillRect(-26, bodyY - 2, 6, 6); ctx.fillRect(-18, bodyY - 2, 6, 6);
  }

  function drawHead(ctx, skin, eq, p, hx, hy, isSlide) {
    ctx.save();
    ctx.translate(hx, hy);

    // ears (behind head)
    drawEar(ctx, skin, p, -16, -6, isSlide, true);

    // head shape
    ctx.fillStyle = skin.body;
    roundEllipse(ctx, 0, 0, 24, 22, 14);
    // snout
    ctx.fillStyle = skin.belly;
    roundEllipse(ctx, 16, 8, 16, 12, 9);
    // cheek patch
    ctx.fillStyle = skin.body;
    roundEllipse(ctx, -4, -2, 18, 18, 12);

    // ninja mask band
    if (skin.mask) { ctx.fillStyle = skin.mask; ctx.fillRect(-22, -8, 44, 10); }

    // eyes
    const blink = p.blink < 0 && p.blink > -0.12;
    drawEye(ctx, 2, -4, blink, eq.glasses);
    drawEye(ctx, 16, -4, blink, eq.glasses);

    // nose
    ctx.fillStyle = skin.nose;
    ctx.beginPath(); ctx.arc(28, 8, 5, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(26, 6, 1.6, 0, 6.28); ctx.fill();
    // mouth / tongue when running fast
    ctx.strokeStyle = skin.nose; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(24, 12, 5, 0.1, Math.PI - 0.1); ctx.stroke();
    if (p.state === 'run') { ctx.fillStyle = '#ff6b8a'; roundEllipse(ctx, 24, 17, 4, 5, 3); }

    // front ear
    drawEar(ctx, skin, p, 6, -8, isSlide, false);

    // glasses + hat on top
    drawGlasses(ctx, eq.glasses);
    drawHat(ctx, eq.hat, skin);

    // robot antenna
    if (skin.robot) { ctx.strokeStyle = '#7c8799'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-10, -32); ctx.stroke(); ctx.fillStyle = '#39e6ff'; ctx.beginPath(); ctx.arc(-10, -34, 3, 0, 6.28); ctx.fill(); }

    ctx.restore();
  }

  function drawEar(ctx, skin, p, ex, ey, isSlide, back) {
    ctx.save();
    ctx.translate(ex, ey);
    const flop = Math.sin(p.runPhase * 2) * 0.18 + (p.state === 'jump' ? -0.3 : 0) + (isSlide ? 0.5 : 0);
    ctx.rotate((back ? -0.3 : 0.2) + flop);
    ctx.fillStyle = back ? skin.ear : skin.body;
    roundEllipse(ctx, -2, 8, 9, 16, 8);
    ctx.fillStyle = skin.belly; ctx.globalAlpha = 0.5; roundEllipse(ctx, -2, 10, 5, 10, 5); ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEye(ctx, ex, ey, blink, glasses) {
    if (glasses === 'eye' && ex > 8) { return; } // eyepatch covers right eye, drawn in glasses
    ctx.save(); ctx.translate(ex, ey);
    ctx.fillStyle = '#fff';
    if (blink) { ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke(); ctx.restore(); return; }
    ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 5.5, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1c1c28'; ctx.beginPath(); ctx.arc(1, 1, 3, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -1, 1.4, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  function drawGlasses(ctx, type) {
    if (!type || type === 'none') return;
    ctx.save();
    if (type === 'shades') {
      ctx.fillStyle = '#101018';
      roundRect(ctx, -6, -8, 12, 9, 2); ctx.fill();
      roundRect(ctx, 9, -8, 12, 9, 2); ctx.fill();
      ctx.fillRect(5, -6, 5, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-4, -6, 3, 2); ctx.fillRect(11, -6, 3, 2);
    } else if (type === 'nerd') {
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(2, -4, 6, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(16, -4, 6, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(10, -4); ctx.stroke();
    } else if (type === 'eye') {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(16, -4, 6, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(24, -12); ctx.stroke();
    } else if (type === 'visor') {
      ctx.fillStyle = 'rgba(57,230,255,0.85)';
      roundRect(ctx, -6, -8, 28, 8, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-2, -6, 14, 1.5);
    }
    ctx.restore();
  }

  function drawHat(ctx, type, skin) {
    if (!type || type === 'none') return;
    ctx.save();
    ctx.translate(0, -18);
    const col = (D.HATS.find((h) => h.id === type) || {}).color || '#e2474f';
    if (type === 'cap') {
      ctx.fillStyle = col; roundRect(ctx, -16, -10, 30, 12, 6); ctx.fill();
      ctx.fillRect(10, -2, 16, 5);
    } else if (type === 'party') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-12, 2); ctx.lineTo(2, -34); ctx.lineTo(14, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5d8f'; for (let i = -8; i < 12; i += 7) { ctx.beginPath(); ctx.arc(i, -4 - Math.abs(i) * 0.3, 2.5, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2, -34, 4, 0, 6.28); ctx.fill();
    } else if (type === 'tophat') {
      ctx.fillStyle = col; ctx.fillRect(-18, -2, 38, 5); roundRect(ctx, -12, -26, 26, 26, 3); ctx.fill();
      ctx.fillStyle = '#e23b4e'; ctx.fillRect(-12, -8, 26, 5);
    } else if (type === 'crown') {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(-14, 2); ctx.lineTo(-14, -10); ctx.lineTo(-7, -2); ctx.lineTo(0, -14); ctx.lineTo(7, -2); ctx.lineTo(14, -10); ctx.lineTo(14, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(0, -4, 2.5, 0, 6.28); ctx.fill();
    } else if (type === 'halo') {
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(2, -16, 14, 5, 0, 0, 6.28); ctx.stroke();
    }
    ctx.restore();
  }

  /* ----------------------------- shape helpers ----------------------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function roundEllipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.28); ctx.fill();
  }

  /* ----------------------------- preview ----------------------------- */
  // Render a static, idle puppy with the given cosmetics into any canvas.
  function previewPuppy(canvas, eq) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 96, h = canvas.clientHeight || 96;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const skin = D.SKINS.find((s) => s.id === eq.skin) || D.SKINS[0];
    const p = { runPhase: 0.7, tail: 0.5, state: 'run', vy: 0, blink: 2, giant: 1, x: 0, y: 0, invuln: 0 };
    const sheet = ASSETS && ASSETS.puppy(skin.id);
    if (sheet) {
      const scale = (h * 0.82) / sheet.fh;
      const dw = sheet.fw * scale, dh = sheet.fh * scale;
      ctx.drawImage(sheet.img, 0, 0, sheet.fw, sheet.fh, w / 2 - dw / 2, h - dh, dw, dh);
      return;
    }
    ctx.save();
    ctx.translate(w * 0.46, h * 0.84);
    const sc = Math.min(w, h) / 150;
    ctx.scale(sc, sc);
    drawPuppy(ctx, skin, eq, p);
    ctx.restore();
  }

  /* ----------------------------- public API -------------------------- */
  global.PR_GAME = {
    init, on, startRun, beginPlay, pause, resume, quit,
    inputJump, inputSlideDown, inputSlideUp,
    setWorldById, worldForLevel, previewPuppy,
    get mode() { return G.mode; },
    get fps() { return G.fps; },
    refreshSettings() { /* settings read live from SAVE */ },
  };
})(window);
