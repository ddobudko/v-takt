/* «в такт» — синтез и часы.
   Вся ритмическая сетка живёт на часах аудиоконтекста.
   Наружу отдаём два времени:
     ctxNow()  — домен планирования (в это время ноту НАЗНАЧАЮТ);
     now()     — «слышимое» время = ctxNow() - выходная задержка.
   Нота, назначенная на T, слышна ровно тогда, когда now() == T,
   поэтому рендер и оценка клика считаются в now(), а планирование — в ctxNow(). */
(function (global) {
  'use strict';

  var BPM = 84;
  var BEAT = 60 / BPM;

  var ctx = null, master = null, outNode = null, revSend = null, noiseBuf = null;
  var lat = 0;
  var ready = false;

  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function makeIR(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    var c = ctx.createConvolver();
    c.buffer = buf;
    return c;
  }

  function init() {
    if (ready) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.75;

    // общий смягчитель верха: снимает жёсткость хэтов и колокольчиков,
    // не трогая тело инструментов
    var soft = ctx.createBiquadFilter();
    soft.type = 'highshelf';
    soft.frequency.value = 4500;
    soft.gain.value = -4.5;

    // компрессор здесь — страховка от редких совпадений, а не эффект:
    // при верном балансе он почти не срабатывает и не качает картину
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;

    master.connect(soft);
    soft.connect(comp);
    comp.connect(ctx.destination);
    outNode = comp;

    var rev = makeIR(2.8, 2.5);
    revSend = ctx.createGain();
    revSend.gain.value = 1;
    var revOut = ctx.createGain();
    revOut.gain.value = 0.4;
    revSend.connect(rev);
    rev.connect(revOut);
    revOut.connect(master);

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    lat = ctx.outputLatency || ctx.baseLatency || 0;
    ready = true;
  }

  function bus(level, send) {
    var g = ctx.createGain();
    g.gain.value = level;
    g.connect(master);
    if (send > 0) {
      var s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(revSend);
    }
    return g;
  }

  function noise() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  function env(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /* ---- голоса ---- */

  function kick(t, v) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    // ниже стартовая частота и мягче атака — удар без щелчка по ушам
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    var g = ctx.createGain();
    env(g, t, v, 0.014, 0.42);
    o.connect(g);
    g.connect(bus(0.34, 0.06));
    o.start(t);
    o.stop(t + 0.5);
  }

  function hat(t, v) {
    var s = noise();
    var f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4800;
    // потолок сверху: без него хэт — чистое шило, вся энергия выше 2 кГц
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    lp.Q.value = 0.5;
    var g = ctx.createGain();
    env(g, t, v, 0.003, 0.065);
    s.connect(f); f.connect(lp); lp.connect(g);
    g.connect(bus(0.55, 0.3));
    s.start(t);
    s.stop(t + 0.12);
  }

  function rim(t, v) {
    var s = noise();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1750;
    f.Q.value = 6;
    var g = ctx.createGain();
    env(g, t, v, 0.002, 0.14);
    s.connect(f); f.connect(g);
    var b = bus(0.5, 0.45);
    g.connect(b);
    s.start(t);
    s.stop(t + 0.18);

    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 420;
    var og = ctx.createGain();
    env(og, t, v * 0.5, 0.002, 0.07);
    o.connect(og); og.connect(b);
    o.start(t); o.stop(t + 0.1);
  }

  function bass(t, m, v, dur) {
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 540;
    f.Q.value = 1.2;
    var g = ctx.createGain();
    env(g, t, v, 0.022, dur);

    var o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = midi(m);
    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = midi(m - 12);
    var mix = ctx.createGain();
    mix.gain.value = 0.6;
    o2.connect(mix);

    o1.connect(f); mix.connect(f); f.connect(g);
    g.connect(bus(0.34, 0.08));
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.06); o2.stop(t + dur + 0.06);
  }

  function pluck(t, m, v) {
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(m);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.45);
    var g = ctx.createGain();
    env(g, t, v, 0.006, 0.72);
    o.connect(f); f.connect(g);
    g.connect(bus(0.5, 0.55));
    o.start(t);
    o.stop(t + 0.78);
  }

  function bell(t, m, v) {
    var g = ctx.createGain();
    env(g, t, v, 0.01, 2.3);
    g.connect(bus(0.38, 0.8));
    [[1, 1], [2.01, 0.4], [3.02, 0.16]].forEach(function (p) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(m) * p[0];
      var gg = ctx.createGain();
      gg.gain.value = p[1];
      o.connect(gg); gg.connect(g);
      o.start(t);
      o.stop(t + 2.4);
    });
  }

  function pad(t, notes, v, dur) {
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1150;
    f.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(bus(0.32, 0.85));
    notes.forEach(function (m) {
      [-7, 7].forEach(function (det) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det;
        var gg = ctx.createGain();
        gg.gain.value = 0.22;
        o.connect(gg); gg.connect(f);
        o.start(t);
        o.stop(t + dur + 0.15);
      });
    });
  }

  /* ---- служебные ---- */

  function confirm_(t, v) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(93), t);
    var g = ctx.createGain();
    env(g, t, v || 0.09, 0.004, 0.4);
    o.connect(g);
    g.connect(bus(0.5, 0.6));
    o.start(t); o.stop(t + 0.45);
  }

  function thud(t) {
    var s = noise();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    var g = ctx.createGain();
    env(g, t, 0.09, 0.004, 0.16);
    s.connect(f); f.connect(g);
    g.connect(bus(0.5, 0.1));
    s.start(t); s.stop(t + 0.2);
  }

  function chord(t, notes, v) {
    notes.forEach(function (m, i) {
      bell(t + i * 0.06, m, v || 0.12);
    });
  }

  global.SND = {
    BEAT: BEAT,
    BPM: BPM,
    init: init,
    resume: function () { if (ctx && ctx.state !== 'running') ctx.resume(); },
    ready: function () { return ready; },
    ctxNow: function () { return ctx ? ctx.currentTime : 0; },
    now: function () { return ctx ? ctx.currentTime - lat : 0; },
    latency: function () { return lat; },
    kick: kick, hat: hat, rim: rim, bass: bass,
    pluck: pluck, bell: bell, pad: pad,
    confirm: confirm_, thud: thud, chord: chord,
    // точка съёма для замеров уровня и спектра при настройке
    graph: function () { return { ctx: ctx, master: master, out: outNode }; }
  };
})(window);
