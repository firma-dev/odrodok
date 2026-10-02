/* ============================================================
   js/zvuk.js — Хозяин: исполнитель «звук».
   Модель и шина — js/dannye.js (window.OD). Своего CSS нет:
   вид иконки по body[data-sound] уже в baza.css.

   Что делает: WebAudio. Звук включён по умолчанию; браузер даёт
   играть только после первого действия — AudioContext создаётся
   (и resume + «тихий» буфер для iOS) в обработчике первого жеста:
   mousedown / keydown / touchend / pointerup (не мышь) / click.
   До жеста контекста нет и ничего не грузится. После жеста файлы
   assets/kartoteka/zvuki/<имя>.m4a тянутся и декодируются один раз
   (≈ 167 КБ на 11 файлов; step не грузится — его нет ни в записке,
   ни в snd() холста). Звук, попросивший буфер до конца декодирования
   (первый жест сразу открыл стопку), играет, как только буфер готов,
   если опоздание < .6 с. Каждый раз высота ±4 %
   (playbackRate 0.96…1.04).

     событие                 звук                          громкость
     od:open                 open (шелест целиком, 3,1 с)    .55
     od:close                close (начало шелеста, 0,75 с)  .5
     od:button               btn (двойной щелчок машинки)    .8
     od:go via wheel/key/swipe/drag
                             page0…6 случайно, без повтора   .5
     od:flip via key         flip (страница книги)           .6
     (od:go via tab/url, od:flip via button — только щелчок кнопки / тишина)

   С кнопки — только щелчок: если od:button был < 80 мс назад, страницу
   и переворот не играть; open/close играть с задержкой .16 с.
   Иконка [data-action="sound"]: OD.set({sound}), aria-pressed,
   aria-label «Выключить звук» / «Включить звук»; при включении — btn на .4,
   при выключении — тишина (и обрыв того, что звучит).
   Выключение помнится: localStorage 'od-sound' = 'off' (в try/catch).
   Скрытая вкладка — не играть (контекст на паузе). Одновременно не
   больше MAX голосов: лишний обрывает самый старый.
   prefers-reduced-motion звук не трогает: это не движение.

   Слушает: od:open, od:close, od:button, od:go, od:flip, od:state.
   Шлёт:    od:sound {on}.
   Для проверки: window.OD.audio — {ctx, buffers, voices} только чтение.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;

  var DIR = 'assets/kartoteka/zvuki/';
  var NAMES = ['open', 'close', 'btn', 'flip', 'page0', 'page1', 'page2', 'page3', 'page4', 'page5', 'page6'];
  var KEY = 'od-sound';          // localStorage: 'off' — выключен; нет ключа — включён
  var MAX = 4;                   // одновременных голосов
  var BTN_WINDOW = 80;           // мс: событие «с кнопки», если od:button был недавно
  var BTN_DELAY = 0.16;          // с: шелест после щелчка кнопки
  var LATE = 600;                // мс: сколько ждать буфер, который ещё декодируется

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;                // создаётся только на жесте
  var buffers = {};              // имя → AudioBuffer
  var loading = false;
  var pending = [];              // [{name, vol, delay, at}] — ждут декодирования
  var voices = [];               // [{src, gain}] — звучат сейчас
  var lastBtn = -1e9;
  var lastPage = -1;

  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  // ── выключение помнится ─────────────────────────────────────
  function readPref() {
    try { return window.localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
  }
  function writePref(on) {
    try {
      if (on) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, 'off');
    } catch (e) { /* приватный режим, запрет хранилища — просто не помним */ }
  }

  // ── контекст и разблокировка ────────────────────────────────
  function unlock() {
    if (!AC || !OD.state.sound) return;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state !== 'running' && !document.hidden) {
        // iOS Safari: resume и запуск «тихого» буфера — внутри обработчика жеста
        var r = ctx.resume && ctx.resume();
        if (r && r.catch) r.catch(function () {});
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination);
        if (s.start) s.start(0); else s.noteOn(0);
      }
    } catch (e) { return; }
    load();
  }

  function onGesture(e) {
    if (e.type === 'keydown' && e.key === 'Escape') return;   // Escape браузер жестом не считает
    if (e.type === 'pointerup' && e.pointerType === 'mouse') return;
    if (ctx && ctx.state === 'running') return;
    unlock();
  }
  ['mousedown', 'keydown', 'touchend', 'pointerup', 'click'].forEach(function (t) {
    window.addEventListener(t, onGesture, { capture: true, passive: true });
  });

  // ── загрузка и декодирование (один раз, после жеста) ─────────
  function decode(data) {
    // старый Safari (webkitAudioContext) знает только колбэки
    return new Promise(function (ok, fail) {
      var p = ctx.decodeAudioData(data, ok, fail);
      if (p && p.then) p.then(ok, fail);
    });
  }
  function load() {
    if (loading || !ctx || !window.fetch) return;
    loading = true;
    NAMES.forEach(function (name) {
      fetch(DIR + name + '.m4a')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(decode)
        .then(function (buf) { buffers[name] = buf; flush(name); })
        .catch(function () { /* нет файла / кодека — молча без этого звука */ });
    });
  }
  function flush(name) {
    var t = now();
    pending = pending.filter(function (p) {
      if (p.name !== name) return t - p.at < LATE;
      if (t - p.at < LATE) play(p.name, p.vol, Math.max(0, p.delay - (t - p.at) / 1000));
      return false;
    });
  }

  // ── проигрывание ────────────────────────────────────────────
  function play(name, vol, delay) {
    if (!OD.state.sound || !ctx || document.hidden) return;
    var buf = buffers[name];
    if (!buf) { pending.push({ name: name, vol: vol, delay: delay || 0, at: now() }); return; }
    try {
      if (ctx.state !== 'running' && ctx.resume) { var r = ctx.resume(); if (r && r.catch) r.catch(function () {}); }
      while (voices.length >= MAX) stopVoice(voices[0]);
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;
      g.gain.value = vol;
      src.connect(g); g.connect(ctx.destination);
      var v = { src: src, gain: g };
      voices.push(v);
      src.onended = function () { drop(v); };
      src.start(ctx.currentTime + (delay || 0));
    } catch (e) { /* без звука, но без ошибки */ }
  }
  function drop(v) {
    var i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    try { v.gain.disconnect(); } catch (e) {}
  }
  function stopVoice(v) {
    try { v.src.onended = null; v.src.stop(0); } catch (e) {}
    drop(v);
  }
  function silence() {
    pending = [];
    while (voices.length) stopVoice(voices[0]);
  }

  var fromButton = function () { return now() - lastBtn < BTN_WINDOW; };

  // ── события ─────────────────────────────────────────────────
  OD.on('button', function (d) {
    if (d.action === 'sound') return;          // иконка звучит сама (ниже)
    lastBtn = now();
    play('btn', 0.8);
  });
  OD.on('open', function () { play('open', 0.55, fromButton() ? BTN_DELAY : 0); });
  OD.on('close', function () { play('close', 0.5, fromButton() ? BTN_DELAY : 0); });
  OD.on('go', function (d) {
    if (fromButton()) return;
    if (d.via !== 'wheel' && d.via !== 'key' && d.via !== 'swipe' && d.via !== 'drag') return;
    var j;
    do { j = Math.floor(Math.random() * 7); } while (j === lastPage);
    lastPage = j;
    play('page' + j, 0.5);
  });
  OD.on('flip', function (d) {
    if (fromButton() || d.via !== 'key') return;
    play('flip', 0.6);
  });

  // ── иконка ──────────────────────────────────────────────────
  function paintIcon(on) {
    document.querySelectorAll('[data-action="sound"]').forEach(function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-action="sound"]');
    if (!b) return;
    var on = !OD.state.sound;
    OD.set({ sound: on });
    writePref(on);
    if (on) { unlock(); play('btn', 0.4); }
  });
  OD.on('state', function (d) {
    if (!('sound' in d.patch)) return;
    var on = !!d.patch.sound;
    paintIcon(on);
    if (!on) silence();
    OD.emit('sound', { on: on });
  });

  // ── скрытая вкладка ─────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    try {
      var r;
      if (document.hidden) { silence(); r = ctx.suspend(); }
      else if (OD.state.sound) r = ctx.resume();
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  });

  // ── старт: выключенный раньше звук остаётся выключенным ─────
  if (!readPref()) OD.set({ sound: false });
  else paintIcon(true);

  OD.audio = {
    get ctx() { return ctx; },
    get buffers() { return buffers; },
    get voices() { return voices.length; },
    names: NAMES.slice()
  };
})();
