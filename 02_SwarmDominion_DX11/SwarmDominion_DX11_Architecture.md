# SwarmDominion DX11 — 클라이언트 전체 구조 학습 문서

## 1. 프로젝트 개요

다중 에이전트 전쟁 시뮬레이션 클라이언트. 래퍼/프레임워크 없이 DirectX 11 API를 직접 호출하며, 모든 초기화와 렌더 루프가 `main.cpp` 한 파일에 있다.

```
SwarmDominion_DX11/
├── CMakeLists.txt
├── shaders/
│   ├── terrain.hlsl           # 지형 셰이더 (체크보드 + AOI 링)
│   ├── unit_instanced.hlsl    # 유닛 인스턴싱 셰이더 (StructuredBuffer)
│   └── particle.hlsl          # 파티클 빌보드 셰이더 (SV_VertexID)
├── proto/
│   └── battle.pb.h/cc         # Protobuf 메시지 정의 (서버와 공유)
├── src/
│   ├── main.cpp               # 진입점. 윈도우, DX11, 게임 루프 전부
│   ├── camera.h/cpp           # FPS 스타일 카메라 (WASD + 마우스)
│   ├── render/
│   │   ├── terrain_layer.h/cpp
│   │   ├── unit_layer.h/cpp
│   │   ├── particle_layer.h/cpp
│   │   └── hud_layer.h/cpp
│   ├── agent/
│   │   ├── agent_pool.h/cpp   # SoA 에이전트 데이터
│   │   └── behavior.h/cpp     # 상태 머신 AI
│   └── net/  
│       ├── network_thread.h/cpp
│       ├── connection_pool.h/cpp
│       ├── tcp_client.h/cpp
│       ├── packet_codec.h/cpp
│       ├── battle_protocol.h/cpp
│       ├── network_stats.h/cpp
│       └── net_types.h
```

---

## 2. main.cpp — 프로그램의 심장

### 2.1 초기화 순서

```
WinMain()
  ├── ParseCommandLine()         # --ip, --port, --faction, --count
  ├── RegisterClassEx + CreateWindow    # Win32 윈도우 생성
  ├── D3D11CreateDeviceAndSwapChain()   # ★ DX11 핵심 — 한 줄로 끝
  ├── GetBuffer → CreateRenderTargetView  # 백버퍼 → RTV
  ├── CreateTexture2D → CreateDepthStencilView  # 뎁스 버퍼
  ├── ImGui_ImplDX11_Init()      # ImGui DX11 백엔드
  ├── 기본 렌더 상태 생성        # defaultRS, defaultDSS
  ├── Camera.Init()
  ├── TerrainLayer.Init(device)
  ├── UnitLayer.Init(device, 5000)
  ├── ParticleLayer.Init(device, 2000)
  ├── AgentPool 초기화            # N개 에이전트 생성
  ├── NetworkThread 콜백 설정     # 접속 완료 시 C_JoinBattle 전송
  └── NetworkThread.Start()       # 백그라운드 네트워크 스레드 시작
```

### 2.2 메인 루프 (매 프레임)

```
while (msg.message != WM_QUIT)
  ├── PeekMessage → DispatchMessage   # Win32 메시지 처리
  ├── Delta Time 계산
  │
  ├── [1] DrainEvents()               # 네트워크 이벤트 수신 (더블 버퍼 swap)
  │   ├── BattleProtocol::Dispatch()   # 패킷 파싱 → AgentPool 업데이트
  │   ├── S_Move → Behavior::OnMoveReceived()  # 적 발견 시 상태 전이
  │   └── S_Death → ParticleLayer.SpawnBurst() # 사망 파티클
  │
  ├── [2] Space 키 → C_StartBattle    # 전투 시작 (모든 에이전트 조인 후)
  │
  ├── [3] Behavior::Update()          # AI 상태 머신 업데이트 + C_Move 전송
  │
  ├── [4] Camera.Update(dt)           # WASD 이동, 마우스 회전
  ├── [5] ParticleLayer.Update(dt)    # 중력, 수명 감소, dead 제거
  │
  ├── [6] ClearRenderTargetView + ClearDepthStencilView
  ├── [7] OMSetRenderTargets + RSSetViewports
  │
  ├── [8] TerrainLayer.Render()       # 지형 그리기
  ├── [9] UnitLayer.Update + Render() # 유닛 인스턴싱 (solid + ghost)
  ├── [10] ParticleLayer.Render()     # 파티클 빌보드
  │
  ├── [11] 렌더 상태 복원             # BlendState=null, DSS=default, RS=default
  │
  ├── [12] ImGui 프레임               # HUD + Debug 패널
  └── [13] SwapChain.Present(1, 0)    # VSync
```

