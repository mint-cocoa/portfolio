#include "camera.h"
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <algorithm>
#include <cmath>

void Camera::Init(float aspect_ratio) {
    aspect_ = aspect_ratio;
}

void Camera::Update(float dt) {
    XMVECTOR forward = XMVectorSet(
        std::sin(yaw_), 0.f, std::cos(yaw_), 0.f);
    XMVECTOR right = XMVectorSet(
        std::cos(yaw_), 0.f, -std::sin(yaw_), 0.f);
    XMVECTOR up = XMVectorSet(0.f, 1.f, 0.f, 0.f);

    XMVECTOR pos = XMLoadFloat3(&position_);
    float speed = move_speed_ * dt;

    if (keys_['W']) pos = XMVectorAdd(pos, XMVectorScale(forward, speed));
    if (keys_['S']) pos = XMVectorSubtract(pos, XMVectorScale(forward, speed));
    if (keys_['D']) pos = XMVectorAdd(pos, XMVectorScale(right, speed));
    if (keys_['A']) pos = XMVectorSubtract(pos, XMVectorScale(right, speed));
    if (keys_['E'] || keys_[VK_SPACE]) pos = XMVectorAdd(pos, XMVectorScale(up, speed));
    if (keys_['Q'] || keys_[VK_SHIFT]) pos = XMVectorSubtract(pos, XMVectorScale(up, speed));

    XMStoreFloat3(&position_, pos);
}

void Camera::OnMouseMove(int dx, int dy, bool right_button_down) {
    if (!right_button_down) return;
    yaw_ += static_cast<float>(dx) * rotate_speed_;
    pitch_ += static_cast<float>(dy) * rotate_speed_;
    pitch_ = std::clamp(pitch_, -XM_PIDIV2 + 0.01f, XM_PIDIV2 - 0.01f);
}

void Camera::OnMouseWheel(int delta) {
    position_.y -= static_cast<float>(delta) / 120.f * zoom_speed_;
    position_.y = std::clamp(position_.y, 5.f, 500.f);
}

XMMATRIX Camera::GetViewMatrix() const {
    XMVECTOR eye = XMLoadFloat3(&position_);
    XMVECTOR look_dir = XMVectorSet(
        std::sin(yaw_) * std::cos(pitch_),
        std::sin(pitch_),
        std::cos(yaw_) * std::cos(pitch_),
        0.f);
    XMVECTOR target = XMVectorAdd(eye, look_dir);
    XMVECTOR up = XMVectorSet(0.f, 1.f, 0.f, 0.f);
    return XMMatrixLookAtLH(eye, target, up);
}

XMMATRIX Camera::GetProjectionMatrix() const {
    return XMMatrixPerspectiveFovLH(fov_, aspect_, near_z_, far_z_);
}

XMMATRIX Camera::GetVPMatrix() const {
    return XMMatrixMultiply(GetViewMatrix(), GetProjectionMatrix());
}

XMFLOAT3 Camera::GetRight() const {
    XMFLOAT3 r;
    r.x = std::cos(yaw_);
    r.y = 0.f;
    r.z = -std::sin(yaw_);
    return r;
}

XMFLOAT3 Camera::GetUp() const {
    // Billboard up is perpendicular to look direction in the view plane
    XMFLOAT3 u;
    u.x = -std::sin(yaw_) * std::sin(pitch_);
    u.y = std::cos(pitch_);
    u.z = -std::cos(yaw_) * std::sin(pitch_);
    return u;
}
