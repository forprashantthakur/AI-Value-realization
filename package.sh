#!/usr/bin/env bash
# Builds the single-file published demo: node demo-site/build.mjs + Tailwind + inline assembly.
set -e
cd "$(dirname "$0")/.."
node demo-site/build.mjs
npx tailwindcss -c tailwind.config.ts -i src/app/globals.css -o demo-site/dist/app.css --minify --content "./src/**/*.{ts,tsx},./demo-site/**/*.{ts,tsx}"
python3 - "$1" <<'PY'
import sys
css=open('demo-site/dist/app.css').read()
js=open('demo-site/dist/app.js').read().replace('</script','<\\/script')
out=sys.argv[1] if len(sys.argv)>1 and sys.argv[1] else 'demo-site/dist/index.html'
open(out,'w').write(f'<title>AI Value Realization</title>\n<style>\n:root{{color-scheme:light}}\nhtml,body{{background:#f9f9f7;color:#171d2a}}\n{css}\n</style>\n<div id="root"><p style="padding:24px;font:14px system-ui">Loading the AI Value Realization Platform…</p></div>\n<script>{js}</script>\n')
print('wrote', out)
PY
