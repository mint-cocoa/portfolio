#pragma once

#include <d3d12.h>
#include <wrl/client.h>
#include <DirectXMath.h>
#include <vector>
#include <cstdint>

using Microsoft::WRL::ComPtr;

class DX12Renderer;
class Camera;

struct Particle {
    DirectX::XMFLOAT3 pos;
    DirectX::XMFLOAT3 vel;
    float life;       // remaining life in seconds
    float max_life;
    float size;
    DirectX::XMFLOAT3 color;
};

struct ParticleInstance {
    DirectX::XMFLOAT3 pos;
    float scale;
    float r, g, b, a;
};

class ParticleSystem {
public:
    void Init(DX12Renderer& renderer, std::uint32_t max_particles);
    void SpawnBurst(DirectX::XMFLOAT3 pos, DirectX::XMFLOAT3 color, int count);
    void Update(float dt);
    void Render(ID3D12GraphicsCommandList* cmd, const Camera& camera);

private:
    void CreatePSO(ID3D12Device* device);

    std::vector<Particle> particles_;
    std::uint32_t max_particles_ = 2000;

    ComPtr<ID3D12RootSignature> root_sig_;
    ComPtr<ID3D12PipelineState> pso_;
    ComPtr<ID3D12Resource> upload_buffer_;
    ComPtr<ID3D12DescriptorHeap> srv_heap_;
};
