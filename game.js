/* «втакт» — механика фазы.
   Один бесконечный круг. Инструменты входят по одному и не выключаются сами:
   каждый держится LIFE своих циклов, потом угасает, если не подтвердить его
   новым попаданием в долю. Чистая игра разгоняет темп, ошибки его сбрасывают. */
(function () {
  'use strict';

  var S = window.SND;

  var VW = 1000, VH = 620;            // виртуальное поле композиции
  var PERFECT = 0.085, GOOD = 0.155;  // окна попадания, секунды

  var BEATS_PER_BAR = 4;
  var LIFE = 4;          // сколько своих циклов инструмент живёт без подтверждения
  var WARN = 2;          // за сколько последних циклов начинает предупреждать
  var INTRO_BARS = 2;    // через сколько тактов входит следующий инструмент

  var BPM_START = 84, BPM_MIN = 66, BPM_MAX = 150;
  var BPM_UP = 0.3;      // за попадание
  var BPM_BONUS = 0.8;   // за такт, в котором все инструменты держатся уверенно
  var BPM_DOWN = 4;      // за промах или угасание

  var SCORE_ON = 200, SCORE_HIT = 100, SCORE_GOOD = 60;
  var SCORE_MISS = -50, SCORE_LOST = -150;
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
    nameForm: document.getElementById('name-form'),
    nameInput: document.getElementById('name-input'),
    welcome: document.getElementById('welcome'),
    welcomeName: document.getElementById('welcome-name'),
    welcomeBest: document.getElementById('welcome-best'),
    changeName: document.getElementById('change-name')
  };

  function num(n) { return n.toLocaleString('ru-RU'); }

  /* ---------------- инструменты ---------------- */
  /* play(t, i) — фигура одного цикла, t = абсолютное время начала цикла */

  var INSTR = {
    kick: {
      hue: 222, sat: 24, light: 42,
      play: function (t, i, bd) { S.kick(t, 0.85); S.kick(t + bd, 0.5); },
      accent: function (t) { S.kick(t, 0.8); }
    },
    hat: {
      hue: 200, sat: 16, light: 54,
      play: function (t, i, bd) {
        S.hat(t + 0.5 * bd, 0.3);
        S.hat(t + 1.5 * bd, 0.22);
        if (i % 2) S.hat(t + 1.75 * bd, 0.12);
      },
      accent: function (t) { S.hat(t, 0.3); }
    },
    rim: {
      hue: 14, sat: 32, light: 55,
      play: function (t, i, bd) { S.rim(t, 0.5); S.rim(t + 1.5 * bd, 0.3); },
      accent: function (t) { S.rim(t, 0.45); }
    },
    bass: {
      hue: 246, sat: 34, light: 47,
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
      seq: [81, 76, 79, 84],
      play: function (t, i) { S.bell(t, this.seq[i % this.seq.length], 0.22); },
      accent: function (t) { S.bell(t, 81, 0.2); }
    },
    pad: {
      hue: 190, sat: 22, light: 51,
      ch: [[57, 60, 64], [55, 60, 64]],
      play: function (t, i, bd) { S.pad(t, this.ch[i % 2], 0.13, 8 * bd); },
      accent: function (t, bd) { S.pad(t, [57, 60, 64], 0.1, 2 * bd); }
    }
  };

  /* порядок входа — он же музыкальная драматургия: пульс, бас, дыхание сверху,
     полиритм, мелодия, колокол, пад */
  var COMPOSITION = [
    { kind: 'kick',  period: 2, x: 170, y: 300 },
    { kind: 'bass',  period: 4, x: 510, y: 340 },
    { kind: 'hat',   period: 2, x: 310, y: 150 },
    { kind: 'rim',   period: 3, x: 300, y: 480 },
    { kind: 'pluck', period: 4, x: 670, y: 180 },
    { kind: 'bell',  period: 5, x: 750, y: 460 },
    { kind: 'pad',   period: 8, x: 890, y: 290 }
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
    objs: [],
    cursor: 0,          // следующая доля к планированию
    score: 0,
    combo: 0,
    sync: 0.25,
    player: null,
    best: 0,
    beaten: false,
    lastSaved: 0,
    lastBar: -1,
    errorsThisBar: 0,
    pops: [],
    hinted: 0,
    perfToCtx: 0,
    scale: 1, ox: 0, oy: 0, dpr: 1
  };

  function radiusFor(period) { return 34 + period * 9; }

  function reset() {
    st.objs = COMPOSITION.map(function (c, i) {
      return {
        id: i, kind: c.kind, period: c.period, x: c.x, y: c.y,
        r: radiusFor(c.period),
        introBeat: i * INTRO_BARS * BEATS_PER_BAR,
        visible: false, appearAt: 0,
        alive: false, until: -1,
        lastPhase: 0, flash: 0, shake: 0, warnFlash: 0, ripples: []
      };
    });
    clock.timeRef = S.ctxNow() + 0.9;
    clock.beatRef = 0;
    clock.bpm = BPM_START;
    targetBpm = BPM_START;
    st.cursor = 0;
    st.score = 0;
    st.combo = 0;
    st.lastBar = -1;
    st.errorsThisBar = 0;
    st.pops = [];
    st.hinted = 0;
    st.best = st.player ? VTStore.best(st.player) : 0;
    st.beaten = false;
    st.lastSaved = 0;
    paintBest();
  }

  function multiplier() { return 1 + Math.min(3, Math.floor(st.combo / 8)); }

  /* заряд инструмента: 1 — только что подтверждён, 0 — последняя доля-шанс */
  function chargeFrac(o, beat) {
    if (!o.alive) return 0;
    var remaining = o.until + 1 - beat / o.period;
    return Math.max(0, Math.min(1, remaining / LIFE));
  }

  /* «синхрон» — качество игры, а не заряд слоёв: он красит сцену целиком.
     Заряд отдельного инструмента показывает только его собственная дуга. */
  function bumpSync(delta) {
    st.sync = Math.max(0.15, Math.min(1, st.sync + delta));
  }

  function syncedColor(inst, alpha, lightShift, satScale) {
    var s = inst.sat * (0.16 + 0.84 * st.sync) * (satScale === undefined ? 1 : satScale);
    return 'hsla(' + inst.hue + ',' + s.toFixed(1) + '%,' +
      (inst.light + (lightShift || 0)).toFixed(1) + '%,' + alpha + ')';
  }

  function pop(o, text, good) {
    st.pops.push({ x: o.x, y: o.y - o.r - 14, text: text, t: S.now(), hue: INSTR[o.kind].hue, good: good });
  }

  /* ---------------- планировщик ----------------
     Идём курсором по целым долям: на границе такта переставляем темп,
     на своей доле каждый живой инструмент играет фигуру цикла. */

  function schedule() {
    if (!S.ready() || st.mode !== 'play') return;
    var horizon = S.ctxNow() + 0.25;
    var guard = 0;
    while (timeAt(st.cursor) < horizon && guard++ < 512) {
      if (st.cursor % BEATS_PER_BAR === 0) applyTempo(st.cursor);
      var bt = timeAt(st.cursor);
      var bd = beatDur();
      if (bt > S.ctxNow() + 0.005) {
        st.objs.forEach(function (o) {
          if (!o.alive || st.cursor % o.period !== 0) return;
          var k = st.cursor / o.period;
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
      var d = Math.hypot(vx - o.x, vy - o.y);
      if (d < o.r * 1.3 && d < best) { best = d; target = o; }
    });
    return target;
  }

  var cursorNow = '';
  function setCursor(c) {
    if (cursorNow === c) return;
    cursorNow = c;
    cv.style.cursor = c;
  }

  function onPointerDown(ev) {
    if (st.mode !== 'play') return;
    var t = heardTimeOf(ev);
    var target = objectAt(ev.clientX, ev.clientY);
    if (!target) return;                     // мимо всего — без наказания

    var beat = beatAt(t);
    var k = Math.max(0, Math.round(beat / target.period));
    var err = Math.abs(t - timeAt(k * target.period));
    var aNow = S.ctxNow() + 0.02;

    if (err <= GOOD) {
      var perfect = err <= PERFECT;
      var was = chargeFrac(target, beat);
      var gain;
      if (!target.alive) {
        target.alive = true;
        gain = SCORE_ON;
        INSTR[target.kind].accent(aNow, beatDur());
        S.confirm(aNow, perfect ? 0.11 : 0.07);
        target.ripples.push({ t: S.now(), s: 1.15 });
      } else {
        gain = perfect ? SCORE_HIT : SCORE_GOOD;
        if (was > TOPPED_UP) gain = Math.round(gain * 0.4);  // не давать долбить один круг
        S.confirm(aNow, 0.05);
        target.ripples.push({ t: S.now(), s: 0.7 });
      }
      target.until = k + LIFE - 1;
      target.flash = 1;
      st.combo++;
      gain *= multiplier();
      st.score += gain;
      pop(target, '+' + gain, true);
      bumpSync(perfect ? 0.14 : 0.09);
      targetBpm = Math.min(BPM_MAX, targetBpm + BPM_UP);
      if (st.hinted === 0) { st.hinted = 1; showHint('держите инструмент живым — подтверждайте попадание, пока дуга не опустела'); }
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
    S.init();
    S.resume();
    st.mode = 'play';
    reset();
    el.title.classList.add('gone');
    setTimeout(function () {
      if (st.hinted === 0) showHint('кликните по кругу, когда кольцо коснётся его края');
    }, 1200);
  }

  function toTitle() {
    saveNow();
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

  cv.addEventListener('pointerdown', onPointerDown);

  cv.addEventListener('pointermove', function (ev) {
    setCursor(st.mode === 'play' && objectAt(ev.clientX, ev.clientY) ? 'grab' : '');
  });
  cv.addEventListener('pointerleave', function () { setCursor(''); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
      if (st.mode === 'play') { saveNow(); reset(); }
    } else if (e.key === 'Escape') {
      if (st.mode === 'play') toTitle();
    }
  });

  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) saveNow();
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
      if (!o.visible && beat >= o.introBeat) { o.visible = true; o.appearAt = t; }
      if (!o.visible) return;

      // угасание: даём доиграть окно попадания последней доли-шанса
      if (o.alive && t > timeAt((o.until + 1) * o.period) + GOOD) expire(o);

      var p = beat / o.period;
      p = p - Math.floor(p);
      if (p < o.lastPhase) {
        if (o.alive) { o.ripples.push({ t: t, s: 0.9 }); o.flash = Math.max(o.flash, 0.85); }
        if (o.alive && chargeFrac(o, beat) <= WARN / LIFE) o.warnFlash = 1;
      }
      o.lastPhase = p;
      o.flash = Math.max(0, o.flash - dt * 2.6);
      o.shake = Math.max(0, o.shake - dt * 3.2);
      o.warnFlash = Math.max(0, o.warnFlash - dt * 1.6);
      o.ripples = o.ripples.filter(function (r) { return t - r.t < 1.25; });
    });

    // границы такта: премия за такт, в котором все слои держатся уверенно
    var bar = Math.floor(beat / BEATS_PER_BAR);
    if (bar !== st.lastBar) {
      if (st.lastBar >= 0) {
        var live = st.objs.filter(function (o) { return o.alive; });
        var confident = live.length && live.every(function (o) {
          return chargeFrac(o, beat) > WARN / LIFE;
        });
        if (confident && st.errorsThisBar === 0) {
          targetBpm = Math.min(BPM_MAX, targetBpm + BPM_BONUS);
        }
      }
      st.lastBar = bar;
      st.errorsThisBar = 0;
    }

    st.pops = st.pops.filter(function (q) { return t - q.t < 0.95; });

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

  function background(t) {
    var live = st.objs.filter(function (o) { return o.alive; });
    var hue = 40, sat = 6;
    if (live.length) {
      var sx = 0, sy = 0;
      live.forEach(function (o) {
        var h = INSTR[o.kind].hue * Math.PI / 180;
        sx += Math.cos(h); sy += Math.sin(h);
      });
      hue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
      sat = 9 * st.sync;
    }
    var bp = beatAt(t);
    bp = bp - Math.floor(bp);
    var dip = live.length ? Math.pow(1 - bp, 6) * 0.9 * st.sync : 0;
    return 'hsl(' + hue.toFixed(0) + ',' + sat.toFixed(1) + '%,' + (96.4 - dip).toFixed(2) + '%)';
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = st.mode === 'title' ? '#f6f5f2' : background(t);
    g.fillRect(0, 0, cv.width, cv.height);
    if (!st.objs.length) return;

    var d = st.dpr;
    g.setTransform(d * st.scale, 0, 0, d * st.scale, d * st.ox, d * st.oy);
    var beat = beatAt(t);

    st.objs.forEach(function (o) {
      if (!o.visible) return;
      var inst = INSTR[o.kind];
      var a = Math.min(1, (t - o.appearAt) / 0.8);          // мягкий вход
      var p = beat / o.period; p = p - Math.floor(p);
      var jitter = o.shake > 0 ? Math.sin(t * 90) * o.shake * 5 : 0;
      var x = o.x + jitter, y = o.y;

      var frac = chargeFrac(o, beat);
      var warning = o.alive && frac <= WARN / LIFE;
      var lastChance = o.alive && frac <= 1 / LIFE;         // следующая доля — последняя
      var urgency = warning ? 1 - frac / (WARN / LIFE) : 0;
      // цвет почти не теряется: угасающий должен быть настойчивее, а не незаметнее,
      // иначе он читается как невключённый
      var satScale = o.alive ? 0.75 + 0.25 * frac : 1;

      o.ripples.forEach(function (r) {
        var k = (t - r.t) / 1.25;
        if (k > 1) return;
        g.beginPath();
        g.arc(x, y, o.r + k * 130 * r.s, 0, Math.PI * 2);
        g.strokeStyle = syncedColor(inst, (1 - k) * 0.3 * r.s * a, 0, satScale);
        g.lineWidth = 1.4 * (1 - k);
        g.stroke();
      });

      // приближающееся кольцо — фаза, читаемая глазом
      var ringA = Math.pow(p, 2.2);
      var land = p > 0.88 ? (p - 0.88) / 0.12 : 0;
      var antic = Math.pow(p, 10);
      g.beginPath();
      g.arc(x, y, Math.max(o.r * Math.pow(p, 1.25), 0.5), 0, Math.PI * 2);
      g.strokeStyle = lastChance
        ? 'hsla(12,58%,50%,' + ((0.3 + 0.65 * ringA) * a) + ')'   // «сюда, сейчас»
        : o.alive
          ? syncedColor(inst, (0.18 + 0.72 * ringA) * a, 0, satScale)
          : 'hsla(28,7%,38%,' + ((0.14 + 0.56 * ringA) * a) + ')';
      g.lineWidth = (1.2 + land * 2) * (warning ? 1.6 : 1);
      g.stroke();

      if (warning) {
        // тревожный ореол пульсирует на каждой своей доле — видно, какой круг просит
        g.beginPath();
        g.arc(x, y, o.r + 17 + o.warnFlash * 6, 0, Math.PI * 2);
        g.strokeStyle = 'hsla(12,58%,52%,' +
          ((0.1 + 0.45 * o.warnFlash) * (0.45 + 0.55 * urgency) * a).toFixed(3) + ')';
        g.lineWidth = 1.4 + o.warnFlash * 2.4;
        g.stroke();
      }

      if (o.alive) {
        g.beginPath();
        g.arc(x, y, o.r, 0, Math.PI * 2);
        g.fillStyle = syncedColor(inst, (0.09 + o.flash * 0.15) * a, 0, satScale);
        g.fill();
        g.strokeStyle = warning
          ? 'hsla(12,50%,48%,' + ((0.45 + 0.35 * urgency + o.flash * 0.3) * a).toFixed(3) + ')'
          : syncedColor(inst, (0.6 + antic * 0.2 + o.flash * 0.4) * a, -o.flash * 6, satScale);
        g.lineWidth = 1.6 + o.flash * 1.6 + urgency * 1.2;
        g.stroke();

        // дуга заряда: полная сразу после подтверждения, пустая на доле-шансе.
        // в тревоге держим минимальную длину, иначе она исчезает ровно тогда,
        // когда нужнее всего
        var shown = warning ? Math.max(frac, 0.05) : frac;
        g.beginPath();
        g.arc(x, y, o.r + 9, -Math.PI / 2, -Math.PI / 2 + shown * Math.PI * 2);
        g.strokeStyle = warning
          ? 'hsla(12,58%,50%,' + ((0.55 + 0.4 * o.warnFlash) * a).toFixed(3) + ')'
          : syncedColor(inst, 0.45 * a, 0, satScale);
        g.lineWidth = warning ? 2.8 + o.warnFlash * 1.8 + urgency * 1.4 : 2;
        g.stroke();

        g.beginPath();
        g.arc(x, y, 2.8 + o.flash * 2.6, 0, Math.PI * 2);
        g.fillStyle = syncedColor(inst, 0.85 * a, 0, satScale);
        g.fill();
      } else {
        g.beginPath();
        g.arc(x, y, o.r, 0, Math.PI * 2);
        g.strokeStyle = 'hsla(28,7%,40%,' + ((0.42 + antic * 0.25) * a) + ')';
        g.lineWidth = 1.4;
        g.stroke();
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fillStyle = 'hsla(28,7%,40%,' + (0.5 * a) + ')';
        g.fill();
      }
    });

    // всплывающие очки
    g.textAlign = 'center';
    g.font = '15px -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif';
    st.pops.forEach(function (q) {
      var k = (t - q.t) / 0.95;
      g.fillStyle = q.good
        ? 'hsla(' + q.hue + ',38%,42%,' + (1 - k) + ')'
        : 'hsla(12,55%,45%,' + (1 - k) + ')';
      g.fillText(q.text, q.x, q.y - k * 22);
    });
  }

  /* ---------------- цикл ---------------- */

  window.__VT = { st: st, clock: clock, INSTR: INSTR, COMPOSITION: COMPOSITION,
                  beatAt: beatAt, timeAt: timeAt, tempo: function () { return targetBpm; } };

  var last = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (S.ready()) st.perfToCtx = S.ctxNow() - performance.now() / 1000;
    var t = S.ready() ? S.now() : 0;
    var dt = last ? Math.min(0.05, t - last) : 0;
    last = t;
    if (st.mode === 'play' && S.ready()) update(t, dt);
    draw(t);
  }
  requestAnimationFrame(frame);
})();
