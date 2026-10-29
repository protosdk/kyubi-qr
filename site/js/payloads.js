// Builds the text each content type puts in a QR code, plus notes for the person filling the form. No DOM access.
var Payloads = (function () {
  'use strict';

  function url(raw) {
    var result = { text: '', notes: [], encoded: null, host: '' };
    var text = raw.trim();
    if (!text) return result;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      text = 'https://' + text;
      result.notes.push({ tone: 'info', text: '已自動加上 https://' });
    }
    result.text = text;
    var parsed = null;
    try { parsed = new URL(text); } catch (e) { /* reported below */ }
    if (!parsed) {
      result.notes.push({ tone: 'warn', text: '這不是有效的網址，手機掃描後只會顯示成一般文字。' });
      return result;
    }
    result.host = parsed.hostname;
    if (!/^https?:$/.test(parsed.protocol)) {
      result.notes.push({ tone: 'warn', text: parsed.protocol.slice(0, -1) + ' 不是一般的網頁網址，掃描後怎麼開啟由手機決定。' });
    } else if (parsed.hostname.indexOf('.') < 0 && parsed.hostname.charAt(0) !== '[') {
      result.notes.push({ tone: 'warn', text: '網域沒有後綴（例如 .com），手機多半連不到這個網址。' });
    }
    if (/[^\x21-\x7e]/.test(text) && parsed.href !== text) {
      result.encoded = parsed.href;
      result.notes.push({ tone: 'warn', text: '網址裡有中文、空白或其他特殊字元，有些掃描器會讀錯。' });
    }
    return result;
  }

  var WIFI_SPECIAL = /[\\;,:"]/;

  function escapeWifi(value) {
    return value.replace(/([\\;,:"])/g, '\\$1');
  }

  function isHex(value) {
    return /^[0-9a-f]+$/i.test(value);
  }

  // The WIFI: format phone cameras read: WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:true;;
  function wifi(input) {
    var result = { text: '', masked: '', notes: [], missing: '' };
    var security = input.security;
    var ssid = input.ssid;
    var password = security === 'nopass' ? '' : input.password;
    if (!ssid) {
      result.missing = '輸入網路名稱後，QR 碼會出現在這裡。';
      return result;
    }
    if (security !== 'nopass' && !password) {
      result.missing = '輸入密碼後，QR 碼會出現在這裡。';
      return result;
    }

    var ssidBytes = new TextEncoder().encode(ssid).length;
    if (ssidBytes > 32) {
      result.notes.push({ tone: 'warn', text: '網路名稱最長 32 個位元組（中文大約 10 個字），現在是 ' + ssidBytes + ' 個，不會是真的網路名稱。' });
    }
    if (/^\s|\s$/.test(ssid)) {
      result.notes.push({ tone: 'warn', text: '網路名稱前後有空白。路由器上的名稱如果沒有空白，手機會找不到這個網路。' });
    }
    if (isHex(ssid)) {
      result.notes.push({ tone: 'info', text: '網路名稱全是 0–9、A–F，少數舊的掃描 App 會把它當成十六進位碼而連不上。' });
    }

    if (security === 'WPA') {
      var wpaOk = /^[\x20-\x7e]{8,63}$/.test(password) || (password.length === 64 && isHex(password));
      if (wpaOk) {
        // Passphrase is fine; nothing to say.
      } else if (/[^\x20-\x7e]/.test(password)) {
        result.notes.push({ tone: 'warn', text: 'WPA 密碼只能用英文字母、數字和半形符號。路由器不會接受這組密碼，掃了也連不上。' });
      } else {
        result.notes.push({ tone: 'warn', text: 'WPA 密碼要 8 到 63 個字元，現在是 ' + password.length + ' 個。路由器不會接受這組密碼，掃了也連不上。' });
      }
    } else if (security === 'WEP') {
      var wepOk = ([5, 13].indexOf(password.length) >= 0 && /^[\x20-\x7e]+$/.test(password)) ||
        ([10, 26].indexOf(password.length) >= 0 && isHex(password));
      if (!wepOk) {
        result.notes.push({ tone: 'warn', text: 'WEP 密碼必須是 5 或 13 個字元，或 10、26 位十六進位數字，現在是 ' + password.length + ' 個。' });
      }
      result.notes.push({ tone: 'info', text: 'WEP 很容易被破解，可以的話把路由器改成 WPA2 或 WPA3。' });
    }
    if (WIFI_SPECIAL.test(ssid) || WIFI_SPECIAL.test(password)) {
      result.notes.push({ tone: 'info', text: '名稱或密碼裡的 \\ ; , : " 已自動加上反斜線，手機讀到的仍是原本的字。' });
    }

    var head = 'WIFI:T:' + security + ';S:' + escapeWifi(ssid) + ';';
    var tail = (input.hidden ? 'H:true;' : '') + ';';
    if (security === 'nopass') {
      result.text = result.masked = head + tail;
    } else {
      result.text = head + 'P:' + escapeWifi(password) + ';' + tail;
      result.masked = head + 'P:' + '•'.repeat(Math.min(password.length, 12)) + ';' + tail;
    }
    return result;
  }

  return { url: url, wifi: wifi };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Payloads;
