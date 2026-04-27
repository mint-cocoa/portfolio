# 포트폴리오 문서 저장소

> 최종 정리일: 2026-04-27
> 3개 프로젝트의 포트폴리오 문서, 소스코드, 벤치마크 데이터를 프로젝트별로 분류

---

## 폴더 구조

```
포폴문서/
├── CMakeLists.txt             ← iouring_runtime_web(RuntimeWeb) 기반 정적 포트폴리오 서버 빌드
├── Dockerfile                 ← portfolio_site 컨테이너 이미지 빌드
├── scripts/render-devops.sh   ← DevOps QMD 문서 렌더 스크립트
├── src/                       ← C++ 포트폴리오 정적 파일 서버
├── docs/                      ← 공개 HTML/PDF/QMD 산출물
├── 01_ServerCore_v4/          ← io_uring 기반 게임 서버 프레임워크
├── 02_SwarmDominion_DX11/     ← DX12 SVO 렌더러 포트폴리오 (조사/설계)
├── 03_FactionClash_Client/    ← DX11 아이소메트릭 멀티플레이 던전 RPG 클라이언트
├── _plans/                    ← 구현 계획 문서 모음
├── _archive/                  ← 구버전/중복 파일 보관
└── README.md                  ← 이 파일
```

---

## 빌드와 배포

DevOps 포트폴리오 문서는 Quarto 소스에서 렌더링합니다.

```bash
./scripts/render-devops.sh
```

포트폴리오 사이트는 `iouring_runtime_web` 기반 C++ 서버로 `docs/`를 서빙합니다.
컨테이너 이미지는 `ghcr.io/mint-cocoa/portfolio:${GITHUB_SHA}`로 빌드되며,
GitHub Actions가 `home-k8s-gitops`의 `apps/portfolio/values.yaml` tag를 갱신합니다.

GitHub Pages는 `master:/docs`를 정적 미러로 서빙합니다.

- Pages: `https://mint-cocoa.github.io/portfolio/`
- Live C++ server path: `https://portfolio.mintcocoa.cc/`

로컬 컨테이너 확인:

```bash
docker build -t portfolio:local .
docker run --rm --security-opt seccomp=unconfined --ulimit memlock=-1:-1 \
  -p 3000:3000 portfolio:local
```

---

## 01. ServerCore v4 — io_uring 게임 서버 프레임워크

**경로**: `01_ServerCore_v4/`
**공개 저장소**
- `iouring-runtime`: https://github.com/mint-cocoa/iouring-runtime
- `libiouring-core`: https://github.com/mint-cocoa/libiouring-core (통합 이전 히스토리)
- `libiouringweb`: https://github.com/mint-cocoa/libiouringweb (통합 이전 히스토리)
- `multiplayer-dungeon-rpg-server`: https://github.com/mint-cocoa/multiplayer-dungeon-rpg-server (RuntimeGame 예제로 흡수된 서버 히스토리)
**기술 스택**: C++20, io_uring, Linux

### 핵심 파일

| 파일 | 설명 |
|------|------|
| `ServerCorePortfolio.qmd` | Quarto 소스 (Mermaid 다이어그램 6개 포함) |
| `ServerCorePortfolio.html` | 렌더링된 포트폴리오 (브라우저로 바로 열기) |
| `Benchmarks/v4-benchmark-report.md` | 전체 벤치마크 결과 원본 데이터 |

### 프로젝트 요약

io_uring 기반 비동기 I/O 서버 프레임워크와 그 위에 구현한 web/proxy/game 서버 포트폴리오입니다. 현재 main의 중심은 `iouring-runtime`이며, core `Runtime` 위에 `RuntimeWeb`, `RuntimeProxy`, `RuntimeGame`을 선택형 모듈로 분리했습니다. 기존 독립 게임 서버는 `examples/game/dungeon_full_server`가 `RuntimeGame`을 재사용하는 형태로 흡수했습니다.

**핵심 성과**:
- 전체 모듈 동시 빌드: `BUILD_WEB=ON`, `BUILD_PROXY=ON`, `BUILD_GAME=ON`, `BUILD_TESTS=ON`
- 테스트: core/web/proxy/game 총 24개 통과
- 게임 smoke: `dungeon_protocol_probe`로 로그인, 캐릭터, 룸 생성, scene ready, 채팅, 파티 업데이트 통과
- Echo 서버: 327K echo/s (100 클라이언트)
- 브로드캐스트: io_uring이 epoll 대비 p50 레이턴시 525배 개선
- Room 샤딩: 400봇 기준 epoll 대비 13,905배 개선
- Separated 아키텍처: 400봇 기준 3.1M msg/s 처리량

**주요 기술 포인트**: MSG_RING 크로스링 통신, 4-Phase 대칭형 이벤트 루프, 제로카피 브로드캐스트, MPSC 큐, 세션 수명관리(weak_ptr + keep_alive 패턴)

### 작업 이력 (세션 기반)

1. **ServerCore_v4_Portfolio.qmd 작성** — 코어 아키텍처 다이어그램 5개 (PNG → Mermaid 변환), 907줄로 10% 압축
2. **STAR 구조 재작성** — 6개 Episode 기반 문제해결 사례, 면접용 포트폴리오 (PORTFOLIO_STAR.md)
3. **벤치마크 통합** — v4-benchmark-report.md 원본 데이터를 포트폴리오에 반영, 8장 769줄
4. **시각적 HTML 포트폴리오** — 다크 테마, 히어로 헤더, stat 카드, 인터랙티브 다이어그램 (portfolio.html)
5. **PDF 포트폴리오** — 33페이지, 과거형 어조 통일, SVG 다이어그램 6개 포함
6. **Word 포트폴리오** — docx-js로 365 단락 생성, 유효성 검증 통과

