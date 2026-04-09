#include "unit_renderer.h"
#include "dx12_renderer.h"
#include "camera.h"
#include <d3dcompiler.h>
#include <stdexcept>
#include <cstring>

#pragma comment(lib, "d3dcompiler.lib")

using namespace DirectX;

static void ThrowIfFailed(HRESULT hr) {
    if (FAILED(hr)) throw std::runtime_error("DX12 unit renderer call failed");
}

static const char* kUnitVS = R"(
cbuffer CameraCB : register(b0) {
    float4x4 VP;
    float3 CameraRight;
    float _pad0;
    float3 CameraUp;
    float _pad1;
};

struct UnitData {
    float3 worldPos;
    float scale;
    uint faction;
    uint unitType;
    float morale;
    float hpRatio;
};
StructuredBuffer<UnitData> Units : register(t0);

struct VSOut {
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD;
    nointerpolation uint faction : FACTION;
    nointerpolation uint unitType : UNITTYPE;
    nointerpolation float hpRatio : HP;
    nointerpolation float morale : MORALE;
};

VSOut main(uint vertexId : SV_VertexID, uint instanceId : SV_InstanceID) {
    // Generate quad corners from vertex ID (0-3 -> triangle strip quad)
    float2 offsets[4] = {
        float2(-0.5, -0.5),
        float2( 0.5, -0.5),
        float2(-0.5,  0.5),
        float2( 0.5,  0.5)
    };
    float2 q = offsets[vertexId];

    UnitData u = Units[instanceId];
    float3 worldPos = u.worldPos
        + CameraRight * q.x * u.scale
        + CameraUp * q.y * u.scale;

    VSOut o;
    o.pos = mul(float4(worldPos, 1.0), VP);
    o.uv = q + 0.5;
    o.faction = u.faction;
    o.unitType = u.unitType;
    o.hpRatio = u.hpRatio;
    o.morale = u.morale;
    return o;
}
)";

static const char* kUnitPS = R"(
struct PSIn {
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD;
    nointerpolation uint faction : FACTION;
    nointerpolation uint unitType : UNITTYPE;
    nointerpolation float hpRatio : HP;
    nointerpolation float morale : MORALE;
};

float4 main(PSIn p) : SV_TARGET {
    // Circle mask
    float2 center = p.uv - 0.5;
    float dist = length(center);
    if (dist > 0.45) discard;

    // Base color by faction
    float3 color;
    if (p.faction == 0)
        color = float3(0.85, 0.15, 0.1);   // RED
    else
        color = float3(0.1, 0.2, 0.85);    // BLUE

    // Unit type indicator (inner ring color)
    if (dist < 0.15) {
        if (p.unitType == 1)      // ARCHER - yellow core
            color = float3(0.9, 0.8, 0.2);
        else if (p.unitType == 2) // CAVALRY - white core
            color = float3(0.9, 0.9, 0.9);
        // INFANTRY keeps faction color
    }

    // HP brightness
    color *= lerp(0.3, 1.0, p.hpRatio);

    // Routing effect: desaturate
    if (p.morale <= 3.0) {
        float gray = dot(color, float3(0.299, 0.587, 0.114));
        color = lerp(color, float3(gray, gray, gray), 0.7);
    }

    return float4(color, 1.0);
}
)";

void UnitRenderer::Init(DX12Renderer& renderer, std::uint32_t max_units) {
    max_units_ = max_units;
    instance_stride_ = sizeof(UnitInstance);
    auto* device = renderer.GetDevice();
    CreateRootSignatureAndPSO(device);
    CreateBuffers(device);
}

