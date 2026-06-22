#!/usr/bin/env python3
"""Cria addon domain multi-assets.com no cPanel HostGator via Playwright."""
import os
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    sys.exit(1)

CPANEL_URL = os.environ.get("HG_CPANEL_URL", "https://sh00110.hostgator.com.br:2083")
USER = os.environ.get("HG_CPANEL_USER", "")
PASS = os.environ.get("HG_CPANEL_PASS", "")
DOMAIN = "multi-assets.com"
DOCROOT = "multi-assets.com"


def main():
    if not USER or not PASS:
        print("Defina HG_CPANEL_USER e HG_CPANEL_PASS")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(CPANEL_URL, timeout=60000)
        page.fill('input#user, input[name="user"]', USER)
        page.fill('input#pass, input[name="pass"]', PASS)
        page.click('button[type="submit"], #login_submit')
        page.wait_for_load_state("networkidle", timeout=60000)

        # Domains / Create a New Domain (cPanel 110+)
        for link_text in ["Domains", "Domínios", "Create a New Domain", "Criar um novo domínio"]:
            loc = page.get_by_role("link", name=link_text)
            if loc.count():
                loc.first.click()
                break
        page.wait_for_timeout(2000)

        page.fill('input[name="domain"], #newDomainName', DOMAIN)
        doc = page.locator('input[name="documentRoot"], #documentRoot')
        if doc.count():
            doc.fill(DOCROOT)
        sub = page.locator('input[name="subdomain"], #subdomain')
        if sub.count():
            sub.fill("multi-assets")

        submit = page.locator('button:has-text("Submit"), button:has-text("Enviar"), button:has-text("Create")')
        if submit.count():
            submit.first.click()
            page.wait_for_timeout(3000)

        page.screenshot(path=os.path.join(os.path.dirname(__file__), "..", "diagnosticos", "cpanel-addon-result.png"), full_page=True)
        print("Screenshot: site-producao/diagnosticos/cpanel-addon-result.png")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())