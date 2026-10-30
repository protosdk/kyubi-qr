(function () {
  'use strict';

  // Pixel-art motion over the cyber look: fox-fire rising through the background, signals running along the
  // circuit grid, the header fox on a little CRT screen, and each new code printed module by module.
  // The first two are PixiJS scenes (js/vendor) loaded after the page, so the tool never waits for them; without
  // WebGL the page keeps its CSS look. It is all decoration: nothing here touches the exported images.
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var css = getComputedStyle(document.documentElement);
  var tone = function (name) { return css.getPropertyValue(name).trim(); };
  var COLOR = { well: tone('--well'), trace: tone('--trace'), cyan: tone('--cyan'), frost: tone('--frost') };

  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Calls fn each time the wordmark glitches: glitch-a in style.css fires at 91% of its 7 s loop.
  function onWordmarkGlitch(fn) {
    var glitch = document.querySelector('.glitch');
    if (!glitch) return;
    var onLoop = function (e) {
      if (e.animationName === 'glitch-a') setTimeout(fn, 7000 * 0.91);
    };
    glitch.addEventListener('animationstart', onLoop);
    glitch.addEventListener('animationiteration', onLoop);
  }

  // ---- Background: pixelated fox-fire with a neon bloom, and signals on the grid ----

  // Pixels are 4 CSS px, so one 28 px grid cell is 7 of them. The canvas sits 2 px up and left,
  // which centres every 4 px block on a grid line.
  var BLOCK = 4, GRID_PX = 28, GRID_MS = 7000, SKY_FPS = 30;

  // body::before moves the grid down one cell every 7 s; signals ride the same lines.
  function gridAnimation() {
    if (!document.getAnimations) return null;
    var all = document.getAnimations();
    for (var i = 0; i < all.length; i++) {
      if (all[i].animationName === 'drift') return all[i];
    }
    return null;
  }

  function startSky(PIXI) {
    var canvas = document.getElementById('pixel-sky');
    var app = new PIXI.Application();
    return app.init({
      canvas: canvas, width: innerWidth + 4, height: innerHeight + 4,
      backgroundAlpha: 0, antialias: false, resolution: 1, preference: 'webgl'
    }).then(function () {
      var F = PIXI.filters;
      var fire = new PIXI.Graphics(), lines = new PIXI.Graphics(), flames = new PIXI.Container(), glow = new PIXI.Container();
      flames.addChild(fire);
      // Pinned to the screen so the blocks stay put while the flames move through them.
      flames.filterArea = app.screen;
      flames.filters = [new F.PixelateFilter(BLOCK)];
      glow.addChild(lines, flames);
      var bloom = new F.AdvancedBloomFilter({ threshold: 0.2, bloomScale: 1.2, brightness: 1, blur: 6, quality: 4 });
      var glitch = new F.GlitchFilter({ slices: 12, offset: 24, fillMode: 0 });
      var split = new F.RGBSplitFilter({ red: [-4, 0], green: [0, 0], blue: [4, 0] });
      glow.filters = [bloom];
      app.stage.addChild(glow);
      app.ticker.maxFPS = SKY_FPS;

      var wisps = [], embers = [], signals = [], nextSignal = 0, glitchUntil = 0, grid = gridAnimation();

      function spawn(anywhere) {
        var big = Math.random() < 0.45;
        return {
          x: random(0, app.screen.width), y: anywhere ? random(0, app.screen.height) : app.screen.height + 40,
          r: big ? random(6, 9) : random(3.5, 5.5), speed: random(16, 36),
          sway: random(4, 14), freq: random(0.15, 0.35), phase: random(0, 6.3),
          tip: 1, lean: 0, flickerAt: 0, glow: random(0.45, 0.9), emberAt: 0
        };
      }

      function fit() {
        app.renderer.resize(innerWidth + 4, innerHeight + 4);
        var count = Math.max(6, Math.min(18, Math.round(innerWidth * innerHeight / 90000)));
        while (wisps.length < count) wisps.push(spawn(true));
        wisps.length = count;
      }

      // A kitsunebi: blue halo, cyan teardrop with a flickering tip, white core. PixelateFilter turns it into blocks.
      function drawWisps(now, dt) {
        var h = app.screen.height;
        for (var i = 0; i < wisps.length; i++) {
          var w = wisps[i];
          w.y -= w.speed * dt;
          if (w.y < -40) w = wisps[i] = spawn(false);
          if (now >= w.flickerAt) {
            w.tip = random(0.75, 1.25);
            w.lean = random(-0.5, 0.5);
            w.flickerAt = now + random(90, 220);
          }
          // Brightest low on the screen, gone by the time it reaches the top.
          var fade = Math.max(0, Math.min(1, w.y / h * 1.6, (h + 40 - w.y) / 40));
          if (fade <= 0) continue;
          var a = w.glow * fade, r = w.r;
          var x = w.x + Math.sin(w.phase + now / 1000 * w.freq * 6.283) * w.sway, y = w.y;
          fire.circle(x, y, r * 1.9).fill({ color: COLOR.trace, alpha: a * 0.28 });
          fire.poly([x - r * 0.85, y - r * 0.3, x + w.lean * r, y - r * 2.7 * w.tip, x + r * 0.85, y - r * 0.3]).fill({ color: COLOR.cyan, alpha: a });
          fire.circle(x, y, r).fill({ color: COLOR.cyan, alpha: a });
          fire.circle(x, y + r * 0.15, r * 0.5).fill({ color: COLOR.frost, alpha: a });
          if (now >= w.emberAt) {
            embers.push({ x: x + random(-r, r), y: y + r, speed: w.speed * 0.5, age: 0, life: random(0.6, 1.4), glow: a });
            w.emberAt = now + random(300, 800);
          }
        }
        embers = embers.filter(function (e) {
          e.age += dt;
          e.y -= e.speed * dt;
          if (e.age >= e.life) return false;
          fire.circle(e.x, e.y, 2.5).fill({ color: COLOR.cyan, alpha: e.glow * (1 - e.age / e.life) });
          return true;
        });
      }

      // A signal runs a few cells along one grid line with a short fading tail, then lights the node it reaches.
      function drawSignals(now) {
        if (!grid || grid.currentTime == null) return;
        var drift = (grid.currentTime % GRID_MS) / GRID_MS * GRID_PX;
        if (now >= nextSignal && signals.length < 3) {
          var s = {
            gx: Math.floor(random(1, app.screen.width / GRID_PX)), gy: Math.floor(random(1, app.screen.height / GRID_PX + 1)),
            dx: 0, dy: 0, cells: Math.floor(random(2, 6)), born: now, speed: random(24, 40)
          };
          if (Math.random() < 0.6) s.dx = Math.random() < 0.5 ? -1 : 1; else s.dy = Math.random() < 0.5 ? -1 : 1;
          signals.push(s);
          nextSignal = now + random(500, 1400);
        }
        signals = signals.filter(function (s) {
          var length = s.cells * GRID_PX / BLOCK, run = (now - s.born) / 1000 * s.speed;
          if (run > length + 14) return false;
          // Block-aligned, so the dots land on whole pixels without going through PixelateFilter.
          var x0 = s.gx * GRID_PX, y0 = Math.round(((s.gy - 1) * GRID_PX + drift) / BLOCK) * BLOCK;
          for (var k = 0; k < 6; k++) {
            var d = Math.floor(run) - k;
            if (d < 0 || d > length) continue;
            lines.rect(x0 + s.dx * d * BLOCK, y0 + s.dy * d * BLOCK, BLOCK, BLOCK).fill({ color: COLOR.cyan, alpha: 0.75 * (1 - k / 6) });
          }
          if (run >= length) {
            var a = 0.85 * Math.max(0, 1 - (run - length) / 14);
            var nx = x0 + s.dx * length * BLOCK, ny = y0 + s.dy * length * BLOCK;
            lines.rect(nx - BLOCK, ny, BLOCK * 3, BLOCK).fill({ color: COLOR.cyan, alpha: a });
            lines.rect(nx, ny - BLOCK, BLOCK, BLOCK * 3).fill({ color: COLOR.cyan, alpha: a });
          }
          return true;
        });
      }

      // The background tears into slices along with the wordmark.
      onWordmarkGlitch(function () { glitchUntil = performance.now() + 360; });

      app.ticker.add(function (ticker) {
        var now = performance.now(), dt = Math.min(0.1, ticker.deltaMS / 1000);
        fire.clear();
        lines.clear();
        if (reduced.matches) return;
        drawSignals(now);
        drawWisps(now, dt);
        if (now < glitchUntil) {
          glitch.refresh();
          glow.filters = [bloom, glitch, split];
        } else if (glow.filters.length > 1) {
          glow.filters = [bloom];
        }
      });

      var resizeTimer = 0;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fit, 120);
      });
      fit();
    });
  }

  // ---- Avatar: the fox on a little CRT, booting from blocks and glitching with the wordmark ----

  function startAvatar(PIXI) {
    var avatar = document.querySelector('.avatar');
    var face = avatar && avatar.querySelector('img');
    var canvas = avatar && avatar.querySelector('canvas');
    if (!face || !canvas) return null;
    var dpr = window.devicePixelRatio || 1;
    var app = new PIXI.Application();
    var init = app.init({
      canvas: canvas, width: canvas.clientWidth, height: canvas.clientWidth,
      resolution: dpr, backgroundAlpha: 0, antialias: true, preference: 'webgl'
    });
    return Promise.all([init, PIXI.Assets.load(face.currentSrc || face.src)]).then(function (loaded) {
      var F = PIXI.filters;
      var sprite = new PIXI.Sprite(loaded[1]), mask = new PIXI.Graphics();
      // Pixelation goes on the inner layer, pinned to the canvas so the blocks line up with its edges;
      // the colour split, glitch and CRT go on the outer one.
      var picture = new PIXI.Container(), tube = new PIXI.Container();
      picture.addChild(sprite, mask);
      sprite.mask = mask;
      picture.filterArea = app.screen;
      tube.addChild(picture);
      app.stage.addChild(tube);
      app.ticker.maxFPS = SKY_FPS;

      var pixelate = new F.PixelateFilter(1);
      var crt = new F.CRTFilter({ curvature: 0, lineWidth: 1.4 * dpr, lineContrast: 0.28, noise: 0.05, noiseSize: dpr, vignetting: 0.34, vignettingAlpha: 0.75, vignettingBlur: 0.3 });
      var glitch = new F.GlitchFilter({ slices: 6, offset: 5 * dpr, fillMode: 0 });
      var split = new F.RGBSplitFilter({ red: [-2 * dpr, 0], green: [0, 0], blue: [2 * dpr, dpr] });
      var effect = null;

      function layout() {
        var side = canvas.clientWidth;
        app.renderer.resize(side, side);
        sprite.width = sprite.height = side;
        mask.clear().circle(side / 2, side / 2, side / 2).fill(0xffffff);
      }

      // Steps the block size down through `sizes` (CSS px), with the slice glitch for the first `tear` ms.
      function play(sizes, every, tear) {
        if (effect) return;
        effect = { start: performance.now(), sizes: sizes, every: every, tear: tear };
      }

      app.ticker.add(function () {
        var now = performance.now();
        crt.time += 0.6;
        crt.seed = Math.random();
        if (!effect) return;
        var t = now - effect.start, step = Math.floor(t / effect.every);
        if (step >= effect.sizes.length) {
          effect = null;
          picture.filters = [];
          tube.filters = [crt];
          return;
        }
        pixelate.size = effect.sizes[step] * dpr;
        picture.filters = [pixelate];
        if (t < effect.tear) {
          glitch.refresh();
          tube.filters = [split, glitch, crt];
        } else {
          tube.filters = [split, crt];
        }
      });

      layout();
      var resizeTimer = 0;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layout, 120);
      });
      tube.filters = [crt];
      play([12, 9, 6, 4, 3, 2], 90, 300);
      // Swap the photo for the canvas on the first, most broken-up frame, so the change reads as part of the boot.
      avatar.classList.add('on-screen');
      avatar.addEventListener('pointerenter', function () { play([6, 4, 3, 2], 70, 200); });
      onWordmarkGlitch(function () { play([8, 4, 2], 70, 280); });
    });
  }

  function startScenes() {
    loadScript('js/vendor/pixi.min.js')
      .then(function () { return loadScript('js/vendor/pixi-filters.js'); })
      .then(function () {
        // Each scene fails on its own (no WebGL, say), leaving that part of the page as plain CSS.
        startSky(window.PIXI).catch(function () {});
        var avatar = startAvatar(window.PIXI);
        if (avatar) avatar.catch(function () {});
      })
      .catch(function () { /* the libraries did not load; the CSS look stays */ });
  }

  if (!reduced.matches) {
    if (document.readyState === 'complete') startScenes();
    else window.addEventListener('load', startScenes);
  }

  // ---- New codes print module by module, just behind the scan line ----

  // The scan line's sweep in style.css: 900 ms on cubic-bezier(0.4, 0, 0.2, 1), its lower edge travelling 124.8%
  // of the screen. Returns when that edge reaches a point `fraction` of the way down.
  var SWEEP_MS = 900, SWEEP_REACH = 1.248;
  function sweepTime(fraction) {
    var target = fraction / SWEEP_REACH, lo = 0, hi = 1;
    for (var i = 0; i < 24; i++) {
      var s = (lo + hi) / 2;
      if (3 * s * s - 2 * s * s * s < target) lo = s; else hi = s;
    }
    var t = (lo + hi) / 2;
    return SWEEP_MS * (1.2 * (1 - t) * (1 - t) * t + 0.6 * (1 - t) * t * t + t * t * t);
  }

  var printing = 0;

  function print(modules) {
    var canvas = document.getElementById('pixel-veil');
    if (!canvas || reduced.matches) return;
    var run = ++printing;
    canvas.width = canvas.height = modules;
    var ctx = canvas.getContext('2d');
    var image = ctx.createImageData(modules, modules), data = image.data;
    var well = rgb(COLOR.well), trace = rgb(COLOR.trace), cyan = rgb(COLOR.cyan);
    var due = new Float32Array(modules * modules);
    for (var y = 0; y < modules; y++) {
      var row = sweepTime((y + 0.5) / modules) + 110;
      for (var x = 0; x < modules; x++) due[y * modules + x] = row + Math.random() * 160;
    }
    var start = performance.now();
    canvas.hidden = false;

    // Each module lights blue, then cyan, then clears to show the code underneath.
    function frame(now) {
      if (run !== printing) return;
      var t = now - start, left = 0;
      for (var i = 0; i < due.length; i++) {
        var d = due[i] - t, c = d <= 0 ? null : d < 50 ? cyan : d < 110 ? trace : well;
        var p = i * 4;
        if (!c) { data[p + 3] = 0; continue; }
        left++;
        data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      if (left) requestAnimationFrame(frame);
      else canvas.hidden = true;
    }
    frame(start);
  }

  window.Pixels = {
    // Called by app.js each time a new code starts its scan.
    scan: print
  };
})();
