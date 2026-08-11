/* «в такт» — механика фазы.
   Единственное действие — клик. Попал в фазу объекта — он вводит свой слой в трек.
   Промах — слой глохнет, мир теряет насыщенность. */
(function () {
  'use strict';

  var S = window.SND;
  var BEAT = S.BEAT;

  var VW = 1000, VH = 620;          // виртуальное поле композиции
  var PERFECT = 0.085, GOOD = 0.155; // окна попадания, секунды

  var cv = document.getElementById('stage');
  var g = cv.getContext('2d');

  var el = {
    level: document.getElementById('hud-level'),
    keys: document.getElementById('hud-keys'),
    dots: document.getElementById('hud-dots'),
    hint: document.getElementById('hint'),
    caption: document.getElementById('caption'),
    title: document.getElementById('title')
  };

  /* ---------------- инструменты ---------------- */
  /* play(t, i) — фигура одного цикла, t = абсолютное время начала цикла (домен планирования) */

  var INSTR = {
    kick: {
      hue: 222, sat: 24, light: 42,
      play: function (t) { S.kick(t, 0.85); S.kick(t + BEAT, 0.5); },
      accent: function (t) { S.kick(t, 0.8); }
    },
    hat: {
      hue: 200, sat: 16, light: 54,
      play: function (t, i) {
        S.hat(t + 0.5 * BEAT, 0.3);
        S.hat(t + 1.5 * BEAT, 0.22);
        if (i % 2) S.hat(t + 1.75 * BEAT, 0.12);
      },
      accent: function (t) { S.hat(t, 0.3); }
    },
    rim: {
      hue: 14, sat: 32, light: 55,
      play: function (t) { S.rim(t, 0.5); S.rim(t + 1.5 * BEAT, 0.3); },
      accent: function (t) { S.rim(t, 0.45); }
    },
    bass: {
      hue: 246, sat: 34, light: 47,
      seq: [[45, 50], [45, 48], [43, 50], [45, 52]],
      play: function (t, i) {
        var p = this.seq[i % this.seq.length];
        S.bass(t, p[0], 0.55, BEAT * 1.7);
        S.bass(t + 2.5 * BEAT, p[1], 0.4, BEAT * 1.2);
      },
      accent: function (t) { S.bass(t, 45, 0.5, BEAT); }
    },
    pluck: {
      hue: 36, sat: 50, light: 51,
      ph: [
        [[0, 69], [1.5, 72], [2.5, 76]],
        [[0, 74], [1, 72], [2.5, 69]],
        [[0, 76], [1.5, 79], [3, 72]],
        [[0.5, 72], [2, 74], [3, 69]]
      ],
      play: function (t, i) {
        this.ph[i % this.ph.length].forEach(function (n) {
          S.pluck(t + n[0] * BEAT, n[1], 0.3);
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
    arp: {
      hue: 288, sat: 26, light: 54,
      up: [69, 72, 76, 79, 84, 79, 76, 72],
      play: function (t, i) {
        var n = this.up.slice();
        if (i % 2) n.reverse();
        for (var k = 0; k < 8; k++) S.pluck(t + k * 0.5 * BEAT, n[k], 0.15);
      },
      accent: function (t) { S.pluck(t, 76, 0.2); }
    },
    pad: {
      hue: 190, sat: 22, light: 51,
      ch: [[57, 60, 64], [55, 60, 64]],
      play: function (t, i) { S.pad(t, this.ch[i % 2], 0.13, 8 * BEAT); },
      accent: function (t) { S.pad(t, [57, 60, 64], 0.1, 2 * BEAT); }
    }
  };

  /* ---------------- уровни ---------------- */

  var LEVELS = [
    { name: 'пульс', objs: [
      ['kick', 2, 400, 300], ['bass', 4, 630, 320]
    ]},
    { name: 'шаг', objs: [
      ['kick', 2, 300, 300], ['hat', 2, 455, 455], ['bass', 4, 580, 270], ['pad', 8, 790, 400]
    ]},
    { name: 'против', objs: [
      ['kick', 2, 250, 320], ['hat', 2, 430, 180], ['rim', 3, 480, 450],
      ['bass', 4, 700, 300], ['pluck', 4, 840, 470]
    ]},
    { name: 'полёт', objs: [
      ['kick', 2, 190, 340], ['hat', 2, 350, 180], ['rim', 3, 420, 470],
      ['bass', 4, 620, 330], ['bell', 5, 800, 180], ['arp', 4, 830, 480]
    ]},
    { name: 'дыхание', objs: [
      ['kick', 2, 170, 300], ['hat', 2, 310, 150], ['rim', 3, 300, 480],
      ['bass', 4, 510, 340], ['pluck', 4, 670, 180], ['bell', 5, 750, 460],
      ['pad', 8, 890, 290]
    ]}
  ];

  /* ---------------- состояние ---------------- */

  var st = {
    mode: 'title',        // title | play | outro
    phase: 'playing',     // playing | completing | fading
    level: 0,
    objs: [],
    t0: 0,
    sync: 0.4,
    alpha: 1,
    completeAt: 0,
    fadeAt: 0,
    hinted: false,
    perfToCtx: 0,
    scale: 1, ox: 0, oy: 0
  };

  function radiusFor(period) { return 34 + period * 9; }

  function buildLevel(idx) {
    var def = LEVELS[idx];
    st.objs = def.objs.map(function (o, i) {
      return {
        id: i, kind: o[0], period: o[1], x: o[2], y: o[3],
        r: radiusFor(o[1]),
        alive: false, nextIdx: 0,
        lastPhase: 0, flash: 0, shake: 0, ripples: []
      };
    });
    st.t0 = S.ctxNow() + 0.7;
    st.phase = 'playing';
    st.alpha = 1;
    st.completeAt = 0;

    el.level.textContent = (idx + 1) + ' / ' + LEVELS.length + '   ' + def.name;
    el.dots.innerHTML = '';
    st.objs.forEach(function () {
      var d = document.createElement('div');
      d.className = 'dot';
      el.dots.appendChild(d);
    });
    el.caption.classList.remove('on');
  }

  function syncedColor(inst, alpha, lightShift) {
    var s = inst.sat * (0.16 + 0.84 * st.sync);
    var l = inst.light + (lightShift || 0);
    return 'hsla(' + inst.hue + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%,' + alpha + ')';
  }

  /* ---------------- планировщик ---------------- */

  function schedule() {
    if (!S.ready() || st.mode === 'title' || st.phase === 'fading' || !st.objs.length) return;
    var aNow = S.ctxNow();
    st.objs.forEach(function (o) {
      if (!o.alive) return;
      var per = o.period * BEAT;
      while (st.t0 + o.nextIdx * per < aNow + 0.25) {
        var cs = st.t0 + o.nextIdx * per;
        if (cs > aNow + 0.01) INSTR[o.kind].play(cs, o.nextIdx);
        o.nextIdx++;
      }
    });
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

  function toVirtual(cx, cy) {
    return { x: (cx - st.ox) / st.scale, y: (cy - st.oy) / st.scale };
  }

  function onPointerDown(ev) {
    if (st.mode === 'title' || st.phase === 'fading') return;
    var p = toVirtual(ev.clientX, ev.clientY);
    var t = heardTimeOf(ev);

    var target = null, best = 1e9;
    st.objs.forEach(function (o) {
      var d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < o.r * 1.3 && d < best) { best = d; target = o; }
    });
    if (!target) return;                       // мимо всего — без наказания

    var per = target.period * BEAT;
    var k = Math.round((t - st.t0) / per);
    var err = Math.abs(t - (st.t0 + k * per));
    var aNow = S.ctxNow() + 0.02;

    if (err <= GOOD) {
      var perfect = err <= PERFECT;
      if (!target.alive) {
        target.alive = true;
        target.nextIdx = k + 1;
        INSTR[target.kind].accent(aNow);
        S.confirm(aNow, perfect ? 0.11 : 0.07);
        target.ripples.push({ t: S.now(), s: 1.15 });
      } else {
        // подыгрывание уже живому слою — маленький бонус и волна
        S.confirm(aNow, 0.05);
        target.ripples.push({ t: S.now(), s: 0.6 });
      }
      target.flash = 1;
      st.sync = Math.min(1, st.sync + (perfect ? 0.16 : 0.1));
      if (!st.hinted) { st.hinted = true; el.hint.classList.remove('on'); }
    } else if (st.mode === 'play') {
      if (target.alive) { target.alive = false; st.sync = Math.max(0.05, st.sync - 0.22); }
      else { st.sync = Math.max(0.05, st.sync - 0.16); }
      target.shake = 1;
      S.thud(aNow);
    }
    refreshDots();
  }

  function refreshDots() {
    var nodes = el.dots.children;
    st.objs.forEach(function (o, i) {
      var d = nodes[i];
      if (!d) return;
      if (o.alive) {
        d.classList.add('on');
        d.style.background = syncedColor(INSTR[o.kind], 0.85);
      } else {
        d.classList.remove('on');
        d.style.background = 'transparent';
      }
    });
  }

  function start() {
    S.init();
    S.resume();
    st.mode = 'play';
    st.level = 0;
    st.sync = 0.4;
    st.hinted = false;
    buildLevel(0);
    el.title.classList.add('gone');
    el.hint.textContent = 'кольцо растёт от центра — кликните в момент касания края';
    setTimeout(function () { if (!st.hinted) el.hint.classList.add('on'); }, 1600);
  }

  function nextLevel() {
    el.hint.classList.remove('on');
    st.level++;
    buildLevel(st.level);
    refreshDots();
  }

  el.title.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });
  cv.addEventListener('pointerdown', onPointerDown);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
      if (st.mode === 'play') { st.sync = 0.4; buildLevel(st.level); refreshDots(); }
    } else if (e.key === 'Escape') {
      st.mode = 'title';
      st.objs = [];
      el.caption.classList.remove('on');
      el.hint.classList.remove('on');
      el.title.classList.remove('gone');
      el.level.textContent = '';
      el.dots.innerHTML = '';
    }
  });

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

  function phaseOf(o, t) {
    var per = o.period * BEAT;
    var p = ((t - st.t0) / per) % 1;
    return p < 0 ? p + 1 : p;
  }

  function update(t, dt) {
    st.objs.forEach(function (o) {
      var p = phaseOf(o, t);
      if (p < o.lastPhase) {                 // цикл замкнулся — момент доли
        if (o.alive && st.phase !== 'fading') {
          o.ripples.push({ t: t, s: 0.9 });
          o.flash = Math.max(o.flash, 0.85);
        }
      }
      o.lastPhase = p;
      o.flash = Math.max(0, o.flash - dt * 2.6);
      o.shake = Math.max(0, o.shake - dt * 3.2);
      o.ripples = o.ripples.filter(function (r) { return t - r.t < 1.25; });
    });

    if (st.mode !== 'play') return;

    if (st.phase === 'playing' && st.objs.length && st.objs.every(function (o) { return o.alive; })) {
      st.phase = 'completing';
      st.completeAt = t + 8 * BEAT;
      el.caption.textContent = LEVELS[st.level].name;
      el.caption.classList.add('on');
      S.chord(S.ctxNow() + 0.05, [84, 88, 91], 0.09);
    } else if (st.phase === 'completing' && t >= st.completeAt) {
      if (st.level + 1 >= LEVELS.length) {
        // финальный кадр: аранжировка не гаснет, её можно слушать и подыгрывать
        st.mode = 'outro';
        st.phase = 'done';
        el.level.textContent = '';
        el.caption.textContent = 'конец';
        el.caption.classList.add('on');
      } else {
        st.phase = 'fading';
        st.fadeAt = t;
        el.caption.classList.remove('on');
      }
    } else if (st.phase === 'fading') {
      st.alpha = Math.max(0, 1 - (t - st.fadeAt) / 1.5);
      if (t - st.fadeAt >= 1.6) nextLevel();
    }
  }

  /* ---------------- отрисовка ---------------- */

  function background(t) {
    var alive = st.objs.filter(function (o) { return o.alive; });
    var hue = 40, sat = 6;
    if (alive.length) {
      var sx = 0, sy = 0;
      alive.forEach(function (o) {
        var h = INSTR[o.kind].hue * Math.PI / 180;
        sx += Math.cos(h); sy += Math.sin(h);
      });
      hue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
      sat = 9 * st.sync;
    }
    // еле заметное «дыхание» фона на общей доле
    var beatPhase = ((t - st.t0) / BEAT) % 1;
    if (beatPhase < 0) beatPhase += 1;
    var dip = alive.length ? Math.pow(1 - beatPhase, 6) * 0.9 * st.sync : 0;
    return 'hsl(' + hue.toFixed(0) + ',' + sat.toFixed(1) + '%,' + (96.4 - dip).toFixed(2) + '%)';
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = st.mode === 'title' ? '#f6f5f2' : background(t);
    g.fillRect(0, 0, cv.width, cv.height);

    if (!st.objs.length) return;

    var d = st.dpr;
    g.setTransform(d * st.scale, 0, 0, d * st.scale, d * st.ox, d * st.oy);
    g.globalAlpha = 1;

    st.objs.forEach(function (o) {
      var inst = INSTR[o.kind];
      var p = phaseOf(o, t);
      var jitter = o.shake > 0 ? Math.sin(t * 90) * o.shake * 5 : 0;
      var x = o.x + jitter, y = o.y;
      var a = st.alpha;

      // волны от сыгранных долей
      o.ripples.forEach(function (r) {
        var k = (t - r.t) / 1.25;
        if (k > 1) return;
        var rad = o.r + k * 130 * r.s;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.strokeStyle = syncedColor(inst, (1 - k) * 0.3 * r.s * a);
        g.lineWidth = 1.4 * (1 - k);
        g.stroke();
      });

      // приближающееся кольцо — фаза, читаемая глазом
      var ringR = o.r * Math.pow(p, 1.25);
      var ringA = Math.pow(p, 2.2);
      var land = p > 0.88 ? (p - 0.88) / 0.12 : 0;   // «посадка» — кольцо густеет у края
      var antic = Math.pow(p, 10);                    // предвкушение на самом ободе
      g.beginPath();
      g.arc(x, y, Math.max(ringR, 0.5), 0, Math.PI * 2);
      g.strokeStyle = o.alive
        ? syncedColor(inst, (0.18 + 0.72 * ringA) * a)
        : 'hsla(28,7%,38%,' + ((0.14 + 0.56 * ringA) * a) + ')';
      g.lineWidth = 1.2 + land * 2;
      g.stroke();

      // тело объекта
      if (o.alive) {
        g.beginPath();
        g.arc(x, y, o.r, 0, Math.PI * 2);
        g.fillStyle = syncedColor(inst, (0.09 + o.flash * 0.15) * a);
        g.fill();
        g.strokeStyle = syncedColor(inst, (0.6 + antic * 0.2 + o.flash * 0.4) * a, -o.flash * 6);
        g.lineWidth = 1.6 + o.flash * 1.6;
        g.stroke();

        g.beginPath();
        g.arc(x, y, 2.8 + o.flash * 2.6, 0, Math.PI * 2);
        g.fillStyle = syncedColor(inst, 0.85 * a);
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
  }

  /* ---------------- цикл ---------------- */

  // отладочный доступ для настройки на живой странице
  window.__VT = { st: st, INSTR: INSTR, LEVELS: LEVELS };

  var last = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (S.ready()) st.perfToCtx = S.ctxNow() - performance.now() / 1000;
    var t = S.ready() ? S.now() : 0;
    var dt = last ? Math.min(0.05, t - last) : 0;
    last = t;
    if (st.mode !== 'title' && S.ready()) update(t, dt);
    draw(t);
  }
  requestAnimationFrame(frame);
})();
