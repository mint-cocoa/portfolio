#include "particle_system.h"
#include "dx12_renderer.h"
#include "camera.h"
#include <d3dcompiler.h>
#include <cstring>
#include <cstdlib>
#include <algorithm>
#include <stdexcept>

using namespace DirectX;

static void ThrowIfFailed(HRESULT hr) {
    if (FAILED(hr)) throw std::runtime_error("Particle DX12 call failed");
}

static float RandFloat(float lo, float hi) {
    return lo + static_cast<float>(rand()) / RAND_MAX * (hi - lo);
}

static const char* kParticleVS = R"(
cbuffer CameraCB : register(b0) {
    float4x4 VP;
    float3 CameraRight;
    float _pad0;
    float3 CameraUp;
    float _pad1;
};
struct PData {
    float3 pos;
    float scale;
    float r, g, b, a;
};
StructuredBuffer<PData> Particles : register(t0);

struct VSOut {
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD;
    float4 color : COLOR;
};

VSOut main(uint vid : SV_VertexID, uint iid : SV_InstanceID) {
    float2 offsets[4] = {
        float2(-0.5,-0.5), float2(0.5,-0.5),
        float2(-0.5, 0.5), float2(0.5, 0.5)
    };
    PData p = Particles[iid];
    float3 world = p.pos + CameraRight * offsets[vid].x * p.scale
                         + CameraUp * offsets[vid].y * p.scale;
    VSOut o;
    o.pos = mul(float4(world, 1.0), VP);
    o.uv = offsets[vid] + 0.5;
    o.color = float4(p.r, p.g, p.b, p.a);
    return o;
}
)";

static const char* kParticlePS = R"(
struct PSIn {
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD;
    float4 color : COLOR;
};
float4 main(PSIn p) : SV_TARGET {
    float dist = length(p.uv - 0.5);
    if (dist > 0.5) discard;
    float fade = 1.0 - dist * 2.0;
    return float4(p.color.rgb * fade, p.color.a * fade);
}
)";

void ParticleSystem::Init(DX12Renderer& renderer, std::uint32_t max_particles) {
    max_particles_ = max_particles;
    auto* device = renderer.GetDevice();
    CreatePSO(device);

    // Upload buffer
    D3D12_HEAP_PROPERTIES heap = {};
    heap.Type = D3D12_HEAP_TYPE_UPLOAD;
    D3D12_RESOURCE_DESC desc = {};
    desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    desc.Width = max_particles_ * sizeof(ParticleInstance);
    desc.Height = 1; desc.DepthOrArraySize = 1; desc.MipLevels = 1;
    desc.SampleDesc.Count = 1; desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    ThrowIfFailed(device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE,
        &desc, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&upload_buffer_)));

    // SRV heap
    D3D12_DESCRIPTOR_HEAP_DESC h = {};
    h.NumDescriptors = 1;
    h.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
    h.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    ThrowIfFailed(device->CreateDescriptorHeap(&h, IID_PPV_ARGS(&srv_heap_)));

    D3D12_SHADER_RESOURCE_VIEW_DESC srv = {};
    srv.ViewDimension = D3D12_SRV_DIMENSION_BUFFER;
    srv.Format = DXGI_FORMAT_UNKNOWN;
    srv.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    srv.Buffer.NumElements = max_particles_;
    srv.Buffer.StructureByteStride = sizeof(ParticleInstance);
    device->CreateShaderResourceView(upload_buffer_.Get(), &srv,
        srv_heap_->GetCPUDescriptorHandleForHeapStart());
}

