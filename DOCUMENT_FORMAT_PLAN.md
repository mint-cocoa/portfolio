# Document format improvement plan

## Goal

Keep the public hub, deep portfolio documents, and implementation repositories in
separate roles while sharing one document format.

## Format rules

### Hub pages

- Use `page-layout: full`.
- Keep content shallow: document links, repository map, and high-level evidence.
- Avoid long implementation explanations.

### Portfolio documents

- Use `page-layout: article`, table of contents, numbered sections, and code copy.
- Start with `핵심 요약`.
- Use the same major section order where practical:
  - `핵심 요약`
  - `개요`
  - `문제 정의`
  - `전체 구조` or `아키텍처`
  - `핵심 구현`
  - `검증 결과`
  - `결과`
  - `회고`
  - `관련 레포`
  - `다음 문서`

### Wide evidence

- Use `.column-page` only for wide benchmark tables, architecture diagrams, or
  pipeline diagrams.
- Keep normal prose in the article body width.

## Current implementation

- `_quarto.yml` defines shared HTML defaults.
- `docs/portfolio.css` defines shared summary cards, document cards, evidence
  blocks, repository blocks, and next-document navigation.
- `docs/index.qmd` is the Quarto source for the document index.
- `docs/devops/DevOpsPortfolio.qmd` has been updated to the shared format.
- `scripts/render-docs.sh` renders the index and DevOps source.

## Remaining work

- Restore or recreate QMD sources for:
  - `docs/server/ServerCorePortfolio.html`
  - `docs/client/ClientPortfolio.html`
- Convert server and client documents to the shared section order.
- Add client screenshots or GIFs under `docs/client/assets/`.
- Apply `.column-page` to wide benchmark and architecture blocks after the QMD
  sources are available.
