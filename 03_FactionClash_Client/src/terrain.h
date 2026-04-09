#pragma once

#include <d3d12.h>
#include <dxgi1_4.h>
#include <wrl/client.h>
#include <DirectXMath.h>
#include <cstdint>

using Microsoft::WRL::ComPtr;

class DX12Renderer;

class Terrain {
public:
    void Init(DX12Renderer& renderer);
    void Render(ID3D12GraphicsCommandList* cmd, const DirectX::XMMATRIX& vp);

private:
    void CreateRootSignatureAndPSO(ID3D12Device* device);
    void CreateMesh(ID3D12Device* device);

    ComPtr<ID3D12RootSignature> root_sig_;
    ComPtr<ID3D12PipelineState> pso_;
    ComPtr<ID3D12Resource> vertex_buffer_;
    ComPtr<ID3D12Resource> index_buffer_;
    D3D12_VERTEX_BUFFER_VIEW vbv_ = {};
    D3D12_INDEX_BUFFER_VIEW ibv_ = {};
    std::uint32_t index_count_ = 0;
};
