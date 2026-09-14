const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const outPath = path.join(__dirname, '..', 'fire-tv', 'icons', 'icon-512.png');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const t = [];
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let j = 0; j < 8; j++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
    t[i] = v;
  }
  for (const b of buf) c = t[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tp = Buffer.from(type);
  const cr = Buffer.alloc(4);
  cr.writeUInt32BE(crc32(Buffer.concat([tp, data])) >>> 0);
  return Buffer.concat([len, tp, data, cr]);
}

const SIZE = 512;
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type RGB

// Each row: 1 filter byte (0=None) + SIZE*3 RGB bytes
const row = Buffer.alloc(1 + SIZE * 3);
row[0] = 0;
for (let i = 1; i < row.length; i += 3) {
  row[i] = 11; row[i + 1] = 14; row[i + 2] = 19; // #080b13 dark bg
}
const rows = [];
for (let i = 0; i < SIZE; i++) rows.push(row);
const raw = Buffer.concat(rows);
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(outPath, png);
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
