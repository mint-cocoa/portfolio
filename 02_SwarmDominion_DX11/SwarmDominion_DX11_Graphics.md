# SwarmDominion DX11 — 그래픽스 파이프라인 상세 학습 문서

---

## 1. DX11 그래픽스 파이프라인 전체 흐름

하나의 프레임이 화면에 나타나기까지의 전체 경로:

```
                        CPU 측                                    GPU 측
┌──────────────────────────────────────┐    ┌──────────────────────────────────┐
│  main.cpp 메인 루프                   │    │                                  │
│                                      │    │  Input Assembler (IA)            │
│  1. ClearRenderTargetView            │    │    ↓ 정점 데이터 조립             │
│  2. ClearDepthStencilView            │    │  Vertex Shader (VS)              │
│  3. OMSetRenderTargets(rtv, dsv)     │    │    ↓ 정점 변환 + 인스턴싱         │
│  4. RSSetViewports                   │    │  Rasterizer (RS)                 │
│  5. 각 레이어 Render() 호출           │──►│    ↓ 삼각형 → 프래그먼트          │
│  6. ImGui Render                     │    │  Pixel Shader (PS)               │
│  7. Present(1, 0)                    │    │    ↓ 색상 계산                    │
│                                      │    │  Output Merger (OM)              │
│                                      │    │    ↓ 블렌딩 + 깊이 테스트         │
│                                      │    │  ← 백버퍼에 기록                 │
└──────────────────────────────────────┘    └──────────────────────────────────┘
                                                       ↓
                                              SwapChain.Present()
                                                       ↓
                                                   화면 출력
```

---

## 2. DX11 디바이스 초기화 상세

### 2.1 핵심 COM 객체 3개

```
ID3D11Device          → GPU 리소스 생성 (버퍼, 텍스처, 셰이더, 상태 객체)
ID3D11DeviceContext   → GPU 명령 발행 (Draw, 상태 바인드, 리소스 업데이트)
IDXGISwapChain        → 프론트/백버퍼 관리, Present로 화면 갱신
```

DX11에서는 `D3D11CreateDeviceAndSwapChain()` 한 호출로 세 객체가 동시에 생성된다.

### 2.2 스왑체인 설정

```cpp
DXGI_SWAP_CHAIN_DESC scd = {};
scd.BufferCount  = 2;                        // 더블 버퍼링
scd.BufferDesc.Width  = 1280;
scd.BufferDesc.Height = 720;
scd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;  // 32비트 RGBA
scd.BufferUsage  = DXGI_USAGE_RENDER_TARGET_OUTPUT;
scd.SampleDesc.Count = 1;                   // MSAA 없음
scd.Windowed     = TRUE;
scd.SwapEffect   = DXGI_SWAP_EFFECT_FLIP_DISCARD;    // Windows 10+ 권장
```

**FLIP_DISCARD vs DISCARD**:
- `FLIP_DISCARD`는 DXGI가 프레젠테이션을 최적화 (DWM과 직접 공유)
- `DISCARD`는 레거시, 매 Present마다 백버퍼 내용이 undefined

### 2.3 렌더 타겟 체인

```
SwapChain
  └── GetBuffer(0) → ID3D11Texture2D (백버퍼)
        └── CreateRenderTargetView() → ID3D11RenderTargetView (RTV)

CreateTexture2D(D24_UNORM_S8_UINT) → ID3D11Texture2D (뎁스 텍스처)
  └── CreateDepthStencilView() → ID3D11DepthStencilView (DSV)
```

매 프레임:
```cpp
ctx->OMSetRenderTargets(1, &rtv, dsv);  // "이 RTV와 DSV에 그려라"
ctx->ClearRenderTargetView(rtv, color); // 백버퍼 클리어
ctx->ClearDepthStencilView(dsv, ...);   // 뎁스 버퍼 1.0으로 클리어
```

### 2.4 뷰포트

