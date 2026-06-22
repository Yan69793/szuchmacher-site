"""Mobile smoke test — calendário macro em szuchmacher.com.br"""
from playwright.sync_api import sync_playwright

URL = "https://szuchmacher.com.br/?mobilecheck=1"
SHOT = r"E:\Diretorio\Claude\Site\agenda-corrigida.png"
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

        items = page.locator(".mp-evento")
        count = items.count()
        texts = [items.nth(i).inner_text() for i in range(count)]

        idx_els = page.locator(".mp-evento-idx")
        overlap_pairs = []
        boxes = [idx_els.nth(i).bounding_box() for i in range(idx_els.count())]
        data_boxes = [page.locator(".mp-evento-data").nth(i).bounding_box() for i in range(count)]
        title_boxes = [page.locator(".mp-evento-title").nth(i).bounding_box() for i in range(count)]

        for i, ib in enumerate(boxes):
            if not ib:
                continue
            for j, db in enumerate(data_boxes):
                if db and overlaps(ib, db):
                    overlap_pairs.append(("idx", i, "data", j))
            for j, tb in enumerate(title_boxes):
                if tb and overlaps(ib, tb):
                    overlap_pairs.append(("idx", i, "title", j))

        has_sexta = any("19/06" in t or "sex" in t.lower() for t in texts)
        has_livre = any("Agenda livre" in t for t in texts)
        has_sem_div = any("Sem divulgações relevantes" in t for t in texts)
        has_juneteenth = any("Juneteenth" in t for t in texts)
        has_focus = any("Focus" in t for t in texts)

        hscroll = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

        if vp["label"] == "iphone14":
            section = page.locator("#antecipacao")
            section.scroll_into_view_if_needed()
            section.screenshot(path=SHOT)
            page.locator(".hero").screenshot(path=r"E:\Diretorio\Claude\Site\site-producao\diagnosticos\mobile-hero-390.png")

        print("---", vp["label"], vp["width"], "x", vp["height"], "---")
        print("nav_menu_opens", nav_open)
        print("horizontal_scroll", hscroll)
        print("event_rows", count)
        print("has_focus", has_focus)
        print("has_sexta", has_sexta)
        print("has_agenda_livre", has_livre)
        print("has_sem_divulgacoes", has_sem_div)
        print("has_juneteenth", has_juneteenth)
        print("overlap_count", len(overlap_pairs))
        page.close()

    browser.close()