/* ============================================================
   js/звук.js — ЗАГОТОВКА. Хозяин: исполнитель «звук».
   Модель и шина — js/данные.js (window.OD). Своего CSS нет:
   вид иконки по body[data-sound] уже в база.css.

   Что делает: WebAudio. Звук включён по умолчанию; браузер даёт
   играть только после первого действия — AudioContext создаётся
   (или resume) на первом pointerdown/keydown/touchend.
   Файлы: assets/kartoteka/звуки/<имя>.m4a — open, close, btn, flip,
   page0 … page6 (имена — в передаче). Каждый раз высота ±4 %
   (playbackRate 0.96…1.04).

     событие                 звук                          громкость
     od:open                 open (шелест целиком, 3,1 с)    .55
     od:close                close (начало шелеста, 0,75 с)  .5
     od:button               btn (двойной щелчок машинки)    .8
     od:go via wheel/key/swipe/drag
                             page0…6 случайно, без повтора   .5
     od:flip via key         flip (страница книги)           .6

   С кнопки — только щелчок: если od:button был < 80 мс назад, страницу
   и переворот не играть; open/close играть с задержкой .16 с.
   Иконка [data-action="sound"]: OD.set({sound}), aria-pressed,
   aria-label «Выключить звук» / «Включить звук»; при включении — btn на .4.

   Слушает: od:open, od:close, od:button, od:go, od:flip, od:state.
   Шлёт:    od:sound {on}.
   ============================================================ */
(function () {
  'use strict';
  var OD = window.OD;
  if (!OD) return;
  // реализация — исполнитель «звук»
})();