### 2.3 종료 순서

```
1. NetworkThread.Stop()      # 네트워크 스레드 종료 (join)
2. ImGui_ImplDX11_Shutdown() # ImGui 정리
3. ctx->ClearState()         # 바인딩된 리소스 해제
4. ctx->Flush()              # GPU 명령 플러시
5. ComPtr 자동 Release       # RAII로 COM 객체 해제
```

---

## 3. DX11 초기화 — 핵심 개념

### 3.1 디바이스 + 스왑체인 생성

```cpp
D3D11CreateDeviceAndSwapChain(
    nullptr,                    // 기본 어댑터
    D3D_DRIVER_TYPE_HARDWARE,   // 하드웨어 가속
    nullptr,                    // 소프트웨어 래스터라이저 없음
    createFlags,                // _DEBUG 시 디버그 레이어
    &featureLevel, 1,           // Feature Level 11_0
    D3D11_SDK_VERSION,
    &scd,                       // 스왑체인 설정
    &swapChain,                 // [out] 스왑체인
    &device,                    // [out] 디바이스
    &obtainedLevel,             // [out] 실제 Feature Level
    &ctx                        // [out] 디바이스 컨텍스트
);
```

이 한 줄이 DX11의 핵심. DX12에서는 Device, Factory, CommandQueue, SwapChain을 각각 생성하고 연결해야 한다.

### 3.2 렌더 타겟 설정

```cpp
// 백버퍼 텍스처를 가져와서 RTV 생성
swapChain->GetBuffer(0, IID_PPV_ARGS(&backBuffer));
device->CreateRenderTargetView(backBuffer.Get(), nullptr, &rtv);

// 뎁스 텍스처 생성 + DSV 생성
D3D11_TEXTURE2D_DESC dsd = {};
dsd.Format = DXGI_FORMAT_D24_UNORM_S8_UINT;  // 24bit depth + 8bit stencil
dsd.BindFlags = D3D11_BIND_DEPTH_STENCIL;
device->CreateTexture2D(&dsd, nullptr, &depthTex);
device->CreateDepthStencilView(depthTex.Get(), nullptr, &dsv);
```

### 3.3 렌더 상태 객체

DX11은 상태를 **불변 객체**로 미리 생성하고, 렌더 시 교체한다.

| 상태 객체 | 용도 | 이 프로젝트에서 |
|-----------|------|----------------|
| `ID3D11RasterizerState` | 래스터라이저 설정 (컬링, 와이어프레임) | solid_rs (CULL_BACK), ghost_rs (WIREFRAME+CULL_NONE) |
| `ID3D11BlendState` | 블렌딩 설정 | alpha blend (유닛), additive blend (파티클) |
| `ID3D11DepthStencilState` | 깊이/스텐실 테스트 | depth write off (파티클만) |

**중요: 레이어 간 상태 복원**
각 레이어가 상태를 변경하므로, 다음 레이어 전에 기본 상태로 복원해야 한다.
```cpp
ctx->OMSetBlendState(nullptr, nullptr, 0xFFFFFFFF);  // 블렌드 off
ctx->OMSetDepthStencilState(defaultDSS.Get(), 0);     // depth write on
ctx->RSSetState(defaultRS.Get());                      // solid + cull back
```

