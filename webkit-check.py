#!/usr/bin/env python3
"""Проверка звука на движке WebKit — том же, на котором работает Safari.

Запуск: поднять сервер в папке игры и python3 webkit-check.py [url]
"""
import json
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123/index.html"

PROBE = """
() => {
  const out = { ошибки: [], состояние: {} };
  const S = window.SND, VT = window.__VT;
  out.состояние.модульЗвука = !!S;
  out.состояние.играЗагрузилась = !!VT;
  if (!S) return out;
  out.состояние.контекстСоздан = S.ready();
  out.состояние.состояниеКонтекста = S.state ? S.state() : '—';
  out.состояние.часы = S.ctxNow();
  const gr = S.graph ? S.graph() : {};
  out.состояние.частотаДискретизации = gr.ctx ? gr.ctx.sampleRate : null;
  out.состояние.мастер = gr.master ? gr.master.gain.value : null;
  out.состояние.задержка = S.latency ? S.latency() : null;
  out.состояние.режимИгры = VT ? VT.st.mode : '—';
  return out;
}
"""


def main():
    with sync_playwright() as pw:
        browser = pw.webkit.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
                if m.type in ("error", "warning") else None)

        page.add_init_script(
            "localStorage.setItem('vtakt_prefs', %s)"
            % json.dumps(json.dumps({"lang": "ru", "volume": 0.8, "player": "Тест"}))
        )
        page.goto(URL)
        page.wait_for_timeout(900)

        print("=== до старта ===")
        print(json.dumps(page.evaluate(PROBE), ensure_ascii=False, indent=2))

        # старт настоящим кликом мыши — как у живого игрока
        page.mouse.click(640, 400)
        page.wait_for_timeout(1500)

        print("=== после клика по титулу ===")
        print(json.dumps(page.evaluate(PROBE), ensure_ascii=False, indent=2))

        # идёт ли звук на выходе
        level = page.evaluate("""
        async () => {
          const S = window.SND, gr = S.graph();
          if (!gr.ctx) return { ошибка: 'контекста нет' };
          const an = gr.ctx.createAnalyser(); an.fftSize = 2048;
          gr.out.connect(an);
          const td = new Float32Array(an.fftSize);
          S.kick(gr.ctx.currentTime + 0.05, 0.85);
          let peak = 0;
          const end = performance.now() + 900;
          while (performance.now() < end) {
            an.getFloatTimeDomainData(td);
            for (let i = 0; i < td.length; i++) peak = Math.max(peak, Math.abs(td[i]));
            await new Promise(r => setTimeout(r, 10));
          }
          return { пикТестовогоУдара: +(20*Math.log10(peak||1e-9)).toFixed(1),
                   часыИдут: S.ctxNow() > 0, состояние: S.state() };
        }
        """)
        print("=== выход ===")
        print(json.dumps(level, ensure_ascii=False, indent=2))

        if errors:
            print("=== ошибки страницы ===")
            for e in errors[:15]:
                print(" ", e)
        else:
            print("=== ошибок страницы нет ===")

        browser.close()


if __name__ == "__main__":
    main()
