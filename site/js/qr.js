// QR Code Model 2 encoder (ISO/IEC 18004), versions 1-40, numeric / alphanumeric / byte (UTF-8) modes.
var QR = (function () {
  'use strict';

  // Indexed [level][version]; index 0 is unused.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  var LEVELS = {
    L: { ord: 0, formatBits: 1 },
    M: { ord: 1, formatBits: 0 },
    Q: { ord: 2, formatBits: 3 },
    H: { ord: 3, formatBits: 2 }
  };
  var MODES = {
    numeric: { indicator: 0x1, countBits: [10, 12, 14] },
    alphanumeric: { indicator: 0x2, countBits: [9, 11, 13] },
    byte: { indicator: 0x4, countBits: [8, 16, 16] }
  };
  var ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  // What each module belongs to; the page uses it to colour the structure overlay.
  var KIND = { DATA: 0, FINDER: 1, TIMING: 2, ALIGNMENT: 3, FORMAT: 4, VERSION: 5, DARK: 6 };
  var FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];

  function level(name) {
    var found = LEVELS[name];
    if (!found) throw new TypeError('Unknown error correction level: ' + name);
    return found;
  }

  function appendBits(bits, value, length) {
    for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  // Picks the most compact single mode the whole text fits in.
  function makeSegment(text) {
    var bits = [], i;
    if (/^[0-9]*$/.test(text)) {
      for (i = 0; i < text.length; i += 3) {
        var n = Math.min(3, text.length - i);
        appendBits(bits, parseInt(text.substr(i, n), 10), n * 3 + 1);
      }
      return { mode: 'numeric', count: text.length, bits: bits };
    }
    var alphanumeric = true;
    for (i = 0; i < text.length; i++) {
      if (ALPHANUMERIC.indexOf(text.charAt(i)) < 0) { alphanumeric = false; break; }
    }
    if (alphanumeric) {
      for (i = 0; i + 1 < text.length; i += 2) {
        appendBits(bits, ALPHANUMERIC.indexOf(text.charAt(i)) * 45 + ALPHANUMERIC.indexOf(text.charAt(i + 1)), 11);
      }
      if (i < text.length) appendBits(bits, ALPHANUMERIC.indexOf(text.charAt(i)), 6);
      return { mode: 'alphanumeric', count: text.length, bits: bits };
    }
    var bytes = new TextEncoder().encode(text);
    for (i = 0; i < bytes.length; i++) appendBits(bits, bytes[i], 8);
    return { mode: 'byte', count: bytes.length, bits: bits };
  }

  function countBits(mode, version) {
    return MODES[mode].countBits[Math.floor((version + 7) / 17)];
  }

  // Modules left for data and ECC after all function patterns, remainder bits included.
  function rawDataModules(version) {
    var result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(version, lvl) {
    return Math.floor(rawDataModules(version) / 8) -
      ECC_CODEWORDS_PER_BLOCK[lvl.ord][version] * NUM_ERROR_CORRECTION_BLOCKS[lvl.ord][version];
  }

  function maxCount(mode, bits) {
    if (bits <= 0) return 0;
    if (mode === 'byte') return Math.floor(bits / 8);
    if (mode === 'alphanumeric') return Math.floor(bits / 11) * 2 + (bits % 11 >= 6 ? 1 : 0);
    return Math.floor(bits / 10) * 3 + (bits % 10 >= 7 ? 2 : bits % 10 >= 4 ? 1 : 0);
  }

  // How many characters (bytes in byte mode) one symbol holds.
  function capacity(version, levelName, mode) {
    var cb = countBits(mode, version);
    return Math.min(maxCount(mode, dataCodewords(version, level(levelName)) * 8 - 4 - cb), (1 << cb) - 1);
  }

  function alignmentPositions(version) {
    if (version === 1) return [];
    var numAlign = Math.floor(version / 7) + 2;
    var step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    var result = [6];
    for (var pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // GF(2^8) with the QR field polynomial x^8 + x^4 + x^3 + x^2 + 1.
  function gfMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMultiply(coef, factor); });
    });
    return result;
  }

  // Splits data into blocks, appends each block's ECC, then interleaves codeword by codeword.
  // Also returns which block each interleaved codeword came from.
  function addEccAndInterleave(data, version, lvl) {
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[lvl.ord][version];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[lvl.ord][version];
    var rawCodewords = Math.floor(rawDataModules(version) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var divisor = rsDivisor(blockEccLen);
    var blocks = [], i, k;
    for (i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [], owner = [];
    for (i = 0; i < blocks[0].length; i++) {
      blocks.forEach(function (block, j) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(block[i]);
          owner.push(j);
        }
      });
    }
    return { codewords: result, owner: owner };
  }

  // Codewords reserved against misdecoding, which the decoder cannot spend on correction (ISO/IEC 18004 table 9).
  function misdecodeProtection(version, levelName) {
    if (version === 1) return { L: 3, M: 2, Q: 1, H: 1 }[levelName];
    if (version === 2 && levelName === 'L') return 2;
    if (version === 3 && levelName === 'L') return 1;
    return 0;
  }

  function lineScore(line) {
    var score = 0, run = 1, n = line.length, i, k;
    for (i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    for (i = 0; i + 11 <= n; i++) {
      var forward = true, backward = true;
      for (k = 0; k < 11; k++) {
        var v = line[i + k] ? 1 : 0;
        if (v !== FINDER_LIKE[k]) forward = false;
        if (v !== FINDER_LIKE[10 - k]) backward = false;
      }
      if (forward) score += 40;
      if (backward) score += 40;
    }
    return score;
  }

  function penaltyScore(modules, size) {
    var score = 0, dark = 0, x, y, column = new Array(size);
    for (y = 0; y < size; y++) score += lineScore(modules[y]);
    for (x = 0; x < size; x++) {
      for (y = 0; y < size; y++) column[y] = modules[y][x];
      score += lineScore(column);
    }
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
      }
    }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (modules[y][x]) dark++;
    var total = size * size;
    return score + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  }

  function buildMatrix(version, lvl, codewords, forcedMask) {
    var size = version * 4 + 17, modules = [], kinds = [], codewordIndex = [], x, y, i, j, dx, dy;
    for (y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      kinds.push(new Array(size).fill(KIND.DATA));
      codewordIndex.push(new Array(size).fill(-1));
    }
    function setFunction(x, y, dark, kind) {
      modules[y][x] = dark;
      kinds[y][x] = kind;
    }

    for (i = 0; i < size; i++) {
      setFunction(6, i, i % 2 === 0, KIND.TIMING);
      setFunction(i, 6, i % 2 === 0, KIND.TIMING);
    }
    // Finder patterns, each with its light separator.
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var xx = c[0] + dx, yy = c[1] + dy;
          if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(xx, yy, dist !== 2 && dist !== 4, KIND.FINDER);
        }
      }
    });
    var align = alignmentPositions(version), n = align.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (dy = -2; dy <= 2; dy++) {
          for (dx = -2; dx <= 2; dx++) {
            setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, KIND.ALIGNMENT);
          }
        }
      }
    }

    function drawFormat(mask) {
      var data = lvl.formatBits << 3 | mask, rem = data, k;
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = (data << 10 | rem) ^ 0x5412;
      function bit(k) { return ((bits >>> k) & 1) !== 0; }
      for (k = 0; k <= 5; k++) setFunction(8, k, bit(k), KIND.FORMAT);
      setFunction(8, 7, bit(6), KIND.FORMAT);
      setFunction(8, 8, bit(7), KIND.FORMAT);
      setFunction(7, 8, bit(8), KIND.FORMAT);
      for (k = 9; k < 15; k++) setFunction(14 - k, 8, bit(k), KIND.FORMAT);
      for (k = 0; k < 8; k++) setFunction(size - 1 - k, 8, bit(k), KIND.FORMAT);
      for (k = 8; k < 15; k++) setFunction(8, size - 15 + k, bit(k), KIND.FORMAT);
      setFunction(8, size - 8, true, KIND.DARK);
    }
    drawFormat(0); // Reserves the format areas so data placement skips them.

    if (version >= 7) {
      var rem = version;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var versionBits = version << 12 | rem;
      for (i = 0; i < 18; i++) {
        var dark = ((versionBits >>> i) & 1) !== 0;
        var a = size - 11 + i % 3, b = Math.floor(i / 3);
        setFunction(a, b, dark, KIND.VERSION);
        setFunction(b, a, dark, KIND.VERSION);
      }
    }

    // Data goes in two-module columns, right to left, alternating up and down, skipping the vertical timing column.
    var bitIndex = 0, totalBits = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      var upward = ((right + 1) & 2) === 0;
      for (var vert = 0; vert < size; vert++) {
        y = upward ? size - 1 - vert : vert;
        for (j = 0; j < 2; j++) {
          x = right - j;
          if (kinds[y][x] !== KIND.DATA || bitIndex >= totalBits) continue;
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          codewordIndex[y][x] = bitIndex >>> 3;
          bitIndex++;
        }
      }
    }

    function applyMask(mask) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (kinds[y][x] === KIND.DATA && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
        }
      }
    }
    var mask = forcedMask;
    if (mask === undefined || mask === null || mask < 0) {
      var best = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(m);
        drawFormat(m);
        var score = penaltyScore(modules, size);
        if (score < best) { best = score; mask = m; }
        applyMask(m);
      }
    }
    if (!(mask >= 0 && mask <= 7)) throw new RangeError('Mask must be 0-7');
    applyMask(mask);
    drawFormat(mask);
    return { size: size, mask: mask, modules: modules, kinds: kinds, codewordIndex: codewordIndex };
  }

  function encode(text, options) {
    options = options || {};
    var levelName = options.level || 'M', lvl = level(levelName);
    var seg = makeSegment(text);
    var version, capacityBits, usedBits;
    for (version = Math.max(1, Math.min(40, options.minVersion || 1)); ; version++) {
      capacityBits = dataCodewords(version, lvl) * 8;
      var cb = countBits(seg.mode, version);
      usedBits = seg.count < (1 << cb) ? 4 + cb + seg.bits.length : Infinity;
      if (usedBits <= capacityBits) break;
      if (version >= 40) {
        var error = new RangeError('Data too long for a QR code');
        error.mode = seg.mode;
        error.count = seg.count;
        error.max = capacity(40, levelName, seg.mode);
        throw error;
      }
    }

    var bits = [], i;
    appendBits(bits, MODES[seg.mode].indicator, 4);
    appendBits(bits, seg.count, countBits(seg.mode, version));
    for (i = 0; i < seg.bits.length; i++) bits.push(seg.bits[i]);
    appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
    appendBits(bits, 0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) appendBits(bits, pad, 8);

    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
      data.push(byte);
    }

    var interleaved = addEccAndInterleave(data, version, lvl);
    var matrix = buildMatrix(version, lvl, interleaved.codewords, options.mask);
    var eccPerBlock = ECC_CODEWORDS_PER_BLOCK[lvl.ord][version];
    return {
      version: version,
      size: matrix.size,
      level: levelName,
      mask: matrix.mask,
      mode: seg.mode,
      count: seg.count,
      dataCodewords: data,
      modules: matrix.modules,
      kinds: matrix.kinds,
      codewordIndex: matrix.codewordIndex,
      codewordBlock: interleaved.owner,
      correctable: Math.floor((eccPerBlock - misdecodeProtection(version, levelName)) / 2)
    };
  }

  // Worst case for covering a square of modules: every codeword with a module inside counts as wrong.
  function coverage(qr, start, side) {
    var touched = {}, perBlock = [], functionHit = false, worst = 0;
    for (var y = start; y < start + side; y++) {
      for (var x = start; x < start + side; x++) {
        var kind = qr.kinds[y][x];
        if (kind !== KIND.DATA && kind !== KIND.ALIGNMENT) functionHit = true;
        var ci = qr.codewordIndex[y][x];
        if (ci < 0 || touched[ci]) continue;
        touched[ci] = true;
        var b = qr.codewordBlock[ci];
        perBlock[b] = (perBlock[b] || 0) + 1;
        worst = Math.max(worst, perBlock[b]);
      }
    }
    return { worst: worst, functionHit: functionHit };
  }

  // Largest centred square (odd side, at most `fraction` of the symbol width) whose worst block
  // loses no more than `limit` of its correction capacity, and which leaves finder, timing and
  // format modules alone. Returns { blocked: true } when even a 5-module square is too much.
  function fitLogo(qr, fraction, limit) {
    var raw = qr.size * fraction;
    var requested = Math.max(5, 2 * Math.round((raw - 1) / 2) + 1);
    var allowed = Math.floor(qr.correctable * limit);
    for (var side = requested; side >= 5; side -= 2) {
      var start = (qr.size - side) / 2;
      var cov = coverage(qr, start, side);
      if (!cov.functionHit && cov.worst <= allowed) {
        return { side: side, start: start, requested: requested, worst: cov.worst, correctable: qr.correctable, allowed: allowed };
      }
    }
    return { blocked: true, requested: requested, correctable: qr.correctable, allowed: allowed };
  }

  return { encode: encode, capacity: capacity, fitLogo: fitLogo, KIND: KIND };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QR;
