#pragma once

#include <DirectXMath.h>
#include <cstdint>

using namespace DirectX;

class Camera {
public:
    void Init(float aspect_ratio);
    void Update(float dt);

    void OnMouseMove(int dx, int dy, bool right_button_down);
    void OnMouseWheel(int delta);
    void SetKeyState(std::uint8_t key, bool pressed) { keys_[key] = pressed; }

    XMMATRIX GetViewMatrix() const;
    XMMATRIX GetProjectionMatrix() const;
    XMMATRIX GetVPMatrix() const;
    XMFLOAT3 GetPosition() const { return position_; }
    XMFLOAT3 GetRight() const;
    XMFLOAT3 GetUp() const;

private:
    XMFLOAT3 position_ = {100.f, 120.f, -20.f};
    float yaw_ = 0.f;           // radians
    float pitch_ = -1.0f;       // ~57 degrees down (close to 45 deg top-down)
    float aspect_ = 16.f / 9.f;
    float fov_ = XMConvertToRadians(60.f);
    float near_z_ = 0.1f;
    float far_z_ = 1000.f;
    float move_speed_ = 60.f;
    float rotate_speed_ = 0.003f;
    float zoom_speed_ = 10.f;
    bool keys_[256] = {};
};
