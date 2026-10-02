/* ============================================================
   js/telefon.js — раскладка телефона по высоте. Хозяин: «телефон».
   Пара: css/telefon.css (там же — описание режимов full / fit / tight).
   Масштаб, высоту сцены и режим считает js/dannye.js (fit): --k --H
   --ct --ch --off, <html data-fit>, OD.stage {k, phone, H, fit, ct, ch}.

   Что делает:
     · первый экран: если текст и фото не помещаются по высоте — фото
       меньше (--ps), знак и текст выше (--sign-dy, --text-dy);
     · описание на карточке: высота кратно 28, остаток прокручивается;
       не влезает — пометка в строку номера листа (.c[data-mark="low"]);
     · пустой touchstart — чтобы в iOS Safari работал :active у кнопок.

   Слушает: od:resize {k, phone}, od:rendered, od:state (index, open).
   Шлёт:    ничего.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;

  var STEP = 28;
  var VARS = ['--ps', '--sign-dy', '--text-dy'];
  var root = document.documentElement;
  var fit = { mode: null, H: 844, ch: 756 };

  function px(v) { return (Math.round(v * 100) / 100) + 'px'; }
  function set(name, v) { root.style.setProperty(name, v); }

  function onResize(d) {
    if (!d.phone || !OD.stage.fit) {      // десктопная раскладка (и альбомная)
      VARS.forEach(function (v) { root.style.removeProperty(v); });
      if (fit.mode) unfit();
      fit.mode = null;
      return;
    }
    fit.mode = OD.stage.fit; fit.H = OD.stage.H; fit.ch = OD.stage.ch;
    intro();
    cards(true);
  }

  // ── первый экран ───────────────────────────────────────────
  // холст: фото 220×256 в y 112, знак 28 в y 388, текст в y 436, просветы 20
  function intro() {
    var text = document.querySelector('.intro-text');
    if (!text || !fit.mode) return;
    var top = 112, ph = 256, sign = 28, g = 20;
    var th = text.offsetHeight, avail = fit.H - 16 - top, s = 1;
    if (ph + 2 * g + sign + th > avail) {
      g = 12;
      s = Math.max(0.5, Math.min(1, (avail - 2 * g - sign - th) / ph));
    }
    var signTop = top + ph * s + g, textTop = signTop + sign + g;
    set('--ps', s.toFixed(3));
    set('--sign-dy', px(signTop - 388));
    set('--text-dy', px(textTop - 436));
  }

  // ── описание: высота кратно строке ─────────────────────────
  // у скрытых (display:none) карточек меряем позже, когда войдут в окно
  function cards(all) {
    if (!fit.mode) return;
    var key = fit.mode + ':' + fit.ch, tight = fit.mode === 'tight';
    var list = document.querySelectorAll('#stack-seat > .c');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!all && el.dataset.fitKey === key) continue;
      var face = el.querySelector('.face.front'), fields = el.querySelector('[data-role="fields"]'),
          desc = el.querySelector('[data-role="desc"]');
      if (!face || !fields || !desc || !face.offsetHeight) continue;
      // пометка под описанием (холст); не влезает описание — пометка уходит
      // в строку номера листа, описанию остаётся больше строк
      var bottom = fields.offsetTop + fields.offsetHeight + (tight ? 0 : STEP);
      var room = fit.ch - 56 - bottom;
      desc.style.maxHeight = 'none';
      var low = tight || desc.scrollHeight > room - 43;   // 43 — пометка с отступом
      if (low) el.dataset.mark = 'low'; else delete el.dataset.mark;
      var lines = Math.max(1, Math.floor((low ? room : room - 43) / STEP));
      desc.style.maxHeight = (lines * STEP) + 'px';
      el.dataset.fitKey = key;
    }
  }

  // ушли с телефонной раскладки — снять своё с карточек
  function unfit() {
    document.querySelectorAll('#stack-seat > .c').forEach(function (el) {
      var desc = el.querySelector('[data-role="desc"]');
      if (desc) desc.style.maxHeight = '';
      delete el.dataset.mark; delete el.dataset.fitKey;
    });
  }

  OD.on('resize', onResize);
  OD.on('rendered', function () { cards(true); });
  OD.on('state', function (d) {
    if (d.patch && ('index' in d.patch || 'open' in d.patch)) cards(false);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { intro(); cards(true); });
  }
  // iOS Safari включает :active только при обработчике касания
  document.addEventListener('touchstart', function () {}, { passive: true });
})();
