#!/usr/bin/env python3
"""Optional real-browser layout regression test (no VTL engine required).

Requires: pip install playwright, and a local Chromium executable or
`python -m playwright install chromium`.
"""
from pathlib import Path
import os
import re
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
css=(ROOT/'src/view/style.css').read_text()
html=re.sub(r'<script type="module">.*?</script>','',html,flags=re.S)
html=re.sub(r'<link rel="stylesheet"[^>]+>',f'<style>{css}</style>',html)
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    opts={'headless':True,'args':['--no-sandbox']}
    if executable:opts['executable_path']=executable
    browser=p.chromium.launch(**opts)
    try:
        for width in (390,600,800,1100,1440):
            page=browser.new_page(viewport={'width':width,'height':900})
            try:
                page.set_content(html)
                sizes=page.evaluate('''() => {
                    const canvas=[...document.querySelectorAll('.maincontent canvas')];
                    return {
                        scroll:document.documentElement.scrollWidth,
                        canvas:canvas.map(c=>({
                            canvas:c.getBoundingClientRect().right,
                            panel:c.closest('.panel').getBoundingClientRect().right
                        }))
                    };
                }''')
                assert sizes['scroll']<=width, f'{width}px: body overflow {sizes}'
                assert all(c['canvas']<=c['panel']+1 for c in sizes['canvas']),f'{width}px: canvas overflow'
                print(f'{width}px viewport: no plot overflow')
            finally:page.close()
    finally:browser.close()
