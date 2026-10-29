// Payload tests: exact WIFI: strings, a scanner-style round trip, and the notes shown to people.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Payloads = require('../site/js/payloads.js');

// Reads fields the way ZXing's WifiResultParser and Android's WifiQrCode do: split on unescaped ';', drop backslash escapes.
function parseWifi(text) {
  assert.ok(text.startsWith('WIFI:'), 'missing WIFI: prefix');
  assert.ok(text.endsWith(';;'), 'missing ;; terminator');
  const fields = {};
  let key = null, value = '', escaped = false, i = 5;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { value += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (key === null) {
      if (ch === ';') break;
      if (ch === ':') { key = value; value = ''; continue; }
      value += ch;
      continue;
    }
    if (ch === ';') { fields[key] = value; key = null; value = ''; continue; }
    value += ch;
  }
  assert.equal(i, text.length - 1, 'trailing data after ;;');
  return fields;
}

const tones = notes => notes.map(n => n.tone);

const exact = [
  ['WPA', { ssid: 'Fox-Den-Guest', password: 'sunny-fox-2026', security: 'WPA', hidden: false },
    'WIFI:T:WPA;S:Fox-Den-Guest;P:sunny-fox-2026;;', []],
  ['hidden network', { ssid: 'Den', password: 'acorns and berries', security: 'WPA', hidden: true },
    'WIFI:T:WPA;S:Den;P:acorns and berries;H:true;;', []],
  ['special characters', { ssid: 'a;b,c:d\\e"f', password: 'p;w:d,1\\"x!', security: 'WPA', hidden: false },
    'WIFI:T:WPA;S:a\\;b\\,c\\:d\\\\e\\"f;P:p\\;w\\:d\\,1\\\\\\"x!;;', ['info']],
  ['open network', { ssid: 'Cafe Free', password: 'ignored', security: 'nopass', hidden: false },
    'WIFI:T:nopass;S:Cafe Free;;', []],
  ['open hidden network', { ssid: 'Cafe Free', password: '', security: 'nopass', hidden: true },
    'WIFI:T:nopass;S:Cafe Free;H:true;;', []],
  ['WEP', { ssid: 'OldRouter', password: 'abcdefghijklm', security: 'WEP', hidden: false },
    'WIFI:T:WEP;S:OldRouter;P:abcdefghijklm;;', ['info']],
  ['Chinese SSID', { ssid: '狐狸的家', password: 'kitsune-2026', security: 'WPA', hidden: false },
    'WIFI:T:WPA;S:狐狸的家;P:kitsune-2026;;', []],
  ['64-digit hex key', { ssid: 'Lab', password: 'a'.repeat(64), security: 'WPA', hidden: false },
    'WIFI:T:WPA;S:Lab;P:' + 'a'.repeat(64) + ';;', []]
];

for (const [name, input, text, noteTones] of exact) {
  test(`Wi-Fi: ${name}`, () => {
    const result = Payloads.wifi(input);
    assert.equal(result.text, text);
    assert.deepEqual(tones(result.notes), noteTones);
    const fields = parseWifi(result.text);
    assert.equal(fields.S, input.ssid);
    assert.equal(fields.T, input.security);
    assert.equal(fields.H, input.hidden ? 'true' : undefined);
    if (input.security === 'nopass') {
      assert.ok(!('P' in fields));
    } else {
      assert.equal(fields.P, input.password);
      assert.ok(!result.masked.includes(input.password), 'masked text shows the password');
    }
  });
}

test('Wi-Fi: warns about settings a router would not accept', () => {
  const cases = [
    [{ ssid: 'Den', password: 'short', security: 'WPA' }, ['warn']],
    [{ ssid: 'Den', password: 'x'.repeat(64), security: 'WPA' }, ['warn']],
    [{ ssid: 'Den', password: '狐狸狐狸狐狸狐狸', security: 'WPA' }, ['warn']],
    [{ ssid: '狐'.repeat(11), password: 'sunny-fox-2026', security: 'WPA' }, ['warn']],
    [{ ssid: ' Den', password: 'sunny-fox-2026', security: 'WPA' }, ['warn']],
    [{ ssid: 'CAFE1234', password: 'sunny-fox-2026', security: 'WPA' }, ['info']],
    [{ ssid: 'Old', password: 'abc', security: 'WEP' }, ['warn', 'info']]
  ];
  for (const [input, expected] of cases) assert.deepEqual(tones(Payloads.wifi(input).notes), expected, JSON.stringify(input));
});

test('Wi-Fi: waits for the fields it needs', () => {
  assert.equal(Payloads.wifi({ ssid: '', password: 'x', security: 'WPA' }).text, '');
  assert.equal(Payloads.wifi({ ssid: 'Den', password: '', security: 'WPA' }).text, '');
  assert.equal(Payloads.wifi({ ssid: 'Den', password: '', security: 'nopass' }).text, 'WIFI:T:nopass;S:Den;;');
});

test('URL: adds https:// and flags addresses phones cannot open', () => {
  assert.equal(Payloads.url('example.com/fox').text, 'https://example.com/fox');
  assert.deepEqual(tones(Payloads.url('example.com/fox').notes), ['info']);
  assert.deepEqual(tones(Payloads.url('https://example.com/').notes), []);
  assert.deepEqual(tones(Payloads.url('https://localhost').notes), ['warn']);
  assert.equal(Payloads.url('https://example.com/狐狸').encoded, 'https://example.com/%E7%8B%90%E7%8B%B8');
  assert.equal(Payloads.url('   ').text, '');
});
