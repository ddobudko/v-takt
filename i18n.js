/* Язык интерфейса.
   Строки живут здесь целиком — и те, что в разметке, и те, что рисуются
   на холсте. Разметка помечена data-i18n, холст спрашивает t() при отрисовке,
   поэтому переключение языка не требует перезагрузки. */
(function (global) {
  'use strict';

  var DICT = {
    ru: {
      'title.sub': 'мир дышит своим ритмом.<br>кликните по плитке в тот момент, когда контур коснётся её края.<br>каждая следующая стоит дороже — но молчащая тянет счёт вниз.<br>клавиши qwe · asd · zxc повторяют расположение плиток.',
      'title.go': 'нажмите, чтобы начать',
      'title.name': 'как вас зовут',
      'title.begin': 'начать',
      'title.welcome': 'с возвращением,',
      'title.best': 'ваш рекорд —',
      'title.noBest': 'рекорда пока нет',
      'title.changeName': 'сменить имя',

      'hud.score': 'счёт',
      'hud.best': 'рекорд',
      'hud.newBest': 'новый рекорд',
      'hud.bpm': 'уд/мин',
      'hud.keys': 'space — пауза&nbsp;&nbsp;·&nbsp;&nbsp;r — заново&nbsp;&nbsp;·&nbsp;&nbsp;f — во весь экран',

      'pause.word': 'пауза',
      'pause.resume': 'продолжить',
      'pause.quit': 'выйти в меню',

      'over.word': 'конец',
      'over.line': 'молчал три круга',
      'over.score': 'счёт',
      'over.newBest': 'это новый рекорд',
      'over.best': 'рекорд —',
      'over.again': 'заново',
      'over.menu': 'в меню',

      'set.volume': 'громкость',
      'set.fullscreen': 'во весь экран',
      'set.lang': 'english',

      'hint.aim': 'кликните по плитке, когда контур коснётся её края',
      'hint.hold': 'держите инструмент живым — подтверждайте попадание, пока дуга не опустела',
      'hint.keep': 'прежние не бросайте: молчащая плитка тянет счёт вниз каждую долю',

      'instr.kick': 'пульс',
      'instr.bass': 'бас',
      'instr.hat': 'хэт',
      'instr.rim': 'полиритм',
      'instr.pluck': 'мелодия',
      'instr.bell': 'колокол',
      'instr.pad': 'пад',
      'instr.tom': 'том',
      'instr.glass': 'стекло'
    },

    en: {
      'title.sub': 'the world breathes its own rhythm.<br>click a tile the moment its contour reaches the edge.<br>each next one is worth more — but a silent one drains your score.<br>keys qwe · asd · zxc mirror the tile layout.',
      'title.go': 'press to begin',
      'title.name': 'your name',
      'title.begin': 'begin',
      'title.welcome': 'welcome back,',
      'title.best': 'your best —',
      'title.noBest': 'no record yet',
      'title.changeName': 'change name',

      'hud.score': 'score',
      'hud.best': 'best',
      'hud.newBest': 'new best',
      'hud.bpm': 'bpm',
      'hud.keys': 'space — pause&nbsp;&nbsp;·&nbsp;&nbsp;r — restart&nbsp;&nbsp;·&nbsp;&nbsp;f — fullscreen',

      'pause.word': 'paused',
      'pause.resume': 'resume',
      'pause.quit': 'quit to menu',

      'over.word': 'game over',
      'over.line': 'was silent for three cycles',
      'over.score': 'score',
      'over.newBest': "that's a new best",
      'over.best': 'best —',
      'over.again': 'again',
      'over.menu': 'menu',

      'set.volume': 'volume',
      'set.fullscreen': 'fullscreen',
      'set.lang': 'русский',

      'hint.aim': 'click a tile when its contour reaches the edge',
      'hint.hold': 'keep the instrument alive — land a hit before the arc runs out',
      'hint.keep': "don't abandon the earlier ones: a silent tile drains your score every beat",

      'instr.kick': 'pulse',
      'instr.bass': 'bass',
      'instr.hat': 'hat',
      'instr.rim': 'poly',
      'instr.pluck': 'melody',
      'instr.bell': 'bell',
      'instr.pad': 'pad',
      'instr.tom': 'tom',
      'instr.glass': 'glass'
    }
  };

  var lang = pick();

  function pick() {
    var saved = global.VTStore && VTStore.getLang();
    if (saved && DICT[saved]) return saved;
    var nav = (global.navigator.language || 'en').toLowerCase();
    return nav.indexOf('ru') === 0 ? 'ru' : 'en';
  }

  function t(key) {
    var d = DICT[lang] || DICT.en;
    return d[key] !== undefined ? d[key] : key;
  }

  /* Разметка: текст в data-i18n, подсказка поля в data-i18n-ph.
     Строки с разметкой (переносы) кладём через innerHTML — они наши, не ввод. */
  function apply() {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var v = t(nodes[i].getAttribute('data-i18n'));
      if (v.indexOf('<') >= 0 || v.indexOf('&nbsp;') >= 0) nodes[i].innerHTML = v;
      else nodes[i].textContent = v;
    }
    var ph = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < ph.length; j++) {
      ph[j].placeholder = t(ph[j].getAttribute('data-i18n-ph'));
    }
  }

  global.I18N = {
    t: t,
    apply: apply,
    lang: function () { return lang; },
    toggle: function () {
      lang = lang === 'ru' ? 'en' : 'ru';
      if (global.VTStore) VTStore.setLang(lang);
      apply();
      return lang;
    }
  };
})(window);
