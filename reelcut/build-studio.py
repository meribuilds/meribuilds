#!/usr/bin/env python3
"""Build the Meri Curates Studio page from the reelcut editor.

Usage: python3 build-studio.py /path/to/works/studio
Copies the editor files and writes a studio index.html that adds the team sign-in gate,
Meri Curates branding and a link back to the dashboard. Edit the editor here, then rerun this.
"""
import shutil, sys, pathlib

SUPABASE_URL = "https://zulqjgpucslcsrfekjvc.supabase.co"
SUPABASE_KEY = "sb_publishable_ClDpIJd5lq8FBFAFVR9I-A__D4ILLNd"  # publishable (public) key, same as the dashboard

src = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
for f in ["styles.css", "app.js", "fx.js", "whisper-worker.js", "gate.js", "convert-worker.js"]:
    shutil.copy(src / f, out / f)

h = (src / "index.html").read_text()

def rep(old, new):
    global h
    assert h.count(old) == 1, f"expected one match for: {old[:60]}"
    h = h.replace(old, new)

rep("<title>Meri Cuts · reel cutter</title>", "<title>Meri Curates Studio</title>")
rep("<body>", '<body class="locked">\n'
    '<div class="gate" id="gate">\n'
    '  <form class="box" id="gateForm" onsubmit="return false">\n'
    '    <span class="mono">Meri Curates · team area</span>\n'
    '    <h1>The <em>studio</em></h1>\n'
    '    <p>Cut reels, add effects, music and captions. Sign in with your dashboard account.</p>\n'
    '    <label class="visually-hidden" for="gateEmail">Email</label><input id="gateEmail" type="email" placeholder="you@email.com" autocomplete="email">\n'
    '    <label class="visually-hidden" for="gatePw">Password</label><input id="gatePw" type="password" placeholder="password" autocomplete="current-password">\n'
    '    <div class="err" id="gateErr">Checking your session…</div>\n'
    '    <div class="inline"><button class="btn primary" id="gateGo" type="submit">Sign in</button><a href="../dashboard/">Back to the dashboard</a></div>\n'
    '  </form>\n'
    '  <div class="box" id="gateDenied" hidden>\n'
    '    <span class="mono">Team only</span>\n'
    '    <h1>Not for <em>clients</em></h1>\n'
    '    <p><span id="gateWho"></span> is a client account. The studio is for the Meri Curates team.</p>\n'
    '    <div class="inline"><a class="btn primary" href="../dashboard/">Go to the dashboard</a><button class="btn" id="gateOut" type="button">Sign out</button></div>\n'
    '  </div>\n'
    '</div>\n')
rep('<div class="brand">Meri <b>Cuts</b></div>', '<div class="brand">Meri <b>Curates</b></div>')
rep('<span class="chip">reel cutter</span>', '<span class="chip">studio</span>\n  <a class="navlink" href="../dashboard/">← Dashboard</a>')
rep('<span id="saveStatus" class="status">saved</span>', '<span id="saveStatus" class="status">saved</span>\n  <span id="studioWho" class="status"></span>\n  <button id="studioOut" class="btn sm" type="button" hidden>Sign out</button>')
rep('<script src="fx.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n'
    f'<script>window.STUDIO_AUTH = {{ url: "{SUPABASE_URL}", key: "{SUPABASE_KEY}" }};</script>\n'
    '<script src="gate.js"></script>\n<script src="fx.js"></script>')
(out / "index.html").write_text(h)
print("studio built at", out)
