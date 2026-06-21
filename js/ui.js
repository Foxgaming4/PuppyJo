/* ============================================================================
 * Puppy Runner — UI
 * Screen navigation, HUD, and all meta systems wired to the engine: shop,
 * worlds, achievements, leaderboard, daily rewards, settings, plus the
 * end-of-run flow (currency, XP/level-ups, world unlocks, achievement checks).
 * ==========================================================================*/
(function (global) {
  'use strict';

  const D = global.PR_DATA;
  const SAVE = global.PR_SAVE;
  const AUDIO = global.PR_AUDIO;
  const GAME = global.PR_GAME;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = (n) => Math.floor(n).toLocaleString();
  const todayStr = () => new Date().toISOString().slice(0, 10);

  let currentScreen = 'menu';

  /* ============================ NAVIGATION ============================ */
  function nav(name) {
    AUDIO.resume(); AUDIO.play('button');
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const target = $('#screen-' + name);
    if (target) target.classList.add('active');
    currentScreen = name;
    $('#screens').classList.remove('hidden');
    $('#hud').classList.add('hidden');
    if (name === 'menu') refreshMenu();
    if (name === 'shop') renderShop(activeShopCat);
    if (name === 'worlds') renderWorlds();
    if (name === 'achievements') renderAchievements();
    if (name === 'leaderboard') renderLeaderboard(activeLbScope);
    if (name === 'daily') renderDaily();
    if (name === 'settings') syncSettings();
  }

  /* ============================ MAIN MENU ============================ */
  function refreshMenu() {
    const s = SAVE.get();
    $('#m-highscore').textContent = fmt(s.highScore);
    $('#m-level').textContent = s.level;
    $('#m-bones').textContent = fmt(s.bones);
    $('#daily-badge').classList.toggle('hidden', !dailyClaimable());
  }

  // Refresh menu stats on a save change, but ONLY while the menu is actually on
  // screen — never force navigation (that used to pop the menu over a live run).
  function onSaveChanged() {
    if (currentScreen === 'menu' && !$('#screens').classList.contains('hidden')) refreshMenu();
  }

  /* ============================ GAME FLOW ============================ */
  function startGame() {
    AUDIO.resume();
    $('#screens').classList.add('hidden');
    $('#overlay-gameover').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    $('#touch-controls').classList.toggle('hidden', !isTouch());
    GAME.startRun();
  }

  function showCountdown(val) {
    const cd = $('#countdown');
    cd.classList.remove('hidden');
    cd.querySelector('span').textContent = val;
    cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
    if (val === 'GO') setTimeout(() => cd.classList.add('hidden'), 500);
  }

  /* --------- HUD --------- */
  function updateHUD(d) {
    $('#hud-score').textContent = fmt(d.score);
    $('#hud-bones').textContent = fmt(d.bones);
    $('#hud-level').textContent = d.level;
    $('#hud-level-name').textContent = d.levelName;
    $('#hud-xp-fill').style.width = (d.xpPct * 100) + '%';
    const cmb = $('#hud-combo');
    if (d.combo >= 2 && d.mult > 1) {
      cmb.classList.remove('hidden');
      $('#hud-combo-x').textContent = 'x' + d.mult;
    } else cmb.classList.add('hidden');
    renderPowerBar(d.powerups);
  }

  let lastPowerIds = '';
  function renderPowerBar(list) {
    const bar = $('#powerup-bar');
    const ids = list.map((p) => p.id).join(',');
    if (ids !== lastPowerIds) {
      bar.innerHTML = '';
      list.forEach((p) => {
        const item = el('div', 'pu-chip');
        item.dataset.id = p.id;
        item.style.setProperty('--c', p.color);
        item.innerHTML = `<span class="pu-ic">${p.icon}</span><span class="pu-bar"><i></i></span>`;
        bar.appendChild(item);
      });
      lastPowerIds = ids;
    }
    list.forEach((p) => {
      const item = bar.querySelector(`[data-id="${p.id}"] i`);
      if (item) item.style.width = (p.pct * 100) + '%';
    });
  }

  /* --------- Toasts --------- */
  function toast(msg) {
    const layer = $('#toast-layer');
    const t = el('div', 'toast', msg);
    layer.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 1800);
  }

  /* --------- Popups (level up / achievement) --------- */
  function popup(icon, title, sub, color) {
    const layer = $('#popup-layer');
    const p = el('div', 'popup');
    if (color) p.style.setProperty('--pc', color);
    p.innerHTML = `<div class="popup-ic">${icon}</div><div class="popup-txt"><b>${title}</b><span>${sub || ''}</span></div>`;
    layer.appendChild(p);
    requestAnimationFrame(() => p.classList.add('show'));
    setTimeout(() => { p.classList.remove('show'); setTimeout(() => p.remove(), 500); }, 2600);
  }

  /* ============================ END OF RUN ============================ */
  function onGameOver(run) {
    const s = SAVE.get();

    // stats
    s.runs += 1;
    s.totalDistance += run.distance;
    if (run.distance > s.bestDistance) s.bestDistance = run.distance;
    const newHigh = run.score > s.highScore;
    if (newHigh) s.highScore = run.score;
    Object.keys(run.worldsVisited).forEach((id) => { s.worldsVisited[id] = true; });

    // XP & leveling
    const xpEarned = Math.floor(run.distance / 4) + run.bones * 2 + run.coins + run.paws * 4 + run.mystery * 10;
    run.xpEarned = xpEarned;
    const lvlBefore = s.level;
    const result = SAVE.addXP(xpEarned);

    // newly unlocked worlds -> auto-select the newest so the next run shows it
    if (result.unlockedWorlds.length) {
      const newest = result.unlockedWorlds[result.unlockedWorlds.length - 1];
      s.selectedWorld = newest;
    }

    // leaderboard entry
    SAVE.recordScore({ name: s.settings.name || 'Player', score: run.score, level: s.level, dist: run.distance });

    // achievements
    const earned = checkAchievements(run);

    SAVE.save();

    // ---- populate overlay ----
    $('#go-score').textContent = fmt(run.score);
    $('#go-best').textContent = newHigh ? '🏆 New High Score!' : 'Best: ' + fmt(s.highScore);
    $('#go-best').classList.toggle('isbest', newHigh);
    $('#go-distance').textContent = fmt(run.distance) + 'm';
    $('#go-bones').textContent = fmt(run.bones);
    $('#go-combo').textContent = 'x' + run.bestCombo;

    const sp = SAVE.xpProgress();
    $('#go-level-name').textContent = 'Level ' + s.level + ' · ' + GAME.worldForLevel(s.level).name;
    $('#go-xp-text').textContent = '+' + fmt(xpEarned) + ' XP';
    $('#go-xp-fill').style.width = '0%';
    setTimeout(() => { $('#go-xp-fill').style.width = (sp.pct * 100) + '%'; }, 120);

    // rewards summary
    const rew = $('#go-rewards'); rew.innerHTML = '';
    if (result.leveled.length) {
      result.leveled.forEach((lv) => {
        rew.appendChild(el('div', 'go-reward lvl', `⭐ Reached Level ${lv}!`));
        popup('⭐', 'Level ' + lv + '!', GAME.worldForLevel(lv).name, '#ffd23a');
      });
      AUDIO.play('levelup');
    }
    result.unlockedWorlds.forEach((id) => {
      const w = D.WORLDS.find((x) => x.id === id);
      rew.appendChild(el('div', 'go-reward world', `🗺️ New World: ${w.name}`));
      popup('🗺️', 'World Unlocked', w.name, w.accent);
    });
    earned.forEach((a) => {
      rew.appendChild(el('div', 'go-reward ach', `${a.icon} ${a.name} <small>+${a.reward}🦴</small>`));
    });
    if (!result.leveled.length && !earned.length && !result.unlockedWorlds.length) {
      rew.appendChild(el('div', 'go-reward muted', 'Keep running to earn rewards! 🐾'));
    }

    $('#overlay-gameover').classList.remove('hidden');
    $('#overlay-gameover').classList.remove('shown'); void $('#overlay-gameover').offsetWidth;
    $('#overlay-gameover').classList.add('shown');
  }

  /* ============================ ACHIEVEMENTS ============================ */
  function checkAchievements(run) {
    const s = SAVE.get();
    const earned = [];
    D.ACHIEVEMENTS.forEach((a) => {
      if (s.achievements[a.id]) return;
      let ok = false;
      try { ok = a.check(s, run); } catch (e) { ok = false; }
      if (ok) {
        s.achievements[a.id] = true;
        SAVE.addBones(a.reward);
        earned.push(a);
        AUDIO.play('achieve');
        popup(a.icon, a.name, '+' + a.reward + ' 🦴', '#5dff9b');
      }
    });
    if (earned.length) SAVE.save();
    return earned;
  }

  function renderAchievements() {
    const s = SAVE.get();
    const grid = $('#ach-grid');
    grid.innerHTML = '';
    const total = D.ACHIEVEMENTS.length;
    const done = D.ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
    $('#ach-count').textContent = `(${done}/${total})`;
    D.ACHIEVEMENTS.forEach((a) => {
      const got = !!s.achievements[a.id];
      const card = el('div', 'card ach-card ' + (got ? 'got' : 'locked'));
      card.innerHTML = `
        <div class="ach-ic">${got ? a.icon : '🔒'}</div>
        <div class="ach-info">
          <b>${a.name}</b>
          <span>${a.desc}</span>
        </div>
        <div class="ach-rew">${got ? '✓' : '+' + a.reward + '🦴'}</div>`;
      grid.appendChild(card);
    });
  }

  /* ============================ SHOP ============================ */
  let activeShopCat = 'skin';
  function renderShop(cat) {
    activeShopCat = cat;
    const s = SAVE.get();
    $('#shop-bones').textContent = fmt(s.bones);
    $('#shop-coins').textContent = fmt(s.coins);
    $$('#shop-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.cat === cat));
    const grid = $('#shop-grid');
    grid.innerHTML = '';
    D.COSMETICS[cat].forEach((item) => {
      const owned = SAVE.own(cat, item.id);
      const equipped = s.equipped[cat] === item.id;
      const rarity = item.cost === 0 ? 'common' : item.cost < 400 ? 'rare' : item.cost < 1200 ? 'epic' : 'legendary';
      const card = el('div', 'card shop-card rarity-' + rarity + (equipped ? ' equipped' : ''));
      card.appendChild(el('span', 'rarity-tag', rarity));

      const prev = el('div', 'shop-prev');
      if (cat === 'skin') {
        const cv = el('canvas', 'pup-prev');
        prev.appendChild(cv);
        // defer draw until in DOM
        setTimeout(() => GAME.previewPuppy(cv, { skin: item.id, hat: s.equipped.hat, glasses: s.equipped.glasses }), 0);
      } else if (cat === 'trail') {
        const bar = el('div', 'trail-prev');
        bar.style.background = `linear-gradient(90deg, transparent, ${item.colors.join(',')})`;
        prev.appendChild(bar);
      } else {
        prev.innerHTML = `<span class="emoji-prev">${cosmeticEmoji(cat, item.id)}</span>`;
      }

      const name = el('div', 'shop-name', item.name);
      const btn = el('button', 'btn btn-buy');
      if (equipped) { btn.textContent = 'Equipped'; btn.classList.add('btn-equipped'); btn.disabled = true; }
      else if (owned) { btn.textContent = 'Equip'; btn.onclick = () => { SAVE.equip(cat, item.id); AUDIO.play('button'); renderShop(cat); }; }
      else {
        btn.innerHTML = `Buy <b>${item.cost}🦴</b>`;
        if (s.bones < item.cost) btn.classList.add('cant');
        btn.onclick = () => buy(cat, item);
      }
      card.append(prev, name, btn);
      grid.appendChild(card);
    });
  }
  function cosmeticEmoji(cat, id) {
    const map = {
      hat: { none: '🚫', cap: '🧢', party: '🎉', tophat: '🎩', crown: '👑', halo: '😇' },
      glasses: { none: '🚫', shades: '🕶️', nerd: '👓', eye: '🏴‍☠️', visor: '🥽' },
    };
    return (map[cat] && map[cat][id]) || '✨';
  }
  function buy(cat, item) {
    const s = SAVE.get();
    if (s.bones < item.cost) { toast('Not enough bones! 🦴'); AUDIO.play('hit'); return; }
    SAVE.spend(item.cost, 'bones');
    SAVE.addOwned(cat, item.id);
    SAVE.equip(cat, item.id);
    s.purchases = (s.purchases || 0) + 1;
    SAVE.save();
    AUDIO.play('coin');
    popup('🛍️', 'Unlocked!', item.name, '#5dff9b');
    checkAchievements(null);
    renderShop(cat);
  }

  /* ============================ WORLDS ============================ */
  function renderWorlds() {
    const s = SAVE.get();
    const grid = $('#worlds-grid');
    grid.innerHTML = '';
    D.WORLDS.forEach((w) => {
      const unlocked = SAVE.worldIsUnlocked(w.id);
      const selected = s.selectedWorld === w.id;
      const card = el('div', 'card world-card' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked'));
      card.style.background = `linear-gradient(160deg, ${w.sky[0]}, ${w.sky[1]})`;
      card.innerHTML = `
        <div class="world-name">${w.name}</div>
        <div class="world-strip" style="background:linear-gradient(0deg, ${w.ground}, ${w.near})"></div>
        <div class="world-foot">${unlocked ? (selected ? '✓ Selected' : 'Tap to select') : '🔒 Unlock at Level ' + w.unlock}</div>`;
      if (unlocked) card.onclick = () => { s.selectedWorld = w.id; SAVE.save(); AUDIO.play('button'); GAME.setWorldById(w.id, false); renderWorlds(); };
      grid.appendChild(card);
    });
  }

  /* ============================ LEADERBOARD ============================ */
  let activeLbScope = 'daily';
  function renderLeaderboard(scope) {
    activeLbScope = scope;
    $$('#lb-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.scope === scope));
    const list = $('#lb-list');
    list.innerHTML = '';
    const s = SAVE.get();
    let entries = [];
    const now = Date.now();
    const day = 864e5;
    if (scope === 'all') entries = s.scores.slice();
    else if (scope === 'daily') entries = s.scores.filter((e) => now - e.ts < day);
    else if (scope === 'weekly') entries = s.scores.filter((e) => now - e.ts < day * 7);
    else if (scope === 'global') entries = buildGlobal(s);

    entries.sort((a, b) => b.score - a.score);
    entries = entries.slice(0, 50);

    if (!entries.length) {
      list.appendChild(el('div', 'lb-empty', '🐾 No runs yet. Be the first — hit Play!'));
      return;
    }
    entries.forEach((e, i) => {
      const me = e.me || e.name === (s.settings.name || 'Player');
      const row = el('div', 'lb-row' + (me ? ' me' : '') + (i < 3 ? ' top' : ''));
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      row.innerHTML = `
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${escapeHtml(e.name)}${me ? ' <small>(you)</small>' : ''}</span>
        <span class="lb-lvl">Lv ${e.level || 1}</span>
        <span class="lb-score">${fmt(e.score)}</span>`;
      list.appendChild(row);
    });
  }
  // Simulated global board: deterministic bot scores for the day + your bests.
  function buildGlobal(s) {
    const seed = parseInt(todayStr().replace(/-/g, ''), 10);
    const rng = mulberry(seed);
    const bots = D.BOT_NAMES.map((name) => ({
      name, level: 1 + Math.floor(rng() * 10),
      score: Math.floor(2000 + rng() * 48000),
    }));
    const mine = s.scores.slice(0, 5).map((e) => ({ ...e, me: true }));
    if (s.highScore > 0 && !mine.length) mine.push({ name: s.settings.name || 'Player', score: s.highScore, level: s.level, me: true });
    return bots.concat(mine);
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ============================ DAILY REWARDS ============================ */
  function dailyClaimable() { return SAVE.get().lastClaim !== todayStr(); }
  function currentDailyDay() {
    const s = SAVE.get();
    // streak index for the reward to claim (1-based, cycles within 7)
    const next = (s.dailyStreak % 7) + 1;
    return next;
  }
  function renderDaily() {
    const s = SAVE.get();
    const grid = $('#daily-grid');
    grid.innerHTML = '';
    const claimDay = currentDailyDay();
    D.DAILY_REWARDS.forEach((r) => {
      const claimedThisCycle = r.day < claimDay || (r.day <= (s.dailyStreak % 7 === 0 && s.dailyStreak > 0 ? 7 : s.dailyStreak % 7));
      const isNext = r.day === claimDay && dailyClaimable();
      const card = el('div', 'daily-card' + (isNext ? ' next' : '') + (r.day < claimDay ? ' claimed' : ''));
      card.innerHTML = `
        <span class="daily-day">Day ${r.day}</span>
        <span class="daily-ic">${r.icon}</span>
        <span class="daily-amt">${r.bones ? r.bones + '🦴' : ''}${r.coins ? ' ' + r.coins + '🪙' : ''}</span>
        ${r.day < claimDay ? '<span class="daily-tick">✓</span>' : ''}`;
      grid.appendChild(card);
    });
    const btn = $('#btn-claim');
    if (dailyClaimable()) {
      btn.disabled = false; btn.textContent = `Claim Day ${claimDay} Reward`;
    } else {
      btn.disabled = true; btn.textContent = '✓ Come back tomorrow!';
    }
  }
  function claimDaily() {
    if (!dailyClaimable()) return;
    const s = SAVE.get();
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    // reset streak if a day was missed
    if (s.lastClaim && s.lastClaim !== yesterday) s.dailyStreak = 0;
    const day = currentDailyDay();
    const r = D.DAILY_REWARDS[day - 1];
    if (r.bones) SAVE.addBones(r.bones);
    if (r.coins) SAVE.addCoins(r.coins);
    s.dailyStreak += 1;
    s.lastClaim = todayStr();
    SAVE.save();
    AUDIO.play('levelup');
    popup(r.icon, 'Day ' + day + ' Reward!', `+${r.bones || 0}🦴 ${r.coins ? '+' + r.coins + '🪙' : ''}`, '#ffd23a');
    if (r.cosmetic) {
      // 7-day bonus: gift a trail if not owned
      const gift = D.TRAILS.find((t) => !SAVE.own('trail', t.id));
      if (gift) { SAVE.addOwned('trail', gift.id); SAVE.save(); popup('🎁', 'Bonus Cosmetic!', gift.name, '#9b8cff'); }
    }
    checkAchievements(null);
    renderDaily();
    refreshMenu();
  }

  /* ============================ SETTINGS ============================ */
  function syncSettings() {
    const st = SAVE.get().settings;
    $('#set-music').value = st.music;
    $('#set-sfx').value = st.sfx;
    $('#set-shake').checked = st.shake;
    $('#set-particles').checked = st.particles;
    $('#set-fps').checked = st.fps;
    $('#set-name').value = st.name || '';
  }
  function bindSettings() {
    const st = SAVE.get().settings;
    const apply = () => { AUDIO.setVolumes(st.music / 100, st.sfx / 100); SAVE.saveSoon(); };
    $('#set-music').oninput = (e) => { st.music = +e.target.value; apply(); };
    $('#set-sfx').oninput = (e) => { st.sfx = +e.target.value; apply(); AUDIO.play('button'); };
    $('#set-shake').onchange = (e) => { st.shake = e.target.checked; SAVE.save(); };
    $('#set-particles').onchange = (e) => { st.particles = e.target.checked; SAVE.save(); };
    $('#set-fps').onchange = (e) => { st.fps = e.target.checked; SAVE.save(); };
    $('#set-name').onchange = (e) => { st.name = e.target.value.trim().slice(0, 14) || 'Player'; SAVE.save(); };
    $('#btn-reset').onclick = () => {
      if (confirm('Reset ALL progress, unlocks and high scores? This cannot be undone.')) {
        SAVE.reset(); AUDIO.setVolumes(0.6, 0.8); syncSettings(); refreshMenu(); toast('Progress reset 🐾');
      }
    };
  }

  /* ============================ INPUT / WIRING ============================ */
  const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function bindControls() {
    // keyboard (bound to physical codes for layout independence)
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'KeyP'].includes(e.code)) e.preventDefault();
      if (GAME.mode === 'play') {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { if (!e.repeat) GAME.inputJump(); }
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') GAME.inputSlideDown();
        else if (e.code === 'KeyP' || e.code === 'Escape') doPause();
      } else if (GAME.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
        doResume();
      } else if (GAME.mode === 'dead' && e.code === 'Space') {
        if (!e.repeat) startGame();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') GAME.inputSlideUp();
    });

    // pointer / touch on the canvas area
    const surface = $('#game');
    let touchStartY = 0, touchStartX = 0, touchT = 0, swiped = false;
    const press = (e) => {
      if (GAME.mode !== 'play') return;
      touchStartY = (e.touches ? e.touches[0].clientY : e.clientY);
      touchStartX = (e.touches ? e.touches[0].clientX : e.clientX);
      touchT = Date.now(); swiped = false;
    };
    const move = (e) => {
      if (GAME.mode !== 'play' || swiped) return;
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      if (y - touchStartY > 45) { GAME.inputSlideDown(); swiped = true; }
      else if (touchStartY - y > 45) { GAME.inputJump(); swiped = true; }
    };
    const release = () => {
      if (GAME.mode !== 'play') return;
      GAME.inputSlideUp();
      if (!swiped && Date.now() - touchT < 250) GAME.inputJump(); // tap = jump
    };
    surface.addEventListener('mousedown', press);
    surface.addEventListener('mousemove', move);
    surface.addEventListener('mouseup', release);
    surface.addEventListener('touchstart', (e) => { press(e); }, { passive: true });
    surface.addEventListener('touchmove', (e) => { move(e); }, { passive: true });
    surface.addEventListener('touchend', release, { passive: true });

    // on-screen mobile buttons
    bindHold($('#touch-jump'), () => GAME.inputJump());
    const ts = $('#touch-slide');
    ts.addEventListener('touchstart', (e) => { e.preventDefault(); GAME.inputSlideDown(); }, { passive: false });
    ts.addEventListener('touchend', (e) => { e.preventDefault(); GAME.inputSlideUp(); }, { passive: false });
    ts.addEventListener('mousedown', () => GAME.inputSlideDown());
    ts.addEventListener('mouseup', () => GAME.inputSlideUp());

    // gamepad polling
    pollGamepad();
  }
  function bindHold(btn, fn) {
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  }

  let gpPrev = {};
  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const a = gp.buttons[0] && gp.buttons[0].pressed; // jump
      const b = gp.buttons[1] && gp.buttons[1].pressed; // slide
      const start = gp.buttons[9] && gp.buttons[9].pressed;
      const dpadUp = gp.buttons[12] && gp.buttons[12].pressed;
      const dpadDown = gp.buttons[13] && gp.buttons[13].pressed;
      if (GAME.mode === 'play') {
        if ((a || dpadUp) && !gpPrev.a) GAME.inputJump();
        if (b || dpadDown) GAME.inputSlideDown(); else if (gpPrev.b) GAME.inputSlideUp();
        if (start && !gpPrev.start) doPause();
      } else if (GAME.mode === 'dead' && a && !gpPrev.a) startGame();
      gpPrev = { a: a || dpadUp, b: b || dpadDown, start };
    }
    requestAnimationFrame(pollGamepad);
  }

  function doPause() { GAME.pause(); $('#overlay-pause').classList.remove('hidden'); updatePauseStats(); }
  function doResume() { $('#overlay-pause').classList.add('hidden'); GAME.resume(); }
  function updatePauseStats() {
    // pull from current HUD values
    $('#p-score').textContent = $('#hud-score').textContent;
    $('#p-bones').textContent = $('#hud-bones').textContent;
  }

  function bindButtons() {
    $('#btn-play').onclick = startGame;
    $$('[data-nav]').forEach((b) => b.onclick = () => nav(b.dataset.nav));
    $('#btn-pause').onclick = doPause;
    $('#btn-resume').onclick = doResume;
    $('#btn-restart-pause').onclick = startGame;
    $('#btn-quit').onclick = () => { $('#overlay-pause').classList.add('hidden'); GAME.quit(); nav('menu'); };
    $('#btn-again').onclick = startGame;
    $('#btn-go-menu').onclick = () => { $('#overlay-gameover').classList.add('hidden'); GAME.quit(); nav('menu'); };
    $('#btn-claim').onclick = claimDaily;
    $$('#shop-tabs .tab').forEach((t) => t.onclick = () => { AUDIO.play('button'); renderShop(t.dataset.cat); });
    $$('#lb-tabs .tab').forEach((t) => t.onclick = () => { AUDIO.play('button'); renderLeaderboard(t.dataset.scope); });
  }

  /* ============================ BOOT ============================ */
  function init() {
    bindButtons();
    bindControls();
    bindSettings();

    GAME.on('hud', updateHUD);
    GAME.on('countdown', showCountdown);
    GAME.on('gameover', onGameOver);
    GAME.on('toast', toast);
    GAME.on('powerstart', (p) => toast(p.icon + ' ' + p.name + '!'));

    // pause when tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && GAME.mode === 'play') doPause();
    });

    refreshMenu();
    nav('menu');
  }

  global.PR_UI = { init, nav, toast, popup, refreshMenu, onSaveChanged };
})(window);
