// Payload tests: the URL text that gets encoded and the notes shown to people.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Payloads = require('../site/js/payloads.js');

const tones = notes => notes.map(n => n.tone);

test('URL: adds https:// and flags addresses phones cannot open', () => {
  assert.equal(Payloads.url('example.com/fox').text, 'https://example.com/fox');
  assert.deepEqual(tones(Payloads.url('example.com/fox').notes), ['info']);
  assert.deepEqual(tones(Payloads.url('https://example.com/').notes), []);
  assert.deepEqual(tones(Payloads.url('https://localhost').notes), ['warn']);
  assert.equal(Payloads.url('https://example.com/狐狸').encoded, 'https://example.com/%E7%8B%90%E7%8B%B8');
  assert.equal(Payloads.url('   ').text, '');
});
