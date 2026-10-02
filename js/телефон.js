/* ============================================================
   js/телефон.js — масштаб и высота сцены на телефоне. Хозяин: «телефон».
   Пара: css/телефон.css (там же — описание режимов full / fit / tight).

   Что делает:
     · на телефоне (OD.stage.phone) масштаб --k — по ширине безопасной
       области окна, высота сцены --H = высота / --k (не больше 844);
       режим <html data-fit="full|fit|tight">; переменные --H --ct --ch --off;
       OD.stage.k — тот же масштаб (стопке: пороги свайпа в px сцены);
     · вне телефона трогает --k только при ненулевой safe-area
       (альбомная на телефоне с вырезом);
     · первый экран: если текст и фото не помещаются по высоте — фото
       меньше (--ps), знак и текст выше (--sign-dy, --text-dy);
     · описание на карточке: высота кратно 28, остаток прокручивается;
     · пустой touchstart — чтобы в iOS Safari работал :active у кнопок.

   Слушает: od:resize {k, phone}, od:rendered, od:state (index, sort).
   Шлёт:    ничего.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;

  var W = 390, H_FULL = 844, H_FIT = 775, H_MIN = 632;   // высоты сцены, px
  var TOP = { full: 80, fit: 80, tight: 64 }, GAP = 8;  // верх карточки, зазор снизу
  var CARD = 756, EDGE = 40;                           // карточка; видно у закрытой стопки
  var STEP = 28;
  var VARS = ['--H', '--ct', '--ch', '--off', '--ps', '--sign-dy', '--text-dy'];

  var root = document.documentElement, probe = null;
  var fit = { mode: null, H: H_FULL, ch: CARD };

  function px(v) { return (Math.round(v * 100) / 100) + 'px'; }
  function set(name, v) { root.style.setProperty(name, v); }

  // safe-area: env() читается только через стили — пробный элемент
  function safe() {
    if (!probe) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(probe);
    }
    var s = getComputedStyle(probe);
    return { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0,
             b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
  }

  function onResize(d) {
    var s = safe();
    var w = window.innerWidth - s.l - s.r, h = window.innerHeight - s.t - s.b;

    if (!d.phone) {                       // десктопная раскладка (и альбомная)
      VARS.forEach(function (v) { root.style.removeProperty(v); });
      root.removeAttribute('data-fit');
      if (fit.mode) unfit();
      fit.mode = null;
      if (s.t || s.r || s.b || s.l) {
        var kd = Math.min(w / 1440, h / 900);
        set('--k', kd.toFixed(4));
        OD.stage.k = kd;
      }
      return;
    }

    var k = w / W, H = h / k, mode;
    if (H >= H_FULL) { k = Math.min(k, h / H_FULL); H = H_FULL; mode = 'full'; }
    else if (H >= H_FIT) mode = 'fit';
    else {
      mode = 'tight';
      if (H < H_MIN) { k = h / H_MIN; H = H_MIN; }
    }
    H = Math.floor(H);                    // сцена × k не выше окна
    var ct = TOP[mode], ch = Math.min(CARD, H - ct - GAP);

    set('--k', k.toFixed(4));
    set('--H', H + 'px');
    set('--ct', ct + 'px');
    set('--ch', ch + 'px');
    set('--off', (EDGE - ct - ch) + 'px');
    root.setAttribute('data-fit', mode);
    OD.stage.k = k;
    fit.mode = mode; fit.H = H; fit.ch = ch;

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
