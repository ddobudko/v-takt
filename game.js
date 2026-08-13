/* «втакт» — механика фазы.
   Один бесконечный круг. Инструменты входят по одному в сетку 3×3, от центра
   наружу, и с экрана больше не уходят: взял — держи. Молчащий инструмент
   постоянно тянет очки вниз, зато каждый следующий стоит дороже предыдущего.
   Отсюда вся игра: удерживать всё взятое и тянуться за новым. */
(function () {
  'use strict';

  var S = window.SND;

  /* Геометрия сетки. Индикатор заряда идёт по периметру в GAP от края плитки.
     Шаг подобран так, чтобы зазор между индикаторами соседей был тот же GAP:
     STEP = 2·(полуразмер + GAP) + GAP. Точное равенство возможно только при
     одинаковых плитках, поэтому размер у всех один. */
  var TILE = 120;
  var GAP = 9;
  var HALF = TILE / 2;
  var RING = HALF + GAP;              // индикатор: полурасстояние от центра
  var STEP = 2 * RING + GAP;          // центр к центру
  var FIELD = 2 * STEP + 2 * RING + 44;
  var VW = FIELD, VH = FIELD;         // поле квадратное — сетка квадратная

  var PERFECT = 0.085, GOOD = 0.155;  // окна попадания, секунды

  var BEATS_PER_BAR = 4;
  var LIFE = 6;          // сколько своих циклов инструмент живёт без подтверждения
  var WARN = 2;          // за сколько последних циклов начинает предупреждать
  var INTRO_BARS = 4;    // через сколько тактов входит следующий инструмент
  var GRACE_BARS = 2;    // сколько тактов после входа даётся, прежде чем начнёт минусить
  var FADE = 0.8;        // появление, секунды

  var BPM_START = 84, BPM_MIN = 66, BPM_MAX = 150;
  var BPM_UP = 0.4;      // за попадание
  var BPM_BONUS = 0.8;   // за такт, в котором все инструменты держатся уверенно
  var BPM_DOWN = 4;      // за промах или угасание
  var BPM_TAKE_NEW = 6;  // взял инструмент впервые — даём осмотреться
  var BPM_TAKE_BACK = 3; // вернул замолчавший — послабление поменьше
  /* послабление за взятие должно отыгрываться обратно за интервал до следующего
     входа, иначе темп садится в пол и больше не встаёт */

  var OVER_CYCLES = 3;   // взятый инструмент молчит столько своих кругов — конец

  var SCORE_ON = 200, SCORE_HIT = 100, SCORE_GOOD = 60;
  var SCORE_MISS = -50, SCORE_LOST = -150;
  var DRAIN = 12;        // очков за долю с каждого молчащего инструмента
  var TOPPED_UP = 0.75;  // подтверждение почти полного заряда стоит дешевле

  var cv = document.getElementById('stage');
  var g = cv.getContext('2d');

  var el = {
    score: document.getElementById('hud-score'),
    tempo: document.getElementById('hud-tempo'),
    best: document.getElementById('hud-best'),
    bestCap: document.getElementById('hud-best-cap'),
    bestBox: document.querySelector('.hud-best'),
    hint: document.getElementById('hint'),
    title: document.getElementById('title'),
    pause: document.getElementById('pause'),
    pauseResume: document.getElementById('pause-resume'),
    pauseQuit: document.getElementById('pause-quit'),
    over: document.getElementById('over'),
    overWho: document.getElementById('over-who'),
    overScore: document.getElementById('over-score'),
    overBest: document.getElementById('over-best'),
    overAgain: document.getElementById('over-again'),
    overMenu: document.getElementById('over-menu'),
    nameForm: document.getElementById('name-form'),
    nameInput: document.getElementById('name-input'),
    welcome: document.getElementById('welcome'),
    welcomeName: document.getElementById('welcome-name'),
    welcomeBest: document.getElementById('welcome-best'),
    changeName: document.getElementById('change-name')
  };

  function num(n) { return n.toLocaleString('ru-RU'); }

  /* ---------------- инструменты ---------------- */
  /* play(t, i, bd) — фигура одного цикла, t = абсолютное время начала цикла */

  var INSTR = {
    kick: {
      hue: 222, sat: 24, light: 42,
      title: 'пульс',
      play: function (t, i, bd) { S.kick(t, 0.85); S.kick(t + bd, 0.5); },
      accent: function (t) { S.kick(t, 0.8); }
    },
    hat: {
      hue: 200, sat: 16, light: 54,
      title: 'хэт',
      play: function (t, i, bd) {
        S.hat(t + 0.5 * bd, 0.3);
        S.hat(t + 1.5 * bd, 0.22);
        if (i % 2) S.hat(t + 1.75 * bd, 0.12);
      },
      accent: function (t) { S.hat(t, 0.3); }
    },
    rim: {
      hue: 14, sat: 32, light: 55,
      title: 'полиритм',
      play: function (t, i, bd) { S.rim(t, 0.5); S.rim(t + 1.5 * bd, 0.3); },
      accent: function (t) { S.rim(t, 0.45); }
    },
    bass: {
      hue: 246, sat: 34, light: 47,
      title: 'бас',
      seq: [[45, 50], [45, 48], [43, 50], [45, 52]],
      play: function (t, i, bd) {
        var p = this.seq[i % this.seq.length];
        S.bass(t, p[0], 0.55, bd * 1.7);
        S.bass(t + 2.5 * bd, p[1], 0.4, bd * 1.2);
      },
      accent: function (t, bd) { S.bass(t, 45, 0.5, bd); }
    },
    pluck: {
      hue: 36, sat: 50, light: 51,
      title: 'мелодия',
      ph: [
        [[0, 69], [1.5, 72], [2.5, 76]],
        [[0, 74], [1, 72], [2.5, 69]],
        [[0, 76], [1.5, 79], [3, 72]],
        [[0.5, 72], [2, 74], [3, 69]]
      ],
      play: function (t, i, bd) {
        this.ph[i % this.ph.length].forEach(function (n) {
          S.pluck(t + n[0] * bd, n[1], 0.3);
        });
      },
      accent: function (t) { S.pluck(t, 72, 0.3); }
    },
    bell: {
      hue: 166, sat: 30, light: 45,
      title: 'колокол',
      seq: [81, 76, 79, 84],
      play: function (t, i) { S.bell(t, this.seq[i % this.seq.length], 0.22); },
      accent: function (t) { S.bell(t, 81, 0.2); }
    },
    pad: {
      hue: 190, sat: 22, light: 51,
      title: 'пад',
      ch: [[57, 60, 64], [55, 60, 64]],
      play: function (t, i, bd) { S.pad(t, this.ch[i % 2], 0.13, 8 * bd); },
      accent: function (t, bd) { S.pad(t, [57, 60, 64], 0.1, 2 * bd); }
    },
    tom: {
      hue: 320, sat: 26, light: 48,
      title: 'том',
      play: function (t, i, bd) {
        S.tom(t, 45, 0.4);
        S.tom(t + 3.5 * bd, i % 2 ? 40 : 43, 0.28);
      },
      accent: function (t) { S.tom(t, 45, 0.36); }
    },
    glass: {
      hue: 100, sat: 22, light: 46,
      title: 'стекло',
      ph: [
        [[0, 84], [2.5, 91], [4, 88]],
        [[0, 88], [3, 93], [5.5, 84]],
        [[0.5, 91], [2, 84], [4.5, 93]],
        [[0, 93], [2.5, 88], [6, 91]]
      ],
      play: function (t, i, bd) {
        this.ph[i % this.ph.length].forEach(function (n) {
          S.glass(t + n[0] * bd, n[1], 0.2);
        });
      },
      accent: function (t) { S.glass(t, 88, 0.2); }
    }
  };

  /* сетка 3×3 в шагах от центра, наружу; углы по диагонали — так семь плиток
     остаются уравновешенными */
  var GRID = [
    [0, 0],    // центр
    [-1, 0],   // центр слева
    [1, 0],    // центр справа
    [0, -1],   // сверху по центру
    [0, 1],    // снизу по центру
    [-1, -1],  // угол сверху слева
    [1, 1],    // угол снизу справа
    [1, -1],
    [-1, 1]
  ];

  /* Клавиша привязана к слоту сетки, а не к инструменту: буква всегда
     совпадает с местом плитки на экране. Ключом берём e.code — физическую
     клавишу, чтобы работало и на русской раскладке. */
  var KEYS = {
    '-1,-1': 'KeyQ', '0,-1': 'KeyW', '1,-1': 'KeyE',
    '-1,0':  'KeyA', '0,0':  'KeyS', '1,0':  'KeyD',
    '-1,1':  'KeyZ', '0,1':  'KeyX', '1,1':  'KeyC'
  };
  var KEY_TO_SLOT = {};
  Object.keys(KEYS).forEach(function (slot) { KEY_TO_SLOT[KEYS[slot]] = slot; });

  /* Порядок входа — он же музыкальная драматургия и шкала ценности: каждый
     следующий стоит дороже предыдущего.
     offset — сдвиг сетки плитки в долях. Без него плитки с одинаковым
     периодом привязаны к одному нулю и их доли совпадают всегда: контуры
     сходятся к краю одновременно, и две плитки читаются как одна.
     Низ (пульс, бас, пад) держим на сильной доле, остальное разводим. */
  var COMPOSITION = [
    { kind: 'kick',  period: 2, offset: 0 },
    { kind: 'bass',  period: 4, offset: 0 },
    { kind: 'hat',   period: 2, offset: 1 },
    { kind: 'rim',   period: 3, offset: 0 },
    { kind: 'pluck', period: 4, offset: 2 },
    { kind: 'bell',  period: 5, offset: 1 },
    { kind: 'pad',   period: 8, offset: 0 },
    { kind: 'tom',   period: 6, offset: 3 },
    { kind: 'glass', period: 7, offset: 2 }   // 7 — простое: фраза долго не повторяется
  ];

  /* ---------------- часы с картой темпа ----------------
     Доля — не время, делённое на постоянный BEAT: темп меняется по ходу игры.
     Держим опорную точку (timeRef, beatRef, bpm) и переставляем её строго на
     границе такта, поэтому уже назначенные ноты не сдвигаются. */

  var clock = { timeRef: 0, beatRef: 0, bpm: BPM_START };
  var targetBpm = BPM_START;

  function beatAt(t) { return clock.beatRef + (t - clock.timeRef) * clock.bpm / 60; }
  function timeAt(b) { return clock.timeRef + (b - clock.beatRef) * 60 / clock.bpm; }
  function beatDur() { return 60 / clock.bpm; }

  function applyTempo(beat) {
    var b = Math.max(BPM_MIN, Math.min(BPM_MAX, targetBpm));
    if (Math.abs(b - clock.bpm) < 0.01) return;
    clock.timeRef = timeAt(beat);   // пришпиливаем границу такта к её прежнему времени
    clock.beatRef = beat;
    clock.bpm = b;
  }

  /* ---------------- состояние ---------------- */

  var st = {
    mode: 'title',
    paused: false,
    objs: [],
    cursor: 0,          // следующая доля к планированию
    score: 0,
    combo: 0,
    sync: 0.25,
    tension: 0,
    player: null,
    best: 0,
    beaten: false,
    lastSaved: 0,
    lastBar: -1,
    lastBeatInt: null,
    errorsThisBar: 0,
    pops: [],
    hinted: 0,
    perfToCtx: 0,
    scale: 1, ox: 0, oy: 0, dpr: 1
  };

  function reset() {
    st.objs = COMPOSITION.map(function (c, i) {
      var slot = GRID[i];
      var code = KEYS[slot[0] + ',' + slot[1]];
      return {
        id: i, order: i, kind: c.kind, period: c.period, offset: c.offset || 0,
        key: code, keyLabel: code.slice(3),
        x: FIELD / 2 + slot[0] * STEP, y: FIELD / 2 + slot[1] * STEP,
        size: TILE, half: HALF, radius: TILE * 0.22,
        factor: i + 1,                       // во столько раз дороже первого
        introBeat: i * INTRO_BARS * BEATS_PER_BAR,
        graceUntil: 0,
        visible: false, appearAt: 0,
        alive: false, everTaken: false, until: -1,
        silentSince: null,
        drainBar: 0,
        lastPhase: 0, flash: 0, shake: 0, warnFlash: 0, bleed: 0, ripples: []
      };
    });
    clock.timeRef = S.ctxNow() + 0.9;
    clock.beatRef = 0;
    clock.bpm = BPM_START;
    targetBpm = BPM_START;
    st.cursor = 0;
    st.score = 0;
    st.combo = 0;
    st.sync = 0.4;
    st.lastBar = -1;
    st.lastBeatInt = null;
    st.errorsThisBar = 0;
    st.pops = [];
    st.hinted = 0;
    st.tension = 0;
    st.best = st.player ? VTStore.best(st.player) : 0;
    st.beaten = false;
    st.lastSaved = 0;
    paintBest();
  }

  function multiplier() { return 1 + Math.min(3, Math.floor(st.combo / 8)); }

  function bumpSync(delta) {
    st.sync = Math.max(0.15, Math.min(1, st.sync + delta));
  }

  /* заряд инструмента: 1 — только что подтверждён, 0 — последняя доля-шанс */
  /* положение в собственных кругах плитки — с её сдвигом сетки */
  function cyclePos(o, beat) { return (beat - o.offset) / o.period; }

  function chargeFrac(o, beat) {
    if (!o.alive) return 0;
    return Math.max(0, Math.min(1, (o.until + 1 - cyclePos(o, beat)) / LIFE));
  }

  function bleeding(o, beat) {
    return o.visible && !o.alive && beat > o.graceUntil;
  }

  function syncedColor(inst, alpha, lightShift, satScale) {
    var s = inst.sat * (0.16 + 0.84 * st.sync) * (satScale === undefined ? 1 : satScale);
    return 'hsla(' + inst.hue + ',' + s.toFixed(1) + '%,' +
      (inst.light + (lightShift || 0)).toFixed(1) + '%,' + alpha + ')';
  }

  /* Очки всплывают внутри плитки, а не над ней: после уплотнения сетки
     надпись над плиткой залезала в соседний ряд. */
  function pop(o, text, good) {
    st.pops.push({ x: o.x, y: o.y + 12, text: text, t: S.now(),
                   hue: INSTR[o.kind].hue, good: good });
  }

  /* ---------------- планировщик ---------------- */

  function schedule() {
    if (!S.ready() || st.mode !== 'play' || st.paused) return;
    var horizon = S.ctxNow() + 0.25;
    var guard = 0;
    while (timeAt(st.cursor) < horizon && guard++ < 512) {
      if (st.cursor % BEATS_PER_BAR === 0) applyTempo(st.cursor);
      var bt = timeAt(st.cursor);
      var bd = beatDur();
      if (bt > S.ctxNow() + 0.005) {
        st.objs.forEach(function (o) {
          if (!o.alive) return;
          var rel = st.cursor - o.offset;
          if (rel < 0 || rel % o.period !== 0) return;
          var k = rel / o.period;
          if (k > o.until + 1) return;          // последняя доля-шанс ещё звучит
          INSTR[o.kind].play(bt, k, bd);
        });
      }
      st.cursor += 1;
    }
  }
  setInterval(schedule, 25);

  /* ---------------- ввод ---------------- */

  function heardTimeOf(ev) {
    var t = S.now();
    if (typeof ev.timeStamp === 'number' && ev.timeStamp > 0) {
      var guess = ev.timeStamp / 1000 + st.perfToCtx - S.latency();
      if (Math.abs(guess - t) < 0.5) return guess;
    }
    return t;
  }

  /* одна зона на клик и на курсор: иначе курсор обещает не там, где сработает */
  function objectAt(clientX, clientY) {
    var vx = (clientX - st.ox) / st.scale;
    var vy = (clientY - st.oy) / st.scale;
    var target = null, best = 1e9;
    st.objs.forEach(function (o) {
      if (!o.visible) return;
      var dx = Math.abs(vx - o.x), dy = Math.abs(vy - o.y);
      var reach = o.half * 1.22;
      if (dx > reach || dy > reach) return;
      var d = Math.max(dx, dy);
      if (d < best) { best = d; target = o; }
    });
    return target;
  }

  /* Курсор пересчитывается каждый кадр, а не только на движение мыши:
     инструменты появляются сами, и при неподвижной мыши курсор иначе
     остаётся от прошлого состояния. */
  var pointer = { x: -1, y: -1, over: false };
  var cursorNow = '';

  function setCursor(c) {
    if (cursorNow === c) return;
    cursorNow = c;
    cv.style.cursor = c;
  }

  function updateCursor() {
    var on = st.mode === 'play' && !st.paused && pointer.over &&
             objectAt(pointer.x, pointer.y);
    setCursor(on ? 'grab' : '');
  }

  function onPointerDown(ev) {
    if (st.mode !== 'play' || st.paused) return;
    var target = objectAt(ev.clientX, ev.clientY);
    if (target) hit(target, heardTimeOf(ev));   // мимо всего — без наказания
  }

  /* Общий путь для мыши и клавиатуры: разойдись они, окна попадания
     пришлось бы держать в двух местах. */
  function hit(target, t) {
    var beat = beatAt(t);
    var k = Math.max(0, Math.round(cyclePos(target, beat)));
    var err = Math.abs(t - timeAt(k * target.period + target.offset));
    var aNow = S.ctxNow() + 0.02;

    if (err <= GOOD) {
      var perfect = err <= PERFECT;
      var was = chargeFrac(target, beat);
      var gain;
      if (!target.alive) {
        target.alive = true;
        gain = SCORE_ON;
        INSTR[target.kind].accent(aNow, beatDur());
        S.tick(aNow, perfect ? 0.5 : 0.34);
        target.ripples.push({ t: S.now(), s: 1.15 });
        // новый голос в составе — сбрасываем темп, чтобы было где освоиться
        targetBpm = Math.max(BPM_MIN,
          targetBpm - (target.everTaken ? BPM_TAKE_BACK : BPM_TAKE_NEW));
        target.everTaken = true;
        target.silentSince = null;      // отсчёт до конца игры сброшен
      } else {
        gain = perfect ? SCORE_HIT : SCORE_GOOD;
        if (was > TOPPED_UP) gain = Math.round(gain * 0.4);  // не давать долбить одну плитку
        S.tick(aNow, perfect ? 0.4 : 0.26);
        target.ripples.push({ t: S.now(), s: 0.7 });
        targetBpm = Math.min(BPM_MAX, targetBpm + BPM_UP);
      }
      target.until = k + LIFE - 1;
      target.flash = 1;
      st.combo++;
      gain = gain * target.factor * multiplier();
      st.score += gain;
      pop(target, '+' + num(gain), true);
      bumpSync(perfect ? 0.14 : 0.09);
      if (st.hinted === 0) {
        st.hinted = 1;
        showHint('держите инструмент живым — подтверждайте попадание, пока дуга не опустела');
      }
    } else {
      st.combo = 0;
      st.errorsThisBar++;
      st.score = Math.max(0, st.score + SCORE_MISS);
      pop(target, String(SCORE_MISS), false);
      target.shake = 1;
      S.thud(aNow);
      bumpSync(-0.2);
      targetBpm = Math.max(BPM_MIN, targetBpm - BPM_DOWN);
    }
  }

  function expire(o) {
    o.alive = false;
    o.until = -1;
    o.shake = 1;
    o.graceUntil = beatAt(S.now()) + BEATS_PER_BAR;   // такт форы, чтобы вернуть
    // отсчёт до конца игры идёт только по тому, что игрок уже брал
    if (o.everTaken) o.silentSince = beatAt(S.now());
    st.combo = 0;
    st.errorsThisBar++;
    st.score = Math.max(0, st.score + SCORE_LOST);
    pop(o, String(SCORE_LOST), false);
    S.expire(S.ctxNow() + 0.02);
    bumpSync(-0.18);
    targetBpm = Math.max(BPM_MIN, targetBpm - BPM_DOWN);
  }

  /* ---------------- экраны ---------------- */

  var hintTimer = null;
  function showHint(text) {
    el.hint.textContent = text;
    el.hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.hint.classList.remove('on'); }, 6000);
  }

  function paintBest() {
    var v = num(st.best);
    if (el.best.textContent !== v) el.best.textContent = v;
    var cap = st.beaten ? 'новый рекорд' : 'рекорд';
    if (el.bestCap.textContent !== cap) el.bestCap.textContent = cap;
    el.bestBox.classList.toggle('beaten', st.beaten);
  }

  function saveNow() {
    if (st.player && st.score > 0) VTStore.submit(st.player, st.score);
  }

  function initTitle() {
    document.body.classList.add('on-title');
    var name = VTStore.getPlayer();
    st.player = name;
    st.best = name ? VTStore.best(name) : 0;
    st.beaten = false;
    if (name) {
      el.welcomeName.textContent = name;
      el.welcomeBest.textContent = st.best > 0
        ? 'ваш рекорд — ' + num(st.best)
        : 'рекорда пока нет';
      el.welcome.hidden = false;
      el.nameForm.hidden = true;
      el.changeName.hidden = false;
    } else {
      el.welcome.hidden = true;
      el.nameForm.hidden = false;
      el.changeName.hidden = true;
      setTimeout(function () { el.nameInput.focus(); }, 80);
    }
    paintBest();
  }

  function start() {
    if (!st.player) return;
    document.body.classList.remove('on-title');
    S.init();
    S.resume();
    st.mode = 'play';
    st.paused = false;
    el.pause.hidden = true;
    el.over.hidden = true;
    reset();
    el.title.classList.add('gone');
    setTimeout(function () {
      if (st.hinted === 0) showHint('кликните по плитке, когда контур коснётся её края');
    }, 1200);
  }

  function gameOver(o) {
    if (st.mode !== 'play') return;
    st.mode = 'over';
    st.paused = false;
    saveNow();
    setCursor('');
    el.hint.classList.remove('on');
    el.pause.hidden = true;
    el.overWho.textContent = INSTR[o.kind].title;
    el.overScore.textContent = num(st.score);
    el.overBest.textContent = st.score >= st.best
      ? 'это новый рекорд'
      : 'рекорд — ' + num(st.best);
    el.over.hidden = false;
    var at = S.ctxNow() + 0.05;
    S.expire(at);
    S.bell(at + 0.34, 57, 0.13);
    S.bell(at + 0.68, 52, 0.11);
  }

  function setPaused(on) {
    if (st.mode !== 'play' || st.paused === on) return;
    st.paused = on;
    el.pause.hidden = !on;
    if (on) { S.suspend(); saveNow(); el.hint.classList.remove('on'); }
    else { S.resume(); }
  }

  function toTitle() {
    saveNow();
    setPaused(false);
    el.pause.hidden = true;
    el.over.hidden = true;
    setCursor('');
    st.mode = 'title';
    st.objs = [];
    el.hint.classList.remove('on');
    el.title.classList.remove('gone');
    initTitle();
  }

  el.nameForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = el.nameInput.value.trim().replace(/\s+/g, ' ');
    if (!v) {
      el.nameInput.classList.remove('nudge');
      void el.nameInput.offsetWidth;          // перезапуск анимации
      el.nameInput.classList.add('nudge');
      return;
    }
    VTStore.setPlayer(v);
    st.player = v;
    st.best = VTStore.best(v);
    start();
  });

  el.changeName.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    VTStore.forgetPlayer();
    el.nameInput.value = '';
    initTitle();
  });

  el.title.addEventListener('pointerdown', function (e) {
    if (el.welcome.hidden) return;                        // ждём, пока представятся
    if (e.target.closest('.link-btn, .name-form')) return;
    e.preventDefault();
    start();
  });

  el.pauseResume.addEventListener('click', function () { setPaused(false); });
  el.pauseQuit.addEventListener('click', function () { toTitle(); });
  el.overAgain.addEventListener('click', function () { start(); });
  el.overMenu.addEventListener('click', function () { toTitle(); });

  cv.addEventListener('pointerdown', onPointerDown);

  function trackPointer(ev) {
    pointer.x = ev.clientX;
    pointer.y = ev.clientY;
    pointer.over = true;
  }
  cv.addEventListener('pointermove', trackPointer);
  cv.addEventListener('pointerover', trackPointer);
  cv.addEventListener('pointerdown', trackPointer);
  cv.addEventListener('mousemove', trackPointer);          // подстраховка
  cv.addEventListener('pointerleave', function () { pointer.over = false; });
  cv.addEventListener('mouseleave', function () { pointer.over = false; });

  window.addEventListener('keydown', function (e) {
    var again = e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К';
    if (st.mode === 'over') {
      if (again) start();
      else if (e.key === 'Escape') toTitle();
      return;
    }
    if (st.mode !== 'play') return;

    if (!st.paused && !e.repeat && KEY_TO_SLOT[e.code]) {
      var o = null;
      for (var i = 0; i < st.objs.length; i++) {
        if (st.objs[i].visible && st.objs[i].key === e.code) { o = st.objs[i]; break; }
      }
      if (o) { e.preventDefault(); hit(o, heardTimeOf(e)); return; }
    }

    if (again) {
      saveNow();
      setPaused(false);
      reset();
    } else if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      setPaused(!st.paused);
    }
  });

  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { saveNow(); setPaused(true); }   // ушли со вкладки — не теряем состав
  });

  initTitle();

  /* ---------------- размер ---------------- */

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    st.dpr = dpr;
    st.scale = Math.min(w / VW, h / VH) * 0.92;
    st.ox = (w - VW * st.scale) / 2;
    st.oy = (h - VH * st.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- обновление ---------------- */

  function update(t, dt) {
    var beat = beatAt(t);

    st.objs.forEach(function (o) {
      if (!o.visible && beat >= o.introBeat) {
        o.visible = true;
        o.appearAt = t;
        o.graceUntil = beat + GRACE_BARS * BEATS_PER_BAR;
        if (o.order === 1 && st.hinted < 2) {
          st.hinted = 2;
          showHint('прежние не бросайте: молчащая плитка тянет счёт вниз каждую долю');
        }
      }
      if (!o.visible) return;

      // угасание: даём доиграть окно попадания последней доли-шанса
      if (o.alive && t > timeAt((o.until + 1) * o.period + o.offset) + GOOD) expire(o);

      var p = cyclePos(o, beat);
      p = p - Math.floor(p);
      if (p < o.lastPhase) {
        if (o.alive) { o.ripples.push({ t: t, s: 0.9 }); o.flash = Math.max(o.flash, 0.85); }
        if (o.alive && chargeFrac(o, beat) <= WARN / LIFE) o.warnFlash = 1;
      }
      o.lastPhase = p;
      o.flash = Math.max(0, o.flash - dt * 2.6);
      o.shake = Math.max(0, o.shake - dt * 3.2);
      o.warnFlash = Math.max(0, o.warnFlash - dt * 1.6);
      o.bleed = Math.max(0, o.bleed - dt * 1.4);
      o.ripples = o.ripples.filter(function (r) { return t - r.t < 1.25; });
    });

    // утечка: каждая доля молчания стоит очков
    var bi = Math.floor(beat);
    if (st.lastBeatInt === null) st.lastBeatInt = bi;
    var steps = 0;
    while (st.lastBeatInt < bi && steps++ < 64) {
      st.lastBeatInt++;
      st.objs.forEach(function (o) {
        if (!bleeding(o, beat)) return;
        st.score = Math.max(0, st.score - DRAIN);
        o.drainBar += DRAIN;
        o.bleed = 1;
      });
    }

    // границы такта: премия за такт, где всё держится, и сводка по утечке
    var bar = Math.floor(beat / BEATS_PER_BAR);
    if (bar !== st.lastBar) {
      if (st.lastBar >= 0) {
        var live = st.objs.filter(function (o) { return o.alive; });
        var silent = st.objs.filter(function (o) { return bleeding(o, beat); });
        var confident = live.length && !silent.length && live.every(function (o) {
          return chargeFrac(o, beat) > WARN / LIFE;
        });
        if (confident && st.errorsThisBar === 0) {
          targetBpm = Math.min(BPM_MAX, targetBpm + BPM_BONUS);
        }
        st.objs.forEach(function (o) {
          if (o.drainBar > 0) { pop(o, '−' + o.drainBar, false); o.drainBar = 0; }
        });
      }
      st.lastBar = bar;
      st.errorsThisBar = 0;
    }

    st.pops = st.pops.filter(function (q) { return t - q.t < 0.95; });

    // напряжение ведёт палитру фона, и оно же — предвестник конца
    var visible = st.objs.filter(function (o) { return o.visible; });
    var silent = visible.filter(function (o) { return !o.alive; });
    var warned = 0, doom = 0, doomed = null;
    st.objs.forEach(function (o) {
      if (o.alive && chargeFrac(o, beat) <= WARN / LIFE) warned++;
      if (o.silentSince === null || o.alive) return;
      var d = (beat - o.silentSince) / (OVER_CYCLES * o.period);
      if (d > doom) { doom = d; doomed = o; }
    });
    var target = Math.min(1,
      0.78 * doom +
      0.42 * (visible.length ? silent.length / visible.length : 0) +
      0.18 * (visible.length ? warned / visible.length : 0));
    st.tension += (target - st.tension) * Math.min(1, dt * 1.8);

    if (doomed && doom >= 1) { gameOver(doomed); return; }

    // рекорд обновляется прямо по ходу захода, а не в конце: игра бесконечная,
    // «конца» у неё нет, и терять результат при закрытии вкладки нельзя
    if (st.player && st.score > st.best) {
      if (!st.beaten) {
        st.beaten = true;
        el.bestBox.classList.remove('just-beaten');
        void el.bestBox.offsetWidth;
        el.bestBox.classList.add('just-beaten');
        S.confirm(S.ctxNow() + 0.02, 0.12);
      }
      st.best = st.score;
      if (t - st.lastSaved > 1) { VTStore.submit(st.player, st.best); st.lastSaved = t; }
    }
    paintBest();

    var sc = num(st.score);
    if (el.score.textContent !== sc) el.score.textContent = sc;
    var tp = String(Math.round(clock.bpm));
    if (el.tempo.textContent !== tp) el.tempo.textContent = tp;
  }

  /* ---------------- отрисовка ---------------- */

  /* Путь начинается в верхней точке по центру и идёт по часовой — так дуга
     заряда, нарисованная пунктиром по периметру, стартует сверху. */
  function tilePath(cx, cy, size, r) {
    var h = size / 2;
    var x0 = cx - h, y0 = cy - h, x1 = cx + h, y1 = cy + h;
    r = Math.max(0, Math.min(r, h));
    g.beginPath();
    g.moveTo(cx, y0);
    g.lineTo(x1 - r, y0);
    g.arcTo(x1, y0, x1, y0 + r, r);
    g.lineTo(x1, y1 - r);
    g.arcTo(x1, y1, x1 - r, y1, r);
    g.lineTo(x0 + r, y1);
    g.arcTo(x0, y1, x0, y1 - r, r);
    g.lineTo(x0, y0 + r);
    g.arcTo(x0, y0, x0 + r, y0, r);
    g.closePath();
  }

  function perimeter(size, r) {
    return 4 * (size - 2 * r) + 2 * Math.PI * r;
  }

  /* ---------------- мэш-градиент на фоне ----------------
     Пять радиальных пятен, каждое со своим медленным дрейфом. Рисуем их в
     маленький офскрин и растягиваем со сглаживанием: размытие достаётся
     даром, а полноразмерные заливки каждый кадр обошлись бы дорого.
     Палитра ведётся напряжением: спокойно — серо-зелёно-голубое, тревожно —
     жёлтое и оранжевое, на грани конца — красное. */

  var MESH_W = 128, MESH_H = 80;
  var mesh = document.createElement('canvas');
  mesh.width = MESH_W;
  mesh.height = MESH_H;
  var mg = mesh.getContext('2d');
  var meshImg = mg.createImageData(MESH_W, MESH_H);

  /* Четыре точки, каждая своего цвета, гуляют по всему полю. Цвет пикселя —
     смесь всех четырёх, взвешенная обратным квадратом расстояния. Поле
     сплошное: бумаги под ним нет, как и в референсе.
     sat — доля насыщенности точки; у первой она мала, это и есть «серый». */
  /* lt — сдвиг светлоты точки. Без него все четыре при светлоте 92 % и низкой
     насыщенности почти неотличимы от белого, поле усредняется и мэша не видно:
     разброс RGB был 2–4 единицы. */
  var POINTS = [
    { fx: 0.105, fy: 0.082, px: 0.0, py: 1.7, ax: 0.46, ay: 0.42, sat: 0.34, lt:  6 },
    { fx: 0.073, fy: 0.131, px: 2.3, py: 0.4, ax: 0.48, ay: 0.44, sat: 1.00, lt: -6 },
    { fx: 0.146, fy: 0.061, px: 4.1, py: 3.2, ax: 0.44, ay: 0.46, sat: 0.85, lt: -1 },
    { fx: 0.090, fy: 0.113, px: 5.6, py: 1.1, ax: 0.47, ay: 0.40, sat: 0.62, lt: -3 }
  ];

  //           серо-синий  зелёный  голубой  бирюзовый
  var CALM = [215, 142, 196, 168];
  var WARM = [52,   36,  60,  30];
  var HOT  = [10,    2,  18,   6];

  /* мягкость поля: чем меньше, тем чётче каждая точка держит свою область —
     и тем заметнее, что области переезжают, а не меняют цвет разом */
  var SOFT = (MESH_W * MESH_W + MESH_H * MESH_H) * 0.016;

  function lerp(a, b, k) { return a + (b - a) * k; }

  function pointHue(i, tension) {
    return tension < 0.5
      ? lerp(CALM[i], WARM[i], tension / 0.5)
      : lerp(WARM[i], HOT[i], (tension - 0.5) / 0.5);
  }

  function hslToRgb(h, s, l) {
    h = (h % 360 + 360) % 360 / 360; s /= 100; l /= 100;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function ch(x) {
      if (x < 0) x += 1; else if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    }
    return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)];
  }

  var mpx = [0, 0, 0, 0], mpy = [0, 0, 0, 0];
  var mcr = [0, 0, 0, 0], mcg = [0, 0, 0, 0], mcb = [0, 0, 0, 0];

  /* Цвет поля считается для точек, а не для заливки. Точки покрывают ~4 %
     площади и стоят на половинной прозрачности, поэтому бледный цвет,
     годившийся для сплошного фона, здесь пропадает полностью: сетку видно
     только если сама точка заметно темнее бумаги. */
  function computeField(t, tension, beatDip) {
    var sat = 80 + 40 * tension;
    var light = 69 - 11 * tension - beatDip;

    for (var i = 0; i < 4; i++) {
      var p = POINTS[i];
      mpx[i] = (0.5 + p.ax * Math.sin(t * p.fx * Math.PI * 2 + p.px)) * MESH_W;
      mpy[i] = (0.5 + p.ay * Math.cos(t * p.fy * Math.PI * 2 + p.py)) * MESH_H;
      var c = hslToRgb(pointHue(i, tension), sat * p.sat, light + p.lt);
      mcr[i] = c[0]; mcg[i] = c[1]; mcb[i] = c[2];
    }

    var d = meshImg.data, k = 0;
    for (var y = 0; y < MESH_H; y++) {
      for (var x = 0; x < MESH_W; x++) {
        var wsum = 0, r = 0, g2 = 0, b = 0;
        for (var j = 0; j < 4; j++) {
          var dx = x - mpx[j], dy = y - mpy[j];
          var u = 1 / (dx * dx + dy * dy + SOFT);
          u *= u;                       // обратный квадрат: точки читаются, поле остаётся гладким
          wsum += u;
          r += u * mcr[j]; g2 += u * mcg[j]; b += u * mcb[j];
        }
        d[k++] = r / wsum;
        d[k++] = g2 / wsum;
        d[k++] = b / wsum;
        d[k++] = 255;
      }
    }
    mg.putImageData(meshImg, 0, 0);
  }

  /* Поле выводится не заливкой, а сеткой точек в один пиксель. Рисовать их
     поштучно нельзя: при таком шаге их десятки тысяч на кадр. Поэтому поле
     рисуется целиком в слой, а потом по нему вырезается точечная маска —
     три полноэкранных операции вместо десятков тысяч заливок. */
  var DOT_STEP = 5;    // шаг сетки в CSS-пикселях
  var DOT_ALPHA = 0.5; // прозрачность сетки

  var layer = document.createElement('canvas');
  var lg = layer.getContext('2d');
  var dotTile = document.createElement('canvas');
  var dotPattern = null, tileStep = 0, tileDot = 0;

  function ensureDotPattern(step, dot) {
    if (dotPattern && tileStep === step && tileDot === dot) return;
    dotTile.width = step;
    dotTile.height = step;
    var tg = dotTile.getContext('2d');
    tg.clearRect(0, 0, step, step);
    tg.fillStyle = '#000';
    tg.fillRect(0, 0, dot, dot);
    dotPattern = lg.createPattern(dotTile, 'repeat');
    tileStep = step;
    tileDot = dot;
  }

  function drawMeshDots(t, tension, beatDip) {
    computeField(t, tension, beatDip);

    var dpr = st.dpr;
    var W = cv.width, H = cv.height;
    var dot = Math.max(1, Math.round(dpr));            // один CSS-пиксель
    var step = Math.max(dot + 1, Math.round(DOT_STEP * dpr));

    if (layer.width !== W || layer.height !== H) {
      layer.width = W;
      layer.height = H;
      dotPattern = null;                               // контекст слоя пересоздан
    }
    ensureDotPattern(step, dot);

    // поле целиком в слой, затем оставляем от него только точки сетки
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.imageSmoothingEnabled = true;
    lg.drawImage(mesh, 0, 0, W, H);
    lg.globalCompositeOperation = 'destination-in';
    lg.fillStyle = dotPattern;
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'source-over';

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'hsl(' + lerp(48, 16, tension).toFixed(0) + ',' +
      (6 + 12 * tension).toFixed(1) + '%,' + (96.6 - 2.4 * tension - beatDip).toFixed(2) + '%)';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = DOT_ALPHA;
    g.drawImage(layer, 0, 0);
    g.globalAlpha = 1;
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    var bp = beatAt(t);
    bp = bp - Math.floor(bp);
    var dip = st.objs.length ? Math.pow(1 - bp, 6) * 0.9 * st.sync : 0;
    drawMeshDots(t, st.tension, dip);
    if (!st.objs.length) return;

    var d = st.dpr;
    g.setTransform(d * st.scale, 0, 0, d * st.scale, d * st.ox, d * st.oy);
    var beat = beatAt(t);

    st.objs.forEach(function (o) {
      if (!o.visible) return;
      var inst = INSTR[o.kind];
      var a = Math.min(1, (t - o.appearAt) / FADE);
      var p = cyclePos(o, beat); p = p - Math.floor(p);
      var jitter = o.shake > 0 ? Math.sin(t * 90) * o.shake * 5 : 0;
      var x = o.x + jitter, y = o.y;

      var frac = chargeFrac(o, beat);
      var warning = o.alive && frac <= WARN / LIFE;
      var lastChance = o.alive && frac <= 1 / LIFE;
      var urgency = warning ? 1 - frac / (WARN / LIFE) : 0;
      var leak = bleeding(o, beat);
      var satScale = o.alive ? 0.75 + 0.25 * frac : 1;

      o.ripples.forEach(function (r) {
        var k = (t - r.t) / 1.25;
        if (k > 1) return;
        // волна доходит ровно до индикатора и там гаснет: дальше уже зона соседа
        var s = o.size + k * 2 * GAP * r.s;
        tilePath(x, y, s, o.radius * (s / o.size));
        g.strokeStyle = syncedColor(inst, (1 - k) * 0.28 * r.s * a, 0, satScale);
        g.lineWidth = 1.4 * (1 - k);
        g.stroke();
      });

      // приближающийся контур — фаза, читаемая глазом
      var k2 = Math.pow(p, 1.25);
      var ringA = Math.pow(p, 2.2);
      var land = p > 0.88 ? (p - 0.88) / 0.12 : 0;
      var antic = Math.pow(p, 10);
      tilePath(x, y, Math.max(o.size * k2, 1), o.radius * k2);
      g.strokeStyle = lastChance
        ? 'hsla(12,58%,50%,' + ((0.3 + 0.65 * ringA) * a) + ')'   // «сюда, сейчас»
        : o.alive
          ? syncedColor(inst, (0.18 + 0.72 * ringA) * a, 0, satScale)
          : 'hsla(28,7%,38%,' + ((0.14 + 0.56 * ringA) * a) + ')';
      g.lineWidth = (1.2 + land * 2) * (warning ? 1.6 : 1);
      g.stroke();

      /* Отдельного тревожного ореола больше нет: в плотной сетке он лез бы
         к соседям. Тревога живёт внутри своей рамки — дуга толще и ярче,
         контур плитки уходит в глину, на доле-шансе туда же уходит
         приближающийся контур. */

      if (leak) {
        // молчащая плитка не уходит, а тянет очки — и видно, что она тянет
        tilePath(x, y, o.size + 2 * GAP, o.radius + GAP);
        g.strokeStyle = 'hsla(12,45%,52%,' + ((0.14 + 0.34 * o.bleed) * a).toFixed(3) + ')';
        g.lineWidth = 1.2 + o.bleed * 1.8;
        g.stroke();
      }

      // тело плитки
      tilePath(x, y, o.size, o.radius);
      if (o.alive) {
        // в тревоге плитка вспыхивает внутрь — сигнал, не выходящий за рамку
        g.fillStyle = warning
          ? 'hsla(12,45%,55%,' + ((0.08 + 0.16 * o.warnFlash) * a).toFixed(3) + ')'
          : syncedColor(inst, (0.09 + o.flash * 0.15) * a, 0, satScale);
        g.fill();
        g.strokeStyle = warning
          ? 'hsla(12,50%,48%,' + ((0.45 + 0.35 * urgency + o.flash * 0.3) * a).toFixed(3) + ')'
          : syncedColor(inst, (0.6 + antic * 0.2 + o.flash * 0.4) * a, -o.flash * 6, satScale);
        g.lineWidth = 1.6 + o.flash * 1.6 + urgency * 1.2;
      } else {
        g.fillStyle = leak
          ? 'hsla(12,30%,60%,' + (0.07 * a) + ')'
          : 'hsla(28,7%,50%,' + (0.03 * a) + ')';
        g.fill();
        g.strokeStyle = leak
          ? 'hsla(12,45%,48%,' + ((0.4 + 0.25 * o.bleed) * a).toFixed(3) + ')'
          : 'hsla(28,7%,40%,' + ((0.42 + antic * 0.25) * a) + ')';
        g.lineWidth = 1.4;
      }
      g.stroke();

      // дуга заряда по периметру плитки: полная сразу после подтверждения,
      // пустая на доле-шансе. В тревоге держим минимальную длину, иначе она
      // исчезает ровно тогда, когда нужнее всего
      if (o.alive) {
        var gs = o.size + 2 * GAP, gr = o.radius + GAP;
        var per = perimeter(gs, gr);
        var shown = warning ? Math.max(frac, 0.05) : frac;
        g.save();
        g.setLineDash([shown * per, per]);
        tilePath(x, y, gs, gr);
        g.strokeStyle = warning
          ? 'hsla(12,58%,50%,' + ((0.55 + 0.4 * o.warnFlash) * a).toFixed(3) + ')'
          : syncedColor(inst, 0.5 * a, 0, satScale);
        g.lineWidth = warning ? 2.8 + o.warnFlash * 1.8 + urgency * 1.4 : 2;
        g.stroke();
        g.restore();
      }

      // подпись сверху, ядро в центре, цена снизу: и то и другое у краёв,
      // где растущий контур ещё почти прозрачен и не спорит с текстом
      var ink = warning
        ? 'hsla(12,48%,44%,' + (0.72 * a).toFixed(3) + ')'
        : o.alive
          ? syncedColor(inst, 0.68 * a, -4, satScale)
          : 'hsla(28,7%,42%,' + (0.5 * a) + ')';

      g.save();
      g.textAlign = 'center';
      if ('letterSpacing' in g) g.letterSpacing = '0.12em';
      g.font = '11px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';
      g.fillStyle = ink;
      g.fillText(inst.title, x, y - o.half + 25);
      g.restore();

      // клавиша — в углу, чтобы не спорила с подписью по центру
      g.save();
      g.textAlign = 'right';
      g.font = '10px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';
      g.fillStyle = o.alive
        ? syncedColor(inst, 0.42 * a, 0, satScale)
        : 'hsla(28,7%,45%,' + (0.38 * a) + ')';
      g.fillText(o.keyLabel, x + o.half - 11, y - o.half + 25);
      g.restore();

      g.beginPath();
      g.arc(x, y, o.alive ? 2.8 + o.flash * 2.6 : 2.2, 0, Math.PI * 2);
      g.fillStyle = o.alive
        ? syncedColor(inst, 0.85 * a, 0, satScale)
        : 'hsla(28,7%,40%,' + (0.5 * a) + ')';
      g.fill();

      g.font = '12px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';
      g.fillStyle = ink;
      g.fillText('×' + o.factor, x, y + o.half - 14);
    });

    // всплывающие очки
    g.textAlign = 'center';
    g.font = '15px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';
    st.pops.forEach(function (q) {
      var k = (t - q.t) / 0.95;
      g.fillStyle = q.good
        ? 'hsla(' + q.hue + ',38%,42%,' + (1 - k) + ')'
        : 'hsla(12,55%,45%,' + (1 - k) + ')';
      g.fillText(q.text, q.x, q.y - k * 24);
    });
  }

  /* ---------------- цикл ---------------- */

  window.__VT = { st: st, clock: clock, INSTR: INSTR, COMPOSITION: COMPOSITION, GRID: GRID,
                  beatAt: beatAt, timeAt: timeAt, tempo: function () { return targetBpm; },
                  mesh: mesh, meshImg: meshImg, computeField: computeField,
                  drawMeshDots: drawMeshDots };

  var last = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (S.ready()) st.perfToCtx = S.ctxNow() - performance.now() / 1000;
    // до включения звука фон всё равно должен жить — берём часы страницы
    var t = S.ready() ? S.now() : performance.now() / 1000;
    var dt = last ? Math.min(0.05, t - last) : 0;
    last = t;
    if (st.mode === 'play' && !st.paused && S.ready()) update(t, dt);
    // фон живёт во всех режимах: на конце доводим до красного, на титуле — до покоя
    if (st.mode === 'over') st.tension += (1 - st.tension) * Math.min(1, dt * 1.2);
    else if (st.mode === 'title') st.tension += (0 - st.tension) * Math.min(1, dt * 1.2);
    updateCursor();
    draw(t);
  }
  requestAnimationFrame(frame);
})();