```cpp
D3D11_VIEWPORT vp = {};
vp.Width    = 1280.0f;   // 렌더링 영역 너비 (픽셀)
vp.Height   = 720.0f;    // 렌더링 영역 높이
vp.MinDepth = 0.0f;      // NDC z=0 → 뎁스 0.0
vp.MaxDepth = 1.0f;      // NDC z=1 → 뎁스 1.0
```

뷰포트는 NDC(-1~+1) 좌표를 화면 픽셀 좌표로 매핑한다. 래스터라이저 단계에서 적용.

---

## 3. GPU 리소스 타입별 상세

### 3.1 버퍼 Usage 비교

| Usage | CPU Read | CPU Write | GPU Read | GPU Write | 용도 |
|-------|----------|-----------|----------|-----------|------|
| `IMMUTABLE` | X | X | O | X | 메시 VB/IB — 한 번 만들고 변경 없음 |
| `DEFAULT` | X | X | O | O | Constant Buffer — `UpdateSubresource()`로 갱신 |
| `DYNAMIC` | X | O | O | X | Instance Buffer — `Map/Unmap`으로 매 프레임 갱신 |
| `STAGING` | O | O | X | X | (이 프로젝트에서 미사용) |

### 3.2 버퍼 생성 패턴

**정적 메시 (IMMUTABLE)**:
```cpp
D3D11_BUFFER_DESC vbd = {};
vbd.ByteWidth = vertexCount * sizeof(Vertex);
vbd.Usage     = D3D11_USAGE_IMMUTABLE;     // GPU 전용, 변경 불가
vbd.BindFlags = D3D11_BIND_VERTEX_BUFFER;
D3D11_SUBRESOURCE_DATA init = { vertexData };  // 생성 시 데이터 필수
device->CreateBuffer(&vbd, &init, &vb);
```

**상수 버퍼 (DEFAULT)**:
```cpp
D3D11_BUFFER_DESC cbd = {};
cbd.ByteWidth = (sizeof(Constants) + 15) & ~15;  // ★ 16바이트 정렬 필수
cbd.Usage     = D3D11_USAGE_DEFAULT;
cbd.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
device->CreateBuffer(&cbd, nullptr, &cb);       // 초기 데이터 없이 생성

// 매 프레임 업데이트
ctx->UpdateSubresource(cb, 0, nullptr, &data, 0, 0);  // GPU에 전체 복사
```

**동적 인스턴스 버퍼 (DYNAMIC + STRUCTURED)**:
```cpp
D3D11_BUFFER_DESC bd = {};
bd.ByteWidth          = sizeof(Instance) * maxCount;
bd.Usage              = D3D11_USAGE_DYNAMIC;
bd.BindFlags          = D3D11_BIND_SHADER_RESOURCE;       // SRV로 바인딩
bd.CPUAccessFlags     = D3D11_CPU_ACCESS_WRITE;
bd.MiscFlags          = D3D11_RESOURCE_MISC_BUFFER_STRUCTURED;  // ★ Structured 플래그
bd.StructureByteStride = sizeof(Instance);                 // 원소 크기
device->CreateBuffer(&bd, nullptr, &buf);

// SRV 생성 (셰이더에서 StructuredBuffer<T>로 접근)
D3D11_SHADER_RESOURCE_VIEW_DESC srv = {};
srv.Format              = DXGI_FORMAT_UNKNOWN;  // Structured이면 항상 UNKNOWN
srv.ViewDimension       = D3D11_SRV_DIMENSION_BUFFER;
srv.Buffer.NumElements  = maxCount;
device->CreateShaderResourceView(buf, &srv, &srvView);

// 매 프레임 업데이트 (Map/Unmap)
D3D11_MAPPED_SUBRESOURCE mapped;
ctx->Map(buf, 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped);
//                      ^^^^^^^^^^^^^ 이전 내용 버리고 새로 쓰기
memcpy(mapped.pData, data, count * sizeof(Instance));
ctx->Unmap(buf, 0);
```

**UpdateSubresource vs Map/Unmap**:
- `UpdateSubresource`: DEFAULT 버퍼용. 드라이버가 내부적으로 복사 타이밍 결정.
- `Map(WRITE_DISCARD)`: DYNAMIC 버퍼용. CPU가 GPU 메모리에 직접 쓴다. 이전 프레임의 데이터를 기다리지 않고 새 메모리 블록을 할당(rename)해서 stall 없음.

