/* ============================================================
   js/стопка.js — стопка картотеки. Хозяин: исполнитель «стопка».
   Пара: css/стопка.css. Модель и шина — js/данные.js (window.OD).

   Что делает:
     · открытие/закрытие: клик «↓ потяните» [data-action="open"], колесо
       вниз, свайп вниз, стрелки ↓/→, тянуть рукой «потяните» или кромку
       стопки (отпустил при p > .25 — открылась); «✕ Закрыть»
       [data-action="close"], Esc, колесо/стрелка вверх и свайп вверх на
       первой карточке. OD.set({open, opened}); позиция в стопке
       сохраняется, повторное открытие — без каскада ярлыков;
     · листание: колесо, стрелки, свайп (> 50 px), рука (> 150 px), клик
       по ярлыку [data-action="pick"] — сразу к карточке; OD.set({index});
       один жест — одна карточка: хвост инерции тачпада не листает
       второй раз; жест во время перехода запоминается (один, последний)
       и выполняется после;
     · пока OD.state.flip (плеер или кадры) — листание стоит;
     · глубины: data-depth = i − index, --d = 0…9, классы окна
       (.is-near ±2, .is-deep, .is-far ≥ 9, .is-off), ушедшие — .is-gone;
     · сортировка [data-action="sort"][data-sort]: стопка гаснет .25 с,
       OD.set({sort, index:0}), OD.render(), проявляется на первой;
     · адрес /<slug>: прямой заход — сразу открытая стопка на карточке;
       открытие — pushState, листание — replaceState, закрытие — pushState
       корня; «назад/вперёд» браузера (popstate) — via 'url'.
       На хостинге нужен .htaccess (неизвестный путь → index.html).
     · картинки: decode() обложек окна до показа.

   Слушает: od:rendered.
   Шлёт:    od:open {first, via}, od:close {via}, od:arrived,
            od:go {from, to, via:'wheel'|'key'|'swipe'|'drag'|'tab'|'url'},
            od:sort {order}.
   via открытия/закрытия: 'button'|'wheel'|'key'|'swipe'|'drag'|'url'.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;

  // корень сайта — папка выше js/ (адреса карточек: <корень><slug>)
  var BASE = (function () {
    try { return new URL('..', document.currentScript.src).pathname; } catch (e) { return '/'; }
  })();

  var T = { stack: 1300, seat: 220, fall: 720, back: 900, first: 2500, fade: 250, gap: 800, decode: 200 };
  var SHOW = 9;          // видны передняя + 8
  var WIN = 2;           // окно слоёв ±2
  var OFF = { desk: -797, phone: -796 };   // сдвиг закрытой стопки (база.css)
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function ms(x) { return reduce.matches ? 0 : x; }

  var body, stack, seat;
  var cards = [];
  var busy = false, timer = 0, queue = null;
  var firstTimer = 0, seatTimer = 0;
  var booted = false, sorting = false;
  var drag = null, raf = 0, eatClick = false;

  // ── раскладка ─────────────────────────────────────────────
  function tog(el, c, on) { el.classList.toggle(c, !!on); }

  function layout() {
    var a = OD.state.index;
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i], d = i - a;
      el.dataset.depth = d;
      el.style.setProperty('--d', String(Math.max(0, Math.min(d, 9))));
      tog(el, 'is-gone', d < 0);
      tog(el, 'is-near', d >= -WIN && d <= WIN);
      tog(el, 'is-deep', d > WIN);
      tog(el, 'is-far', d >= SHOW);
      tog(el, 'is-off', d < -WIN || d > SHOW);
      el.inert = d < 0 || d >= SHOW;
    }
    prefetch();
  }

  // снять промежуточные классы движения (после перехода)
  function settle() {
    cards.forEach(function (el) {
      el.classList.remove('is-falling', 'is-rising', 'is-held', 'is-drag');
      el.style.transform = '';
    });
    layout();
  }

  // сразу на месте, без переходов (перекладка, переход по адресу закрытой)
  function instant(fn, onBody) {
    var host = onBody ? body : stack;
    host.classList.add('is-instant');
    fn();
    void stack.offsetWidth;          // применить без переходов
    host.classList.remove('is-instant');
  }

  // ── картинки: decode до показа ────────────────────────────
  function decode(el) {
    if (!el) return Promise.resolve();
    if (el._dec) return el._dec;
    var im = el.querySelector('img.cover');
    if (!im || im.hidden || !im.getAttribute('src') || !im.decode) return (el._dec = Promise.resolve());
    el._dec = im.decode().catch(function () {});
    return el._dec;
  }
  function prefetch() {
    var a = OD.state.index;
    for (var d = -1; d <= 3; d++) if (cards[a + d]) decode(cards[a + d]);
  }

  // ── занятость и очередь ───────────────────────────────────
  // один переход за раз; жест во время перехода — запомнить один (последний)
  function hold(dur, then) {
    busy = true;
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0; busy = false;
      if (then) then();
      var q = queue; queue = null;
      if (q) q();
    }, ms(dur));
  }

  function blocked() {
    return !!OD.state.flip || !!document.querySelector('.c.is-playing, .c.is-frames');
  }

  // ── адрес ─────────────────────────────────────────────────
  function slugFromPath() {
    var p;
    try { p = decodeURIComponent(location.pathname); } catch (e) { p = location.pathname; }
    if (p.indexOf(BASE) !== 0) return '';
    p = p.slice(BASE.length).replace(/\/+$/, '');
    return p === 'index.html' ? '' : p;
  }
  function setUrl(slug, push) {
    var path = BASE + (slug ? encodeURIComponent(slug) : '');
    if (location.pathname === path) return;
    try { history[push ? 'pushState' : 'replaceState']({ od: slug || '' }, '', path + location.search); } catch (e) {}
  }
  function curSlug() { var el = cards[OD.state.index]; return el ? el.dataset.slug : ''; }

  // ── открыть / закрыть ─────────────────────────────────────
  function open(via) {
    if (OD.state.open || !cards.length) return;
    var first = !OD.state.opened;
    clearTimeout(firstTimer); clearTimeout(seatTimer);
    queue = null;
    if (first) body.classList.add('is-first');
    body.classList.add('is-moving');
    prefetch();
    OD.set({ open: true, opened: true });
    if (via !== 'url') setUrl(curSlug(), true);
    OD.emit('open', { first: first, via: via });
    hold(T.stack, function () {
      body.classList.remove('is-moving');
      body.classList.add('is-arrived');
      if (first && !reduce.matches) {
        seat.classList.add('is-seat');
        seatTimer = setTimeout(function () { seat.classList.remove('is-seat'); }, T.seat + 30);
      }
      OD.emit('arrived');
    });
    if (first) firstTimer = setTimeout(function () { body.classList.remove('is-first'); }, ms(T.first));
  }

  function close(via) {
    if (!OD.state.open) return;
    clearTimeout(firstTimer); clearTimeout(seatTimer);
    queue = null;
    seat.classList.remove('is-seat');
    body.classList.remove('is-arrived', 'is-first');
    body.classList.add('is-moving');
    OD.set({ open: false });
    if (via !== 'url') setUrl('', true);
    OD.emit('close', { via: via });
    hold(T.stack, function () { body.classList.remove('is-moving'); settle(); });
  }

  // ── листание ──────────────────────────────────────────────
  // dir: +1 — передняя уходит вниз, −1 — возвращается предыдущая
  function step(dir, via) {
    if (drag || sorting) return;
    if (busy) { queue = function () { step(dir, via); }; return; }
    if (blocked()) return;
    if (!OD.state.open) { if (dir > 0) open(via); return; }
    var a = OD.state.index;
    if (dir < 0 && a === 0) { close(via); return; }
    go(a + dir, via);
  }

  function go(to, via) {
    var n = cards.length, from = OD.state.index;
    if (!OD.state.open || sorting || to < 0 || to >= n || to === from) return;
    if (busy) { queue = function () { go(to, via); }; return; }
    if (blocked()) return;
    var far = Math.abs(to - from) > 1;
    if (far && via !== 'drag') {
      // прыжок по ярлыку: дождаться обложки (не дольше 200 мс)
      busy = true;
      var wait = new Promise(function (r) { setTimeout(r, T.decode); });
      Promise.race([decode(cards[to]), wait]).then(function () { busy = false; run(to, via); });
      return;
    }
    run(to, via);
  }

  function run(to, via) {
    var from = OD.state.index;
    if (to === from || !OD.state.open || blocked()) { var q = queue; queue = null; if (q) q(); return; }
    var fwd = to > from;
    var mover = fwd ? cards[from] : cards[to];
    var i;
    // ушедшая далеко (display:none) — сначала поставить внизу, потом поднимать
    if (mover.classList.contains('is-off')) { mover.classList.remove('is-off'); void mover.offsetWidth; }
    mover.classList.add(fwd ? 'is-falling' : 'is-rising');
    // промежуточные при прыжке назад: на месте, без лица, пока поднимается целевая
    if (!fwd) for (i = to + 1; i < from; i++) cards[i].classList.add('is-held');
    // рука отпустила: переход начнётся с того места, где карточку бросили
    cards.forEach(function (el) {
      if (el.classList.contains('is-drag')) { el.classList.remove('is-drag'); el.style.transform = ''; }
    });
    OD.set({ index: to });
    layout();
    setUrl(curSlug(), false);
    OD.emit('go', { from: from, to: to, via: via });
    hold(Math.max(fwd ? T.fall : T.back, T.gap), settle);
  }

  // ── сортировка ────────────────────────────────────────────
  function sort(order) {
    if ((order !== 'new' && order !== 'old') || order === OD.state.sort || sorting) return;
    sorting = true; queue = null;
    OD.set({ sort: order });           // каретка переключателя едет сразу
    pressed();
    stack.classList.add('is-fading');
    clearTimeout(timer); busy = true;
    setTimeout(function () {
      OD.set({ index: 0 });
      OD.render();                     // → od:rendered → раскладка без переходов
      if (OD.state.open) setUrl(curSlug(), false);
      stack.classList.remove('is-fading');
      sorting = false; busy = false;
      OD.emit('sort', { order: order });
    }, ms(T.fade));
  }
  function pressed() {
    document.querySelectorAll('[data-action="sort"][data-sort]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.sort === OD.state.sort ? 'true' : 'false');
    });
  }

  // ── колесо: один жест — одна карточка ─────────────────────
  // Жест — серия событий без пауз > 180 мс в одну сторону. Хвост инерции
  // тачпада гаснет монотонно; новый толчок поверх хвоста узнаём по резкому
  // росту дельты после спада.
  var wg = { t: -1e9, sign: 0, last: 0, peak: 0, fired: false };
  function onWheel(e) {
    if (e.ctrlKey) return;                       // щипок — масштаб браузера
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);
    var a = Math.abs(dy), s = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    if (!s) return;
    var now = e.timeStamp || performance.now();
    var fresh = now - wg.t > 180 || s !== wg.sign ||
      (a >= 20 && a > wg.last * 2 && wg.last < wg.peak * 0.5);
    wg.t = now;
    if (fresh) { wg.sign = s; wg.peak = a; wg.fired = false; }
    else if (a > wg.peak) wg.peak = a;
    wg.last = a;
    if (wg.fired || a < 6) return;
    wg.fired = true;
    if (blocked()) return;
    step(s, 'wheel');
  }

  // ── клавиатура ────────────────────────────────────────────
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var k = e.key, dir = 0;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') dir = 1;
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') dir = -1;
    else if (k === 'Escape') {
      if (OD.state.open && !blocked()) { e.preventDefault(); close('key'); }
      return;
    } else return;
    if (blocked()) return;                       // стрелки забирает переворот
    e.preventDefault();
    if (e.repeat) return;                        // зажатая клавиша — один жест
    step(dir, 'key');
  }

  // ── указатель: рука (мышь) и свайп (палец) ────────────────
  function scrollable(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var o = getComputedStyle(el).overflowY;
        if (o === 'auto' || o === 'scroll') return true;
      }
    }
    return false;
  }

  function onDown(e) {
    if (drag || !e.isPrimary || e.button !== 0 || sorting) return;
    var t = e.target;
    if (!t.closest) return;
    var onPull = t.closest('.pull'), onStack = t.closest('#stack');
    if (!onPull && t.closest('button, a, input, textarea, select, iframe, video, [data-role="player"]')) return;
    if (t.closest('.panel, .rail')) return;
    var mouse = e.pointerType === 'mouse', mode = null;
    if (!OD.state.open) {
      if (mouse) { if (onPull || onStack) mode = 'pull'; }
      else mode = 'swipe';
    } else {
      if (busy || blocked()) return;
      if (!mouse) { if (!scrollable(t)) mode = 'swipe'; }
      else if (onStack && t.closest('.c') === cards[OD.state.index]) mode = 'card';
    }
    if (!mode) return;
    drag = { mode: mode, id: e.pointerId, x0: e.clientX, y0: e.clientY, dy: 0, eff: 0, p: 0, moved: false, el: t };
    if (mode !== 'swipe') { try { t.setPointerCapture(e.pointerId); } catch (er) {} }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var k = OD.stage.k || 1;
    var dy = (e.clientY - drag.y0) / k;
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true;
      if (drag.mode === 'pull') { stack.classList.add('is-drag'); body.classList.add('is-moving'); }
      if (drag.mode === 'card') cards[OD.state.index].classList.add('is-drag');
    }
    drag.dy = dy;
    if (drag.mode !== 'swipe' && !raf) raf = requestAnimationFrame(paint);
  }

  function paint() {
    raf = 0;
    if (!drag) return;
    if (drag.mode === 'pull') {
      var off = OD.stage.phone ? OFF.phone : OFF.desk;
      drag.p = Math.max(0, Math.min(1, drag.dy / 520));
      stack.style.transform = 'translate3d(0,' + (off * (1 - drag.p)).toFixed(1) + 'px,0)';
      return;
    }
    // передняя идёт вниз с наклоном; вверх — поднимается пролистанная
    var a = OD.state.index, n = cards.length, front = cards[a], prev = cards[a - 1];
    var dy = drag.dy;
    if (dy > 0 && a === n - 1) dy *= 0.25;
    if (dy < 0 && a === 0) dy *= 0.15;
    dy *= 0.92;
    drag.eff = dy;
    if (dy >= 0 || !prev) {
      front.style.transform = 'translate3d(0,' + dy.toFixed(1) + 'px,0) rotateX(' + (-Math.min(Math.max(dy, 0) / 50, 10)).toFixed(2) + 'deg)';
      if (prev && prev.classList.contains('is-drag')) { prev.classList.remove('is-drag'); prev.style.transform = ''; }
    } else {
      front.style.transform = '';
      prev.classList.add('is-drag');
      prev.style.transform = 'translate3d(0,' + (1080 + dy).toFixed(1) + 'px,0) rotateX(' + (-14 * Math.max(0, (1080 + dy) / 1080)).toFixed(2) + 'deg)';
    }
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag, cancel = e.type === 'pointercancel';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (d.moved && d.mode !== 'swipe') paint();
    drag = null;
    if (d.moved) { eatClick = true; setTimeout(function () { eatClick = false; }, 0); }

    if (d.mode === 'pull') {
      var p = d.p;
      stack.classList.remove('is-drag');
      stack.style.transform = '';
      if (!d.moved) { if (!d.el.closest('.pull')) open('drag'); return; }   // клик по кромке
      body.classList.remove('is-moving');
      if (!cancel && p > 0.25) open('drag');
      return;
    }
    if (d.mode === 'swipe') {
      if (cancel || Math.abs(d.dy * (OD.stage.k || 1)) <= 50) return;
      if (!OD.state.open) { if (d.dy > 0) open('swipe'); return; }
      step(d.dy > 0 ? 1 : -1, 'swipe');
      return;
    }
    // рука на передней карточке
    if (!d.moved) return;
    var a = OD.state.index, n = cards.length, dy = d.eff;
    if (!cancel && dy > 150 && a < n - 1) { go(a + 1, 'drag'); return; }
    if (!cancel && dy < -150 && a > 0) { go(a - 1, 'drag'); return; }
    // не дотянул — на место
    var front = cards[a], prev = cards[a - 1];
    front.classList.add('is-rising');
    if (prev && prev.classList.contains('is-drag')) prev.classList.add('is-falling');
    cards.forEach(function (el) { el.classList.remove('is-drag'); el.style.transform = ''; });
    hold(T.back, settle);
  }

  // ── клики ─────────────────────────────────────────────────
  function onClick(e) {
    var b = e.target.closest && e.target.closest('[data-action]');
    if (!b) return;
    var act = b.dataset.action;
    if (act === 'open') { if (!eatClick) open('button'); }
    else if (act === 'close') close('button');
    else if (act === 'sort') sort(b.dataset.sort);
    else if (act === 'pick') {
      var i = cards.indexOf(b.closest('.c'));
      if (i >= 0) go(i, 'tab');
    }
  }

  // ── адрес: назад/вперёд браузера ──────────────────────────
  function onPop() {
    var slug = slugFromPath();
    if (!slug) { close('url'); return; }
    var r = OD.bySlug(slug);
    if (!r) return;
    if (!OD.state.open) {
      if (r.index !== OD.state.index) instant(function () { OD.set({ index: r.index }); settle(); });
      open('url');
    } else if (r.index !== OD.state.index) go(r.index, 'url');
  }

  // прямой заход на /<slug>: стопка сразу открыта на этой карточке
  function fromUrl() {
    var slug = slugFromPath();
    if (!slug) return;
    var r = OD.bySlug(slug);
    if (!r) { setUrl('', false); return; }
    instant(function () {
      OD.set({ index: r.index, open: true, opened: true });
      body.classList.add('is-arrived');
      settle();
    }, true);
    OD.emit('open', { first: true, via: 'url' });
    OD.emit('arrived');
  }

  // ── карточки положены (первый раз и после сортировки) ─────
  OD.on('rendered', function () {
    cards = Array.prototype.slice.call(seat.children);
    var a = Math.max(0, Math.min(OD.state.index, cards.length - 1));
    if (a !== OD.state.index) OD.set({ index: a });
    instant(settle);
    if (!booted) { booted = true; pressed(); fromUrl(); }
  });

  function start() {
    body = document.body;
    stack = document.getElementById('stack');
    seat = document.getElementById('stack-seat');
    if (!stack || !seat) return;
    window.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('click', onClick);
    document.addEventListener('dragstart', function (e) {
      if (e.target.closest && e.target.closest('#stack, .pull')) e.preventDefault();
    });
    window.addEventListener('popstate', onPop);
  }

  // defer: DOM уже разобран; od:rendered придёт позже (после fetch)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
