#!/usr/bin/env python3
"""
Опись работ → data/работы.json для картотеки.

Опись живёт в базе артефакта https://claude.ai/artifact/NwWqncordqwaG8ytDkwLAH
(коллекция works, документ на работу: w01, w02 …). Кнопки «скачать» на странице
описи нет, экспорт делает агент:

    ArtifactData  action=list  url=<опись>  collection=works
                  query={"limit":100}  out_dir=<папка>

Агент сохранит по файлу на работу: <папка>/works/w01.json, w02.json …
Дальше:

    python3 tools/опись-в-json.py <папка>/works            # пишет data/работы.json
    python3 tools/опись-в-json.py <папка>/works --check    # только показать, что изменится

Можно передать и один файл: JSON-массив документов или объект {id: документ}.

Что делает:
  * берёт поля описи как есть (no, title, type, duration, status, added, place,
    dates, people, authors, cycle, link, desc, note, order), пустые → null;
  * проставляет неразрывные пробелы тем же типографом, что и в tools/nbsp.py;
  * добавляет то, чего в описи нет, но что есть на холсте Орвина: адрес (slug),
    короткое имя для ярлыка, подписи полей у конкретной карточки (ХОЛСТ ниже);
  * пути к файлам: обложка всегда assets/kartoteka/обложки/<slug>-780.webp
    (+ cover_srcset с -1560.webp),
    кадры assets/kartoteka/кадры/<slug>/<n>.webp — столько, сколько кадров
    в описи (или на холсте, если в описи нет). Файлов может ещё не быть —
    страница тогда показывает заглушку;
  * номер (no) НЕ исправляет: если у нескольких работ одинаковый номер, пишет
    предупреждение и оставляет как в описи.

Новая работа в описи, которой нет в таблице ХОЛСТ, получит адрес rabota-<id>
и предупреждение — допишите её в ХОЛСТ.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nbsp import typo  # noqa: E402

КОРЕНЬ = Path(__file__).resolve().parent.parent
ВЫХОД = КОРЕНЬ / "data" / "работы.json"
ОПИСЬ = "https://claude.ai/artifact/NwWqncordqwaG8ytDkwLAH"

# поля описи в порядке анкеты
ПОЛЯ = ["no", "title", "type", "duration", "status", "added", "place", "dates",
        "people", "authors", "cycle", "link", "desc", "note"]
# в этих полях текст для людей — прогоняем типограф
ТЕКСТ = {"title", "type", "status", "place", "people", "authors", "cycle", "desc", "note"}

# Взято с холста (project/Main.dc.html, фреймы S1…S8): адрес — slug из названия,
# как у файлов в assets/kartoteka/ (см. assets/kartoteka/ОПИСЬ.md), short — подпись на ярлыке, labels — подписи полей именно у этой карточки,
# shots — сколько кадров есть на холсте (если в описи нет своих).
ХОЛСТ = {
    "w01": {"slug": "kukushka-v-yasnom-pole", "short": "кукушка",
            "labels": {"people": "героиня", "authors": "авторы"}, "shots": 6},
    "w02": {"slug": "dva-brata", "short": "два брата",
            "labels": {"place": "маршрут"}, "shots": 0},
    "w03": {"slug": "bloki-belgradskie-etyudy", "short": "блоки",
            "labels": {"people": "героиня", "dates": "дата"}, "shots": 0},
    "w04": {"slug": "chto-takoe-druzhba", "short": "дружба", "labels": {}, "shots": 0},
    "w05": {"slug": "chto-dlya-tebya-svoboda", "short": "свобода", "labels": {}, "shots": 0},
    "w06": {"slug": "chto-dlya-tebya-molodost", "short": "молодость", "labels": {}, "shots": 0},
    "w07": {"slug": "pervoprohodec", "short": "первопроходец",
            "labels": {"people": "герой"}, "shots": 6,
            # кадры холста уже лежат в репо байт в байт (assets/kartoteka/ОПИСЬ.md)
            "shot_paths": ["assets/pervoprohodcy/shot-0%d.webp" % n for n in (1, 2, 3, 4, 5, 7)]},
    "w08": {"slug": "mariya", "short": "мария",
            "labels": {"people": "героиня", "dates": "дата"}, "shots": 0},
}


def читать(путь: Path):
    """Возвращает список (id, документ)."""
    if путь.is_dir():
        out = []
        for f in sorted(путь.glob("*.json")):
            out.append((f.stem, json.loads(f.read_text(encoding="utf-8"))))
        return out
    data = json.loads(путь.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [(d.get("id") or f"x{i:02d}", d) for i, d in enumerate(data)]
    if isinstance(data, dict) and "works" in data and isinstance(data["works"], list):
        return [(d.get("id") or f"x{i:02d}", d) for i, d in enumerate(data["works"])]
    return list(data.items())


def чисто(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def собрать(документы):
    работы, предупр = [], []
    for wid, d in документы:
        h = ХОЛСТ.get(wid)
        if not h:
            h = {"slug": f"rabota-{wid}", "short": None, "labels": {}, "shots": 0}
            предупр.append(f"{wid}: нет в таблице ХОЛСТ — адрес {h['slug']}, ярлык пустой")
        w = {"id": wid, "slug": h["slug"], "order": d.get("order")}
        for k in ПОЛЯ:
            v = чисто(d.get(k))
            if v is not None and k in ТЕКСТ:
                v = typo(v)
            w[k] = v
        w["short"] = h["short"]
        w["labels"] = h["labels"]
        cover_id = чисто(d.get("cover"))
        shots_ids = [s for s in (d.get("shots") or []) if s]
        n = len(shots_ids) or h["shots"]
        base = f"assets/kartoteka/обложки/{h['slug']}"
        w["cover"] = f"{base}-780.webp"
        w["cover_srcset"] = f"{base}-780.webp 780w, {base}-1560.webp 1560w"
        # заглушка кадров: обложка в сером и темнее, запечена заранее (-ph.webp)
        w["cover_ph"] = f"{base}-ph.webp" if (КОРЕНЬ / f"{base}-ph.webp").exists() else None
        if h.get("shot_paths") and not shots_ids:
            w["shots"] = list(h["shot_paths"])
        else:
            w["shots"] = [f"assets/kartoteka/кадры/{h['slug']}/{i}.webp" for i in range(1, n + 1)]
        # откуда брать файлы: id вложений в описи (если владелец загрузил сам)
        w["src"] = {"cover": cover_id, "shots": shots_ids}
        работы.append(w)
    работы.sort(key=lambda w: (w["order"] is None, w["order"] or 0, w["id"]))

    # одинаковые номера — не правим, только сообщаем
    по_номеру = {}
    for w in работы:
        if w["no"]:
            по_номеру.setdefault(w["no"], []).append(w["slug"])
    for no, slugs in по_номеру.items():
        if len(slugs) > 1:
            предупр.append(f"номер {no} у {len(slugs)} работ: {', '.join(slugs)} — оставлено как в описи")
    return работы, предупр


def пусто(работы):
    """Сколько пустых полей описи по каждой работе."""
    строки = []
    for w in работы:
        нет = [k for k in ПОЛЯ if w[k] is None]
        if not w["src"]["cover"]:
            нет.append("cover")
        if not w["src"]["shots"]:
            нет.append("shots")
        строки.append(f"  {w['no'] or '№—'} {w['slug']}: пусто {len(нет)} — {', '.join(нет) or '—'}")
    return строки


def main(argv):
    check = "--check" in argv
    files = [a for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 1
    работы, предупр = собрать(читать(Path(files[0])))
    out = {
        "_": "Собрано tools/опись-в-json.py из описи. Руками не править — пересобрать.",
        "source": ОПИСЬ,
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "works": работы,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    print(f"работ: {len(работы)}")
    for s in пусто(работы):
        print(s)
    for p in предупр:
        print("! " + p)
    if check:
        old = ВЫХОД.read_text(encoding="utf-8") if ВЫХОД.exists() else ""
        strip = lambda t: "\n".join(l for l in t.splitlines() if '"built"' not in l)
        print("без изменений" if strip(old) == strip(text) else "data/работы.json изменится")
        return 0
    ВЫХОД.parent.mkdir(parents=True, exist_ok=True)
    ВЫХОД.write_text(text, encoding="utf-8")
    print(f"✓ {ВЫХОД.relative_to(КОРЕНЬ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
