// Renders a few hundred symbols to PNG and decodes them with Apple's Vision framework (macOS only).
// Usage: node tools/vision-check.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const QR = require('../site/js/qr.js');
const Payloads = require('../site/js/payloads.js');

if (process.platform !== 'darwin') {
  console.log('Skipped: the Vision decoder needs macOS.');
  process.exit(0);
}

const LOGO_LIMIT = 0.6;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyubi-qr-'));

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// Greyscale PNG with a 4-module quiet zone; dark(x, y) decides each module.
function png(size, dark, scale) {
  const margin = 4, total = (size + margin * 2) * scale;
  const raw = Buffer.alloc((total + 1) * total, 255);
  for (let py = 0; py < total; py++) {
    raw[py * (total + 1)] = 0;
    for (let px = 0; px < total; px++) {
      const x = Math.floor(px / scale) - margin, y = Math.floor(py / scale) - margin;
      if (x >= 0 && y >= 0 && x < size && y < size && dark(x, y)) raw[py * (total + 1) + 1 + px] = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(total, 0);
  ihdr.writeUInt32BE(total, 4);
  ihdr[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const URL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-._~/?=&';
function urlOfLength(n) {
  let s = 'https://example.com/';
  while (s.length < n) s += URL_CHARS[Math.floor(rand() * URL_CHARS.length)];
  return s.slice(0, n);
}

const cases = [];
function add(name, text, options, cover) {
  const qr = QR.encode(text, options);
  const dark = cover ? cover(qr) : (x, y) => qr.modules[y][x];
  const file = path.join(dir, name + '.png');
  fs.writeFileSync(file, png(qr.size, dark, qr.version > 25 ? 5 : qr.version > 10 ? 6 : 8));
  cases.push({ file, name, text, version: qr.version, level: qr.level, mask: qr.mask });
}

for (const level of ['L', 'M', 'Q', 'H']) {
  for (let v = 1; v <= 40; v++) add(`v${v}-${level}`, urlOfLength(QR.capacity(v, level, 'byte')), { level });
}
for (let mask = 0; mask < 8; mask++) {
  add(`mask${mask}-small`, 'https://example.com/fox', { level: 'M', mask });
  add(`mask${mask}-large`, urlOfLength(100), { level: 'Q', mask });
}
add('numeric', '0123456789012345678901234567890123', { level: 'M' });
add('alphanumeric', 'HTTPS://EXAMPLE.COM/AB', { level: 'M' });
add('utf8', 'https://example.com/狐狸?q=背包', { level: 'M' });
const wifi = [
  { ssid: 'Fox-Den-Guest', password: 'sunny-fox-2026', security: 'WPA' },
  { ssid: 'a;b,c:d\\e"f', password: 'p;w:d,1\\"x!', security: 'WPA' },
  { ssid: 'Cafe Free', password: '', security: 'nopass', hidden: true },
  { ssid: '狐狸的家', password: 'kitsune-2026', security: 'WPA' }
];
wifi.forEach((input, i) => add(`wifi${i}`, Payloads.wifi(input).text, { level: 'H' }));
// Centre logo at the page's safety limit, filled with random modules: harsher than a real picture.
for (const level of ['L', 'M', 'Q', 'H']) {
  for (const len of [20, 40, 60, 90, 130, 200, 300, 450]) {
    const text = urlOfLength(len);
    const fit = QR.fitLogo(QR.encode(text, { level }), 0.32, LOGO_LIMIT);
    if (fit.blocked) continue;
    add(`logo-${level}-${len}`, text, { level }, qr => (x, y) => {
      const inside = x >= fit.start && y >= fit.start && x < fit.start + fit.side && y < fit.start + fit.side;
      return inside ? rand() < 0.5 : qr.modules[y][x];
    });
  }
}

const decoder = path.join(dir, 'decode');
execFileSync('swiftc', ['-O', '-o', decoder, path.join(__dirname, 'decode.swift')], { stdio: 'inherit' });
const output = execFileSync(decoder, cases.map(c => c.file), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const results = new Map(output.trim().split('\n').map(line => line.split('\t')).map(p => [p[0], p]));

const failures = [];
for (const c of cases) {
  const r = results.get(c.file);
  if (!r || r[1] !== 'OK') { failures.push(`${c.name}: ${r ? r[1] : 'no result'}`); continue; }
  const text = Buffer.from(r[2], 'base64').toString('utf8');
  if (text !== c.text) failures.push(`${c.name}: payload differs`);
  if (r[3] && Number(r[3]) !== c.version) failures.push(`${c.name}: version ${r[3]}`);
  if (r[4] && r[4] !== c.level) failures.push(`${c.name}: level ${r[4]}`);
  if (r[5] && Number(r[5]) !== c.mask) failures.push(`${c.name}: mask ${r[5]}`);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Vision decoded ${cases.length - failures.length} / ${cases.length} symbols exactly.`);
if (failures.length) {
  failures.forEach(f => console.log('  ' + f));
  process.exit(1);
}
