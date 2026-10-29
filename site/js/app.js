(function () {
  'use strict';

  var STORAGE_KEY = 'url-qr-generator';
  var TYPES = ['url', 'wifi'];
  var SECURITIES = ['WPA', 'WEP', 'nopass'];
  // Output is fixed: navy modules on pale blue, level H, a 4-module quiet zone, ~1024 px PNG, fox at 28% width.
  var OUTPUT = { level: 'H', margin: 4, dark: '#0a1630', light: '#e6f0ff', size: 1024, logoSize: 28 };
  var MODE_LABEL = { byte: '位元組', alphanumeric: '英數', numeric: '數字' };
  var MODE_UNIT = { byte: '位元組', alphanumeric: '字元', numeric: '位數' };
  var MODE_MEASURE = { byte: '個位元組', alphanumeric: '個字元', numeric: '位數字' };
  // Share of the worst block's correction capacity a centre picture may use; the rest is left for dirt and blur.
  var LOGO_LIMIT = 0.6;
  var LOGO_INSET = 0.6;
  var FOX_URL = 'assets/fox.jpg';
  // Overlay colours are part of the exported image, so they stay fixed whatever the page looks like.
  var STRUCTURE = [
    { kind: QR.KIND.FINDER, label: '定位圖形', color: '#2F6BFF' },
    { kind: QR.KIND.TIMING, label: '時序圖形', color: '#12A150' },
    { kind: QR.KIND.ALIGNMENT, label: '校正圖形', color: '#F08C00' },
    { kind: QR.KIND.FORMAT, label: '格式資訊', color: '#C42BD6' },
    { kind: QR.KIND.VERSION, label: '版本資訊', color: '#0FA3B1' },
    { kind: QR.KIND.DARK, label: '固定暗模組', color: '#E5383B' }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    formUrl: $('form-url'), formWifi: $('form-wifi'),
    url: $('url-input'), urlNotes: $('url-notes'), encodeUri: $('encode-uri'),
    ssid: $('wifi-ssid'), password: $('wifi-password'), passwordField: $('wifi-password-field'),
    togglePassword: $('toggle-password'), hidden: $('wifi-hidden'), wifiNotes: $('wifi-notes'),
    sizeNote: $('size-note'),
    image: $('qr-image'), placeholder: $('qr-placeholder'), status: $('status-chip'),
    sticker: $('sticker'), scanline: $('scanline'),
    version: $('spec-version'), modules: $('spec-size'), mode: $('spec-mode'), mask: $('spec-mask'),
    capacityText: $('capacity-text'), capacityBar: $('capacity-bar'), capacityNote: $('capacity-note'),
    budget: $('logo-budget'), budgetText: $('budget-text'), budgetBar: $('budget-bar'), budgetNote: $('budget-note'),
    structure: $('structure-toggle'), legend: $('legend'),
    savePng: $('save-png'), saveSvg: $('save-svg'), copyPng: $('copy-png'), actionNote: $('action-note'),
    payload: $('payload-text')
  };

  var current = null;
  var pendingFrame = 0;
  var numberFormat = new Intl.NumberFormat('zh-TW');
  // The centre picture once it has loaded: { src, img }. src is a data URL so exported SVGs carry the picture.
  var fox = null;
  var foxFailed = false;

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function readAsDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  fetch(FOX_URL)
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.blob();
    })
    .then(readAsDataUrl)
    .then(function (src) {
      return loadImage(src).then(function (img) { fox = { src: src, img: img }; });
    })
    .catch(function () { foxFailed = true; })
    .then(schedule);

  STRUCTURE.forEach(function (s) {
    var li = document.createElement('li');
    var chip = document.createElement('i');
    chip.style.background = s.color;
    li.appendChild(chip);
    li.appendChild(document.createTextNode(s.label));
    el.legend.appendChild(li);
  });

  function checkedValue(name, fallback) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : fallback;
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }

  // Only the form is saved, never the Wi-Fi password.
  function save(s) {
    var stored = { type: s.type, url: s.url, ssid: s.ssid, security: s.security, hidden: s.hidden, structure: s.structure };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    var s = readSaved();
    var linked = location.hash.slice(1);
    var type = TYPES.indexOf(linked) >= 0 ? linked : s.type;
    if (TYPES.indexOf(type) >= 0) $('type-' + type).checked = true;
    if (typeof s.url === 'string') el.url.value = s.url;
    if (typeof s.ssid === 'string') el.ssid.value = s.ssid;
    if (SECURITIES.indexOf(s.security) >= 0) $('security-' + s.security).checked = true;
    el.hidden.checked = s.hidden === true;
    el.structure.checked = s.structure === true;
  }

  function collect() {
    return Object.assign({
      type: checkedValue('type', 'url'),
      url: el.url.value,
      ssid: el.ssid.value,
      password: el.password.value,
      security: checkedValue('security', 'WPA'),
      hidden: el.hidden.checked,
      structure: el.structure.checked
    }, OUTPUT);
  }

  function slug(value) {
    return value.replace(/^www\./, '').replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function renderNotes(list, notes) {
    list.textContent = '';
    notes.forEach(function (n) {
      var li = document.createElement('li');
      li.className = n.tone === 'warn' ? 'warn' : 'note';
      li.textContent = n.text;
      list.appendChild(li);
    });
  }

  // Each content type turns its form into the text to encode and what the preview should say about it.
  var builders = {
    url: function (s) {
      var url = Payloads.url(s.url);
      renderNotes(el.urlNotes, url.notes);
      el.encodeUri.hidden = !url.encoded;
      el.encodeUri.dataset.value = url.encoded || '';
      var host = slug(url.host);
      return {
        text: url.text,
        missing: '輸入網址後，QR 碼會出現在這裡。',
        display: url.text,
        alt: 'QR 碼，內容是 ' + url.text,
        filename: host ? 'qr-' + host : 'qr-code'
      };
    },
    wifi: function (s) {
      var wifi = Payloads.wifi(s);
      el.passwordField.hidden = s.security === 'nopass';
      renderNotes(el.wifiNotes, wifi.notes);
      var name = slug(s.ssid);
      return {
        text: wifi.text,
        missing: wifi.missing,
        display: el.password.type === 'text' ? wifi.text : wifi.masked,
        alt: 'Wi-Fi QR 碼，網路名稱是 ' + s.ssid,
        filename: name ? 'wifi-' + name : 'wifi-qr'
      };
    }
  };

  function moduleScale(total, target) {
    return Math.max(1, Math.round(target / total));
  }

  // Merges horizontal runs so the path stays short even at version 40.
  function runsPath(size, offset, test) {
    var d = '';
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; ) {
        if (!test(y, x)) { x++; continue; }
        var start = x;
        while (x < size && test(y, x)) x++;
        d += 'M' + (start + offset) + ' ' + (y + offset) + 'h' + (x - start) + 'v1h-' + (x - start) + 'z';
      }
    }
    return d;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // Knockout square in module units, with the picture inset inside it.
  function logoBox(fit, margin) {
    var x = fit.start + margin, inner = fit.side - LOGO_INSET * 2;
    return { x: x, side: fit.side, ix: round2(x + LOGO_INSET), iside: round2(inner), radius: round2(inner * 0.22) };
  }

  function roundedRect(ctx, x, y, side, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + side, y, x + side, y + side, r);
    ctx.arcTo(x + side, y + side, x, y + side, r);
    ctx.arcTo(x, y + side, x, y, r);
    ctx.arcTo(x, y, x + side, y, r);
    ctx.closePath();
  }

  function svgMarkup(qr, s, withStructure, logo) {
    var total = qr.size + s.margin * 2;
    var px = total * moduleScale(total, s.size);
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges">',
      '<rect width="' + total + '" height="' + total + '" fill="' + s.light + '"/>',
      '<path fill="' + s.dark + '" d="' + runsPath(qr.size, s.margin, function (y, x) { return qr.modules[y][x]; }) + '"/>'
    ];
    if (withStructure) {
      STRUCTURE.forEach(function (item) {
        var d = runsPath(qr.size, s.margin, function (y, x) { return qr.kinds[y][x] === item.kind; });
        if (d) parts.push('<path fill="' + item.color + '" fill-opacity="0.6" d="' + d + '"/>');
      });
    }
    if (logo) {
      var box = logoBox(logo.fit, s.margin);
      parts.push(
        '<rect x="' + box.x + '" y="' + box.x + '" width="' + box.side + '" height="' + box.side + '" fill="' + s.light + '"/>',
        '<clipPath id="logo-clip"><rect x="' + box.ix + '" y="' + box.ix + '" width="' + box.iside + '" height="' + box.iside + '" rx="' + box.radius + '"/></clipPath>',
        '<image href="' + logo.src + '" x="' + box.ix + '" y="' + box.ix + '" width="' + box.iside + '" height="' + box.iside + '" clip-path="url(#logo-clip)" preserveAspectRatio="xMidYMid slice"/>'
      );
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function pngBlob(cur) {
    return new Promise(function (resolve, reject) {
      var s = cur.settings, qr = cur.qr, total = qr.size + s.margin * 2, scale = moduleScale(total, s.size);
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = total * scale;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = s.light;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = s.dark;
      for (var y = 0; y < qr.size; y++) {
        for (var x = 0; x < qr.size; x++) {
          if (qr.modules[y][x]) ctx.fillRect((x + s.margin) * scale, (y + s.margin) * scale, scale, scale);
        }
      }
      if (cur.logo) {
        var box = logoBox(cur.logo.fit, s.margin);
        ctx.fillStyle = s.light;
        ctx.fillRect(box.x * scale, box.x * scale, box.side * scale, box.side * scale);
        ctx.save();
        roundedRect(ctx, box.ix * scale, box.ix * scale, box.iside * scale, box.radius * scale);
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cur.logo.img, box.ix * scale, box.ix * scale, box.iside * scale, box.iside * scale);
        ctx.restore();
      }
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
  }

  function setStatus(text, tone) {
    el.status.textContent = text;
    el.status.className = 'chip' + (tone ? ' ' + tone : '');
  }

  function setBudget(ratio, text, note, tone) {
    el.budgetText.textContent = text;
    el.budgetBar.style.width = Math.min(100, ratio * 100) + '%';
    el.budgetNote.textContent = note;
    el.budgetNote.className = 'note' + (tone === 'warn' ? ' warn' : '');
  }

  // Picks the fox's size for this symbol and fills in the budget readout.
  function planLogo(qr, bumpedFrom) {
    el.budget.hidden = false;
    if (!fox) {
      setBudget(0, '–', foxFailed ? '小狐狸圖片載入失敗，這次先不放。' : '小狐狸載入中…', foxFailed ? 'warn' : '');
      return null;
    }
    var fit = QR.fitLogo(qr, OUTPUT.logoSize / 100, LOGO_LIMIT);
    if (fit.blocked) {
      setBudget(0, '放不下', '這個 QR 碼的修正能力不夠放小狐狸。為了讓它讀得出來，這次先不放。', 'warn');
      return null;
    }
    var note = '最吃緊的糾錯區塊被蓋掉 ' + fit.worst + ' 個碼字，最多能修 ' + fit.correctable + ' 個。';
    if (bumpedFrom) note += '為了放下小狐狸，版本從 ' + bumpedFrom + ' 提高到 ' + qr.version + '。';
    if (fit.side < fit.requested) note += '小狐狸縮到 ' + Math.round(fit.side / qr.size * 100) + '%，再大會超過安全上限。';
    setBudget(fit.worst / fit.correctable, fit.worst + ' / ' + fit.correctable + ' 碼字', note);
    return { fit: fit, src: fox.src, img: fox.img };
  }

  // One sweep per new code; keystrokes during a sweep don't restart it.
  var scanKey = null;
  var scanTimer = 0;

  function endScan() {
    clearTimeout(scanTimer);
    scanTimer = 0;
    el.sticker.classList.remove('scanning');
  }

  function playScan(key) {
    if (key === scanKey) return;
    scanKey = key;
    if (scanTimer) return;
    el.sticker.classList.remove('scanning');
    void el.sticker.offsetWidth; // restart the CSS animations
    el.sticker.classList.add('scanning');
    // animationend never comes when motion is reduced or the tab is in the background.
    scanTimer = setTimeout(endScan, 1200);
  }

  el.scanline.addEventListener('animationend', endScan);

  function showPlaceholder(text, tone) {
    current = null;
    scanKey = null;
    setStatus(tone === 'warn' ? '超出容量' : '等待輸入', tone);
    el.image.hidden = true;
    el.image.removeAttribute('src');
    el.placeholder.hidden = false;
    el.placeholder.textContent = text;
    el.placeholder.className = 'placeholder' + (tone === 'warn' ? ' warn' : '');
    [el.version, el.modules, el.mode, el.mask, el.capacityText].forEach(function (d) { d.textContent = '–'; });
    el.capacityBar.style.width = '0';
    el.capacityNote.textContent = '';
    el.sizeNote.textContent = '';
    [el.savePng, el.saveSvg, el.copyPng].forEach(function (b) { b.disabled = true; });
  }

  function render() {
    pendingFrame = 0;
    var s = collect();
    save(s);

    el.formUrl.hidden = s.type !== 'url';
    el.formWifi.hidden = s.type !== 'wifi';
    el.legend.hidden = !s.structure;
    el.budget.hidden = true;

    var built = builders[s.type](s);
    el.payload.textContent = built.text ? built.display : '–';
    if (!built.text) {
      showPlaceholder(built.missing);
      return;
    }

    var qr;
    try {
      qr = QR.encode(built.text, { level: s.level });
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      showPlaceholder('內容太長，放不進一個 QR 碼。最多 ' + numberFormat.format(err.max) + ' ' +
        MODE_UNIT[err.mode] + '，現在有 ' + numberFormat.format(err.count) + '，請縮短內容。', 'warn');
      return;
    }

    // A fox that had to shrink may fit at its full size in one of the next few versions.
    var bumpedFrom = null;
    if (fox) {
      var first = QR.fitLogo(qr, s.logoSize / 100, LOGO_LIMIT);
      if (first.blocked || first.side < first.requested) {
        for (var v = qr.version + 1; v <= Math.min(40, qr.version + 3); v++) {
          var candidate = QR.encode(built.text, { level: s.level, minVersion: v });
          var fit = QR.fitLogo(candidate, s.logoSize / 100, LOGO_LIMIT);
          if (!fit.blocked && fit.side >= fit.requested) {
            bumpedFrom = qr.version;
            qr = candidate;
            break;
          }
        }
      }
    }

    current = { qr: qr, settings: s, filename: built.filename, logo: planLogo(qr, bumpedFrom) };

    el.image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup(qr, s, s.structure, current.logo));
    el.image.alt = built.alt + (current.logo ? '，中間有圖案' : '');
    el.image.hidden = false;
    el.placeholder.hidden = true;
    playScan(built.text + (current.logo ? '\u0000fox' : ''));
    setStatus('已編碼 · ' + qr.version + '-' + s.level, 'live');
    [el.savePng, el.saveSvg, el.copyPng].forEach(function (b) { b.disabled = false; });

    el.version.textContent = qr.version;
    el.modules.textContent = qr.size + '×' + qr.size;
    el.mode.textContent = MODE_LABEL[qr.mode];
    el.mask.textContent = qr.mask;

    var cap = QR.capacity(qr.version, s.level, qr.mode);
    el.capacityText.textContent = numberFormat.format(qr.count) + ' / ' + numberFormat.format(cap) + ' ' + MODE_UNIT[qr.mode];
    el.capacityBar.style.width = Math.min(100, qr.count / cap * 100) + '%';
    el.capacityNote.textContent = qr.version < 40
      ? '再多 ' + numberFormat.format(cap - qr.count + 1) + ' ' + MODE_MEASURE[qr.mode] + '會升到版本 ' + (qr.version + 1) + '（' + (qr.size + 4) + '×' + (qr.size + 4) + '）。'
      : '已經是最大的版本 40。';

    var total = qr.size + s.margin * 2, scale = moduleScale(total, s.size), px = total * scale;
    el.sizeNote.textContent = 'PNG 為 ' + numberFormat.format(px) + '×' + numberFormat.format(px) + ' px，每個模組 ' + scale + ' px；SVG 可任意縮放。';
  }

  function schedule() {
    if (!pendingFrame) pendingFrame = setTimeout(render, 0);
  }

  function say(text) {
    el.actionNote.textContent = text;
  }

  function offerFile(filename, data) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: 'image/svg+xml' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    say('已下載 ' + filename + '。');
  }

  el.savePng.addEventListener('click', function () {
    if (!current) return;
    var cur = current;
    pngBlob(cur).then(function (blob) { return offerFile(cur.filename + '.png', blob); }, function () {
      say('PNG 產生失敗，可以改用 SVG。');
    });
  });

  el.saveSvg.addEventListener('click', function () {
    if (!current) return;
    offerFile(current.filename + '.svg', svgMarkup(current.qr, current.settings, false, current.logo));
  });

  el.copyPng.addEventListener('click', function () {
    if (!current) return;
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
      say('這個瀏覽器不能直接複製圖片。可以在預覽圖上按右鍵複製。');
      return;
    }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(current) })]).then(function () {
      say('已複製 PNG 圖片，可以直接貼上。');
    }, function () {
      say('瀏覽器不允許複製圖片。可以在預覽圖上按右鍵複製。');
    });
  });

  el.encodeUri.addEventListener('click', function () {
    if (!el.encodeUri.dataset.value) return;
    el.url.value = el.encodeUri.dataset.value;
    render();
    el.url.focus();
  });

  el.togglePassword.addEventListener('click', function () {
    var show = el.password.type === 'password';
    el.password.type = show ? 'text' : 'password';
    el.togglePassword.textContent = show ? '隱藏' : '顯示';
    el.togglePassword.setAttribute('aria-pressed', String(show));
    render();
  });

  [el.url, el.ssid, el.password].forEach(function (input) { input.addEventListener('input', schedule); });
  [el.structure, el.hidden].forEach(function (input) { input.addEventListener('change', schedule); });
  document.querySelectorAll('input[name="type"], input[name="security"]').forEach(function (input) {
    input.addEventListener('change', schedule);
  });

  restore();
  render();
})();
