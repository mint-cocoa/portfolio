#include "dx12_renderer.h"
#include <d3d12.h>
#include <dxgi1_4.h>

#pragma comment(lib, "d3d12.lib")
#pragma comment(lib, "dxgi.lib")

static void ThrowIfFailed(HRESULT hr) {
    if (FAILED(hr)) throw std::runtime_error("DX12 call failed");
}

bool DX12Renderer::Init(HWND hwnd, std::uint32_t width, std::uint32_t height) {
    width_ = width;
    height_ = height;

    try {
        CreateDevice();
        CreateCommandQueue();
        CreateSwapChain(hwnd);
        CreateRtvHeap();
        CreateDsvHeap();
        CreateCommandAllocatorsAndList();
        CreateFence();
    } catch (...) {
        return false;
    }

    return true;
}

void DX12Renderer::CreateDevice() {
#ifdef _DEBUG
    ComPtr<ID3D12Debug> debug;
    if (SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(&debug)))) {
        debug->EnableDebugLayer();
    }
#endif

    ThrowIfFailed(CreateDXGIFactory1(IID_PPV_ARGS(&factory_)));

    ComPtr<IDXGIAdapter1> adapter;
    for (UINT i = 0; factory_->EnumAdapters1(i, &adapter) != DXGI_ERROR_NOT_FOUND; ++i) {
        DXGI_ADAPTER_DESC1 desc;
        adapter->GetDesc1(&desc);
        if (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) continue;
        if (SUCCEEDED(D3D12CreateDevice(adapter.Get(), D3D_FEATURE_LEVEL_11_0,
                                         IID_PPV_ARGS(&device_)))) {
            break;
        }
    }

    if (!device_) {
        // Fallback to WARP
        ComPtr<IDXGIAdapter> warp;
        ThrowIfFailed(factory_->EnumWarpAdapter(IID_PPV_ARGS(&warp)));
        ThrowIfFailed(D3D12CreateDevice(warp.Get(), D3D_FEATURE_LEVEL_11_0,
                                         IID_PPV_ARGS(&device_)));
    }
}

void DX12Renderer::CreateCommandQueue() {
    D3D12_COMMAND_QUEUE_DESC desc = {};
    desc.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    desc.Flags = D3D12_COMMAND_QUEUE_FLAG_NONE;
    ThrowIfFailed(device_->CreateCommandQueue(&desc, IID_PPV_ARGS(&cmd_queue_)));
}

void DX12Renderer::CreateSwapChain(HWND hwnd) {
    DXGI_SWAP_CHAIN_DESC1 desc = {};
    desc.BufferCount = kFrameCount;
    desc.Width = width_;
    desc.Height = height_;
    desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
    desc.SampleDesc.Count = 1;

    ComPtr<IDXGISwapChain1> swap_chain1;
    ThrowIfFailed(factory_->CreateSwapChainForHwnd(
        cmd_queue_.Get(), hwnd, &desc, nullptr, nullptr, &swap_chain1));

    ThrowIfFailed(factory_->MakeWindowAssociation(hwnd, DXGI_MWA_NO_ALT_ENTER));
    ThrowIfFailed(swap_chain1.As(&swap_chain_));
    frame_index_ = swap_chain_->GetCurrentBackBufferIndex();
}

void DX12Renderer::CreateRtvHeap() {
    D3D12_DESCRIPTOR_HEAP_DESC desc = {};
    desc.NumDescriptors = kFrameCount;
    desc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
    ThrowIfFailed(device_->CreateDescriptorHeap(&desc, IID_PPV_ARGS(&rtv_heap_)));

    rtv_descriptor_size_ = device_->GetDescriptorHandleIncrementSize(
        D3D12_DESCRIPTOR_HEAP_TYPE_RTV);

    D3D12_CPU_DESCRIPTOR_HANDLE rtv_handle = rtv_heap_->GetCPUDescriptorHandleForHeapStart();
    for (UINT i = 0; i < kFrameCount; ++i) {
        ThrowIfFailed(swap_chain_->GetBuffer(i, IID_PPV_ARGS(&render_targets_[i])));
        device_->CreateRenderTargetView(render_targets_[i].Get(), nullptr, rtv_handle);
        rtv_handle.ptr += rtv_descriptor_size_;
    }
}

void DX12Renderer::CreateDsvHeap() {
    D3D12_DESCRIPTOR_HEAP_DESC heap_desc = {};
    heap_desc.NumDescriptors = 1;
    heap_desc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_DSV;
    ThrowIfFailed(device_->CreateDescriptorHeap(&heap_desc, IID_PPV_ARGS(&dsv_heap_)));

    D3D12_HEAP_PROPERTIES heap_props = {};
    heap_props.Type = D3D12_HEAP_TYPE_DEFAULT;

    D3D12_RESOURCE_DESC res_desc = {};
    res_desc.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    res_desc.Width = width_;
    res_desc.Height = height_;
    res_desc.DepthOrArraySize = 1;
    res_desc.MipLevels = 1;
    res_desc.Format = DXGI_FORMAT_D32_FLOAT;
    res_desc.SampleDesc.Count = 1;
    res_desc.Flags = D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL;

    D3D12_CLEAR_VALUE clear_val = {};
    clear_val.Format = DXGI_FORMAT_D32_FLOAT;
    clear_val.DepthStencil.Depth = 1.0f;

    ThrowIfFailed(device_->CreateCommittedResource(
        &heap_props, D3D12_HEAP_FLAG_NONE, &res_desc,
        D3D12_RESOURCE_STATE_DEPTH_WRITE, &clear_val,
        IID_PPV_ARGS(&depth_stencil_)));

    D3D12_DEPTH_STENCIL_VIEW_DESC dsv_desc = {};
    dsv_desc.Format = DXGI_FORMAT_D32_FLOAT;
    dsv_desc.ViewDimension = D3D12_DSV_DIMENSION_TEXTURE2D;
    device_->CreateDepthStencilView(depth_stencil_.Get(), &dsv_desc,
        dsv_heap_->GetCPUDescriptorHandleForHeapStart());
}

