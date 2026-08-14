"""Mobile smoke test — calendário macro em szuchmacher.com.br"""
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "https://szuchmacher.com.br/?mobilecheck=1"
OUT_DIR = Path(__file__).resolve().parent.parent / "diagnosticos"
OUT_DIR.mkdir(parents=True, exist_ok=True)
SHOT = str(OUT_DIR / "agenda-corrigida.png")
VIEWPORTS = [
    {"width": 390, "height": 844, "label": "iphone14"},
    {"width": 320, "height": 568, "label": "iphoneSE"},
]


def rect(box):
    return {
        "left": box["x"],
        "right": box["x"] + box["width"],
        "top": box["y"],
        "bottom": box["y"] + box["height"],
    }


def overlaps(a, b):
    ra, rb = rect(a), rect(b)
    return not (ra["right"] <= rb["left"] or ra["left"] >= rb["right"] or ra["bottom"] <= rb["top"] or ra["top"] >= rb["bottom"])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for vp in VIEWPORTS:
        page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]}, device_scale_factor=2)
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_selector("#macroPanel[data-state='ready']", timeout=30000)

        toggle = page.locator(".mobile-menu-toggle")
        nav_open = False
        if toggle.count():
            toggle.click()
            nav_open = page.locator(".nav.nav-open").count() > 0

        items = page.locator(".mp-ev")
        count = items.count()
        texts = [items.nth(i).inner_text() for i in range(count)]

        title_el = page.locator("#agendaTitle")
        rotulo = title_el.first.inner_text().strip() if title_el.count() else ""
        rotulo_passado = "Semana de referência" in rotulo

        overlap_pairs = []
        marker_boxes = [page.locator(".mp-day-marker").nth(i).bounding_box() for i in range(page.locator(".mp-day-marker").count())]
        time_boxes = [page.locator(".mp-ev-time").nth(i).bounding_box() for i in range(page.locator(".mp-ev-time").count())]
        title_boxes = [page.locator(".mp-ev-title").nth(i).bounding_box() for i in range(page.locator(".mp-ev-title").count())]
        ev_boxes = [items.nth(i).bounding_box() for i in range(count)]

        for i, mb in enumerate(marker_boxes):
            if not mb:
                continue
            for j, tb in enumerate(time_boxes):
                if tb and overlaps(mb, tb):
                    overlap_pairs.append(("day-marker", i, "ev-time", j))
            for j, tb in enumerate(title_boxes):
                if tb and overlaps(mb, tb):
                    overlap_pairs.append(("day-marker", i, "ev-title", j))

        for j in range(count - 1):
            a, b = ev_boxes[j], ev_boxes[j + 1]
            if a and b and overlaps(a, b):
                overlap_pairs.append(("ev", j, "ev", j + 1))

        has_livre = any("Agenda livre" in t for t in texts)
        has_sem_div = any("Sem divulgações relevantes" in t for t in texts)
        has_focus = any("Focus" in t for t in texts)

        hscroll = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

        if vp["label"] == "iphone14":
            section = page.locator("#antecipacao")
            section.scroll_into_view_if_needed()
            section.screenshot(path=SHOT)
            page.locator(".hero").screenshot(path=str(OUT_DIR / "mobile-hero-390.png"))

        print("---", vp["label"], vp["width"], "x", vp["height"], "---")
        print("nav_menu_opens", nav_open)
        print("horizontal_scroll", hscroll)
        print("event_rows", count)
        print("rotulo_agenda", repr(rotulo))
        print("rotulo_passado", rotulo_passado)
        print("has_focus", has_focus)
        print("has_agenda_livre", has_livre)
        print("has_sem_divulgacoes", has_sem_div)
        print("overlap_count", len(overlap_pairs))
        page.close()

    browser.close()