---

## 4. 렌더 레이어 상세

### 4.1 TerrainLayer — 지형

**역할**: 200×200 유닛 크기의 체크보드 지형 + AOI 경계 링

**DX11 리소스**:
- `ID3D11Buffer` (VB) — `IMMUTABLE`, 21×21 = 441 정점
- `ID3D11Buffer` (IB) — `IMMUTABLE`, 20×20×6 = 2400 인덱스
- `ID3D11Buffer` (CB) — `DEFAULT`, 80바이트 (VP행렬 + AOI 파라미터)
- `ID3D11VertexShader` / `ID3D11PixelShader` — `terrain.hlsl`
- `ID3D11InputLayout` — POSITION(float3) + NORMAL(float3) + TEXCOORD(float2)

**렌더 흐름**:
```
1. UpdateSubresource(cb, constants)   # VP 행렬 + AOI 데이터 업로드
2. VSSetShader / PSSetShader          # 셰이더 바인드
3. VSSetConstantBuffers(0, cb)        # b0에 상수 버퍼 바인드
4. PSSetConstantBuffers(0, cb)        # PS에서도 같은 CB 사용 (AOI 링)
5. IASetInputLayout                   # 정점 레이아웃
6. IASetVertexBuffers / IASetIndexBuffer
7. IASetPrimitiveTopology(TRIANGLELIST)
8. DrawIndexed(2400, 0, 0)            # 단일 Draw Call
```

**셰이더 핵심** (`terrain.hlsl`):
- VS: 정점을 VP 행렬로 변환, worldPos를 PS에 전달
- PS: `floor(worldPos.xz / 10.0)`로 체크보드, `smoothstep`으로 AOI 링

### 4.2 UnitLayer — 유닛 인스턴싱

**역할**: 최대 5000 유닛을 병종별 3 draw call로 렌더링

**DX11 리소스**:
- `ID3D11Buffer` (VB×3) — `IMMUTABLE`, 구체/팔면체/원뿔 메시
- `ID3D11Buffer` (IB×3) — `IMMUTABLE`
- `ID3D11Buffer` (인스턴스×6) — `DYNAMIC` StructuredBuffer, solid 3 + ghost 3
- `ID3D11ShaderResourceView` (SRV×6) — 위 버퍼의 셰이더 뷰
- `ID3D11Buffer` (CB) — VP 행렬 + 카메라 위치
- `ID3D11RasterizerState` ×2 — solid, wireframe
- `ID3D11BlendState` — alpha blend

**인스턴싱 원리**:
```
CPU 측:
  gpu_data_[type].push_back({x, y, z, scale, r, g, b, a});  # 타입별로 분류
  Map(instance_buf, WRITE_DISCARD) → memcpy → Unmap          # GPU에 업로드

GPU 측 (셰이더):
  StructuredBuffer<Instance> instances : register(t0);
  Instance inst = instances[input.instanceID];                # SV_InstanceID로 인덱싱
  float3 worldPos = input.pos * inst.scale + inst.position;   # 메시 정점 변환
```

**렌더 흐름**:
```
공통 바인드: VS, PS, CB, InputLayout, Topology

Solid Pass (RSSetState → solid_rs):
  for type in [sphere, diamond, cone]:
    if gpu_data_[type] is empty: skip
    Map → memcpy → Unmap (인스턴스 데이터 업로드)
    VSSetShaderResources(0, instance_srv[type])
    IASetVertexBuffers + IASetIndexBuffer
    DrawIndexedInstanced(index_count, instance_count, ...)

Ghost Pass (RSSetState → ghost_rs):
    동일하되 ghost_buf/ghost_srv 사용, wireframe 래스터라이저
```

**버퍼 오버플로우 방지**:
```cpp
UINT count = (UINT)std::min(gpu_data_[t].size(), (size_t)max_units_);
```
인스턴스 수가 버퍼 크기를 초과하면 클램핑. 이것 없으면 크래시.

