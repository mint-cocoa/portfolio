#include "terrain.h"
#include "dx12_renderer.h"
#include <d3dcompiler.h>
#include <vector>
#include <stdexcept>

#pragma comment(lib, "d3dcompiler.lib")

using namespace DirectX;

struct TerrainVertex {
    XMFLOAT3 pos;
    XMFLOAT2 uv;
};

static void ThrowIfFailed(HRESULT hr) {
    if (FAILED(hr)) throw std::runtime_error("DX12 terrain call failed");
}

// Inline HLSL shaders
static const char* kTerrainVS = R"(
cbuffer CameraCB : register(b0) { float4x4 VP; };
struct VSIn { float3 pos : POSITION; float2 uv : TEXCOORD; };
struct VSOut { float4 pos : SV_POSITION; float2 uv : TEXCOORD; };
VSOut main(VSIn v) {
    VSOut o;
    o.pos = mul(float4(v.pos, 1.0), VP);
    o.uv = v.uv;
    return o;
}
)";

static const char* kTerrainPS = R"(
struct PSIn { float4 pos : SV_POSITION; float2 uv : TEXCOORD; };
float4 main(PSIn p) : SV_TARGET {
    float2 grid = floor(p.uv * 20.0);
    float checker = fmod(grid.x + grid.y, 2.0);
    float3 base_color = lerp(float3(0.15, 0.35, 0.1), float3(0.2, 0.45, 0.15), checker);

    // Simple directional light (sun from upper-right)
    float3 normal = float3(0, 1, 0);
    float3 light_dir = normalize(float3(0.5, -0.8, 0.3));
    float ndl = max(dot(normal, -light_dir), 0.0);
    float3 light_color = float3(1.0, 0.95, 0.85);
    float ambient = 0.35;

    float3 color = base_color * (ambient + ndl * light_color * 0.65);
    return float4(color, 1.0);
}
)";

void Terrain::Init(DX12Renderer& renderer) {
    auto* device = renderer.GetDevice();
    CreateRootSignatureAndPSO(device);
    CreateMesh(device);
}

