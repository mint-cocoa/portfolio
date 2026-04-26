#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

quarto render docs/index.qmd --to html
quarto render docs/server/ServerCorePortfolio.qmd --to html
quarto render docs/client/ClientPortfolio.qmd --to html
quarto render docs/devops/DevOpsPortfolio.qmd --to html
quarto render docs/devops/OpsDashboard.qmd --to dashboard
