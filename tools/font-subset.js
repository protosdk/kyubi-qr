// Rewrites the Noto Sans TC link in site/index.html so Google Fonts sends only the characters the page uses.
// The full font is about 3 MB for the page's three weights; the subset is a few hundred KB.
// Usage: npm run fonts (run it after changing any Chinese text; npm test fails until you do)
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const SOURCES = ['index.html', 'js/app.js', 'js/payloads.js'];
const LINK = /https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC[^"]*/;

// Every printable ASCII character, because Noto Sans TC also draws the Latin text in body copy,
// plus every other character in the page and its scripts.
function pageText() {
  const chars = new Set();
  for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCharCode(c));
  for (const file of SOURCES) {
    for (const ch of fs.readFileSync(path.join(SITE, file), 'utf8')) {
      if (ch.codePointAt(0) > 0x7e) chars.add(ch);
    }
  }
  return [...chars].sort().join('');
}

function fontUrl(text) {
  return 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap&text=' + encodeURIComponent(text);
}

function currentUrl() {
  const match = LINK.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'));
  return match ? match[0] : null;
}

module.exports = { pageText, fontUrl, currentUrl };

if (require.main === module) {
  const file = path.join(SITE, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  if (!LINK.test(html)) throw new Error('No Noto Sans TC link found in site/index.html');
  const text = pageText();
  fs.writeFileSync(file, html.replace(LINK, fontUrl(text)));
  console.log(`Noto Sans TC link now covers ${[...text].length} characters.`);
}
