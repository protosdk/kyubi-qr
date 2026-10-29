// Builds the text a URL QR code holds, plus notes for the person filling the form. No DOM access.
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

  return { url: url };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Payloads;
