#!/usr/bin/env python3
"""Auditoria produção szuchmacher.com.br — Playwright + HTTP checks."""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://szuchmacher.com.br"
OUT_DIR = Path(__file__).resolve().parent.parent / "diagnosticos"
OUT_DIR.mkdir(exist_ok=True)
TS = datetime.now().strftime("%Y%m%d_%H%M%S")

ENDPOINTS = [
    "prices.php",
    "market-data.php",
    "macro_api.php",
    "agenda-data.json",
    "assets/agenda.php",
    "assets/macro.php",
]

PAGES = [
    {"url": f"{BASE}/", "name": "home"},
    {"url": f"{BASE}/multiasset-app.html", "name": "multiasset-app"},
]

VIEWPORTS = [
    {"width": 1280, "height": 800, "label": "desktop"},
    {"width": 390, "height": 844, "label": "mobile390"},
    {"width": 320, "height": 568, "label": "mobile320"},
]


def http_check(path: str) -> dict:
    url = f"{BASE}/{path.lstrip('/')}"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json, text/html, */*",
                "User-Agent": "SzuchmacherAudit/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read(8000).decode("utf-8", errors="replace")
            return {
                "url": url,
                "status": r.status,
                "ok": 200 <= r.status < 300,
                "content_type": r.headers.get("Content-Type", ""),
                "snippet": body[:300],
            }
    except Exception as e:
        return {"url": url, "status": None, "ok": False, "error": str(e)[:200]}


def audit_page(page, name: str, vp: dict) -> dict:
    errors = []
    warnings = []
    console_msgs = []

    def on_console(msg):
        if msg.type in ("error", "warning"):
            console_msgs.append({"type": msg.type, "text": msg.text[:300]})

    page.on("console", on_console)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {str(exc)[:200]}"))

    t0 = datetime.now(timezone.utc)
    url = next(p["url"] for p in PAGES if p["name"] == name)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
    except Exception as e:
        warnings.append(f"goto_timeout: {str(e)[:120]}")
        page.goto(url, wait_until="commit", timeout=60000)
    if name == "multiasset-app":
        page.wait_for_timeout(4000)

    if name == "home":
        try:
            page.wait_for_selector("#macroPanel[data-state='ready']", timeout=35000)
            panel = page.locator("#macroPanel")
            items = page.locator(".mp-evento")
            result = {
                "macro_ready": True,
                "eventos": items.count(),
                "has_sexta": any("19/06" in items.nth(i).inner_text() for i in range(items.count())),
            }
        except Exception as e:
            result = {"macro_ready": False, "error": str(e)[:200]}
            warnings.append("macro panel not ready")
    else:
        result = {}
        for sel, label in [
            ("#macro-ibov", "ibov_strip"),
            ("#bench-assume-selic", "bench_selic"),
            ("#g-pess", "sim_gold"),
        ]:
            el = page.locator(sel)
            if el.count():
                txt = el.first.inner_text().strip()
                result[label] = txt[:80]
                if txt in ("", "—", "-"):
                    warnings.append(f"{label} empty")
            else:
                warnings.append(f"{label} missing")

    load_ms = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
    shot = OUT_DIR / f"audit-{name}-{vp['label']}-{TS}.png"
    page.screenshot(path=str(shot), full_page=False)

    overflow = page.evaluate(
        """() => {
          const w = document.documentElement.clientWidth;
          const isScrollContained = (el) => {
            let node = el;
            while (node && node !== document.body) {
              const st = getComputedStyle(node);
              if (st.overflowX === 'auto' || st.overflowX === 'scroll') return true;
              node = node.parentElement;
            }
            return false;
          };
          let bad = 0;
          document.querySelectorAll('*').forEach(el => {
            if (isScrollContained(el)) return;
            const r = el.getBoundingClientRect();
            if (r.width > w + 2 && r.right > w + 2) bad++;
          });
          return bad;
        }"""
    )
    if overflow > 0:
        warnings.append(f"horizontal_overflow_elements={overflow}")

    return {
        "viewport": vp["label"],
        "load_ms": load_ms,
        "screenshot": str(shot),
        "checks": result,
        "console": console_msgs[:15],
        "errors": errors,
        "warnings": warnings,
    }


def main():
    report = {
        "generated_at": datetime.now().isoformat(),
        "base": BASE,
        "endpoints": [http_check(p) for p in ENDPOINTS],
        "pages": [],
        "html_pages": [],
    }

    for p in PAGES:
        try:
            req = urllib.request.Request(
                p["url"],
                headers={"User-Agent": "SzuchmacherAudit/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                report["html_pages"].append({"url": p["url"], "status": r.status, "ok": True})
        except Exception as e:
            report["html_pages"].append({"url": p["url"], "status": None, "ok": False, "error": str(e)})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for page_def in PAGES:
            for vp in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=2 if vp["width"] < 500 else 1,
                )
                page = context.new_page()
                report["pages"].append(audit_page(page, page_def["name"], vp))
                context.close()
        browser.close()

    out_json = OUT_DIR / f"audit-raw-{TS}.json"
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(e.get("ok") for e in report["endpoints"] if e["url"].endswith((".php", ".json"))) else 1


if __name__ == "__main__":
    sys.exit(main())