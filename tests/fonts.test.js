// The Noto Sans TC subset must contain every character the page can show, or that text falls back to another font.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pageText, currentUrl } = require('../tools/font-subset.js');

test('Noto Sans TC link covers every character on the page', () => {
  const url = currentUrl();
  assert.ok(url, 'site/index.html has no Noto Sans TC link');
  const covered = new Set(new URL(url).searchParams.get('text') || '');
  const missing = [...pageText()].filter(ch => !covered.has(ch));
  assert.deepEqual(missing, [], 'Run npm run fonts to add these characters to the font link');
});
