#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site_dir="$repo_root/_site"

rm -rf "$site_dir"
mkdir -p "$site_dir"

cp -a "$repo_root/docs/." "$site_dir/"
touch "$site_dir/.nojekyll"

test -f "$site_dir/index.html"
test -f "$site_dir/server/ServerCorePortfolio.html"
test -f "$site_dir/client/ClientPortfolio.html"
test -f "$site_dir/devops/DevOpsPortfolio.html"
test -f "$site_dir/devops/OpsDashboard.html"