### 3.3 16바이트 정렬 규칙

HLSL의 `cbuffer`는 각 멤버가 16바이트 경계를 넘지 않아야 한다.

```
float4x4 viewProj;    // 64 bytes (16 × 4)
float3   cameraPos;   // 12 bytes
float    _pad;         // 4 bytes  ← 패딩으로 16바이트 맞춤
```

C++ 구조체도 이에 맞춰야 한다:
```cpp
struct CB {
    XMFLOAT4X4 vp;        // 64B
    XMFLOAT3 camera_pos;  // 12B
    float pad;             // 4B  → 총 80B (16의 배수)
};
```

버퍼 크기도 16의 배수여야 한다: `(size + 15) & ~15`

---

## 4. 렌더 상태 객체 (State Objects)

DX11에서 파이프라인 상태는 **불변 객체**로 미리 생성하고, 렌더 시 `context->XXSetState()`로 교체한다.

### 4.1 Rasterizer State

래스터라이저가 삼각형을 프래그먼트로 변환할 때의 규칙.

```cpp
D3D11_RASTERIZER_DESC rd = {};
rd.FillMode = D3D11_FILL_SOLID;       // SOLID or WIREFRAME
rd.CullMode = D3D11_CULL_BACK;        // NONE, FRONT, BACK
rd.FrontCounterClockwise = FALSE;      // CW = front face
rd.DepthClipEnable = TRUE;             // near/far 클리핑
device->CreateRasterizerState(&rd, &rs);

ctx->RSSetState(rs);  // 바인드
```

이 프로젝트의 래스터라이저 상태:

| 이름 | FillMode | CullMode | 용도 |
|------|----------|----------|------|
| `solid_rs` | SOLID | BACK | 일반 유닛 렌더링 |
| `ghost_rs` | WIREFRAME | NONE | AOI 밖 유닛 (와이어프레임) |
| `particle_rs` | SOLID | NONE | 빌보드 파티클 (양면) |
| `defaultRS` | SOLID | BACK | 레이어 간 복원용 |

### 4.2 Blend State

Output Merger에서 셰이더 출력과 기존 렌더 타겟 값을 합치는 규칙.

**알파 블렌딩** (UnitLayer):
```
최종색 = Src.rgb × SrcAlpha + Dest.rgb × (1 - SrcAlpha)
```
```cpp
bld.SrcBlend  = D3D11_BLEND_SRC_ALPHA;
bld.DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
```
반투명 유닛(ghost)의 alpha=0.3이면, 유닛 색상 30% + 배경 색상 70%.

**Additive 블렌딩** (ParticleLayer):
```
최종색 = Src.rgb × SrcAlpha + Dest.rgb × 1
```
```cpp
bld.SrcBlend  = D3D11_BLEND_SRC_ALPHA;
bld.DestBlend = D3D11_BLEND_ONE;
```
파티클 색상이 배경에 **더해진다**. 밝게 빛나는 효과. 여러 파티클이 겹치면 점점 밝아짐.

### 4.3 Depth-Stencil State

깊이 테스트와 쓰기를 제어한다.

| 레이어 | DepthEnable | DepthWriteMask | 이유 |
|--------|-------------|----------------|------|
| Terrain | TRUE (기본값) | ALL (기본값) | 지형은 가장 먼저 그려지므로 깊이 채워야 함 |
| Unit | TRUE | ALL | 유닛끼리 깊이 정렬 필요 |
| Particle | TRUE | **ZERO** | 파티클은 깊이 읽기만 (뒤에 있으면 가려짐), 쓰기 안 함 |

파티클이 depth write를 하면? 반투명 파티클 뒤의 다른 파티클이 가려져서 깜빡임 발생.

```cpp
D3D11_DEPTH_STENCIL_DESC dsd = {};
dsd.DepthEnable    = TRUE;
dsd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ZERO;  // 읽기만
dsd.DepthFunc      = D3D11_COMPARISON_LESS;
```

