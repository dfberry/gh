#!/usr/bin/env bash
# Simple script to convert SVG placeholders to PNG using available tools.
# Usage: ./docs/scripts/convert-images.sh

set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
SVG_DIR="$DIR/../images"

if command -v rsvg-convert >/dev/null 2>&1; then
  echo "Using rsvg-convert to convert SVGs..."
  for f in "$SVG_DIR"/*.svg; do
    out="${f%.svg}.png"
    echo "Converting $f -> $out"
    rsvg-convert -o "$out" "$f"
  done
  exit 0
fi

if command -v convert >/dev/null 2>&1; then
  echo "Using ImageMagick 'convert' to convert SVGs..."
  for f in "$SVG_DIR"/*.svg; do
    out="${f%.svg}.png"
    echo "Converting $f -> $out"
    convert "$f" "$out"
  done
  exit 0
fi

echo "No supported converter found. Install 'rsvg-convert' (librsvg) or ImageMagick 'convert'."
exit 2