---

## 02. SwarmDominion DX11 → DX12 SVO 렌더러

**경로**: `02_SwarmDominion_DX11/`
**기술 스택**: C++, DX12, HLSL, SVO (Sparse Voxel Octree)

### 핵심 파일

| 파일 | 설명 |
|------|------|
| `SwarmDominion_DX11_Architecture.md` | 아키텍처 설계 문서 |
| `SwarmDominion_DX11_Graphics.md` | 그래픽스 파이프라인 문서 |

### 프로젝트 요약

DX11 기존 프로젝트를 DX12 + SVO 레이마칭 렌더러로 확장하기 위한 조사 및 설계 프로젝트.

**레퍼런스 분석 (우선순위 순)**:
1. **AdamYuan/SparseVoxelOctree** (1순위) — GPU voxelization → SVO build → raymarch/path trace 전체 파이프라인
2. **voxel-rs** (2순위) — 무한 복셀 지형, chunk 관리, LoD, 이벤트 기반 load/unload
3. **unity-svo-demo** (보조) — 실시간 편집 UX, dirty flag, rebuild trigger
4. **voxel-raycaster** (보조) — Blinn-Phong shading, shadow ray, texture atlas

**포트폴리오 구현 4대 포인트**:
- GPU voxelization / GPU build 파이프라인
- 선형 SVO 버퍼 인코딩 + traversal shader
- Chunk dirty update + 부분 재빌드
- Debug view, picking, shadow/secondary ray

**상용 사례 조사**: Teardown (3D 텍스처 Mipmap 레이마칭), Atomontage (SVDAG, ~0.77bit/voxel), CryEngine SVOGI

### 작업 이력

1. **레퍼런스 분석** — GitHub 레포 6개 + 상용 엔진 3종 + 학술 논문(arXiv 1911.06001) 조사
2. **조사 보고서 작성** — docx + md 형태로 SVO 레이마칭 구현사례 종합 보고서
3. **DX12 구현 계획** — 아키텍처/그래픽스 설계 문서 작성

---

## 03. Isometric Client — DX11 아이소메트릭 멀티플레이 던전 RPG

**경로**: `03_FactionClash_Client/`
**소스 코드**: `C:\Users\kasd0\isometric_client` (Windows)
**기술 스택**: C++, DirectX 11, Protobuf 3, Dear ImGui, WinSock2

### 핵심 파일

| 파일 | 설명 |
|------|------|
| `ClientPortfolio.qmd` | 클라이언트 포트폴리오 Quarto 소스 (Mermaid 다이어그램 8개 포함) |
| `ClientPortfolio.html` | 렌더링된 포트폴리오 (브라우저로 바로 열기) |

### 프로젝트 요약

`libiouring-core` 기반 `multiplayer-dungeon-rpg-server`와 연동되는 DX11 아이소메트릭 멀티플레이 던전 RPG 클라이언트입니다. 래퍼 프레임워크 없이 DirectX 11 API를 직접 호출하며, 인스턴스드 던전 렌더링, 프로시저럴 이펙트 셰이더, 비동기 TCP 네트워킹을 구현했습니다.

**소스 구성** (~6,200줄 C++, 316줄 HLSL):
- `Core/` — App, DX11Device, EngineContext, Input, Timer, WinMain
- `Renderer/` — Pipeline, Camera, MeshCache, MaterialManager, InstanceRenderer, EffectRenderer, MinimapRenderer, ObjLoader, TextureLoader
- `Network/` — TcpClient (WSAAsyncSelect), PacketFramer, PacketHandler, PacketBuilder, NetworkContext
- `Game/` — PlayerController, EntityManager, CombatManager, DungeonGenerator, SessionState
- `Scene/` — LoginScene, CharSelectScene, LobbyScene, GameScene (4단계 씬 흐름)
- `Data/` — PlayerData, SkillData, InventoryData, CurrencyData, ChatHistory

**주요 기술 포인트**: StructuredBuffer 인스턴싱 (듀얼 버퍼), 5종 프로시저럴 이펙트 셰이더, 59종 패킷 프로토콜 (26종 핸들러), 패킷 버퍼링 기반 씬 전환 안정성, 아이소메트릭 카메라 수학, 축 분리 벽 슬라이딩, 결정론적 해시 던전 변형

---

## _plans/ — 구현 계획 문서

| 파일 | 날짜 | 내용 |
|------|------|------|
| `2026-03-18-portfolio-web-design.md` | 03-18 | 웹 포트폴리오 디자인 기획 |
| `2026-03-18-portfolio-web-impl.md` | 03-18 | 웹 포트폴리오 구현 계획 |
| `2026-03-21-dx12-faction-clash-impl.md` | 03-21 | DX12 FactionClash 구현 계획 |
| `2026-03-27-client-portfolio-update-plan.md` | 03-27 | 클라이언트 포트폴리오 업데이트 계획 |

---

## _archive/ — 보관용 (구버전/중복)

| 폴더/파일 | 보관 사유 |
|-----------|-----------|
| `Exports/` | Word/HTML/PDF 구버전 4종 (ServerCore_v4_Combined 등) |
| `Source/` | PORTFOLIO.md, ServerCore_v4_Portfolio.qmd/md/html 구버전 |
| `images/` | PNG 아키텍처 이미지 5장 (Mermaid로 대체됨) |
| `VisualWebPortfolio/` | 미완성 Node.js 프로젝트 (package.json만 존재) |
| `FactionClash/` | 03_FactionClash_Client로 이동 후 남은 원본 |
| `C/` | 잘못 생성된 경로 아티팩트 (battle.proto 1개만 포함) |

_archive 내 파일은 삭제해도 무방하나, 혹시 필요할 수 있어 보관 중입니다.