### 4.4 레이어 간 상태 복원 문제

DX11은 **전역 상태 머신**이다. 한 레이어가 상태를 바꾸면 다음 레이어에 영향.

```
렌더 순서:
  TerrainLayer  → 기본 상태 (blend off, depth write on, cull back)
  UnitLayer     → BlendState 변경 (alpha blend on), RSState 변경 (ghost=wireframe)
  ParticleLayer → BlendState 변경 (additive), DSState 변경 (depth write off), RS 변경 (cull none)
  ImGui         → 자체 상태 관리 (자동 복원)
```

ParticleLayer가 끝난 후 복원하지 않으면:
- ImGui가 additive blend로 그려짐 → 글자가 밝게 번짐
- 다음 프레임의 Terrain이 depth write off → 깊이 버퍼 안 채워짐 → 유닛이 지형 뒤에서도 보임

**해결**:
```cpp
// 파티클 렌더 후
ctx->OMSetBlendState(nullptr, nullptr, 0xFFFFFFFF);   // nullptr = 기본 (blend off)
ctx->OMSetDepthStencilState(defaultDSS.Get(), 0);     // depth write on
ctx->RSSetState(defaultRS.Get());                      // solid + cull back
ID3D11ShaderResourceView* nullSRV = nullptr;
ctx->VSSetShaderResources(0, 1, &nullSRV);             // SRV 해제 (리소스 해저드 방지)
```

---

## 5. 셰이더 파이프라인 상세

### 5.1 셰이더 컴파일

```cpp
ComPtr<ID3DBlob> vs_blob, ps_blob, errors;
D3DCompileFromFile(
    L"shaders/terrain.hlsl",  // 파일 경로
    nullptr,                   // 매크로 정의 없음
    nullptr,                   // include 핸들러 없음
    "VSMain",                  // 진입점 함수 이름
    "vs_5_0",                  // 타겟 프로필 (Shader Model 5.0)
    0,                         // 컴파일 플래그
    0,                         // 이펙트 플래그
    &vs_blob,                  // [out] 컴파일된 바이트코드
    &errors                    // [out] 에러 메시지
);

device->CreateVertexShader(
    vs_blob->GetBufferPointer(),  // 바이트코드
    vs_blob->GetBufferSize(),     // 크기
    nullptr,                       // class linkage (미사용)
    &vs_                           // [out] 셰이더 객체
);
```

**vs_blob**은 컴파일된 DXBC(DirectX Bytecode). Input Layout 생성에도 사용된다 (셰이더 시그니처 검증).

### 5.2 Input Layout — 정점 데이터 해석 규칙

GPU가 정점 버퍼의 바이트를 어떻게 해석할지 정의한다.

**TerrainLayer** (32바이트/정점):
```
Offset 0:  POSITION  float3  (12B)   ─┐
Offset 12: NORMAL    float3  (12B)    ├── 연속된 메모리
Offset 24: TEXCOORD  float2  (8B)    ─┘
```
```cpp
D3D11_INPUT_ELEMENT_DESC layout[] = {
    {"POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0,  0, D3D11_INPUT_PER_VERTEX_DATA, 0},
    {"NORMAL",   0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0},
    {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT,    0, 24, D3D11_INPUT_PER_VERTEX_DATA, 0},
};
//             시맨틱    포맷                    슬롯 오프셋   분류                     인스턴스
```

**UnitLayer** (24바이트/정점):
```
Offset 0:  POSITION  float3  (12B)
Offset 12: NORMAL    float3  (12B)
```

**ParticleLayer** — Input Layout **없음**:
```cpp
ctx->IASetInputLayout(nullptr);
```
셰이더가 `SV_VertexID`와 `SV_InstanceID`만 사용하므로 정점 버퍼 자체가 필요 없다.

### 5.3 terrain.hlsl — 체크보드 + AOI 링

