/**
 * Generates DSAHub's extension icons into `public/`.
 *
 * The artwork is code rather than a checked-in binary for one reason that matters at 16px:
 * each size is rendered at its own resolution instead of being downscaled from 128, so the
 * toolbar icon stays sharp. It also makes "how do I change the icon" answerable.
 *
 * No image dependency. Node's zlib is the only hard part of a PNG, and the glyph is two
 * rounded rectangles and a triangle — rendered 8× and box-averaged for antialiasing.
 *
 *     npm run icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/** Chrome documents needing these three: toolbar/favicon, extensions page, store. */
const SIZES = [16, 48, 128];

/** Samples per pixel per axis. 8 is past the point where more changes any byte. */
const SUPERSAMPLE = 8;

const INDIGO = [0x4f, 0x46, 0xe5];
const WHITE = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------------------- geometry
// All coordinates are fractions of the canvas, so one description renders at every size.

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const side = (px, py, qx, qy) => (qx - px) * (y - py) - (qy - py) * (x - px);
  const a = side(ax, ay, bx, by);
  const b = side(bx, by, cx, cy);
  const c = side(cx, cy, ax, ay);
  return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
}

/**
 * An arrow pushing up out of a bar: a solution leaving the platform for the repository.
 *
 * Deliberately not a "⟳" or a "{ }" — both turn to mush at 16px, which is the size the
 * user actually looks at.
 */
function sample(x, y) {
  const onTile = inRoundRect(x, y, 0, 0, 1, 1, 0.22);
  if (!onTile) return null;

  const shaft = inRoundRect(x, y, 0.435, 0.3, 0.565, 0.63, 0.03);
  const head = inTriangle(x, y, 0.5, 0.15, 0.28, 0.4, 0.72, 0.4);
  const base = inRoundRect(x, y, 0.26, 0.72, 0.74, 0.85, 0.065);

  return shaft || head || base ? WHITE : INDIGO;
}

// -------------------------------------------------------------------------------- render

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const colour = sample(
            (px * SUPERSAMPLE + sx + 0.5) * step,
            (py * SUPERSAMPLE + sy + 0.5) * step,
          );
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          hits += 1;
        }
      }

      const at = (py * size + px) * 4;
      if (hits === 0) continue;
      // Premultiplied-looking edges are wrong for PNG, so the colour is the average of the
      // samples that hit the tile and only the alpha carries the coverage.
      rgba[at] = Math.round(r / hits);
      rgba[at + 1] = Math.round(g / hits);
      rgba[at + 2] = Math.round(b / hits);
      rgba[at + 3] = Math.round((hits / perPixel) * 255);
    }
  }

  return rgba;
}

// ----------------------------------------------------------------------------- PNG output

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size, rgba) {
  const stride = size * 4;
  // Filter type 0 per scanline. A real encoder would pick per row; the gain on a 128px
  // flat-colour tile is a few dozen bytes.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = truecolour with alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const target = new URL(`../public/icon-${String(size)}.png`, import.meta.url);
  const bytes = png(size, render(size));
  writeFileSync(target, bytes);
  console.log(`icon-${String(size)}.png  ${String(bytes.length)} bytes`);
}