### 4.3 ParticleLayer — 빌보드 파티클

**역할**: 사망 이펙트 등의 파티클을 카메라 방향 빌보드로 렌더링

**DX11 리소스**:
- `ID3D11Buffer` (StructuredBuffer) — `DYNAMIC`, 최대 2000 파티클
- `ID3D11ShaderResourceView` — 위 버퍼의 SRV
- `ID3D11Buffer` (CB) — VP 행렬 + cameraRight + cameraUp
- `ID3D11BlendState` — **Additive** (SrcAlpha + One)
- `ID3D11DepthStencilState` — depth read only, **write off**
- `ID3D11RasterizerState` — CULL_NONE
- **InputLayout 없음** — `SV_VertexID`와 `SV_InstanceID`만 사용

**빌보드 원리** (`particle.hlsl`):
```hlsl
float2 offsets[4] = { {-0.5,-0.5}, {0.5,-0.5}, {-0.5,0.5}, {0.5,0.5} };
float2 off = offsets[input.vertexID] * p.scale;
float3 worldPos = p.position + cameraRight * off.x + cameraUp * off.y;
```
4개의 고정 오프셋으로 카메라를 향하는 사각형(쿼드)을 생성. 메시 버퍼가 필요 없다.

**렌더**:
```cpp
ctx->IASetInputLayout(nullptr);  // 입력 레이아웃 없음!
ctx->IASetPrimitiveTopology(TRIANGLESTRIP);
ctx->DrawInstanced(4, count, 0, 0);  // 4 정점 × N 인스턴스
```

**파티클 시뮬레이션** (CPU, 매 프레임):
```
position += velocity * dt
velocity.y -= 9.8 * dt        # 중력
life -= dt
if life <= 0: 제거
scale = original_size * (life / max_life)  # 수명에 따라 축소
alpha = life / max_life                     # 페이드 아웃
```

### 4.4 HudLayer — ImGui HUD

**역할**: ImGui로 3개 패널 렌더링. DX 호출 없음, 순수 ImGui API.

| 패널 | 내용 |
|------|------|
| Battle Status | FPS, 에이전트 수, 게임 페이즈, 팩션별 생존 수, 봇 슬라이더 |
| Selected Agent | 선택 에이전트의 ID, 타입, 상태, HP바, 사기, 가시 유닛 수 |
| Network Dashboard | 송수신 패킷/바이트, 120프레임 그래프 |

**ImGui DX11 통합**:
```cpp
// 초기화
ImGui::CreateContext();
ImGui_ImplWin32_Init(hwnd);
ImGui_ImplDX11_Init(device.Get(), ctx.Get());

// WndProc에 훅
ImGui_ImplWin32_WndProcHandler(hwnd, msg, wp, lp);

// 매 프레임
ImGui_ImplDX11_NewFrame();
ImGui_ImplWin32_NewFrame();
ImGui::NewFrame();
// ... ImGui 호출 ...
ImGui::Render();
ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());
```

---

## 5. 셰이더 (HLSL SM 5.0)

3개 셰이더 모두 `D3DCompileFromFile()`로 런타임 컴파일.

### 5.1 Constant Buffer 바인딩

DX11에서 상수 데이터를 셰이더에 전달하는 방법:

```cpp
// 1. 버퍼 생성 (Init 시 1회)
D3D11_BUFFER_DESC cbd = {};
cbd.ByteWidth = (sizeof(Constants) + 15) & ~15;  // 16바이트 정렬 필수!
cbd.Usage = D3D11_USAGE_DEFAULT;
cbd.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
device->CreateBuffer(&cbd, nullptr, &cb);

// 2. 데이터 업로드 (매 프레임)
ctx->UpdateSubresource(cb.Get(), 0, nullptr, &constants, 0, 0);

// 3. 셰이더에 바인드
ctx->VSSetConstantBuffers(0, 1, cb.GetAddressOf());  // register(b0)
ctx->PSSetConstantBuffers(0, 1, cb.GetAddressOf());   // VS, PS 모두 가능
```