void DX12Renderer::CreateCommandAllocatorsAndList() {
    for (UINT i = 0; i < kFrameCount; ++i) {
        ThrowIfFailed(device_->CreateCommandAllocator(
            D3D12_COMMAND_LIST_TYPE_DIRECT,
            IID_PPV_ARGS(&cmd_allocators_[i])));
    }

    ThrowIfFailed(device_->CreateCommandList(
        0, D3D12_COMMAND_LIST_TYPE_DIRECT,
        cmd_allocators_[frame_index_].Get(),
        nullptr,
        IID_PPV_ARGS(&cmd_list_)));
    ThrowIfFailed(cmd_list_->Close());
}

void DX12Renderer::CreateFence() {
    ThrowIfFailed(device_->CreateFence(0, D3D12_FENCE_FLAG_NONE,
                                        IID_PPV_ARGS(&fence_)));
    fence_event_ = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    for (auto& v : fence_values_) v = 1;
}

void DX12Renderer::BeginFrame(float clear_color[4]) {
    auto* allocator = cmd_allocators_[frame_index_].Get();
    ThrowIfFailed(allocator->Reset());
    ThrowIfFailed(cmd_list_->Reset(allocator, nullptr));

    // Transition render target to RENDER_TARGET
    D3D12_RESOURCE_BARRIER barrier = {};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = render_targets_[frame_index_].Get();
    barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_PRESENT;
    barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_RENDER_TARGET;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    cmd_list_->ResourceBarrier(1, &barrier);

    // Set render target
    D3D12_CPU_DESCRIPTOR_HANDLE rtv = rtv_heap_->GetCPUDescriptorHandleForHeapStart();
    rtv.ptr += frame_index_ * rtv_descriptor_size_;
    D3D12_CPU_DESCRIPTOR_HANDLE dsv = dsv_heap_->GetCPUDescriptorHandleForHeapStart();
    cmd_list_->OMSetRenderTargets(1, &rtv, FALSE, &dsv);

    // Clear
    cmd_list_->ClearRenderTargetView(rtv, clear_color, 0, nullptr);
    cmd_list_->ClearDepthStencilView(dsv, D3D12_CLEAR_FLAG_DEPTH, 1.0f, 0, 0, nullptr);

    // Set viewport and scissor
    D3D12_VIEWPORT viewport = {0.f, 0.f, static_cast<float>(width_),
                                static_cast<float>(height_), 0.f, 1.f};
    D3D12_RECT scissor = {0, 0, static_cast<LONG>(width_), static_cast<LONG>(height_)};
    cmd_list_->RSSetViewports(1, &viewport);
    cmd_list_->RSSetScissorRects(1, &scissor);
}

void DX12Renderer::EndFrame() {
    // Transition render target to PRESENT
    D3D12_RESOURCE_BARRIER barrier = {};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = render_targets_[frame_index_].Get();
    barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_RENDER_TARGET;
    barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_PRESENT;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    cmd_list_->ResourceBarrier(1, &barrier);

    ThrowIfFailed(cmd_list_->Close());

    ID3D12CommandList* lists[] = {cmd_list_.Get()};
    cmd_queue_->ExecuteCommandLists(1, lists);

    ThrowIfFailed(swap_chain_->Present(1, 0));

    MoveToNextFrame();
}

void DX12Renderer::MoveToNextFrame() {
    const std::uint64_t current_fence = fence_values_[frame_index_];
    ThrowIfFailed(cmd_queue_->Signal(fence_.Get(), current_fence));

    frame_index_ = swap_chain_->GetCurrentBackBufferIndex();

    if (fence_->GetCompletedValue() < fence_values_[frame_index_]) {
        ThrowIfFailed(fence_->SetEventOnCompletion(fence_values_[frame_index_], fence_event_));
        WaitForSingleObjectEx(fence_event_, INFINITE, FALSE);
    }

    fence_values_[frame_index_] = current_fence + 1;
}

void DX12Renderer::WaitForGpu() {
    std::uint64_t val = fence_values_[frame_index_];
    ThrowIfFailed(cmd_queue_->Signal(fence_.Get(), val));
    ThrowIfFailed(fence_->SetEventOnCompletion(val, fence_event_));
    WaitForSingleObjectEx(fence_event_, INFINITE, FALSE);
    fence_values_[frame_index_] = val + 1;
}

void DX12Renderer::Shutdown() {
    WaitForGpu();
    if (fence_event_) {
        CloseHandle(fence_event_);
        fence_event_ = nullptr;
    }
}