void UnitRenderer::CreateRootSignatureAndPSO(ID3D12Device* device) {
    // Root param 0: CBV (camera constants, 24 floats = VP + right + up + padding)
    // Root param 1: SRV descriptor table (StructuredBuffer)
    D3D12_ROOT_PARAMETER params[2] = {};

    // Param 0: Root constants (VP matrix 16 + CameraRight 3 + pad 1 + CameraUp 3 + pad 1 = 24)
    params[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    params[0].Constants.ShaderRegister = 0;
    params[0].Constants.Num32BitValues = 24;
    params[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;

    // Param 1: Descriptor table for SRV (StructuredBuffer)
    D3D12_DESCRIPTOR_RANGE range = {};
    range.RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
    range.NumDescriptors = 1;
    range.BaseShaderRegister = 0;

    params[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    params[1].DescriptorTable.NumDescriptorRanges = 1;
    params[1].DescriptorTable.pDescriptorRanges = &range;
    params[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;

    D3D12_ROOT_SIGNATURE_DESC rs_desc = {};
    rs_desc.NumParameters = 2;
    rs_desc.pParameters = params;
    rs_desc.Flags = D3D12_ROOT_SIGNATURE_FLAG_NONE; // No IA input layout

    ComPtr<ID3DBlob> sig_blob, error_blob;
    ThrowIfFailed(D3D12SerializeRootSignature(&rs_desc, D3D_ROOT_SIGNATURE_VERSION_1,
                                               &sig_blob, &error_blob));
    ThrowIfFailed(device->CreateRootSignature(0, sig_blob->GetBufferPointer(),
                                               sig_blob->GetBufferSize(),
                                               IID_PPV_ARGS(&root_sig_)));

    // Compile shaders
    ComPtr<ID3DBlob> vs_blob, ps_blob;
    UINT flags = 0;
#ifdef _DEBUG
    flags = D3DCOMPILE_DEBUG | D3DCOMPILE_SKIP_OPTIMIZATION;
#endif
    ThrowIfFailed(D3DCompile(kUnitVS, strlen(kUnitVS), "UnitVS",
                              nullptr, nullptr, "main", "vs_5_0", flags, 0,
                              &vs_blob, &error_blob));
    ThrowIfFailed(D3DCompile(kUnitPS, strlen(kUnitPS), "UnitPS",
                              nullptr, nullptr, "main", "ps_5_0", flags, 0,
                              &ps_blob, &error_blob));

    // PSO - no input layout (procedural vertices)
    D3D12_GRAPHICS_PIPELINE_STATE_DESC pso = {};
    pso.pRootSignature = root_sig_.Get();
    pso.VS = {vs_blob->GetBufferPointer(), vs_blob->GetBufferSize()};
    pso.PS = {ps_blob->GetBufferPointer(), ps_blob->GetBufferSize()};
    pso.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    pso.RasterizerState.CullMode = D3D12_CULL_MODE_NONE; // Billboard faces camera
    pso.RasterizerState.DepthClipEnable = TRUE;
    pso.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    pso.DepthStencilState.DepthEnable = TRUE;
    pso.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ALL;
    pso.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_LESS;
    pso.SampleMask = UINT_MAX;
    pso.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    pso.NumRenderTargets = 1;
    pso.RTVFormats[0] = DXGI_FORMAT_R8G8B8A8_UNORM;
    pso.DSVFormat = DXGI_FORMAT_D32_FLOAT;
    pso.SampleDesc.Count = 1;

    ThrowIfFailed(device->CreateGraphicsPipelineState(&pso, IID_PPV_ARGS(&pso_)));
}

void UnitRenderer::CreateBuffers(ID3D12Device* device) {
    UINT64 buf_size = static_cast<UINT64>(max_units_) * instance_stride_;

    // Upload buffer (CPU-writable)
    D3D12_HEAP_PROPERTIES upload_heap = {};
    upload_heap.Type = D3D12_HEAP_TYPE_UPLOAD;

    D3D12_RESOURCE_DESC buf_desc = {};
    buf_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    buf_desc.Width = buf_size;
    buf_desc.Height = 1;
    buf_desc.DepthOrArraySize = 1;
    buf_desc.MipLevels = 1;
    buf_desc.SampleDesc.Count = 1;
    buf_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;

    ThrowIfFailed(device->CreateCommittedResource(
        &upload_heap, D3D12_HEAP_FLAG_NONE, &buf_desc,
        D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
        IID_PPV_ARGS(&upload_buffer_)));

    // For simplicity, use upload buffer directly as SRV (avoids copy barrier complexity)
    // This works fine for 400 units * 32 bytes = 12.8KB per frame
    instance_buffer_ = upload_buffer_;

    // SRV descriptor heap
    D3D12_DESCRIPTOR_HEAP_DESC heap_desc = {};
    heap_desc.NumDescriptors = 1;
    heap_desc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
    heap_desc.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    ThrowIfFailed(device->CreateDescriptorHeap(&heap_desc, IID_PPV_ARGS(&srv_heap_)));

    // Create SRV for StructuredBuffer
    D3D12_SHADER_RESOURCE_VIEW_DESC srv_desc = {};
    srv_desc.ViewDimension = D3D12_SRV_DIMENSION_BUFFER;
    srv_desc.Format = DXGI_FORMAT_UNKNOWN;
    srv_desc.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    srv_desc.Buffer.NumElements = max_units_;
    srv_desc.Buffer.StructureByteStride = instance_stride_;

    device->CreateShaderResourceView(
        instance_buffer_.Get(), &srv_desc,
        srv_heap_->GetCPUDescriptorHandleForHeapStart());
}

void UnitRenderer::Update(const std::vector<UnitInstance>& instances) {
    instance_count_ = static_cast<std::uint32_t>(
        std::min(instances.size(), static_cast<size_t>(max_units_)));

    if (instance_count_ == 0) return;

    void* mapped = nullptr;
    upload_buffer_->Map(0, nullptr, &mapped);
    std::memcpy(mapped, instances.data(), instance_count_ * instance_stride_);
    upload_buffer_->Unmap(0, nullptr);
}

void UnitRenderer::Render(ID3D12GraphicsCommandList* cmd, const Camera& camera) {
    if (instance_count_ == 0) return;

    cmd->SetPipelineState(pso_.Get());
    cmd->SetGraphicsRootSignature(root_sig_.Get());

    // Set camera constants (root param 0)
    struct CameraConstants {
        XMFLOAT4X4 vp;
        XMFLOAT3 camera_right;
        float pad0;
        XMFLOAT3 camera_up;
        float pad1;
    } constants;

    XMMATRIX vp = camera.GetVPMatrix();
    XMStoreFloat4x4(&constants.vp, XMMatrixTranspose(vp));
    constants.camera_right = camera.GetRight();
    constants.pad0 = 0.f;
    constants.camera_up = camera.GetUp();
    constants.pad1 = 0.f;

    cmd->SetGraphicsRoot32BitConstants(0, 24, &constants, 0);

    // Set SRV heap and table (root param 1)
    ID3D12DescriptorHeap* heaps[] = {srv_heap_.Get()};
    cmd->SetDescriptorHeaps(1, heaps);
    cmd->SetGraphicsRootDescriptorTable(1, srv_heap_->GetGPUDescriptorHandleForHeapStart());

    // Draw: 4 vertices per quad (triangle strip), instanced
    cmd->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP);
    cmd->DrawInstanced(4, instance_count_, 0, 0);
}
