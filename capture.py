#!/usr/bin/env python3
"""Съёмка обложки и скриншотов для витрины.

Запуск: сначала поднять сервер в папке игры (python3 -m http.server 8123),
потом python3 capture.py. Результат кладётся в press/.

Аудиоконтекст в headless по умолчанию спит, а на нём держится вся ритмическая
сетка игры — поэтому браузер запускается с разрешённым автоплеем, иначе часы
стоят и на снимках пустое поле.
"""
import json
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
OUT = pathlib.Path(__file__).parent / "press"

PREFS = {"lang": "ru", "volume": 0.0, "player": "Дима"}

# бот держит весь состав живым — нужен для кадров с полной сеткой
BOT = """
const S = window.SND, VT = window.__VT, st = VT.st;
st.objs.forEach(o => { o.introBeat = 0; });
window.__bot = setInterval(() => {
  if (st.mode !== 'play' || st.paused) return;
  const now = S.now(), beat = VT.beatAt(now);
  for (const o of st.objs) {
    if (!o.visible) continue;
    const k = Math.round((beat - o.offset) / o.period);
    if (Math.abs(now - VT.timeAt(k * o.period + o.offset)) > 0.03) continue;
    if (o.__lastK === k) continue;
    const frac = o.alive ? (o.until + 1 - (beat - o.offset) / o.period) / 6 : -1;
    if (o.alive && frac > 0.6) continue;
    o.__lastK = k;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: o.key, bubbles: true }));
    break;
  }
}, 4);
"""

START = "document.getElementById('title').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"
STOP_BOT = "clearInterval(window.__bot)"


def fresh(browser, w, h, lang="ru"):
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
    prefs = dict(PREFS, lang=lang)
    page.add_init_script(
        "localStorage.setItem('vtakt_prefs', %s);"
        "localStorage.setItem('vtakt_scores', %s);"
        % (json.dumps(json.dumps(prefs)), json.dumps(json.dumps({"Дима": 148300})))
    )
    page.goto(URL)
    page.wait_for_timeout(700)
    return page


def alive_grid(page, hold=14000):
    page.evaluate(START)
    page.wait_for_timeout(900)
    page.evaluate(BOT)
    page.wait_for_timeout(hold)


def main():
    try:
        urllib.request.urlopen(URL, timeout=3)
    except Exception:
        sys.exit("Сервер не отвечает. Подними: python3 -m http.server 8123 в папке игры")

    OUT.mkdir(exist_ok=True)

    with sync_playwright() as pw:
        # системный Chrome, чтобы не тянуть отдельную сборку браузера
        browser = pw.chromium.launch(
            channel="chrome",
            args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
        )

        # обложка 630×500 — требование itch.io.
        # HUD убираем: на таком размере сетка занимает почти весь кадр,
        # и счёт с подсказками налезает на верхние плитки
        page = fresh(browser, 630, 500)
        alive_grid(page, 13000)
        page.evaluate(STOP_BOT)
        page.evaluate("document.querySelectorAll('.hud').forEach(n => n.style.display='none')")
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "cover-630x500.png"))
        page.close()

        shots = [
            ("01-grid", "ru", "full"),
            ("02-title", "ru", "title"),
            ("03-early", "ru", "early"),
            ("04-tension", "ru", "tension"),
            ("05-grid-en", "en", "full"),
        ]
        for name, lang, kind in shots:
            page = fresh(browser, 1920, 1080, lang)
            if kind == "title":
                pass                                   # титул снимаем как есть
            elif kind == "early":
                page.evaluate(START)
                page.wait_for_timeout(900)
                page.evaluate(BOT)
                page.wait_for_timeout(5200)            # успевают войти три-четыре
                page.evaluate(STOP_BOT)
                page.wait_for_timeout(300)
            elif kind == "tension":
                alive_grid(page, 12000)
                page.evaluate(STOP_BOT)
                page.wait_for_function(
                    "window.__VT.st.tension > 0.75 || window.__VT.st.mode !== 'play'",
                    timeout=30000,
                )
                page.evaluate("document.getElementById('over').style.visibility='hidden'")
            else:
                alive_grid(page)
                page.evaluate(STOP_BOT)
            page.wait_for_timeout(200)
            page.screenshot(path=str(OUT / (name + ".png")))
            page.close()

        browser.close()

    for f in sorted(OUT.glob("*.png")):
        print(f.name, f.stat().st_size // 1024, "КБ")


if __name__ == "__main__":
    main()