```
cbuffer (b0): viewProj(4x4) + selectedPos(float2) + aoiRadius(float) + enabled(float)

VS: 정점 위치를 viewProj로 변환, worldPos를 PS에 전달
PS: worldPos로 체크보드 + AOI 링 계산
```

**체크보드 패턴 원리**:
```hlsl
float2 grid = floor(worldPos.xz / 10.0);    // 10 유닛 격자로 나눔
float checker = fmod(grid.x + grid.y, 2.0);  // 짝수=0, 홀수=1
float3 baseColor = lerp(darkGreen, lightGreen, checker);
```
`grid.x + grid.y`가 짝수면 어두운 초록, 홀수면 밝은 초록.

**AOI 링 원리**:
```hlsl
float dist = length(worldPos.xz - selectedPos);
float ratio = dist / aoiRadius;
// ratio가 0.95~1.03 범위에서만 링이 보임
float ring = smoothstep(0.95, 0.98, ratio) * smoothstep(1.03, 1.0, ratio);
finalColor += float3(0.2, 0.9, 0.5) * ring * 0.6;
```
`smoothstep`으로 부드러운 경계. 두 smoothstep의 곱이 얇은 밴드를 만든다.

### 5.4 unit_instanced.hlsl — StructuredBuffer 인스턴싱

```
cbuffer (b0): viewProj(4x4) + cameraPos(float3) + pad(float)
StructuredBuffer<Instance> (t0): position(float3) + scale(float) + color(float4)

VS: 메시 정점 × scale + position → viewProj 변환
PS: Directional light × instance color
```

**인스턴싱 핵심**:
```hlsl
Instance inst = instances[input.instanceID];    // SV_InstanceID로 인덱싱
float3 worldPos = input.pos * inst.scale + inst.position;  // 로컬 → 월드
```

GPU가 `DrawIndexedInstanced(indexCount, instanceCount, ...)`를 호출하면:
- 같은 메시를 `instanceCount`번 반복
- 각 반복마다 `SV_InstanceID`가 0, 1, 2, ... 증가
- StructuredBuffer에서 해당 인스턴스의 위치/색상을 가져옴

**라이팅**:
```hlsl
float3 lightDir = normalize(float3(0.5, 1.0, 0.3));  // 고정 방향광
float NdotL = max(dot(normalize(normal), lightDir), 0.3);  // 최소 30% ambient
return float4(color.rgb * NdotL, color.a);
```

### 5.5 particle.hlsl — 빌보드 쿼드 생성

```
cbuffer (b0): viewProj(4x4) + cameraRight(float3) + pad + cameraUp(float3) + pad
StructuredBuffer<ParticleInst> (t0): position(float3) + scale(float) + color(float4)

VS: SV_VertexID로 쿼드 4정점 생성, camera 벡터로 빌보드 배치
PS: UV 기반 소프트 원 + alpha fadeout
```

**정점 없이 쿼드 만들기**:
```hlsl
float2 offsets[4] = {
    float2(-0.5, -0.5),  // 좌하
    float2( 0.5, -0.5),  // 우하
    float2(-0.5,  0.5),  // 좌상
    float2( 0.5,  0.5)   // 우상
};

float2 off = offsets[input.vertexID] * p.scale;
float3 worldPos = p.position + cameraRight * off.x + cameraUp * off.y;
```

`SV_VertexID`가 0~3이므로 4개의 정점이 생성된다. `TRIANGLESTRIP`으로 2개 삼각형 = 1 쿼드.

**카메라 방향 빌보드**: `cameraRight`와 `cameraUp` 벡터를 기준으로 오프셋하면, 쿼드가 항상 카메라를 정면으로 향한다.

**소프트 원**:
```hlsl
float dist = length(uv - 0.5) * 2.0;     // 중심에서의 거리 (0~1)
float alpha = saturate(1.0 - dist) * color.a;  // 원 바깥은 투명
```

---

## 6. 프로시저럴 메시 생성

### 6.1 Sphere (보병 INF)

UV Sphere: 8 경도 × 6 위도 세그먼트

