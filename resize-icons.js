// Pure Node.js PNG resize — no external dependencies.
// Decodes a PNG, resizes with bilinear interpolation, re-encodes as PNG.
// Usage: node resize-icons.js

const fs   = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG chunk helpers ─────────────────────────────────────────────────────────
function makeChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb  = Buffer.from(type, "ascii");
  const body = Buffer.concat([tb, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crcBuf]);
}

// ── PNG decoder ───────────────────────────────────────────────────────────────
function decodePng(buf) {
  // Parse chunks
  let pos = 8; // skip signature
  const chunks = {};
  const idats  = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos); pos += 4;
    const type   = buf.slice(pos, pos + 4).toString("ascii"); pos += 4;
    const data   = buf.slice(pos, pos + length); pos += length;
    pos += 4; // skip CRC
    if (type === "IHDR") chunks.IHDR = data;
    if (type === "IDAT") idats.push(data);
    if (type === "IEND") break;
  }

  const w         = chunks.IHDR.readUInt32BE(0);
  const h         = chunks.IHDR.readUInt32BE(4);
  const bitDepth  = chunks.IHDR[8];
  const colorType = chunks.IHDR[9];

  // channels per pixel
  let channels;
  if      (colorType === 0) channels = 1; // greyscale
  else if (colorType === 2) channels = 3; // RGB
  else if (colorType === 3) channels = 1; // indexed (treat as 1 ch raw)
  else if (colorType === 4) channels = 2; // greyscale+alpha
  else if (colorType === 6) channels = 4; // RGBA
  else throw new Error(`Unsupported color type: ${colorType}`);

  const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const raw = zlib.inflateSync(Buffer.concat(idats));

  // Reconstruct with PNG filters
  const stride = w * bytesPerPixel;
  const pixels = Buffer.alloc(h * stride);

  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    const filter   = raw[rowStart];
    const src      = raw.slice(rowStart + 1, rowStart + 1 + stride);
    const dst      = pixels.slice(y * stride, y * stride + stride);
    const prev     = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? dst[x - bytesPerPixel] : 0;
      const b = prev[x];
      const c = x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let v = src[x];
      if      (filter === 0) dst[x] = v;
      else if (filter === 1) dst[x] = (v + a) & 0xff;
      else if (filter === 2) dst[x] = (v + b) & 0xff;
      else if (filter === 3) dst[x] = (v + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) dst[x] = (v + paethPredictor(a, b, c)) & 0xff;
    }
  }

  return { w, h, channels, bitDepth, colorType, pixels, bytesPerPixel };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// ── Convert any decoded PNG to RGBA ──────────────────────────────────────────
function toRGBA(img) {
  const { w, h, channels, colorType, pixels, bytesPerPixel } = img;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const src = i * bytesPerPixel;
    let r, g, b, a;
    if      (colorType === 0) { r = g = b = pixels[src]; a = 255; }           // grey
    else if (colorType === 2) { r = pixels[src]; g = pixels[src+1]; b = pixels[src+2]; a = 255; } // RGB
    else if (colorType === 4) { r = g = b = pixels[src]; a = pixels[src+1]; } // grey+alpha
    else if (colorType === 6) { r = pixels[src]; g = pixels[src+1]; b = pixels[src+2]; a = pixels[src+3]; } // RGBA
    else                      { r = g = b = pixels[src]; a = 255; }           // fallback
    const d = i * 4;
    rgba[d]=r; rgba[d+1]=g; rgba[d+2]=b; rgba[d+3]=a;
  }
  return rgba;
}

// ── Bilinear resize ───────────────────────────────────────────────────────────
function resizeRGBA(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      const gx = dx * (sw - 1) / (dw - 1 || 1);
      const gy = dy * (sh - 1) / (dh - 1 || 1);
      const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, sw - 1);
      const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, sh - 1);
      const fx = gx - x0, fy = gy - y0;
      const di = (dy * dw + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = src[(y0 * sw + x0) * 4 + c];
        const v10 = src[(y0 * sw + x1) * 4 + c];
        const v01 = src[(y1 * sw + x0) * 4 + c];
        const v11 = src[(y1 * sw + x1) * 4 + c];
        dst[di + c] = Math.round(
          v00 * (1-fx) * (1-fy) +
          v10 * fx     * (1-fy) +
          v01 * (1-fx) * fy     +
          v11 * fx     * fy
        );
      }
    }
  }
  return dst;
}

// ── PNG encoder (RGBA) ────────────────────────────────────────────────────────
function encodePng(rgba, w, h) {
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  const rowSize = 1 + w * 4;
  const raw = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0; // filter none
    rgba.copy(raw, y * rowSize + 1, y * w * 4, (y + 1) * w * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const iconsDir = path.join(__dirname, "icons");
const src      = fs.readFileSync(path.join(iconsDir, "logo_source.png"));
const img      = decodePng(src);
const rgba     = toRGBA(img);

for (const size of [16, 48, 128]) {
  const resized = resizeRGBA(rgba, img.w, img.h, size, size);
  const png     = encodePng(resized, size, size);
  const out     = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`Written ${out} (${png.length} bytes)`);
}

console.log("Done.");
