#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

quarto_bin="${QUARTO_BIN:-quarto}"
if ! command -v "$quarto_bin" >/dev/null 2>&1; then
  if [[ -x "/c/Program Files/Quarto/bin/quarto" ]]; then
    quarto_bin="/c/Program Files/Quarto/bin/quarto"
  elif [[ -f "/mnt/c/Program Files/Quarto/bin/quarto.exe" ]]; then
    quarto_bin="/mnt/c/Program Files/Quarto/bin/quarto.exe"
  elif [[ -x "C:/Program Files/Quarto/bin/quarto.exe" ]]; then
    quarto_bin="C:/Program Files/Quarto/bin/quarto.exe"
  else
    echo "quarto executable not found" >&2
    exit 127
  fi
fi

rm -rf docs
rm -rf generated-quarto
node scripts/prepare-servercore-docs.js
"$quarto_bin" render generated-quarto
rm -rf docs/diagrams
cp -a content/diagrams docs/diagrams
cp content/portfolio.css docs/portfolio.css
touch docs/.nojekyll

test -f docs/index.html
test -f docs/docs/1.overview.html
test -f docs/docs/2.lifecycle-management.html
test -f docs/docs/3.buffer-management.html
test -f docs/docs/4.concurrency-management.html
test -f docs/docs/5.producer-consumer-backpressure.html
test -f docs/docs/6.summary.html
test -f docs/docs/backend-platform-self-introduction.html
test -f docs/diagrams/servercore-site-style/fig-servercore-proxy-backpressure-example.svg