void ParticleSystem::CreatePSO(ID3D12Device* device) {
    // Same root sig pattern as unit renderer
    D3D12_ROOT_PARAMETER params[2] = {};
    params[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    params[0].Constants.ShaderRegister = 0;
    params[0].Constants.Num32BitValues = 24;
    params[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;

    D3D12_DESCRIPTOR_RANGE range = {};
    range.RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
    range.NumDescriptors = 1;
    params[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    params[1].DescriptorTable.NumDescriptorRanges = 1;
    params[1].DescriptorTable.pDescriptorRanges = &range;
    params[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;

    D3D12_ROOT_SIGNATURE_DESC rs = {};
    rs.NumParameters = 2; rs.pParameters = params;

    ComPtr<ID3DBlob> sig, err;
    ThrowIfFailed(D3D12SerializeRootSignature(&rs, D3D_ROOT_SIGNATURE_VERSION_1, &sig, &err));
    ThrowIfFailed(device->CreateRootSignature(0, sig->GetBufferPointer(),
        sig->GetBufferSize(), IID_PPV_ARGS(&root_sig_)));

    ComPtr<ID3DBlob> vs, ps;
    UINT flags = 0;
#ifdef _DEBUG
    flags = D3DCOMPILE_DEBUG | D3DCOMPILE_SKIP_OPTIMIZATION;
#endif
    ThrowIfFailed(D3DCompile(kParticleVS, strlen(kParticleVS), "PVS", nullptr, nullptr,
        "main", "vs_5_0", flags, 0, &vs, &err));
    ThrowIfFailed(D3DCompile(kParticlePS, strlen(kParticlePS), "PPS", nullptr, nullptr,
        "main", "ps_5_0", flags, 0, &ps, &err));

    D3D12_GRAPHICS_PIPELINE_STATE_DESC pso = {};
    pso.pRootSignature = root_sig_.Get();
    pso.VS = {vs->GetBufferPointer(), vs->GetBufferSize()};
    pso.PS = {ps->GetBufferPointer(), ps->GetBufferSize()};
    pso.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    pso.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
    pso.RasterizerState.DepthClipEnable = TRUE;

    // Additive blending
    auto& rt = pso.BlendState.RenderTarget[0];
    rt.BlendEnable = TRUE;
    rt.SrcBlend = D3D12_BLEND_SRC_ALPHA;
    rt.DestBlend = D3D12_BLEND_ONE;
    rt.BlendOp = D3D12_BLEND_OP_ADD;
    rt.SrcBlendAlpha = D3D12_BLEND_ONE;
    rt.DestBlendAlpha = D3D12_BLEND_ZERO;
    rt.BlendOpAlpha = D3D12_BLEND_OP_ADD;
    rt.RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;

    pso.DepthStencilState.DepthEnable = TRUE;
    pso.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ZERO; // Don't write depth
    pso.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_LESS;
    pso.SampleMask = UINT_MAX;
    pso.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    pso.NumRenderTargets = 1;
    pso.RTVFormats[0] = DXGI_FORMAT_R8G8B8A8_UNORM;
    pso.DSVFormat = DXGI_FORMAT_D32_FLOAT;
    pso.SampleDesc.Count = 1;
    ThrowIfFailed(device->CreateGraphicsPipelineState(&pso, IID_PPV_ARGS(&pso_)));
}

void ParticleSystem::SpawnBurst(XMFLOAT3 pos, XMFLOAT3 color, int count) {
    for (int i = 0; i < count && particles_.size() < max_particles_; ++i) {
        Particle p;
        p.pos = pos;
        p.vel = {RandFloat(-3.f, 3.f), RandFloat(2.f, 8.f), RandFloat(-3.f, 3.f)};
        p.life = p.max_life = RandFloat(0.3f, 0.8f);
        p.size = RandFloat(0.5f, 1.5f);
        p.color = color;
        particles_.push_back(p);
    }
}

void ParticleSystem::Update(float dt) {
    for (auto& p : particles_) {
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += p.vel.z * dt;
        p.vel.y -= 9.8f * dt; // gravity
        p.life -= dt;
    }
    // Remove dead particles
    particles_.erase(
        std::remove_if(particles_.begin(), particles_.end(),
            [](const Particle& p) { return p.life <= 0; }),
        particles_.end());
}

void ParticleSystem::Render(ID3D12GraphicsCommandList* cmd, const Camera& camera) {
    if (particles_.empty()) return;

    std::uint32_t count = static_cast<std::uint32_t>(
        std::min(particles_.size(), static_cast<size_t>(max_particles_)));

    // Upload particle instances
    std::vector<ParticleInstance> instances(count);
    for (std::uint32_t i = 0; i < count; ++i) {
        auto& p = particles_[i];
        float alpha = p.life / p.max_life;
        instances[i] = {p.pos, p.size * alpha, p.color.x, p.color.y, p.color.z, alpha};
    }

    void* mapped = nullptr;
    upload_buffer_->Map(0, nullptr, &mapped);
    std::memcpy(mapped, instances.data(), count * sizeof(ParticleInstance));
    upload_buffer_->Unmap(0, nullptr);

    cmd->SetPipelineState(pso_.Get());
    cmd->SetGraphicsRootSignature(root_sig_.Get());

    struct Constants {
        XMFLOAT4X4 vp;
        XMFLOAT3 right; float pad0;
        XMFLOAT3 up; float pad1;
    } cb;
    XMStoreFloat4x4(&cb.vp, XMMatrixTranspose(camera.GetVPMatrix()));
    cb.right = camera.GetRight();
    cb.up = camera.GetUp();
    cmd->SetGraphicsRoot32BitConstants(0, 24, &cb, 0);

    ID3D12DescriptorHeap* heaps[] = {srv_heap_.Get()};
    cmd->SetDescriptorHeaps(1, heaps);
    cmd->SetGraphicsRootDescriptorTable(1, srv_heap_->GetGPUDescriptorHandleForHeapStart());

    cmd->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP);
    cmd->DrawInstanced(4, count, 0, 0);
}
