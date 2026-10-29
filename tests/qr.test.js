// Encoder tests: known answers from ISO/IEC 18004, plus structure every symbol must have.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../site/js/qr.js');

const LEVELS = ['L', 'M', 'Q', 'H'];
const KIND = QR.KIND;

function urlOfLength(n) {
  let s = 'https://example.com/';
  for (let i = 0; s.length < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789-_'[(i * 7) % 38];
  return s.slice(0, n);
}

// Format information strings, most significant bit first (ISO/IEC 18004 annex C).
const FORMAT_BITS = {
  L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
  M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'],
  Q: ['011010101011111', '011000001101000', '011111100110001', '011101000000110', '010010010110100', '010000110000011', '010111011011010', '010101111101101'],
  H: ['001011010001001', '001001110111110', '001110011100111', '001100111010000', '000011101100010', '000001001010101', '000110100001100', '000100000111011']
};

function readFormat(qr) {
  const m = qr.modules, size = qr.size, first = [], second = [];
  for (let i = 0; i <= 5; i++) first[i] = m[i][8];
  first[6] = m[7][8];
  first[7] = m[8][8];
  first[8] = m[8][7];
  for (let i = 9; i < 15; i++) first[i] = m[8][14 - i];
  for (let i = 0; i < 8; i++) second[i] = m[8][size - 1 - i];
  for (let i = 8; i < 15; i++) second[i] = m[size - 15 + i][8];
  const toInt = bits => bits.reduce((acc, dark, i) => acc | ((dark ? 1 : 0) << i), 0);
  return [toInt(first), toInt(second)];
}

test('capacity matches the ISO/IEC 18004 table', () => {
  const cases = [
    [1, 'L', 'byte', 17], [1, 'H', 'byte', 7], [1, 'M', 'numeric', 34], [1, 'M', 'alphanumeric', 20],
    [7, 'M', 'byte', 122], [10, 'Q', 'byte', 151], [40, 'L', 'byte', 2953], [40, 'H', 'byte', 1273], [40, 'L', 'numeric', 7089]
  ];
  for (const [version, level, mode, expected] of cases) {
    assert.equal(QR.capacity(version, level, mode), expected, `${version}-${level} ${mode}`);
  }
});

test('picks the smallest version that fits, for every version and level', () => {
  for (const level of LEVELS) {
    for (let v = 1; v <= 40; v++) {
      const cap = QR.capacity(v, level, 'byte');
      assert.equal(QR.encode(urlOfLength(cap), { level }).version, v, `${v}-${level} at capacity`);
      if (v < 40) assert.equal(QR.encode(urlOfLength(cap + 1), { level }).version, v + 1, `${v}-${level} one byte over`);
    }
  }
});

test('HELLO WORLD at level Q has the textbook data codewords', () => {
  const qr = QR.encode('HELLO WORLD', { level: 'Q' });
  assert.equal(qr.version, 1);
  assert.equal(qr.mode, 'alphanumeric');
  assert.deepEqual(qr.dataCodewords, [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236]);
});

test('chooses numeric, alphanumeric or byte mode', () => {
  assert.equal(QR.encode('0123456789').mode, 'numeric');
  assert.equal(QR.encode('HTTPS://EXAMPLE.COM/').mode, 'alphanumeric');
  assert.equal(QR.encode('https://example.com/').mode, 'byte');
  assert.equal(QR.encode('https://example.com/狐狸').count, new TextEncoder().encode('https://example.com/狐狸').length);
});

test('both copies of the format information match the spec for every level and mask', () => {
  for (const level of LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      const qr = QR.encode('https://example.com/', { level, mask });
      assert.equal(qr.mask, mask);
      const expected = parseInt(FORMAT_BITS[level][mask], 2);
      assert.deepEqual(readFormat(qr), [expected, expected], `${level} mask ${mask}`);
    }
  }
});

test('function patterns sit where the spec puts them', () => {
  for (const v of [1, 2, 7, 21, 40]) {
    const qr = QR.encode('x', { level: 'M', minVersion: v });
    const { size, modules: m } = qr;
    assert.equal(qr.version, v);
    assert.equal(size, v * 4 + 17);
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          assert.equal(m[cy + dy][cx + dx], ring !== 2, `finder at ${cx},${cy} v${v}`);
        }
      }
    }
    for (let i = 8; i < size - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `horizontal timing v${v}`);
      assert.equal(m[i][6], i % 2 === 0, `vertical timing v${v}`);
    }
    assert.equal(m[size - 8][8], true, `dark module v${v}`);
  }
});

test('every codeword owns exactly eight modules', () => {
  for (const v of [1, 5, 10, 25, 40]) {
    for (const level of LEVELS) {
      const qr = QR.encode(urlOfLength(QR.capacity(v, level, 'byte')), { level });
      const counts = new Map();
      for (const row of qr.codewordIndex) for (const ci of row) if (ci >= 0) counts.set(ci, (counts.get(ci) || 0) + 1);
      assert.equal(counts.size, qr.codewordBlock.length, `v${v}-${level}`);
      for (const n of counts.values()) assert.equal(n, 8);
    }
  }
});

test('fitLogo keeps the centre square inside the correction budget', () => {
  for (const len of [20, 60, 130, 300]) {
    for (const level of ['Q', 'H']) {
      const qr = QR.encode(urlOfLength(len), { level });
      const fit = QR.fitLogo(qr, 0.28, 0.6);
      if (fit.blocked) continue;
      assert.equal(fit.side % 2, 1);
      assert.equal(fit.start * 2 + fit.side, qr.size);
      assert.ok(fit.worst <= Math.floor(qr.correctable * 0.6));
      for (let y = fit.start; y < fit.start + fit.side; y++) {
        for (let x = fit.start; x < fit.start + fit.side; x++) {
          assert.ok(qr.kinds[y][x] === KIND.DATA || qr.kinds[y][x] === KIND.ALIGNMENT, 'logo covers a function pattern');
        }
      }
    }
  }
  assert.equal(QR.fitLogo(QR.encode('https://a.co', { level: 'L' }), 0.3, 0.6).blocked, true);
});

test('refuses content that no version can hold', () => {
  assert.throws(() => QR.encode(urlOfLength(2954), { level: 'L' }), err => {
    assert.equal(err.name, 'RangeError');
    assert.equal(err.max, 2953);
    assert.equal(err.count, 2954);
    assert.equal(err.mode, 'byte');
    return true;
  });
});
