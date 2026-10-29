<img src=".github/banner.png" alt="QB Code: the blue cyber fox beside the words QB Code, joined by glowing circuit lines">

# QB Code

A static QR code generator for URLs that puts a little cyber fox in the middle of every code, without making the code harder to read.

The name is a pun: 九尾 (*kyū-bi*) is the nine-tailed fox of Japanese folklore, and *kyū-bi* sounds like the letters **Q·B**, so a nine-tailed fox's QR code is a QB code. The repository is called `kyubi-qr`.

**Site:** https://protosdk.github.io/kyubi-qr/

## 繁體中文簡介

QB Code 是九尾狐的 QR 碼產生器：九尾（きゅうび，kyū-bi）唸起來就是 Q·B，碼狸全開。貼上網址碼上就好，可以下載 PNG 或 SVG，要列印、要分享，有狐同享。QR 編碼器完全自己實作，全部在瀏覽器裡計算，沒有後端伺服器，內容不會送到任何地方。九尾狐佔多大由糾錯預算精確計算，照樣掃得出來，狸所當然。

## Features

- **URL**: adds `https://` when it's missing, and warns about addresses phones can't open or may misread.
- **Fox in the centre**, sized so it uses at most 60% of the error correction (see below).
- **Downloads**: PNG (about 1024 px) and SVG, plus copy-to-clipboard.
- **Structure overlay** that colours the finder, timing and alignment patterns and the format and version information.
- **Cyberpunk motion**: a neon flicker-on with an occasional glitch on the wordmark, a HUD ring around the fox, a drifting circuit grid, and a scan line with lock-on brackets for each new code. It all turns off when the system asks for reduced motion.
- No server, no build step, no dependencies. The site is plain HTML, CSS and JavaScript.

## How the fox stays readable

The encoder (`site/js/qr.js`) is written from scratch against ISO/IEC 18004: versions 1–40, numeric, alphanumeric and byte (UTF-8) modes, Reed–Solomon error correction, and automatic mask selection.

While placing data, it records which codeword and error-correction block each module belongs to. To place the fox, the page:

1. Takes a square in the centre (28% of the code's width, odd number of modules).
2. Counts every codeword that has at least one module under the square as damaged, which is the worst case.
3. Keeps the square only if the most-damaged block uses no more than **60%** of what that block can correct. The remaining 40% is margin for dirt, blur and camera angle. The finder, timing and format areas are never covered.
4. If the square doesn't fit, tries up to three larger versions, then falls back to a smaller square.

## Fixed output settings

| Setting | Value |
| --- | --- |
| Error correction | H (30%) |
| Quiet zone | 4 modules |
| Colours | `#0A1630` modules on `#E6F0FF` |
| PNG size | about 1024 px, whole pixels per module |
| Fox | 28% of the code width |

The values live in `OUTPUT` at the top of `site/js/app.js`.

## Privacy

- Everything is computed in the browser. What you type is never sent anywhere.
- The URL and the structure-overlay switch are kept in your browser's `localStorage` so they're still there next time.
- The page loads its fonts from Google Fonts, so your browser requests the font files from Google. Nothing you type is part of those requests.

## Run locally

```bash
python3 -m http.server 8000 --directory site
```

Then open http://localhost:8000. Opening `site/index.html` straight from disk also works, but without the fox, because browsers block `fetch` on `file://` pages.

## Tests

```bash
npm test
```

This needs Node.js 20 or later and nothing else. The tests cover known answers from the spec (capacity tables, all 32 format-information strings, the textbook `HELLO WORLD` codewords), symbol structure, the codeword map, the logo budget, and the URL payload.

On macOS there's also a round-trip check that renders 208 symbols (every version and level, every mask, and logo areas filled with random noise) and decodes them with Apple's Vision framework:

```bash
npm run check:vision
```

## Deploy

`.github/workflows/pages.yml` runs the tests on every push and pull request. Pushes to `main` also publish `site/` to GitHub Pages.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. On GitHub's free plan, Pages needs the repository to be public.

## Project layout

```
site/
  index.html            page markup and search/link-preview metadata
  manifest.webmanifest  name and icons for adding the page to a home screen
  css/style.css         styles
  js/qr.js              QR encoder (also loadable from Node)
  js/payloads.js        URL payload builder
  js/app.js             page logic: rendering, fox placement, downloads
  assets/               fox picture, icons and link-preview image (not Apache-licensed, see below)
tests/                  node:test suites
tools/                  macOS Vision round-trip check
```

## License

The code is licensed under the [Apache License 2.0](LICENSE).

The fox picture and every image made from it (all files in `site/assets/`, and the README banner `.github/banner.png`) are **not** covered by that license. All rights are reserved, and they're included only so the official site and this README can show them. If you fork this project, replace those files with your own pictures. See [NOTICE](NOTICE).
