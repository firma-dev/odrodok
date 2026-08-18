# Сайт odrodok.ru

Статический сайт, без сборщиков и зависимостей. Открывается прямо из файла.

## Структура

    site/
      index.html            → odrodok.ru        (заглушка со знаком)
      holding.html          исходник заглушки, копируется в index.html при сборке
      pervoprohodcy.html    → odrodok.ru/pervoprohodcy
      vozduh.html           → odrodok.ru/vozduh
      favicon.ico
      site.webmanifest
      .htaccess             адреса без .html, кеш, сжатие
      assets/
        fonts/              ocra-becker.woff2 (основной), .otf (запасной), basis-400
        icons/              иконки под браузер и iOS
        mark.webp           знак в шапке и подвале
        pervoprohodcy/      обложка, кадры, og
        vozduh/             кадры, og
      src/                  исходные тексты замыслов
      tools/nbsp.py         типограф: убирает висячие предлоги
      dist/                 архивы сборок для заливки на хостинг

## Как добавить страницу

1. Скопировать `vozduh.html` (в нём нет плеера) или `pervoprohodcy.html` (с плеером).
2. Поменять `title`, `description`, og-теги, `h1`, текст, кадры.
3. Кадры: класть в `assets/<проект>/`, конвертировать в webp.
4. Прогнать типограф: `python3 tools/nbsp.py новая-страница.html`

## Выкладка

Архив из `dist/` → ISPmanager → Менеджер файлов → каталог сайта →
Загрузить → Извлечь. После распаковки выставить права:

    find . -type d -exec chmod 755 {} \; && find . -type f -exec chmod 644 {} \;

Иначе Apache отдаёт 403 — распаковщик ставит 600/700.

## Знать про вёрстку

- Дизайн-система IDS (из финансера): жёсткие тени без блюра, нулевые радиусы.
- Токены — в `:root`, шкалы отступов `--gap-*`, тени `--sh*`.
- Заголовок ограничен `min(3.2em, 7.6vw)`, чтобы не вылезал на узких экранах.
- Зерно бумаги — два слоя `body::before/::after`, крутится через `opacity`.
