/* ============================================================
   js/данные.js — общая модель картотеки. Хозяин: каркас.
   Подключается первым (defer). Остальные части только читают OD
   и подписываются на события; данные.js никого не двигает.

   Что делает:
     1. грузит data/работы.json → OD.works (порядок описи, order ↑);
     2. держит состояние OD.state и отражает его в атрибутах <body>;
     3. событийная шина: OD.on / OD.emit (CustomEvent "od:<имя>" на document);
     4. собирает карточку из <template id="tpl-card"> — OD.card();
     5. кладёт карточки в #stack-seat в текущем порядке — OD.render();
     6. служебное: масштаб сцены (--k), часы на поле, запасные картинки,
        событие "button" на любое нажатие кнопки (для звука).

   Шлёт:   data, rendered, state, resize, button
   Слушает: ничего (стопка и остальные вызывают OD.set / OD.render сами).

   Правило: в коде — латиница (имена, классы, события, data-*),
   тексты для людей — кириллица.
   ============================================================ */
(function () {
  'use strict';

  var PH = {                     // заглушки пустых полей — тексты с холста
    type: '[тип]', duration: '[хрон.]', status: '[статус]', added: '[дата]',
    desc: '[Описание фильма в две-три строки: о чём он и почему попал в картотеку.]',
    mark: '[статус]',
    cover: function (no) { return '[обложка ' + no + ' — нужен файл]'; },
    shot: function (n) { return '[кадр ' + n + ' — нужен файл]'; },
    field: function (label) { return '[' + label + ']'; }
  };
  // поля в правой колонке: ключ описи → подпись по умолчанию
  // (у отдельных карточек подписи свои — work.labels, взято с холста)
  var FIELDS = [['people', 'герои'], ['place', 'место'], ['dates', 'даты'], ['authors', 'вместе с']];
  // следы времени: 8 наборов по два, карточка i получает набор i % 8
  // (координаты — в css/база.css по [data-w="набор-номер"])
  var WEAR = [['yellow', 'fold'], ['coffee', 'smudge'], ['clip', 'fox'], ['crease', 'pin'],
              ['tape', 'yellow'], ['tear', 'smudge'], ['coffee', 'fox'], ['foldbl', 'crease']];
  var SHOTS_PH = 6;              // сколько кадров-заглушек, если своих нет
  var STAGE = { desk: [1440, 900], phone: [390, 844] };
  var PHONE_MAX = 767;           // ширина окна, до которой раскладка телефонная

  var OD = window.OD = {
    works: [],                   // как в описи
    state: { open: false, opened: false, sort: 'new', index: 0, sound: true },
    stage: { k: 1, phone: false },
    PH: PH,

    // ── шина ────────────────────────────────────────────────
    on: function (type, fn) {
      document.addEventListener('od:' + type, function (e) { fn(e.detail || {}, e); });
    },
    emit: function (type, detail) {
      document.dispatchEvent(new CustomEvent('od:' + type, { detail: detail || {} }));
    },

    // ── состояние ───────────────────────────────────────────
    // OD.set({open:true}) — меняет state, обновляет <body data-*>, шлёт "state"
    set: function (patch) {
      var s = OD.state, changed = {}, k;
      for (k in patch) if (s[k] !== patch[k]) { s[k] = patch[k]; changed[k] = patch[k]; }
      reflect();
      if (Object.keys(changed).length) OD.emit('state', { patch: changed, state: s });
    },

    // ── данные ──────────────────────────────────────────────
    // работы в текущем порядке: «новые» — обратный порядок описи
    ordered: function () {
      var w = OD.works.slice();
      return OD.state.sort === 'new' ? w.reverse() : w;
    },
    bySlug: function (slug) {
      var list = OD.ordered();
      for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return { work: list[i], index: i };
      return null;
    },
    // текст поля или заглушка
    show: function (v, ph) { return v == null || v === '' ? ph : v; },

    // ── карточка ────────────────────────────────────────────
    // собирает <article class="c"> для работы w на месте i из n
    card: function (w, i, n) {
      var el = document.getElementById('tpl-card').content.firstElementChild.cloneNode(true);
      var $ = function (r) { return el.querySelector('[data-role="' + r + '"]'); };
      var no = OD.show(w.no, '№—');
      var sheet = 'лист ' + pad(i + 1) + ' / ' + pad(n) + ' · одродок';
      var hdrL = [OD.show(w.type, PH.type), OD.show(w.duration, PH.duration), OD.show(w.status, PH.status)].join(' · ');
      var hdrR = 'в картотеке с ' + OD.show(w.added, PH.added);

      el.dataset.slug = w.slug;
      el.dataset.i = i;
      el.dataset.depth = i;      // стопка пересчитывает относительно текущей
      if (w.link) el.dataset.link = w.link;

      var tab = $('tab'), tNo = document.createElement('span'), tShort = document.createElement('span');
      tNo.className = 'tab-no'; tNo.textContent = no;
      tShort.className = 'tab-short'; tShort.textContent = ' ' + OD.show(w.short, '');
      tab.append(tNo, tShort);
      $('tab').setAttribute('aria-label', 'Карточка ' + no + ' ' + OD.show(w.title, ''));
      $('hdr-l').textContent = hdrL;
      $('hdr-r').textContent = hdrR;
      $('back-hdr-l').textContent = no + ' · кадры';
      $('back-hdr-r').textContent = hdrR;
      $('sheet').textContent = sheet;
      $('back-sheet').textContent = sheet;

      var cover = $('cover'), coverPh = $('cover-ph');
      cover.alt = OD.show(w.title, '');
      coverPh.textContent = PH.cover(no);
      if (w.cover_srcset) {                 // 780w / 1560w; ширина окна обложки × масштаб сцены
        cover.srcset = w.cover_srcset;
        cover.sizes = Math.round((OD.stage.phone ? 326 : 996) * OD.stage.k) + 'px';
      }
      img(cover, w.cover, function () { cover.hidden = true; coverPh.hidden = false; });

      var dl = $('fields');
      FIELDS.forEach(function (f) {
        var label = (w.labels && w.labels[f[0]]) || f[1];
        var dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.className = 'ln s'; dd.className = 'ln';
        dt.textContent = label;
        dd.textContent = OD.show(w[f[0]], PH.field(label));
        dl.append(dt, dd);
      });
      $('desc').textContent = OD.show(w.desc, PH.desc);
      $('mark').textContent = w.note || w.status || PH.mark;

      [$('wear'), $('back-wear')].forEach(function (box) {
        var set = i % WEAR.length;
        WEAR[set].forEach(function (t, j) {
          var s = document.createElement('span');
          s.className = 'w-' + t; s.dataset.w = set + '-' + j;
          box.append(s);
        });
      });

      // кадры: свои или 6 заглушек из обложки в сером
      var shots = (w.shots && w.shots.length) ? w.shots : null;
      var list = shots || Array.apply(null, Array(SHOTS_PH)).map(function () { return w.cover; });
      var strip = $('strip'), thumbs = $('thumbs');
      list.forEach(function (src, j) {
        var n1 = j + 1;
        var layer = document.createElement('div');
        layer.className = 'shot' + (shots ? '' : ' is-ph');
        layer.dataset.n = n1;
        var im = document.createElement('img'); im.alt = '';
        img(im, src, function () { im.hidden = true; }, true);
        layer.append(im);
        if (!shots) {
          var ph = document.createElement('span'); ph.className = 'ph shot-ph'; ph.textContent = PH.shot(n1);
          layer.append(ph);
        } else {
          im.addEventListener('error', function () {
            var ph = document.createElement('span'); ph.className = 'ph shot-ph'; ph.textContent = PH.shot(n1);
            layer.classList.add('is-ph'); layer.append(ph);
          }, { once: true });
        }
        strip.append(layer);

        var b = document.createElement('button');
        b.type = 'button'; b.className = 'thumb' + (shots ? '' : ' is-ph');
        b.dataset.action = 'shot'; b.dataset.n = n1;
        b.setAttribute('aria-label', 'Кадр ' + n1);
        var ti = document.createElement('img'); ti.alt = '';
        img(ti, src, function () { ti.hidden = true; }, true);
        var tl = document.createElement('span'); tl.className = 'thumb-label'; tl.textContent = 'кадр ' + pad(n1);
        b.append(ti, tl);
        thumbs.append(b);
      });
      $('counter').textContent = '01 / ' + pad(list.length);
      el.dataset.shots = list.length;
      return el;
    },

    // кладёт все карточки в стопку в текущем порядке; шлёт "rendered"
    render: function () {
      var seat = document.getElementById('stack-seat');
      var list = OD.ordered(), n = list.length;
      seat.textContent = '';
      list.forEach(function (w, i) {
        var el = OD.card(w, i, n);
        el.style.zIndex = String(n - i);   // первая в порядке — сверху
        el.style.setProperty('--d', String(Math.min(i, 9)));  // глубина для ярлыка и тени
        seat.append(el);
      });
      OD.emit('rendered', { count: n });
    }
  };

  // ── внутреннее ────────────────────────────────────────────
  function pad(x) { return String(x).padStart(2, '0'); }

  function img(el, src, onFail, lazy) {
    if (!src) { onFail(); return; }
    if (lazy) el.loading = 'lazy';      // кадры грузятся, когда оборот открыт
    el.addEventListener('error', onFail, { once: true });
    el.decoding = 'async';
    el.src = src;
  }

  function reflect() {
    var b = document.body, s = OD.state;
    if (!b) return;
    b.dataset.open = s.open ? '1' : '0';
    b.dataset.sort = s.sort;
    b.dataset.sound = s.sound ? 'on' : 'off';
  }

  // масштаб сцены: геометрия холста в px, окно — любое
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    var phone = w <= PHONE_MAX;
    var S = phone ? STAGE.phone : STAGE.desk;
    var k = Math.min(w / S[0], h / S[1]);
    var root = document.documentElement.style;
    root.setProperty('--k', k.toFixed(4));
    var was = OD.stage.phone;
    OD.stage.k = k; OD.stage.phone = phone;
    document.body.dataset.phone = phone ? '1' : '0';
    OD.emit('resize', { k: k, phone: phone, changed: was !== phone });
  }

  function clock() {
    var el = document.querySelector('[data-role="clock"]');
    if (!el) return;
    var tick = function () {
      var t = new Date();
      el.textContent = '(' + pad(t.getDate()) + '.' + pad(t.getMonth() + 1) + '.' + String(t.getFullYear()).slice(2) + ') ' +
        pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
    };
    tick(); setInterval(tick, 1000);
  }

  // img[data-fallback="путь"] — при ошибке подменить; data-fallback="none" — спрятать
  function fallbacks() {
    document.querySelectorAll('img[data-fallback]').forEach(function (im) {
      var fb = im.dataset.fallback;
      var swap = function () {
        if (fb === 'none') { im.style.visibility = 'hidden'; return; }
        if (im.src.indexOf(fb) < 0) im.src = fb;
      };
      if (im.complete && im.naturalWidth === 0) swap(); else im.addEventListener('error', swap, { once: true });
    });
  }

  function load() {
    return fetch('data/работы.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        OD.works = (j.works || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        OD.emit('data', { works: OD.works });
        OD.render();
      })
      .catch(function (e) {
        document.body.dataset.error = 'data';
        console.error('[od] не загрузились data/работы.json:', e);
      });
  }

  function start() {
    reflect(); fit(); clock(); fallbacks();
    window.addEventListener('resize', fit);
    // любое нажатие кнопки → "button" (звук щёлкает машинкой); шлём раньше действия
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b) OD.emit('button', { el: b, action: b.dataset.action || null });
    }, true);
    load();
  }

  // DOMContentLoaded наступает после всех defer-скриптов: части успеют подписаться
  if (document.readyState === 'complete') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
