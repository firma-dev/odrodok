/* ============================================================
   js/переворот.js — «Смотреть» и «Кадры». Хозяин: исполнитель «переворот».
   Пара: css/переворот.css. Модель и шина — js/данные.js (window.OD).

   Что делает (только для передней карточки: .c[data-depth="0"]):
     · [data-action="watch"] и пробел: обложка переворачивается, на обороте
       [data-role="player"] плеер по ссылке .c[data-link]. Kinescope, Vimeo,
       YouTube — iframe; создаётся, когда переворот закончился, и убирается
       сразу по «■ Стоп» (звук обрывается, оборот уходит с афишей). Ссылки
       нет или она не из этих трёх — заглушка с холста «[здесь идёт фильм]»;
     · [data-action="frames"]: переворот всей карточки, на обороте кадры;
       [data-action="to-front"] и Esc — обратно. Плеер остаётся на обложке;
     · кадры: [data-action="shot-prev"|"shot-next"] (по кругу, как на холсте),
       [data-action="shot"][data-n], стрелки, колесо и свайп внутри оборота;
       счётчик [data-role="counter"] «01 / 06», --shot на .c двигает ленту;
     · OD.set({flip: null|'cover'|'card'}) — пока не null, стопка не листает;
     · пока идёт переворот (≈ 1 с), новые нажатия по этой карточке не берутся;
     · при od:go / od:sort / od:close / od:rendered — всё сразу к обложке.
     · prefers-reduced-motion — без хода, сразу.

   Клавиши ловит на window в фазе захвата и при открытом плеере или кадрах
   гасит дальше (Esc не закрывает стопку, стрелки не листают).

   Слушает: od:go, od:sort, od:close, od:rendered.
   Шлёт:    od:flip {target:'cover'|'card', on, via:'button'|'key'},
            od:shot {index, via:'button'|'thumb'|'key'|'wheel'|'swipe'}.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;

  var T_COVER = 900, T_CARD = 1000;            // --t-cover, --t-flip
  var WHEEL_GAP = 600;                         // --t-strip: одно колесо — один кадр
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var cur = null;          // {el, playing, frames, shot, busy, timer}
  var lastWheel = 0;

  function $(el, role) { return el.querySelector('[data-role="' + role + '"]'); }
  function pad(x) { return String(x).padStart(2, '0'); }
  function front() { return document.querySelector('#stack-seat .c[data-depth="0"]'); }

  // состояние передней; чужая карточка — сначала сбросить прежнюю
  function at(el) {
    if (!cur || cur.el !== el) { reset(); cur = { el: el, playing: false, frames: false, shot: 0, busy: false, timer: 0 }; }
    return cur;
  }

  function publish() {
    OD.set({ flip: !cur ? null : cur.frames ? 'card' : cur.playing ? 'cover' : null });
  }

  // ход: класс хода и класс стороны ставятся вместе, до любых событий —
  // если между ними кто-то спросит раскладку, visibility переключится
  // сразу, а не на середине хода. Конец — по часам (--t-cover / --t-flip).
  function turn(c, cls, side, on, ms, done) {
    var el = c.el;
    clearTimeout(c.timer);
    if (!reduce.matches) { el.classList.add(cls); c.busy = true; }
    el.classList.toggle(side, on);
    if (reduce.matches) { if (done) done(); return; }
    c.timer = setTimeout(function () {
      el.classList.remove(cls);
      c.busy = false;
      if (done) done();
    }, ms + 40);
  }

  // ── «Смотреть» ────────────────────────────────────────────
  function watch(el, via) {
    var c = at(el);
    if (c.busy || c.frames) return;
    player(c);
    c.playing = !c.playing;
    if (!c.playing) unmount(c);
    turn(c, 'is-cover-anim', 'is-playing', c.playing, T_COVER, function () { if (c.playing && cur === c) mount(c); });
    publish();
    OD.emit('flip', { target: 'cover', on: c.playing, via: via });
  }

  // оборот обложки: афиша; без ссылки — заглушка с холста
  function player(c) {
    var box = $(c.el, 'player');
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    var cover = $(c.el, 'cover');
    if (cover && !cover.hidden && cover.getAttribute('src')) {
      var im = document.createElement('img');
      im.className = 'player-poster'; im.alt = ''; im.decoding = 'async';
      im.src = cover.currentSrc || cover.src;
      im.addEventListener('error', function () { im.remove(); }, { once: true });
      box.append(im);
    }
    if (!embed(c.el.dataset.link)) {
      var w = work(c.el);
      var note = document.createElement('span');
      note.className = 'player-note'; note.textContent = '[здесь идёт фильм]';
      var bar = document.createElement('div'); bar.className = 'player-bar';
      var t0 = document.createElement('span'); t0.textContent = '00:00';
      var track = document.createElement('span'); track.className = 'player-track';
      var fill = document.createElement('span'); fill.className = 'player-fill';
      var t1 = document.createElement('span'); t1.textContent = OD.show(w && w.duration, OD.PH.duration);
      track.append(fill); bar.append(t0, track, t1);
      box.append(note, bar);
    }
    var light = document.createElement('span'); light.className = 'light';
    box.append(light);
  }

  function mount(c) {
    var src = embed(c.el.dataset.link), box = $(c.el, 'player');
    if (!src || !box || box.querySelector('iframe')) return;
    var w = work(c.el);
    var f = document.createElement('iframe');
    f.className = 'player-frame';
    f.src = src;
    f.title = 'Фильм' + (w && w.title ? ' «' + w.title + '»' : '');
    f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.insertBefore(f, box.querySelector('.light'));
  }

  function unmount(c) {
    var box = c && $(c.el, 'player'), f = box && box.querySelector('iframe');
    if (f) { f.src = 'about:blank'; f.remove(); }
  }

  // ссылка работы → адрес встраивания; не узнали — null (будет заглушка)
  function embed(link) {
    if (!link) return null;
    var u;
    try { u = new URL(link); } catch (e) { return null; }
    var h = u.hostname.replace(/^www\./, ''), p = u.pathname.split('/').filter(Boolean), id;
    if (/(^|\.)kinescope\.io$/.test(h)) {
      id = p[0] === 'embed' ? p[1] : p[0];
      return id && /^[\w-]+$/.test(id) ? 'https://kinescope.io/embed/' + id + '?autoplay=1' : null;
    }
    if (h === 'vimeo.com' || h === 'player.vimeo.com') {
      var i = p[0] === 'video' ? 1 : 0, hash = p[i + 1] || u.searchParams.get('h');
      id = p[i];
      if (!/^\d+$/.test(id || '')) return null;
      return 'https://player.vimeo.com/video/' + id + '?autoplay=1' + (hash && /^\w+$/.test(hash) ? '&h=' + hash : '');
    }
    if (h === 'youtu.be') id = p[0];
    else if (/^(m\.)?youtube(-nocookie)?\.com$/.test(h)) {
      id = u.searchParams.get('v') || (/^(embed|shorts|live)$/.test(p[0]) ? p[1] : null);
    }
    if (id && /^[\w-]{6,}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
    return null;
  }

  function work(el) {
    for (var i = 0; i < OD.works.length; i++) if (OD.works[i].slug === el.dataset.slug) return OD.works[i];
    return null;
  }

  // ── «Кадры» ───────────────────────────────────────────────
  function frames(el, on, via) {
    var c = at(el);
    if (c.busy || c.frames === on) return;
    c.frames = on;
    if (on) { warm(el); shot(c, c.shot, null); }  // рамка и подпись на месте
    turn(c, 'is-card-anim', 'is-frames', on, T_CARD);
    publish();
    OD.emit('flip', { target: 'card', on: on, via: via });
  }

  // кадры раскодировать, пока идёт первая половина хода: иначе первое
  // открытие оборота платит за раскодирование на середине (WebKit: кадр ~80 мс)
  function warm(el) {
    if (el.dataset.warm) return;
    el.dataset.warm = '1';
    el.querySelectorAll('[data-role="back"] img').forEach(function (im) {
      if (im.hidden) return;
      if (!im.getAttribute('src') && im.dataset.src) im.src = im.dataset.src;   // данные.js: кадры ждут оборота
      if (im.decode) im.decode().catch(function () {});
    });
  }

  function count(c) { return c.el.querySelectorAll('[data-role="strip"] .shot').length || 1; }

  function shot(c, k, via) {
    var n = count(c);
    k = Math.max(0, Math.min(n - 1, k));
    var moved = k !== c.shot;
    c.shot = k;
    c.el.style.setProperty('--shot', String(k));
    var counter = $(c.el, 'counter');
    if (counter) counter.textContent = pad(k + 1) + ' / ' + pad(n);
    c.el.querySelectorAll('[data-role="thumbs"] .thumb').forEach(function (b, j) {
      b.classList.toggle('is-on', j === k);
      if (j === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (via && moved) OD.emit('shot', { index: k, via: via });
  }

  function step(c, d, via, wrap) {
    var n = count(c), k = c.shot + d;
    if (wrap) k = (k + n) % n;
    shot(c, k, via);
  }

  // ── сброс: всё сразу к обложке ────────────────────────────
  function reset() {
    if (!cur) return;
    var c = cur, el = c.el;
    cur = null;
    clearTimeout(c.timer);
    unmount(c);
    el.classList.remove('is-playing', 'is-frames', 'is-cover-anim', 'is-card-anim');
    el.style.removeProperty('--shot');
    var counter = $(el, 'counter');
    if (counter) counter.textContent = '01 / ' + pad(count(c));
    el.querySelectorAll('[data-role="thumbs"] .thumb.is-on').forEach(function (b) {
      b.classList.remove('is-on'); b.removeAttribute('aria-current');
    });
    if (OD.state.flip) OD.set({ flip: null });
  }

  // ── ввод ──────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-action]');
    if (!b) return;
    var el = b.closest('.c');
    if (!el || el.dataset.depth !== '0') return;
    var a = b.dataset.action;
    if (a === 'watch') watch(el, 'button');
    else if (a === 'frames') frames(el, true, 'button');
    else if (a === 'to-front') frames(el, false, 'button');
    else if (cur && cur.el === el && cur.frames) {
      if (a === 'shot-prev') step(cur, -1, 'button', true);
      else if (a === 'shot-next') step(cur, 1, 'button', true);
      else if (a === 'shot') shot(cur, (parseInt(b.dataset.n, 10) || 1) - 1, 'thumb');
    }
  });

  window.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key, t = e.target;
    var typing = t && t.closest && t.closest('input,textarea,select,[contenteditable]');
    if (typing) return;
    var c = cur && cur.el.dataset.depth === '0' ? cur : null;

    if (k === ' ' || k === 'Spacebar') {
      if (!OD.state.open || (t && t.closest && t.closest('button'))) return;  // кнопка нажмётся сама
      var el = front();
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) watch(el, 'key');
      return;
    }
    if (!c || !(c.frames || c.playing)) return;

    if (k === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (c.frames) frames(c.el, false, 'key'); else watch(c.el, 'key');
    } else if (/^Arrow(Up|Down|Left|Right)$/.test(k)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (c.frames && !c.busy) step(c, /Down|Right/.test(k) ? 1 : -1, 'key', true);
    }
  }, true);

  // колесо внутри кадров: по одному кадру, без круга
  document.addEventListener('wheel', function (e) {
    if (!cur || !cur.frames || cur.busy || Math.abs(e.deltaY) < 6) return;
    var now = Date.now();
    if (now - lastWheel < WHEEL_GAP) return;
    lastWheel = now;
    step(cur, e.deltaY > 0 ? 1 : -1, 'wheel', false);
  }, { passive: true });

  // свайп по окну кадров (телефон — вбок, стол — вверх-вниз)
  var sw = null;
  document.addEventListener('pointerdown', function (e) {
    var win = e.target.closest && e.target.closest('.shots-window');
    sw = win && cur && cur.frames && win.closest('.c') === cur.el ? { x: e.clientX, y: e.clientY } : null;
  });
  document.addEventListener('pointerup', function (e) {
    if (!sw || !cur || !cur.frames) { sw = null; return; }
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y, d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    sw = null;
    if (Math.abs(d) > 50) step(cur, d < 0 ? 1 : -1, 'swipe', true);
  });

  OD.on('go', reset);
  OD.on('sort', reset);
  OD.on('close', reset);
  OD.on('rendered', function () { cur = null; if (OD.state.flip) OD.set({ flip: null }); });
})();
