/* Asset pipeline: turn an AI-generated puppy "sprite sheet" (irregular frame
 * positions, soft halo, transparent background) into a CLEAN uniform horizontal
 * strip the game can blit by equal division.
 *
 * It auto-detects frames via connected-components on the alpha channel, keeps
 * the full rows (drops partial trailing rows like an idle/extra pose), then
 * normalizes every frame bottom-centred into identical cells.
 *
 * Usage: node tools/slice-puppy.js assets/puppy/classic.png
 * Output: <name>.frames.png  +  <name>.frames.json  next to the source.
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

/* ----------------------------- PNG decode ----------------------------- */
function decodePNG(file) {
  const b = fs.readFileSync(file);
  let o = 8, w, h, bd, ct, idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), data = b.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data.readUInt8(8); ct = data.readUInt8(9); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (bd !== 8 || ct !== 6) throw new Error('Only 8-bit RGBA PNG supported (got bd=' + bd + ' ct=' + ct + ')');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  const paeth = (a, bb, c) => { const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? bb : c; };
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], ri = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rv = raw[ri + x], a = x >= bpp ? out[y * stride + x - bpp] : 0, bb = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
      let v; switch (ft) { case 0: v = rv; break; case 1: v = rv + a; break; case 2: v = rv + bb; break; case 3: v = rv + ((a + bb) >> 1); break; case 4: v = rv + paeth(a, bb, c); break; default: v = rv; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, data: out };
}

/* ----------------------------- PNG encode ----------------------------- */
const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ----------------------------- slicing ----------------------------- */
function slice(file) {
  const img = decodePNG(file);
  const { w, h, data } = img;
  const A = (x, y) => data[(y * w + x) * 4 + 3];
  const TH = 90;            // solid-body threshold for component detection
  const SOFT = 18;          // include soft anti-aliased edge
  const HALO = 14;          // below this, kill (removes faint halo)

  // connected components (8-connected) over solid pixels
  const lab = new Int32Array(w * h).fill(-1); let comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) >= TH && lab[y * w + x] === -1) {
      let minx = x, maxx = x, miny = y, maxy = y, area = 0; const st = [[x, y]]; lab[y * w + x] = comps.length;
      while (st.length) {
        const [cx, cy] = st.pop(); area++;
        if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && lab[ny * w + nx] === -1 && A(nx, ny) >= TH) { lab[ny * w + nx] = comps.length; st.push([nx, ny]); }
        }
      }
      comps.push({ minx, miny, maxx, maxy, area, cy: (miny + maxy) / 2 });
    }
  }
  comps = comps.filter((c) => c.area > 3000);

  // group into rows, keep full rows (drop partial trailing rows)
  comps.sort((a, b) => a.cy - b.cy);
  const rows = []; const ROW_TOL = 130;
  comps.forEach((c) => { const r = rows.find((r) => Math.abs(r.cy - c.cy) < ROW_TOL); if (r) { r.items.push(c); r.cy = (r.cy * (r.items.length - 1) + c.cy) / r.items.length; } else rows.push({ cy: c.cy, items: [c] }); });
  const maxCount = Math.max(...rows.map((r) => r.items.length));
  const kept = [];
  rows.forEach((r) => { if (r.items.length >= Math.max(3, maxCount - 1)) { r.items.sort((a, b) => a.minx - b.minx); kept.push(...r.items); } });

  // expand each frame to capture soft edges
  const frames = kept.map((c) => {
    let minx = c.minx, maxx = c.maxx, miny = c.miny, maxy = c.maxy;
    const PAD = 10;
    for (let y = Math.max(0, c.miny - PAD); y <= Math.min(h - 1, c.maxy + PAD); y++)
      for (let x = Math.max(0, c.minx - PAD); x <= Math.min(w - 1, c.maxx + PAD); x++)
        if (A(x, y) >= SOFT) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    return { minx, miny, w: maxx - minx + 1, h: maxy - miny + 1 };
  });

  const cw = Math.max(...frames.map((f) => f.w)) + 16;
  const ch = Math.max(...frames.map((f) => f.h)) + 16;
  const baseline = ch - 8;            // feet sit near the bottom of the cell
  const count = frames.length;

  // compose strip (count * cw) x ch
  const strip = Buffer.alloc(cw * count * ch * 4);
  const stripStride = cw * count * 4;
  frames.forEach((f, fi) => {
    const offX = fi * cw + Math.round((cw - f.w) / 2);   // horizontal centre
    const offY = baseline - f.h;                          // bottom align
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const si = ((f.miny + y) * w + (f.minx + x)) * 4;
      let a = data[si + 3];
      if (a < HALO) continue;
      const dx = offX + x, dy = offY + y;
      if (dx < 0 || dy < 0 || dx >= cw * count || dy >= ch) continue;
      const di = dy * stripStride + dx * 4;
      strip[di] = data[si]; strip[di + 1] = data[si + 1]; strip[di + 2] = data[si + 2]; strip[di + 3] = a;
    }
  });

  const base = file.replace(/\.png$/i, '');
  fs.writeFileSync(base + '.frames.png', encodePNG(cw * count, ch, strip));
  fs.writeFileSync(base + '.frames.json', JSON.stringify({ count, frameW: cw, frameH: ch, baseline }, null, 2));
  console.log(`sliced ${path.basename(file)} -> ${count} frames @ ${cw}x${ch}  (strip ${cw * count}x${ch})`);
  console.log(`wrote ${path.basename(base)}.frames.png + .frames.json`);
}

const arg = process.argv[2] || 'assets/puppy/classic.png';
slice(arg);
