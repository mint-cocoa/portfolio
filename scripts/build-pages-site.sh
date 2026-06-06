#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site_dir="$repo_root/_site"

rm -rf "$site_dir"
mkdir -p "$site_dir"

cp -a "$repo_root/docs/." "$site_dir/"
touch "$site_dir/.nojekyll"

test -f "$site_dir/index.html"
test -f "$site_dir/docs/1.overview.html"
test -f "$site_dir/docs/2.lifecycle-management.html"
test -f "$site_dir/docs/3.buffer-management.html"
test -f "$site_dir/docs/4.concurrency-management.html"
test -f "$site_dir/docs/5.producer-consumer-backpressure.html"
test -f "$site_dir/docs/6.summary.html"
test -f "$site_dir/docs/backend-platform-self-introduction.html"
test -f "$site_dir/diagrams/servercore-site-style/fig-servercore-proxy-backpressure-example.svg"
