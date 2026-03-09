// Run with Node.js to generate icons: node generate-icons.js
// Requires: npm install canvas  (or use the built-in approach below with no deps)
//
// This script writes minimal valid PNG files for each required icon size.
// The icons are a simple blue square with a white "C" (for Copy).
// If you have Node + canvas installed you can replace this with richer graphics.

const fs = require("fs");
const path = require("path");

// Minimal 1x1 transparent PNG (base64) used as a fallback placeholder.
// For a real extension, replace these with proper artwork.
const SIZES = [16, 48, 128];

// Each size gets a solid #1a73e8 blue square PNG generated via a tiny pure-JS PNG encoder.
function createPNG(size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBytes = Buffer.from(type, "ascii");
    const body = Buffer.concat([typeBytes, data]);
    const crc = crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Image data: each row = filter byte (0) + RGB pixels
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const base = y * rowSize;
    raw[base] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const off = base + 1 + x * 3;
      raw[off]     = 0x1a; // R
      raw[off + 1] = 0x73; // G
      raw[off + 2] = 0xe8; // B  => #1a73e8
    }
  }

  const zlib = require("zlib");
  const compressed = zlib.deflateSync(raw);

  const idat = chunk("IDAT", compressed);
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, chunk("IHDR", ihdr), idat, iend]);
}

// Simple CRC-32 implementation
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
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff);
}

const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

for (const size of SIZES) {
  const png = createPNG(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Written ${outPath} (${png.length} bytes)`);
}

console.log("Done. Icons are solid blue squares — replace with real artwork as needed.");
