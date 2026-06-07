const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const contentRoot = path.join(repoRoot, "content");
const sourceDocsDir = path.join(contentRoot, "docs");
const sourceDiagramsDir = path.join(contentRoot, "diagrams");
const sourceDownloadsDir = path.join(contentRoot, "downloads");
const sourceCssPath = path.join(contentRoot, "portfolio.css");
const buildDir = path.join(repoRoot, "generated-quarto");
const buildDocsDir = path.join(buildDir, "docs");
const buildDiagramsDir = path.join(buildDir, "diagrams");
const buildDownloadsDir = path.join(buildDir, "downloads");
const quartoOutputDir = process.env.QUARTO_OUTPUT_DIR || "../docs";

const chapterSummaries = new Map([
  ["1.overview.md", "io_uring 기반 Core가 소켓, CQE, Session을 어떻게 하나의 실행 모델로 묶는지 정리합니다."],
  ["2.lifecycle-management.md", "SessionManager, IoEvent, pending_io_, SessionState가 각각 어느 생존 범위를 판단하는지 분리합니다."],
  ["3.buffer-management.md", "수신 fast/slow path와 송신 순서 보장, 부분 송신 복구를 설명합니다."],
  ["4.concurrency-management.md", "Room 상태 순서, WorkerOutbox, Session owner ring이 서로 다른 순서를 보장하는 이유를 다룹니다."],
  ["5.producer-consumer-backpressure.md", "SendQueue, Proxy, Paused recv, HTTP streaming에서 느린 소비자 앞의 생산 위치를 조절합니다."],
  ["6.summary.md", "Web/Proxy/Game 모듈과 검증 결과를 통해 Core 불변식이 유지되는지 확인합니다."],
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function titleFromMarkdown(markdown, fallback) {
  const heading = markdown.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);
  if (!heading) {
    return fallback.replace(/^\d+\./, "").replace(/[-_]/g, " ");
  }
  return heading[1].replace(/\s+\{#[^}]+\}\s*$/, "");
}

function outputStem(file) {
  return path.basename(file, path.extname(file));
}

function normalizeMarkdownForQmd(markdown) {
  return markdown.replace(/^---\s*$/gm, "***");
}

function convertObsidianEmbeds(markdown) {
  return markdown.replace(/!\[\[([^\]]+)\]\]/g, (_, rawTarget) => {
    const [rawPath, rawWidth] = rawTarget.split("|").map((part) => part.trim());
    const normalized = rawPath.replace(/\\/g, "/");
    const basename = path.basename(normalized, path.extname(normalized));
    const alt = basename.replace(/[-_]/g, " ");
    const relative = normalized.startsWith("diagrams/")
      ? `../${normalized}`
      : normalized;

    if (rawWidth && /^\d+$/.test(rawWidth)) {
      return `![${alt}](${relative}){width="${rawWidth}px"}`;
    }
    return `![${alt}](${relative})`;
  });
}

function frontMatter(title, order, description) {
  return [
    "---",
    `title: ${yamlString(title)}`,
    `order: ${order}`,
    `description: ${yamlString(description)}`,
    "---",
    "",
  ].join("\n");
}

function buildIndex() {
  return `---
title: "서버 런타임 구현 포트폴리오"
subtitle: "io_uring 기반 프로토콜 독립 전송 런타임 설계와 구현"
order: 0
listing:
  id: document-listing
  contents: "docs/*.qmd"
  type: table
  sort: "order"
  fields: [title, description]
  field-links: [title]
  table-hover: true
  filter-ui: [title, description]
  sort-ui: false
  page-size: 20
  field-display-names:
    title: "문서"
    description: "내용"
---

## 문서 구성

Obsidian Vault의 Markdown 원본을 GitHub Actions에서 Quarto 문서로 렌더링한 각 장입니다.

::: {#document-listing}
:::

::: {.repo-links}
| 항목 | 링크 |
| --- | --- |
| 구현 저장소 | [iouring-runtime](https://github.com/mint-cocoa/iouring-runtime) |
| 공개 문서 기준 URL | [mint-cocoa.github.io/portfolio/](https://mint-cocoa.github.io/portfolio/) |
| 인쇄용 PDF | [ServerCore-Portfolio-chromium.pdf](downloads/ServerCore-Portfolio-chromium.pdf) |
:::
`;
}

function main() {
  if (!fs.existsSync(sourceDocsDir)) {
    throw new Error(`Source docs directory not found: ${sourceDocsDir}`);
  }

  removeDir(buildDir);
  ensureDir(buildDocsDir);
  copyDir(sourceDiagramsDir, buildDiagramsDir);
  copyDir(sourceDownloadsDir, buildDownloadsDir);
  fs.copyFileSync(sourceCssPath, path.join(buildDir, "portfolio.css"));

  const files = fs
    .readdirSync(sourceDocsDir)
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const chapters = files.map((file) => {
    const sourcePath = path.join(sourceDocsDir, file);
    const markdown = fs.readFileSync(sourcePath, "utf8").trimStart();
    const stem = outputStem(file);
    const title = titleFromMarkdown(markdown, stem);
    const description = chapterSummaries.get(file) || "";
    return { file, sourcePath, markdown, stem, title, description };
  });

  chapters.forEach((chapter, index) => {
    const body = convertObsidianEmbeds(normalizeMarkdownForQmd(chapter.markdown));
    const qmd = `${frontMatter(chapter.title, index + 1, chapter.description)}${body}\n`;
    fs.writeFileSync(path.join(buildDocsDir, `${chapter.stem}.qmd`), qmd, "utf8");
  });

  fs.writeFileSync(path.join(buildDir, "index.qmd"), buildIndex(), "utf8");
  fs.writeFileSync(
    path.join(buildDir, "_quarto.yml"),
    `project:
  type: website
  output-dir: ${quartoOutputDir}
  resources:
    - diagrams/
    - downloads/

website:
  title: "서버 런타임 구현 포트폴리오"
  page-navigation: true
  navbar:
    left:
      - text: "문서"
        href: index.qmd
  sidebar:
    contents: auto

format:
  html:
    lang: ko
    theme: cosmo
    toc: true
    toc-depth: 3
    number-sections: true
    code-copy: true
    code-fold: false
    link-external-newwindow: true
    page-layout: article
    css: portfolio.css
    code-overflow: wrap
    highlight-style: github
    fontsize: 1em
    linestretch: 1.6
    grid:
      body-width: 900px
      margin-width: 280px
      gutter-width: 1.5rem
`,
    "utf8",
  );

  console.log(`Prepared ${chapters.length} documents in ${path.relative(repoRoot, buildDir)}`);
}

main();
