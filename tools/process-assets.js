/* Asset pipeline v2.
 * The supplied art is JPEG (.png extension) with transparency flattened to a
 * checkerboard. This decodes the JPEGs, keys the checkerboard back out to real
 * alpha, and writes clean transparent PNGs the game can use directly.
 *
 *  - obstacles / items : single centred object -> cropped transparent PNG
 *  - puppy skins       : labelled 6-col grid (Run/Jump/Slide) -> 3 uniform strips
 *  - worlds            : sky/ground kept opaque; far/mid/near keyed transparent
 *
 * Usage: node tools/process-assets.js [obstacles|items|puppy|worlds|all]
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const jpeg = require('jpeg-js');

/* ----------------------------- PNG encode ----------------------------- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([l, t, data, cc]); };
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ----------------------------- helpers ----------------------------- */
function decode(file) { const r = jpeg.decode(fs.readFileSync(file), { maxMemoryUsageInMB: 1024, formatAsRGBA: true }); return { w: r.width, h: r.height, data: r.data }; }
// checkerboard = neutral (gray/white) and not dark; works for any checker shade.
// Border-connected flood fill means dark outlines stop the fill, so even
// neutral-coloured sprites (shadow/robot) stay intact (they're enclosed).
const isBg = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 105 && (mx - mn) < 26; };

// flood-fill transparency from the border across background-coloured pixels
function keyCheckerboard(img) {
  const { w, h, data } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x; if (seen[i]) return; seen[i] = 1;
    const p = i * 4;
    if (isBg(data[p], data[p + 1], data[p + 2])) { data[p + 3] = 0; stack.push(x, y); }
  };
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
    pushIf(x + 1, y + 1); pushIf(x - 1, y - 1); pushIf(x + 1, y - 1); pushIf(x - 1, y + 1);
  }
  return img;
}

function bbox(img, x0, y0, x1, y1, athr = 40) {
  const { w, data } = img; let minx = x1, miny = y1, maxx = x0, maxy = y0, found = false;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * w + x) * 4 + 3] > athr) { found = true; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  return found ? { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 } : null;
}

// copy a sub-rect of src into dst at (dx,dy)
function blit(src, sx, sy, sw, sh, dst, dstW, dx, dy) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const a = src.data[((sy + y) * src.w + (sx + x)) * 4 + 3]; if (a < 6) continue;
    const si = ((sy + y) * src.w + (sx + x)) * 4, di = ((dy + y) * dstW + (dx + x)) * 4;
    dst[di] = src.data[si]; dst[di + 1] = src.data[si + 1]; dst[di + 2] = src.data[si + 2]; dst[di + 3] = a;
  }
}

/* ----------------------------- single object (obstacle / item) ------- */
function processSingle(src, out) {
  if (!fs.existsSync(src)) return null;
  const img = keyCheckerboard(decode(src));
  const bb = bbox(img, 0, 0, img.w, img.h, 60);
  if (!bb) { console.log('  ! no content:', src); return null; }
  const pad = Math.round(Math.max(bb.w, bb.h) * 0.02);
  const x0 = Math.max(0, bb.x - pad), y0 = Math.max(0, bb.y - pad);
  const x1 = Math.min(img.w, bb.x + bb.w + pad), y1 = Math.min(img.h, bb.y + bb.h + pad);
  const ow = x1 - x0, oh = y1 - y0, dst = Buffer.alloc(ow * oh * 4);
  blit(img, x0, y0, ow, oh, dst, ow, 0, 0);
  fs.writeFileSync(out, encodePNG(ow, oh, dst));
  return { w: ow, h: oh };
}

