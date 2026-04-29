#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find "$repo_root/docs/devops/assets" -maxdepth 1 -type f \( \
  -name 'DevOpsPortfolio*.js' -o \
  -name 'OpsDashboard*.js' -o \
  -name 'api*.js' -o \
  -name 'api*.css' \
\) -delete

cd "$repo_root/dashboard"
npm run build
