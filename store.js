/* Имя игрока и рекорды.
   Слой намеренно тонкий и с той же формой ответа, что будет у общего
   лидерборда: заменить localStorage на сеть можно внутри этих функций,
   не трогая экраны. */
(function (global) {
  'use strict';

  var COOKIE = 'vtakt_player';
  var KEY = 'vtakt_scores';
  var PREFS = 'vtakt_prefs';
  var YEAR = 365 * 86400;

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function writeCookie(name, value, maxAge) {
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; max-age=' + maxAge + '; path=/; SameSite=Lax';
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }          // приватный режим — играем без рекордов
  }

  function save(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
  }

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREFS)) || {}; }
    catch (e) { return {}; }
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) {}
  }

  function pref(name, value) {
    var p = prefs();
    if (value === undefined) return p[name];
    p[name] = value;
    savePrefs(p);
    return value;
  }

  global.VTStore = {
    getLang: function () { return pref('lang'); },
    setLang: function (v) { pref('lang', v); },
    getVolume: function () { var v = pref('volume'); return typeof v === 'number' ? v : 0.8; },
    setVolume: function (v) { pref('volume', v); },

    getPlayer: function () {
      var n = readCookie(COOKIE);
      return n && n.trim() ? n.trim() : null;
    },
    setPlayer: function (name) { writeCookie(COOKIE, name, YEAR); },
    forgetPlayer: function () { writeCookie(COOKIE, '', 0); },

    best: function (name) { return load()[name] || 0; },

    submit: function (name, score) {
      if (!name) return false;
      var m = load();
      if (score <= (m[name] || 0)) return false;
      m[name] = score;
      save(m);
      return true;
    },

    /* сюда встанет общий лидерборд: форма ответа уже та, что нужна таблице */
    top: function (n) {
      var m = load();
      return Object.keys(m)
        .map(function (k) { return { name: k, score: m[k] }; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, n || 5);
    }
  };
})(window);