```
정점 수: (kLat+1) × (kLon+1) = 7 × 9 = 63
인덱스 수: kLat × kLon × 6 = 6 × 8 × 6 = 288

정점 계산:
  for lat in 0..kLat:
    theta = PI * lat / kLat            // 0 → PI (북극 → 남극)
    for lon in 0..kLon:
      phi = 2*PI * lon / kLon          // 0 → 2*PI (경도)
      normal = (sin(theta)*cos(phi), cos(theta), sin(theta)*sin(phi))
      position = normal                 // 단위 구, position == normal
```

**position == normal 트릭**: 단위 구에서 표면 위의 점은 곧 법선 벡터. 추가 계산 불필요.

### 6.2 Diamond/Octahedron (궁병 ARC)

6개 꼭짓점, 8개 삼각형 면

```
꼭짓점: (0,±1,0), (±1,0,0), (0,0,±1)

면: 상단 4 + 하단 4
  Top: (top, +x, +z), (top, +z, -x), (top, -x, -z), (top, -z, +x)
  Bot: (bot, +z, +x), (bot, -x, +z), (bot, -z, -x), (bot, +x, -z)
```

**Flat Shading**: 면 단위로 법선 계산. 같은 꼭짓점이라도 면마다 다른 법선을 가지므로 정점을 공유하지 않고 면당 3개씩 생성 → 24개 정점, 24개 인덱스.

```cpp
XMVECTOR e1 = v1 - v0;
XMVECTOR e2 = v2 - v0;
XMVECTOR n  = normalize(cross(e1, e2));  // 면 법선
```

### 6.3 Cone (기병 CAV)

8 세그먼트, 꼭대기 y=1.2, 밑면 y=-0.4, 반경 0.8

```
측면: 8 삼각형 (apex → base 원주)
밑면: 8 삼각형 (center → 원주, 뒤집힌 와인딩)

정점: 8×3(측면) + 8×3(밑면) = 48
```

밑면은 법선이 (0,-1,0)으로 고정. 와인딩 순서를 반대로 해서 아래에서 봤을 때 정면이 되도록.

---

## 7. 렌더링 순서와 투명도

### 7.1 왜 순서가 중요한가

```
올바른 순서:
  1. 불투명 오브젝트 (Terrain, Solid Units) → 깊이 버퍼 채움
  2. 반투명 오브젝트 (Ghost Units) → 깊이 읽기 + 알파 블렌딩
  3. Additive 오브젝트 (Particles) → 깊이 읽기만, 쓰기 안 함

잘못된 순서 (파티클 먼저):
  파티클이 depth write → 지형이 파티클 뒤에서 가려짐 → 구멍 발생
```

### 7.2 이 프로젝트의 렌더 순서

```
[1] Terrain        RS: solid/cull_back    Blend: off       Depth: read+write
[2] Unit (Solid)   RS: solid/cull_back    Blend: alpha     Depth: read+write
[3] Unit (Ghost)   RS: wireframe/no_cull  Blend: alpha     Depth: read+write
[4] Particle       RS: solid/no_cull      Blend: additive  Depth: read only
[5] ── 상태 복원 ──
[6] ImGui                                 (자체 관리)
```

### 7.3 Draw Call 분석

| 레이어 | Draw Call 수 | Draw 함수 | 정점 수 / 인스턴스 수 |
|--------|-------------|-----------|----------------------|
| Terrain | 1 | `DrawIndexed(2400)` | 441 정점, 2400 인덱스 |
| Unit Solid | 최대 3 | `DrawIndexedInstanced(N, M)` | 병종당 1 call |
| Unit Ghost | 최대 3 | `DrawIndexedInstanced(N, M)` | 위와 동일 |
| Particle | 1 | `DrawInstanced(4, count)` | 4 정점 × count 인스턴스 |
| **총합** | **최대 8** | | |

5000 유닛을 **최대 8 draw call**로 렌더링. 인스턴싱의 효과.

---

## 8. 카메라 시스템

### 8.1 행렬 파이프라인

```
Local Space  ─(World)─►  World Space  ─(View)─►  Camera Space  ─(Projection)─►  Clip Space
  메시 정점                세계 좌표               카메라 기준               NDC(-1~+1)
```

