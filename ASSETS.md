# 🎨 Puppy Runner — Asset List

The game now has an **asset loader** ([js/assets.js](js/assets.js)): drop a file into `assets/` with the right name and it's used automatically; anything missing **falls back to the built-in procedural art / synthesized audio**. This doc lists every slot and maps it to code.

## ✅ Wired up right now (from the assets you added)

| Asset | Status |
|---|---|
| `assets/puppy/classic.png` | ✅ Sliced into a 10-frame run cycle → animated in-game (hero + shop preview) |
| `assets/obstacles/{crate,rock,stump,fence,barrel,spikes,saw}.png` | ✅ Used in-game (barrel & saw auto-rotate) |
| `assets/audio/gameover.mp3`, `go.mp3` | ✅ Play in place of the synth SFX |
| Everything else (puddle, bird, drone, other skins, worlds, music…) | ⏳ Using built-in defaults until you add them |

### Puppy sheet pipeline
Your `classic.png` was an AI sheet (irregular frames, soft halo). The build step
`node tools/slice-puppy.js assets/puppy/classic.png` auto-detects the frames and
writes a clean uniform strip `classic.frames.png` (this is what the game loads).
**Re-run it whenever you replace `classic.png`.** Same command works for any new
skin sheet — then add the skin to the `PUPPY` map in [js/assets.js](js/assets.js).

---

This document lists every asset slot so you can supply real images/audio. Each entry maps to where it's used in code.

> **Authoring tips** — Export **PNG-24 with transparency**, authored at **~2× the listed size** (for crisp high-DPI / retina). The game's logical screen height is **720px**, so sizes below are in logical px; double them when exporting. Keep characters/obstacles facing **right** (the puppy runs to the right while the world scrolls left).

Proposed folder layout (create under the project root):

```
assets/
  puppy/        # character skins & poses
  obstacles/    # obstacle sprites
  items/        # collectibles & power-up icons
  worlds/       # per-world parallax backgrounds + ground
  weather/      # particle sprites (optional)
  ui/           # logo, icons, currency, medals
  audio/
    music/      # per-world loops
    sfx/        # sound effects
```

---

## 1) Puppy (character) — `assets/puppy/`  ★ highest priority

The puppy animates with **run / jump / slide** states (defined in [data.js](js/data.js) `SKINS`, drawn in [game.js](js/game.js) `drawPuppy`). Best supplied as a **spritesheet per skin**.

| Skin id | Name | Suggested file |
|---|---|---|
| `classic` | Classic Puppy | `puppy/classic.png` |
| `snow` | Snow Pup | `puppy/snow.png` |
| `shadow` | Shadow | `puppy/shadow.png` |
| `golden` | Golden Puppy | `puppy/golden.png` |
| `ninja` | Ninja Puppy | `puppy/ninja.png` |
| `pirate` | Pirate Puppy | `puppy/pirate.png` |
| `robot` | Robot Puppy | `puppy/robot.png` |
| `super` | Super Puppy | `puppy/super.png` |

**Per skin, provide a sheet** (transparent, facing right), each frame **256×256**:
- **Run cycle**: 6–8 frames (horizontal strip)
- **Jump**: 1 frame (legs tucked)
- **Slide**: 1 frame (low & stretched, ears back)
- *(optional)* **Hurt/Tumble**: 1 frame for the death moment

→ 8 skins. (If you only do one, do `classic` first.)

### Accessories *(optional / advanced)* — `assets/puppy/acc/`
Worn on the head; need a consistent anchor point. Each ~**128×128** PNG.
- **Hats** (5): `cap`, `party`, `tophat`, `crown`, `halo`
- **Glasses** (4): `shades`, `nerd`, `eye` (eyepatch), `visor`
- **Trails** (6: `dust`, `sparkle`, `rainbow`, `fire`, `bubbles`, `stars`) are **particle effects**, not sprites — better left procedural, or supply a single 32×32 particle each.

---

## 2) Obstacles — `assets/obstacles/`  ★ high priority

From [data.js](js/data.js) `OBSTACLES`. Sizes are logical px (export @2×). Transparent PNG.

| id | Name | Size (w×h) | Notes |
|---|---|---|---|
| `crate` | Wooden crate | 128×128 | static |
| `rock` | Rock | 148×112 | static |
| `puddle` | Puddle | 240×64 | wide & low, ground hazard |
| `stump` | Tree stump | 140×156 | static |
| `fence` | Fence | 192×192 | tall (jump over) |
| `bird` | Bird | 140×96 | **animated**: 3–4 flap frames |
| `barrel` | Rolling barrel | 140×140 | code rotates it — supply 1 frame |
| `spikes` | Spikes | 220×88 | static, low |
| `drone` | Drone | 152×112 | **animated**: 2 frames |
| `saw` | Saw blade | 168×168 | code rotates it — supply 1 frame |

