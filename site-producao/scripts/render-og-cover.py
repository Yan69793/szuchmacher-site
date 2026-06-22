#!/usr/bin/env python3
"""Gera og-cover.jpg (1200x630) a partir de og-cover.html + logo.png."""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "og-cover.html"
OUT = ROOT / "og-cover.jpg"


def main() -> int:
    if not HTML.is_file():
        raise SystemExit(f"Arquivo ausente: {HTML}")
    uri = HTML.as_uri()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        page.goto(uri, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT), type="jpeg", quality=90)
        browser.close()
    print(f"OK: {OUT} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())