이 프로젝트에서 World 행렬은 없다 (인스턴싱에서 셰이더가 직접 `pos * scale + position` 계산).
View × Projection = **VP 행렬**을 CPU에서 계산하여 Constant Buffer로 전달.

### 8.2 View 행렬

```cpp
XMVECTOR eye = position;
XMVECTOR look_dir = (sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch));
XMVECTOR target = eye + look_dir;
return XMMatrixLookAtLH(eye, target, up);
```

- `yaw`: 수평 회전 (마우스 좌우)
- `pitch`: 수직 회전 (마우스 상하), ±90° 클램핑
- `LookAtLH`: Left-Handed 좌표계 (DX 표준, +Z가 화면 안쪽)

### 8.3 Projection 행렬

```cpp
XMMatrixPerspectiveFovLH(fov=60°, aspect=16/9, near=0.1, far=1000)
```

- FOV 60°: 넓은 전략 시야
- Near 0.1: 카메라 바로 앞까지 렌더링
- Far 1000: 200×200 맵 전체를 볼 수 있는 거리

### 8.4 행렬 전치 (Transpose)

```cpp
XMStoreFloat4x4(&constants.vp, XMMatrixTranspose(vp));
```

**왜 Transpose하는가?**
- DirectXMath: **row-major** 행렬 (행 기준 메모리 배치)
- HLSL `mul(v, M)`: **row-major** 곱셈 (벡터 × 행렬)
- HLSL `cbuffer`의 `float4x4`: 메모리에서 **column-major**로 읽음

따라서 CPU의 row-major 행렬을 HLSL에 그대로 넘기면 전치되어 해석된다.
`XMMatrixTranspose()`로 미리 전치해서 보내면 HLSL에서 올바르게 읽힌다.

---

## 9. ComPtr과 리소스 관리

### 9.1 ComPtr

```cpp
using Microsoft::WRL::ComPtr;

ComPtr<ID3D11Buffer> vb;
device->CreateBuffer(&desc, &data, &vb);  // vb.GetAddressOf() 자동
// ...
// 스코프 벗어나면 자동 Release() 호출
```

DX11 COM 객체의 수명을 RAII로 관리. `AddRef`/`Release` 수동 호출 불필요.

### 9.2 리소스 해저드

한 리소스가 동시에 SRV(읽기)와 RTV(쓰기)로 바인딩되면 undefined behavior.

이 프로젝트에서는 StructuredBuffer가 SRV로만 사용되므로 해저드 없지만,
레이어 전환 시 이전 SRV를 해제하는 것이 좋은 습관:

```cpp
ID3D11ShaderResourceView* nullSRV = nullptr;
ctx->VSSetShaderResources(0, 1, &nullSRV);
```

---

## 10. GPU 메모리 레이아웃 요약

```
VRAM 할당:

[IMMUTABLE] Terrain VB        441 × 32B = 14,112B
[IMMUTABLE] Terrain IB        2400 × 4B =  9,600B
[IMMUTABLE] Sphere VB          63 × 24B =  1,512B
[IMMUTABLE] Sphere IB         288 × 4B  =  1,152B
[IMMUTABLE] Diamond VB         24 × 24B =    576B
[IMMUTABLE] Diamond IB         24 × 4B  =     96B
[IMMUTABLE] Cone VB            48 × 24B =  1,152B
[IMMUTABLE] Cone IB            48 × 4B  =    192B

[DEFAULT]   Terrain CB                      80B (16-aligned)
[DEFAULT]   Unit CB                         80B
[DEFAULT]   Particle CB                     96B

[DYNAMIC]   Unit Instance ×6   5000 × 32B × 6 = 960,000B
[DYNAMIC]   Particle Instance  2000 × 32B     =  64,000B

총합: ~1.05 MB (GPU 메모리)
```

메시 데이터는 극히 작고(~28KB), 인스턴스 버퍼가 대부분(~1MB). 매 프레임 갱신되는 것은 DYNAMIC 버퍼뿐.
