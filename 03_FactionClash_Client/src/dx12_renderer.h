#pragma once

#include <d3d12.h>
#include <dxgi1_4.h>
#include <wrl/client.h>
#include <cstdint>
#include <stdexcept>

using Microsoft::WRL::ComPtr;

class DX12Renderer {
public:
    bool Init(HWND hwnd, std::uint32_t width, std::uint32_t height);
    void BeginFrame(float clear_color[4]);
    void EndFrame();
    void Shutdown();

    ID3D12Device*              GetDevice()     { return device_.Get(); }
    ID3D12GraphicsCommandList* GetCommandList() { return cmd_list_.Get(); }
    ID3D12CommandQueue*        GetCommandQueue(){ return cmd_queue_.Get(); }
    std::uint32_t Width()  const { return width_; }
    std::uint32_t Height() const { return height_; }
    std::uint32_t FrameIndex() const { return frame_index_; }

private:
    void CreateDevice();
    void CreateCommandQueue();
    void CreateSwapChain(HWND hwnd);
    void CreateRtvHeap();
    void CreateDsvHeap();
    void CreateCommandAllocatorsAndList();
    void CreateFence();
    void WaitForGpu();
    void MoveToNextFrame();

    static constexpr std::uint32_t kFrameCount = 3;

    // Core
    ComPtr<IDXGIFactory4>               factory_;
    ComPtr<ID3D12Device>                device_;
    ComPtr<ID3D12CommandQueue>          cmd_queue_;
    ComPtr<IDXGISwapChain3>             swap_chain_;

    // RTV
    ComPtr<ID3D12DescriptorHeap>        rtv_heap_;
    ComPtr<ID3D12Resource>              render_targets_[kFrameCount];
    std::uint32_t                       rtv_descriptor_size_ = 0;

    // DSV
    ComPtr<ID3D12DescriptorHeap>        dsv_heap_;
    ComPtr<ID3D12Resource>              depth_stencil_;

    // Commands
    ComPtr<ID3D12CommandAllocator>      cmd_allocators_[kFrameCount];
    ComPtr<ID3D12GraphicsCommandList>   cmd_list_;

    // Sync
    ComPtr<ID3D12Fence>                 fence_;
    HANDLE                              fence_event_ = nullptr;
    std::uint64_t                       fence_values_[kFrameCount] = {};

    std::uint32_t                       frame_index_ = 0;
    std::uint32_t                       width_ = 0;
    std::uint32_t                       height_ = 0;
};
