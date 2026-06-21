# 🐶 Puppy Runner

A polished, self-contained **endless runner** for the web — guide **Puppy** through 8 beautiful, themed worlds, dodging obstacles, collecting bones, grabbing power-ups, leveling up and chasing the high score. Built with vanilla **HTML + CSS + Canvas 2D** and the **Web Audio API**. No build step, no dependencies, no servers — it runs entirely in the browser and **works offline**.

> Vibe: a mix of *Subway Surfers / Temple Run* with a cozy pet-adventure feel.

---

## ✨ Features

**Core gameplay**
- Auto-running side-scroller with **jump, double-jump, slide** (and an air *slam* fast-fall).
- Smooth, resolution-independent physics with coyote-time + jump-buffering for forgiving controls.
- Speed ramps with distance; difficulty scales fairly (reaction-friendly obstacle spacing).
- 10 obstacle types (crates, rocks, puddles, stumps, fences, birds, barrels, spikes, drones, saws) that unlock as you level up — ground, tall, flying and rolling behaviours.

**Collectibles & power-ups**
- Gold Bones (currency), Coins, Paw Tokens, and **Mystery Boxes** (random rewards).
- 6 power-ups: 🧲 Magnet, 🛡️ Shield, ⚡ Speed Boost, 🐢 Slow-Motion, ✖️2 Double Score, 🐘 Giant Puppy.
- Combo multiplier that builds as you collect and dodge.

**Progression & meta**
- XP / **Level** system with a smooth curve and on-screen XP bar.
- **8 unlockable worlds** — Green Meadows, Sunny Forest, Snow Land, Desert Run, Candy World, Volcano Zone, Cyber City, Space Station — each with its own palette, parallax silhouettes, weather (leaves/snow/sand/embers/rain/bubbles/stars) and adaptive chiptune music. The world theme even **transitions mid-run** as your distance grows.
- **50+ achievements** (tiered + one-off), each granting bone rewards.
- **Shop** with real puppy previews: skins, hats, glasses and trails (Golden, Ninja, Pirate, Robot, Super Puppy, capes, crowns, halos, rainbow/fire/stardust trails…).
- **Leaderboard** with Daily / Weekly / All-Time / 🌍 Global (simulated) tabs.
- **7-day Daily Rewards** with login streaks.
- Auto-save to LocalStorage (high score, level, currency, unlocks, achievements, settings).

**Presentation**
- Glassmorphism UI, smooth screen transitions, particle effects, dust trails, screen shake, dynamic flashes, animated procedural puppy (running/jumping/sliding with wagging tail, blinking, floppy ears).
- Fully **synthesized audio** (music + SFX) — zero audio files, so it stays tiny and offline.

**Platform**
- Responsive for **desktop + mobile**; touch controls (tap = jump, swipe down = slide) plus on-screen buttons.
- **Gamepad** support (A/B + D-pad + Start).
- **PWA**: installable, offline-capable via a service worker, with manifest + icons.

---

## 🎮 Controls

| Action | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Jump / Double-jump | `Space` / `↑` / `W` (tap again to double) | Tap or swipe up | A / D-pad ↑ |
| Slide / Slam | `↓` / `S` (hold) | Swipe down / Slide button | B / D-pad ↓ |
| Pause | `P` / `Esc` | Pause button | Start |
| Restart (on game over) | `Space` | Run Again | A |

---

## 🚀 Run it

The game itself works by simply opening **`index.html`** in a browser. To get the **PWA / offline / installable** behaviour (service workers require `http(s)` or `localhost`), serve it locally:

```bash
# Option A — included zero-dependency server
node serve.js
# → open http://localhost:8080

# Option B — any static server
npx serve .
python -m http.server 8080
```

Then open the URL, hit **Play**, and to install: use the browser's *Install app* / *Add to Home Screen* option.

---

## 🧪 Tests

A headless smoke test mocks the DOM/Canvas/WebAudio, boots the real game, drives frames through a **full run to game-over**, and exercises every screen and meta system:

```bash
node test/smoke.js
```

---

## 📁 Project structure

```
index.html              # markup: canvas, HUD, all screens & overlays
css/styles.css          # glassmorphism theme, responsive layout, animations
js/data.js              # tuning, worlds, obstacles, cosmetics, achievements, daily
js/storage.js           # LocalStorage save system (schema-safe, cloud-ready)
js/audio.js             # Web Audio synth: adaptive music + SFX
js/game.js              # engine: physics, spawner, collisions, power-ups,
                        #         particles, and all procedural rendering
js/ui.js                # screens, HUD, shop, leaderboard, achievements, daily,
                        #         end-of-run flow (XP, level-ups, unlocks)
js/main.js              # bootstrap + service-worker registration
manifest.webmanifest    # PWA manifest
sw.js                   # service worker (app-shell precache, offline)
icons/                  # SVG app icons (regular + maskable)
serve.js                # optional local static server
test/smoke.js           # headless integration test
```

---

## 🔧 Notes & extension points

- **Currencies & balance** live in `js/data.js` (`CONFIG`) and the cosmetic/achievement tables — easy to tune.
- **Global leaderboard** is currently simulated (deterministic per-day bot scores merged with your local bests). To make it truly online, swap `recordScore` / `buildGlobal` in the codebase to call a backend (Firebase/Supabase) — the data shapes already match `{ name, score, level, dist, ts }`.
- **Art** is 100% drawn on the canvas (procedural), which keeps the game offline and dependency-free. It can be swapped for AI-generated sprites if desired.

🐾 Have fun — go fetch that high score!