void Terrain::CreateRootSignatureAndPSO(ID3D12Device* device) {
    // Root signature: one 32-bit constant buffer (16 floats = 4x4 matrix)
    D3D12_ROOT_PARAMETER param = {};
    param.ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    param.Constants.ShaderRegister = 0;
    param.Constants.Num32BitValues = 16; // float4x4
    param.ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;

    D3D12_ROOT_SIGNATURE_DESC rs_desc = {};
    rs_desc.NumParameters = 1;
    rs_desc.pParameters = &param;
    rs_desc.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;

    ComPtr<ID3DBlob> sig_blob, error_blob;
    ThrowIfFailed(D3D12SerializeRootSignature(&rs_desc, D3D_ROOT_SIGNATURE_VERSION_1,
                                               &sig_blob, &error_blob));
    ThrowIfFailed(device->CreateRootSignature(0, sig_blob->GetBufferPointer(),
                                               sig_blob->GetBufferSize(),
                                               IID_PPV_ARGS(&root_sig_)));

    // Compile shaders
    ComPtr<ID3DBlob> vs_blob, ps_blob;
    UINT compile_flags = 0;
#ifdef _DEBUG
    compile_flags = D3DCOMPILE_DEBUG | D3DCOMPILE_SKIP_OPTIMIZATION;
#endif
    ThrowIfFailed(D3DCompile(kTerrainVS, strlen(kTerrainVS), "TerrainVS",
                              nullptr, nullptr, "main", "vs_5_0", compile_flags, 0,
                              &vs_blob, &error_blob));
    ThrowIfFailed(D3DCompile(kTerrainPS, strlen(kTerrainPS), "TerrainPS",
                              nullptr, nullptr, "main", "ps_5_0", compile_flags, 0,
                              &ps_blob, &error_blob));

    // Input layout
    D3D12_INPUT_ELEMENT_DESC input_layout[] = {
        {"POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0,
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
        {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 12,
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
    };

    // PSO
    D3D12_GRAPHICS_PIPELINE_STATE_DESC pso_desc = {};
    pso_desc.pRootSignature = root_sig_.Get();
    pso_desc.VS = {vs_blob->GetBufferPointer(), vs_blob->GetBufferSize()};
    pso_desc.PS = {ps_blob->GetBufferPointer(), ps_blob->GetBufferSize()};
    pso_desc.InputLayout = {input_layout, _countof(input_layout)};
    pso_desc.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    pso_desc.RasterizerState.CullMode = D3D12_CULL_MODE_BACK;
    pso_desc.RasterizerState.FrontCounterClockwise = FALSE;
    pso_desc.RasterizerState.DepthClipEnable = TRUE;
    pso_desc.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    pso_desc.DepthStencilState.DepthEnable = TRUE;
    pso_desc.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ALL;
    pso_desc.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_LESS;
    pso_desc.SampleMask = UINT_MAX;
    pso_desc.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    pso_desc.NumRenderTargets = 1;
    pso_desc.RTVFormats[0] = DXGI_FORMAT_R8G8B8A8_UNORM;
    pso_desc.DSVFormat = DXGI_FORMAT_D32_FLOAT;
    pso_desc.SampleDesc.Count = 1;

    ThrowIfFailed(device->CreateGraphicsPipelineState(&pso_desc, IID_PPV_ARGS(&pso_)));
}

void Terrain::CreateMesh(ID3D12Device* device) {
    // 200x200 quad = 4 vertices, 6 indices
    constexpr float kSize = 200.0f;
    TerrainVertex vertices[] = {
        {{0.f,    0.f, 0.f},    {0.f, 0.f}},
        {{kSize,  0.f, 0.f},    {1.f, 0.f}},
        {{kSize,  0.f, kSize},  {1.f, 1.f}},
        {{0.f,    0.f, kSize},  {0.f, 1.f}},
    };
    std::uint32_t indices[] = {0, 2, 1, 0, 3, 2};
    index_count_ = 6;

    // Vertex buffer (upload heap for simplicity)
    D3D12_HEAP_PROPERTIES heap = {};
    heap.Type = D3D12_HEAP_TYPE_UPLOAD;

    D3D12_RESOURCE_DESC vb_desc = {};
    vb_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    vb_desc.Width = sizeof(vertices);
    vb_desc.Height = 1;
    vb_desc.DepthOrArraySize = 1;
    vb_desc.MipLevels = 1;
    vb_desc.SampleDesc.Count = 1;
    vb_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;

    ThrowIfFailed(device->CreateCommittedResource(
        &heap, D3D12_HEAP_FLAG_NONE, &vb_desc,
        D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
        IID_PPV_ARGS(&vertex_buffer_)));

    void* mapped = nullptr;
    vertex_buffer_->Map(0, nullptr, &mapped);
    memcpy(mapped, vertices, sizeof(vertices));
    vertex_buffer_->Unmap(0, nullptr);

    vbv_.BufferLocation = vertex_buffer_->GetGPUVirtualAddress();
    vbv_.SizeInBytes = sizeof(vertices);
    vbv_.StrideInBytes = sizeof(TerrainVertex);

    // Index buffer
    D3D12_RESOURCE_DESC ib_desc = vb_desc;
    ib_desc.Width = sizeof(indices);

    ThrowIfFailed(device->CreateCommittedResource(
        &heap, D3D12_HEAP_FLAG_NONE, &ib_desc,
        D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
        IID_PPV_ARGS(&index_buffer_)));

    index_buffer_->Map(0, nullptr, &mapped);
    memcpy(mapped, indices, sizeof(indices));
    index_buffer_->Unmap(0, nullptr);

    ibv_.BufferLocation = index_buffer_->GetGPUVirtualAddress();
    ibv_.SizeInBytes = sizeof(indices);
    ibv_.Format = DXGI_FORMAT_R32_UINT;
}

void Terrain::Render(ID3D12GraphicsCommandList* cmd, const XMMATRIX& vp) {
    cmd->SetPipelineState(pso_.Get());
    cmd->SetGraphicsRootSignature(root_sig_.Get());

    // Pass VP matrix as root constants
    XMMATRIX vp_t = XMMatrixTranspose(vp); // HLSL expects column-major
    cmd->SetGraphicsRoot32BitConstants(0, 16, &vp_t, 0);

    cmd->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    cmd->IASetVertexBuffers(0, 1, &vbv_);
    cmd->IASetIndexBuffer(&ibv_);
    cmd->DrawIndexedInstanced(index_count_, 1, 0, 0, 0);
}