---

## 3) Collectibles & power-ups — `assets/items/`  ★ high priority

**Collectibles** (drawn in [game.js](js/game.js) `drawCollectible`):

| id | Name | Size | Notes |
|---|---|---|---|
| `bone` | Gold Bone (currency) | 64×64 | |
| `coin` | Coin | 64×64 | code spins it; or supply 6-frame spin |
| `paw` | Paw Token | 64×64 | |
| `mystery` | Mystery Box | 96×96 | |

**Power-up icons** (6) — currently emoji, 96×96 transparent PNG:
`magnet`, `shield`, `speed`, `slowmo`, `double`, `giant`

---

## 4) Worlds (backgrounds) — `assets/worlds/<id>/`  ★ medium priority

8 worlds from [data.js](js/data.js) `WORLDS`. Each is rendered as **3 parallax layers + ground** (see [game.js](js/game.js) `drawBackground`). For each world supply **horizontally-seamless (tileable) PNGs**:

- `sky.png` — 1920×1080 *(optional; gradient used otherwise)*
- `far.png` — ~2048×720, far silhouettes, seamless
- `mid.png` — ~2048×720, mid silhouettes, seamless
- `near.png` — ~2048×720, near silhouettes, seamless
- `ground.png` — 256×256 seamless tile (or 512×360 strip)

World ids / themes:
1. `meadows` — Green Meadows (trees, leaves)
2. `forest` — Sunny Forest
3. `snow` — Snow Land (pines, mountains, snow)
4. `desert` — Desert Run (cacti, dunes, sand)
5. `candy` — Candy World (lollipops, bubbles)
6. `volcano` — Volcano Zone (rocks, embers)
7. `cyber` — Cyber City (neon buildings, rain)
8. `space` — Space Station (planets, stars)

→ ~32 layer images (4 × 8). Sky optional.

---

## 5) Weather particles *(optional)* — `assets/weather/`

Small 32×32 transparent PNGs (code currently draws these). One each:
`leaf`, `snowflake`, `sand`, `ember`, `raindrop`, `bubble`, `star`

---

## 6) UI — `assets/ui/` + `icons/`

| Asset | Size | File | Notes |
|---|---|---|---|
| App icon | 192×192, 512×512 | `icons/icon-192.png`, `icon-512.png` | replaces current SVG if you prefer raster |
| Maskable icon | 512×512 | `icons/icon-maskable.png` | keep art in centre 80% safe zone |
| Logo | ~640×320 | `ui/logo.png` | optional; CSS text logo used now |
| Currency icons | 64×64 | `ui/bone.png`, `ui/coin.png`, `ui/paw.png` | for HUD/shop (can reuse item art) |
| Medals | 64×64 | `ui/gold.png`, `ui/silver.png`, `ui/bronze.png` | optional; leaderboard uses emoji now |

Buttons/panels are styled with CSS — no images needed unless you want custom textures.

---

## 7) Audio — `assets/audio/`  (currently synthesized)

**Music** — seamless loops, 30–90s, `.ogg` (+ `.mp3` fallback). One per world (8):
`meadows`, `forest`, `snow`, `desert`, `candy`, `volcano`, `cyber`, `space`

**SFX** — short one-shots, `.ogg`/`.wav` (from [audio.js](js/audio.js)). 17 total:
`jump`, `double_jump`, `slide`, `coin`, `bone`, `paw`, `mystery`, `powerup`,
`hit`, `shield`, `smash`, `levelup`, `achievement`, `button`, `gameover`, `countdown`, `go`

---

## Priority order (if doing it in passes)

1. **Puppy `classic`** sheet + the 10 **obstacles** + 4 **collectibles** — biggest visual upgrade.
2. **World backgrounds** (start with `meadows`, `snow`, `cyber`, `space`).
3. **Power-up icons**, remaining **skins**, **app icons**.
4. **Audio** music + SFX.
5. Accessories, medals, weather sprites (nice-to-have).

---

### How to plug them in
Right now the renderer is fully procedural. Once you drop images into `assets/` using these names, I can add a small **asset loader** that uses your images when present and **falls back to the procedural art** when missing — so it keeps working at every stage. Just say the word and I'll wire it up.