### 5.2 StructuredBuffer 바인딩

인스턴스 데이터를 셰이더에 전달하는 방법:

```cpp
// 1. 버퍼 생성
D3D11_BUFFER_DESC bd = {};
bd.ByteWidth = sizeof(Instance) * maxCount;
bd.Usage = D3D11_USAGE_DYNAMIC;           // CPU에서 매 프레임 갱신
bd.BindFlags = D3D11_BIND_SHADER_RESOURCE;
bd.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
bd.MiscFlags = D3D11_RESOURCE_MISC_BUFFER_STRUCTURED;  // ★ 핵심 플래그
bd.StructureByteStride = sizeof(Instance);
device->CreateBuffer(&bd, nullptr, &buf);

// 2. SRV 생성
D3D11_SHADER_RESOURCE_VIEW_DESC srv_desc = {};
srv_desc.Format = DXGI_FORMAT_UNKNOWN;    // Structured이면 UNKNOWN
srv_desc.ViewDimension = D3D11_SRV_DIMENSION_BUFFER;
srv_desc.Buffer.NumElements = maxCount;
device->CreateShaderResourceView(buf.Get(), &srv_desc, &srv);

// 3. 데이터 업로드 (Map/Unmap)
D3D11_MAPPED_SUBRESOURCE mapped;
ctx->Map(buf.Get(), 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped);
memcpy(mapped.pData, data, count * sizeof(Instance));
ctx->Unmap(buf.Get(), 0);

// 4. 셰이더에 바인드
ctx->VSSetShaderResources(0, 1, srv.GetAddressOf());  // register(t0)
```

---

## 6. 에이전트 시스템

### 6.1 AgentPool — Structure of Arrays

```cpp
struct AgentPool {
    std::vector<uint32_t> unit_id;    // 서버가 부여한 ID
    std::vector<uint32_t> faction;     // 팩션 (0~7)
    std::vector<uint8_t>  unit_type;   // 0=INF, 1=ARC, 2=CAV
    std::vector<float> x, z;           // 위치
    std::vector<float> vx, vz;         // 속도
    std::vector<AgentState> state;     // Idle/Advance/Attack/Flee/Dead
    std::vector<float> hp_ratio;       // 0.0 ~ 1.0
    std::vector<int32_t> morale;       // 사기
    // ... 등등
    uint32_t count = 0;
};
```

**왜 SoA인가?**
같은 필드를 일괄 순회할 때 캐시 라인에 연속 데이터가 적재된다.
- `for (i) x[i] += vx[i] * dt;` → x[], vx[] 만 캐시에 올라옴
- AoS라면 Agent 구조체 전체가 캐시를 차지 (불필요한 필드 포함)

### 6.2 Behavior — 상태 머신

```
                    전투 개시
          Idle ──────────────► Advance
                                 │
                        적 발견 (AOI) │
                                 ▼
                              Attack
                             ╱      ╲
                    HP<20% ╱          ╲ 타겟 소실
                         ▼              ▼
                       Flee         Advance
                         │
                  HP>50% │
                         ▼
                      Advance
```

- **Advance**: 맵 중앙(100,100)을 향해 이동. 보병 5m/s, 기병 10m/s.
- **Attack**: 가장 가까운 적을 추적. 거리 2.0 이내면 `C_Attack` 전송.
- **Flee**: 스폰 지점으로 후퇴. HP 50% 회복 시 Advance로 복귀.
- **20Hz**: 50ms마다 `C_Move` 패킷을 서버에 전송.

---

## 7. 네트워킹

### 7.1 스레드 구조

