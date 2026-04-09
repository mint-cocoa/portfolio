#pragma once

#include <d3d12.h>
#include <dxgi1_4.h>
#include <wrl/client.h>
#include <DirectXMath.h>
#include <vector>
#include <cstdint>

using Microsoft::WRL::ComPtr;

class DX12Renderer;
class Camera;

struct UnitInstance {
    DirectX::XMFLOAT3 world_pos;
    float scale;
    std::uint32_t faction;   // 0=RED, 1=BLUE
    std::uint32_t unit_type; // 0=INF, 1=ARC, 2=CAV
    float morale;
    float hp_ratio;
};

class UnitRenderer {
public:
    void Init(DX12Renderer& renderer, std::uint32_t max_units);
    void Update(const std::vector<UnitInstance>& instances);
    void Render(ID3D12GraphicsCommandList* cmd, const Camera& camera);

private:
    void CreateRootSignatureAndPSO(ID3D12Device* device);
    void CreateBuffers(ID3D12Device* device);

    ComPtr<ID3D12RootSignature> root_sig_;
    ComPtr<ID3D12PipelineState> pso_;
    ComPtr<ID3D12Resource> instance_buffer_;   // DEFAULT heap
    ComPtr<ID3D12Resource> upload_buffer_;      // UPLOAD heap
    ComPtr<ID3D12DescriptorHeap> srv_heap_;

    std::uint32_t instance_count_ = 0;
    std::uint32_t max_units_ = 0;
    std::uint32_t instance_stride_ = 0;
};