/* ----------------------------- puppy grid ---------------------------- */
const ANIMS = ['run', 'jump', 'slide'];   // rows 0,1,2 of the sheet
function processPuppy(src, baseOut) {
  if (!fs.existsSync(src)) return null;
  const img = keyCheckerboard(decode(src));
  const cols = 6, rows = 4, colW = img.w / cols, rowH = img.h / rows;
  const result = {};
  for (let r = 0; r < ANIMS.length; r++) {
    const frames = [];
    for (let c = 0; c < cols; c++) {
      const cx0 = Math.round(c * colW) + 3, cx1 = Math.round((c + 1) * colW) - 3;
      const cy0 = Math.round(r * rowH) + 3, cy1 = Math.round(r * rowH + rowH * 0.78); // exclude label band
      const bb = bbox(img, cx0, cy0, cx1, cy1, 50);
      if (bb) frames.push(bb);
    }
    if (!frames.length) continue;
    const cw = Math.max(...frames.map((f) => f.w)) + 12;
    const ch = Math.max(...frames.map((f) => f.h)) + 12;
    const baseline = ch - 6;
    const strip = Buffer.alloc(cw * frames.length * ch * 4);
    frames.forEach((f, i) => blit(img, f.x, f.y, f.w, f.h, strip, cw * frames.length, i * cw + Math.round((cw - f.w) / 2), baseline - f.h));
    fs.writeFileSync(`${baseOut}.${ANIMS[r]}.png`, encodePNG(cw * frames.length, ch, strip));
    result[ANIMS[r]] = { count: frames.length, fw: cw, fh: ch };
  }
  return result;
}

/* ----------------------------- worlds -------------------------------- */
function processWorldLayer(src, out, keyed) {
  if (!fs.existsSync(src)) return false;
  const img = decode(src);
  if (keyed) keyCheckerboard(img);
  fs.writeFileSync(out, encodePNG(img.w, img.h, img.data));
  return true;
}

/* ----------------------------- run ----------------------------- */
const A = 'assets';
const OBSTACLES = ['crate', 'rock', 'stump', 'fence', 'barrel', 'spikes', 'saw', 'bird', 'drone', 'puddle'];
const ITEMS = ['bone', 'coin', 'paw', 'mystery', 'magnet', 'shield', 'speed', 'slowmo', 'double', 'giant'];
const SKINS = ['classic', 'snow', 'shadow', 'golden', 'ninja', 'pirate', 'robot', 'super'];
const WORLDS = ['meadows', 'forest', 'snow', 'desert', 'candy'];

const what = process.argv[2] || 'all';
const run = (k) => what === 'all' || what === k;
const manifest = { puppy: {} };

if (run('obstacles')) { console.log('obstacles:'); OBSTACLES.forEach((id) => { const r = processSingle(`${A}/obstacles/${id}.png`, `${A}/obstacles/${id}.proc.png`); if (r) console.log(`  ${id} -> ${r.w}x${r.h}`); }); }
if (run('items')) { console.log('items:'); ITEMS.forEach((id) => { const r = processSingle(`${A}/items/${id}.png`, `${A}/items/${id}.proc.png`); if (r) console.log(`  ${id} -> ${r.w}x${r.h}`); }); }
if (run('puppy')) { console.log('puppy:'); SKINS.forEach((id) => { const r = processPuppy(`${A}/puppy/${id}.png`, `${A}/puppy/${id}`); if (r) { manifest.puppy[id] = r; console.log(`  ${id} ->`, Object.entries(r).map(([k, v]) => `${k}:${v.count}`).join(' ')); } }); fs.writeFileSync(`${A}/puppy/manifest.json`, JSON.stringify(manifest.puppy, null, 2)); }
if (run('worlds')) {
  console.log('worlds:');
  WORLDS.forEach((id) => {
    const d = `${A}/worlds/${id}`;
    processWorldLayer(`${d}/sky.png`, `${d}/sky.proc.png`, false);
    processWorldLayer(`${d}/ground.png`, `${d}/ground.proc.png`, false);
    ['far', 'mid', 'near'].forEach((l) => processWorldLayer(`${d}/${l}.png`, `${d}/${l}.proc.png`, true));
    console.log(`  ${id} done`);
  });
}
console.log('done.');
