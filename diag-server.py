#!/usr/bin/env python3
"""Сервер для диагностики: раздаёт папку игры и принимает отчёт из браузера.

Нужен, потому что достучаться до Safari снаружи нельзя — пусть страница
сама расскажет о себе. Отчёт падает в diag-report.json.

Запуск: python3 diag-server.py [порт]
"""
import http.server
import json
import pathlib
import socketserver
import sys
import urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
ROOT = pathlib.Path(__file__).parent
REPORT = ROOT / "diag-report.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        if self.path.startswith("/report"):
            q = urllib.parse.urlparse(self.path).query
            data = urllib.parse.parse_qs(q).get("d", ["{}"])[0]
            try:
                parsed = json.loads(data)
            except Exception:
                parsed = {"сырое": data}
            REPORT.write_text(json.dumps(parsed, ensure_ascii=False, indent=2),
                              encoding="utf-8")
            print("получен отчёт:", json.dumps(parsed, ensure_ascii=False)[:200])
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("диагностика на http://localhost:%d/safari-diag.html" % PORT)
        httpd.serve_forever()