```
[Main Thread]                    [Network Thread]
     │                                │
     │   Start(ip, port, count)       │
     │ ──────────────────────────►    │
     │                                ├── CreateConnections() (blocking)
     │                                │
     │                                │   loop:
     │                                │     Poll() (WSAPoll → recv)
     │                                │     패킷 파싱 → back_events_ 에 저장
     │                                │     tick_cb_(pool, dt)
     │                                │     sleep(1ms)
     │                                │
     │   DrainEvents(out)             │
     │ ──────────────────────────►    │
     │   (mutex lock)                 │
     │   out.swap(back_events_)       │
     │ ◄──────────────────────────    │
     │                                │
     │   events 순회 → Dispatch       │
     │   Behavior::Update → Send      │
```

**더블 버퍼링**: 네트워크 스레드가 `back_events_`에 쓰고, 메인 스레드가 `DrainEvents()`로 swap. lock 구간이 swap 한 번으로 최소화.

### 7.2 패킷 포맷

```
[total_size : uint16] [msg_id : uint16] [protobuf payload : N bytes]
```

- `total_size` = 4(헤더) + payload 길이
- `msg_id` = 메시지 종류 (C_JoinBattle=1, S_Move=103 등)
- Protobuf 3으로 직렬화된 payload

### 7.3 메시지 흐름

```
접속 시:
  Client → C_JoinBattle (faction, unit_type)
  Server → S_BattleInit (unit_id, spawn_pos)

전투 시작:
  Client → C_StartBattle
  Server → S_GameState (phase=2)

전투 중 (20Hz):
  Client → C_Move (x, z, vx, vz)
  Server → S_Move (AOI 내 유닛 목록)

전투:
  Client → C_Attack (target_id)
  Server → S_Damage (target_id, remaining_hp)
  Server → S_Death (unit_id)
```

---

## 8. 빌드 시스템

### 8.1 CMakeLists.txt

```cmake
target_link_libraries(SwarmDominion_DX11 PRIVATE
    d3d11 dxgi d3dcompiler dxguid   # DX11
    ws2_32                           # WinSock2 (네트워킹)
    imgui::imgui                     # ImGui (vcpkg)
    protobuf::libprotobuf            # Protobuf (vcpkg)
)
```

### 8.2 빌드 명령

```bash
cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=c:/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
```

### 8.3 실행

```bash
SwarmDominion_DX11.exe --faction 0 --count 50    # Red 50명
SwarmDominion_DX11.exe --faction 1 --count 100   # Blue 100명
SwarmDominion_DX11.exe --ip 192.168.1.10 --port 7778 --faction 2 --count 200
```

---

## 9. 주요 함정과 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| 유닛 많을 때 크래시 | `memcpy`가 StructuredBuffer 크기 초과 | `std::min(count, max_units_)`로 클램핑 |
| 파티클 뒤에 지형이 투명 | 파티클의 additive blend가 다음 레이어에 영향 | 레이어 사이에 `OMSetBlendState(nullptr)` |
| depth write off가 남아있음 | 파티클이 DepthStencilState를 변경 | 기본 DSS로 복원 |
| 종료 시 크래시 | 네트워크 스레드가 아직 실행 중인데 COM 해제 | Stop() → ImGui Shutdown → ClearState → Flush 순서 |
| 서버 없이 Behavior 크래시 | ConnectionPool이 비어있는데 Send 호출 | `IsRunning()` 체크 후 Update |
| Constant Buffer 크기 오류 | 16바이트 정렬 위반 | `(size + 15) & ~15` |
| SRV 리소스 해저드 | 이전 레이어의 SRV가 바인딩된 채 다음 Draw | `VSSetShaderResources(0, 1, &nullSRV)` |

---

## 10. 데이터 흐름 요약

```
서버 ──TCP──► NetworkThread ──DrainEvents──► Main Thread
                                                │
                                    BattleProtocol::Dispatch
                                                │
                                           AgentPool 갱신
                                         (위치, HP, 상태)
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                     Behavior::Update    UnitLayer::Update   HudLayer::Render
                     (상태 머신 AI)      (GPU 인스턴스 빌드)  (ImGui 패널)
                              │                 │
                              ▼                 ▼
                     C_Move/C_Attack      DrawIndexedInstanced
                     (서버에 전송)        (GPU 렌더링)
```
