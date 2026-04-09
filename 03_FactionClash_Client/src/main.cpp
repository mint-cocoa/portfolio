#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include "dx12_renderer.h"
#include "camera.h"
#include "terrain.h"
#include "unit_renderer.h"
#include "bot_manager.h"
#include "particle_system.h"
#include <chrono>
#include <cstdint>
#include <cstdio>

static DX12Renderer g_renderer;
static Camera g_camera;
static Terrain g_terrain;
static UnitRenderer g_unit_renderer;
static BotManager g_bots;
static ParticleSystem g_particles;
static HWND g_hwnd = nullptr;
static int g_frame_count = 0;
static float g_fps_timer = 0;
static int g_fps = 0;
static POINT g_last_mouse = {};
static bool g_right_mouse_down = false;
static bool g_running = true;

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_DESTROY:
        g_running = false;
        PostQuitMessage(0);
        return 0;
    case WM_KEYDOWN:
        if (wp == VK_ESCAPE) { g_running = false; PostQuitMessage(0); }
        g_camera.SetKeyState(static_cast<std::uint8_t>(wp), true);
        return 0;
    case WM_KEYUP:
        g_camera.SetKeyState(static_cast<std::uint8_t>(wp), false);
        return 0;
    case WM_RBUTTONDOWN:
        g_right_mouse_down = true;
        GetCursorPos(&g_last_mouse);
        SetCapture(hwnd);
        return 0;
    case WM_RBUTTONUP:
        g_right_mouse_down = false;
        ReleaseCapture();
        return 0;
    case WM_MOUSEMOVE:
        if (g_right_mouse_down) {
            POINT pt;
            GetCursorPos(&pt);
            g_camera.OnMouseMove(pt.x - g_last_mouse.x, pt.y - g_last_mouse.y, true);
            g_last_mouse = pt;
        }
        return 0;
    case WM_MOUSEWHEEL:
        g_camera.OnMouseWheel(GET_WHEEL_DELTA_WPARAM(wp));
        return 0;
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE, LPSTR, int) {
    constexpr std::uint32_t kWidth = 1280;
    constexpr std::uint32_t kHeight = 720;

    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.lpszClassName = L"FactionClash";
    RegisterClassExW(&wc);

    RECT rect = {0, 0, static_cast<LONG>(kWidth), static_cast<LONG>(kHeight)};
    AdjustWindowRect(&rect, WS_OVERLAPPEDWINDOW, FALSE);

    g_hwnd = CreateWindowExW(
        0, L"FactionClash", L"Faction Clash - DX12 Battle Viewer",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT,
        rect.right - rect.left, rect.bottom - rect.top,
        nullptr, nullptr, hInst, nullptr);

    if (!g_hwnd) return 1;
    ShowWindow(g_hwnd, SW_SHOW);
    UpdateWindow(g_hwnd);

    if (!g_renderer.Init(g_hwnd, kWidth, kHeight)) {
        MessageBoxW(g_hwnd, L"Failed to initialize DX12", L"Error", MB_OK);
        return 1;
    }

    g_camera.Init(static_cast<float>(kWidth) / static_cast<float>(kHeight));
    g_terrain.Init(g_renderer);
    g_unit_renderer.Init(g_renderer, 512);
    g_particles.Init(g_renderer, 2000);
    g_bots.Start("127.0.0.1", 7778, 150, 150);

    // Main loop
    MSG msg = {};
    while (g_running) {
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
            if (msg.message == WM_QUIT) g_running = false;
        }
        if (!g_running) break;

        static auto last_time = std::chrono::high_resolution_clock::now();
        auto now = std::chrono::high_resolution_clock::now();
        float dt = std::chrono::duration<float>(now - last_time).count();
        last_time = now;
        g_camera.Update(dt);

        // FPS counter in title bar
        g_frame_count++;
        g_fps_timer += dt;
        if (g_fps_timer >= 1.0f) {
            g_fps = g_frame_count;
            g_frame_count = 0;
            g_fps_timer -= 1.0f;

            std::vector<UnitInstance> tmp;
            g_bots.GetInstances(tmp);
            wchar_t title[256];
            swprintf_s(title, L"Faction Clash - %d units | %d FPS", static_cast<int>(tmp.size()), g_fps);
            SetWindowTextW(g_hwnd, title);
        }

        float clear_color[] = {0.08f, 0.08f, 0.12f, 1.0f};
        g_renderer.BeginFrame(clear_color);
        auto vp = g_camera.GetVPMatrix();
        g_terrain.Render(g_renderer.GetCommandList(), vp);

        std::vector<UnitInstance> instances;
        g_bots.GetInstances(instances);
        g_unit_renderer.Update(instances);
        g_unit_renderer.Render(g_renderer.GetCommandList(), g_camera);

        g_particles.Update(dt);
        g_particles.Render(g_renderer.GetCommandList(), g_camera);

        g_renderer.EndFrame();
    }

    g_bots.Stop();
    g_renderer.Shutdown();
    return 0;
}
