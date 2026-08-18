#!/usr/bin/env python3
"""
Типограф для сайта «Одродок»: убирает висячие предлоги.

Что делает — только внутри видимого текста HTML, не трогая
теги, атрибуты, <style>, <script> и уже проставленные сущности:

  1. неразрывный пробел после коротких слов (предлоги, союзы, частицы)
  2. неразрывный пробел перед короткими словами в конце строки (же, ли, бы)
  3. неразрывный пробел в конструкциях «в 2026», «№ 4», «10 км»
  4. неразрывный пробел перед тире

Запуск:
    python3 tools/nbsp.py pervoprohodcy.html          # правит файл на месте
    python3 tools/nbsp.py *.html                      # несколько файлов
    python3 tools/nbsp.py --check pervoprohodcy.html  # только показать, что изменится
"""

import re
import sys
from pathlib import Path

NBSP = " "

# короткие слова, после которых нельзя переносить строку
SHORT_WORDS = (
    "а в и к о с у я на за по до из от над под при про для без "
    "не ни но да же ли бы вы мы ты он она они это все всё как "
    "что чем чём кто где куда там тут уж их им ему ей ним них "
    "со во ко об обо изо ото перед через между около вокруг "
    "если чтобы когда пока хотя ведь лишь даже только уже ещё еще"
).split()

# слова, которые нельзя отрывать от предыдущего
CLITICS = ("же", "ли", "бы", "б", "ж")


def _protect(html: str):
    """Вырезает служебные участки, чтобы типограф их не трогал."""
    stash = []

    def hide(m):
        stash.append(m.group(0))
        return f"\x00{len(stash) - 1}\x00"

    # style, script целиком + любые теги + html-сущности
    pattern = re.compile(
        r"<(script|style)\b[^>]*>.*?</\1>|<[^>]+>|&[a-zA-Z#0-9]+;",
        re.S | re.I,
    )
    return pattern.sub(hide, html), stash


def _restore(html: str, stash) -> str:
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], html)


def typo(text: str) -> str:
    # 1. после коротких слов
    words = "|".join(sorted(SHORT_WORDS, key=len, reverse=True))
    text = re.sub(
        rf"(?<![^\s> («„\"—-]) ?\b({words})\b[ \t]+",
        lambda m: m.group(0).rstrip(" \t").replace(m.group(1), m.group(1)) + NBSP,
        text,
        flags=re.I,
    )

    # 2. перед частицами
    text = re.sub(
        rf"[ \t]+\b({'|'.join(CLITICS)})\b",
        lambda m: NBSP + m.group(1),
        text,
        flags=re.I,
    )

    # 3. число + слово не разрывать: «303 трека», «85 лет», «№ 4»
    text = re.sub(r"(\d)[ \t]+(?=[а-яёa-z])", r"\1" + NBSP, text, flags=re.I)
    text = re.sub(r"(№|§)[ \t]*(?=\d)", r"\1" + NBSP, text)

    # 4. тире не должно начинать строку — цепляем к предыдущему слову
    text = re.sub(r"[ \t]+([—–])[ \t]+", NBSP + r"\1 ", text)

    return text


def process(html: str) -> str:
    safe, stash = _protect(html)
    return _restore(typo(safe), stash)


def main(argv):
    check = "--check" in argv
    files = [a for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 1

    for name in files:
        p = Path(name)
        src = p.read_text(encoding="utf-8")
        out = process(src)
        if src == out:
            print(f"— {p.name}: без изменений")
            continue
        diff = sum(1 for a, b in zip(src, out) if a != b) or abs(len(out) - len(src))
        if check:
            print(f"~ {p.name}: будет проставлено неразрывных пробелов ≈ {out.count(NBSP) - src.count(NBSP)}")
        else:
            p.write_text(out, encoding="utf-8")
            print(f"✓ {p.name}: неразрывных пробелов +{out.count(NBSP) - src.count(NBSP)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
