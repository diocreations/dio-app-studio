#!/bin/sh
# Rebuild the raster icons and the 1200x630 share card from the SVG sources.
# Run from the repository root: sh scripts/art/make-icons.sh
set -eu
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

python3 -m http.server 8899 --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
sleep 1

# Chrome's headless screenshot renders at exactly the window size, unlike
# qlmanage, which lays the SVG out at native size on a square canvas.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot="$ROOT/public/og.png" http://127.0.0.1:8899/og.html >/dev/null 2>&1
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=480,480 --screenshot="$ROOT/public/icon-480.png" http://127.0.0.1:8899/icon.html >/dev/null 2>&1

sips -z 32 32 "$ROOT/public/icon-480.png" --out "$ROOT/public/favicon-32.png" >/dev/null
sips -z 180 180 "$ROOT/public/icon-480.png" --out "$ROOT/public/apple-touch-icon.png" >/dev/null
rm "$ROOT/public/icon-480.png"

cd "$ROOT"
bun scripts/art/make-ico.mjs
cp scripts/art/favicon.svg public/favicon.svg
