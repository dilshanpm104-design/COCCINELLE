#!/usr/bin/env python3
"""Builds tests/harness.html from the real admin.html so tests render the exact shell markup and styles.
The only change: paths are made relative to /tests, the login screens are hidden and app.js is swapped for harness.js."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
h = (root / 'admin.html').read_text()
h = h.replace('href="admin/admin.css?v=1"', 'href="../admin/admin.css"').replace('src="logo.png"', 'src="../logo.png"').replace('href="logo.png"', 'href="../logo.png"')
h = h.replace('<div id="shell" hidden>', '<div id="shell">').replace('<div id="splash" class="splash">', '<div id="splash" class="splash" hidden>')
h = re.sub(r'<script type="module" src="admin/app.js[^"]*"></script>', '<script type="module" src="harness.js"></script>', h)
assert 'harness.js' in h and '<div id="shell">' in h
(root / 'tests' / 'harness.html').write_text(h)
print('built tests/harness.html')
