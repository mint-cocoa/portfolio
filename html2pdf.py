#!/usr/bin/env python3
"""Convert HTML to PDF using Chrome DevTools Protocol with print-optimized settings."""

import json
import subprocess
import sys
import time
import base64
import websocket
import os

def find_chrome():
    home = os.path.expanduser("~")
    return f"{home}/.local/share/quarto/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell"

def html_to_pdf(html_path, pdf_path):
    chrome = find_chrome()
    port = 9222

    proc = subprocess.Popen([
        chrome,
        "--no-sandbox",
        "--disable-gpu",
        "--headless",
        f"--remote-debugging-port={port}",
        "--font-render-hinting=none",
        "--remote-allow-origins=*",
    ], stderr=subprocess.PIPE)

    time.sleep(2)

    # Get WebSocket URL
    import urllib.request
    resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version")
    ws_url = json.loads(resp.read())["webSocketDebuggerUrl"]

    ws = websocket.create_connection(ws_url)
    msg_id = 1

    def send(method, params=None):
        nonlocal msg_id
        msg = {"id": msg_id, "method": method}
        if params:
            msg["params"] = params
        ws.send(json.dumps(msg))
        msg_id += 1
        while True:
            result = json.loads(ws.recv())
            if result.get("id") == msg_id - 1:
                return result

    # Create target and navigate
    result = send("Target.createTarget", {"url": "about:blank"})
    target_id = result["result"]["targetId"]

    # Attach to target
    resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/json")
    pages = json.loads(resp.read())
    page_ws_url = None
    for page in pages:
        if page.get("id") == target_id:
            page_ws_url = page["webSocketDebuggerUrl"]
            break

    ws.close()
    ws = websocket.create_connection(page_ws_url)
    msg_id = 1

    # Enable page
    send("Page.enable")

    # Navigate
    file_url = f"file://{os.path.abspath(html_path)}"
    send("Page.navigate", {"url": file_url})
    time.sleep(3)

    # Inject print CSS for better readability
    print_css = """
    /* Hide sidebar TOC and make body full-width */
    #quarto-sidebar, #quarto-margin-sidebar, .sidebar,
    nav.toc-active, #TOC, .quarto-container .toc-left,
    .margin-sidebar, #quarto-sidebar-glass { display: none !important; }

    #quarto-content, .page-columns, .quarto-container,
    .content, main, body, .page-rows-contents {
        margin-left: 0 !important; margin-right: 0 !important;
        padding-left: 0 !important; padding-right: 0 !important;
        max-width: 100% !important; width: 100% !important;
        grid-template-columns: 1fr !important;
    }

    body { font-size: 12pt !important; line-height: 1.6 !important; }
    h1 { font-size: 20pt !important; }
    h2 { font-size: 16pt !important; }
    h3 { font-size: 14pt !important; }
    .sourceCode { font-size: 9.5pt !important; }
    pre code { white-space: pre-wrap !important; word-wrap: break-word !important; }
    table { font-size: 10.5pt !important; }
    img, .mermaid-js svg { max-width: 100% !important; page-break-inside: avoid; }
    h1, h2, h3, h4 { page-break-after: avoid; }
    .quarto-title-block { margin-bottom: 1em; }
    """
    send("Runtime.evaluate", {
        "expression": f"""
            var style = document.createElement('style');
            style.textContent = `{print_css}`;
            document.head.appendChild(style);
        """
    })

    # Emulate print media so CSS applies
    send("Emulation.setEmulatedMedia", {"media": "print"})

    # Print to PDF with optimized settings
    result = send("Page.printToPDF", {
        "landscape": False,
        "displayHeaderFooter": False,
        "printBackground": True,
        "scale": 0.85,
        "paperWidth": 8.27,   # A4
        "paperHeight": 11.69, # A4
        "marginTop": 0.6,
        "marginBottom": 0.6,
        "marginLeft": 0.8,
        "marginRight": 0.8,
        "preferCSSPageSize": False,
    })

    pdf_data = base64.b64decode(result["result"]["data"])
    with open(pdf_path, "wb") as f:
        f.write(pdf_data)

    ws.close()
    proc.terminate()
    proc.wait()
    print(f"Created: {pdf_path} ({len(pdf_data) // 1024}KB)")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.html> <output.pdf>")
        sys.exit(1)
    html_to_pdf(sys.argv[1], sys.argv[2])
