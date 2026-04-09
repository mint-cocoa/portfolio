#pragma once

#include <vector>
#include <cstdint>
#include <cmath>
#include <algorithm>

struct SpatialEntry {
    std::uint32_t unit_id;
    float x, z;
    float vx, vz;
    std::uint32_t faction;
    bool is_dead;
    bool is_routing;
};

class SpatialHash {
public:
    void Rebuild(const std::vector<SpatialEntry>& entries, float cell_size, float world_size) {
        cell_size_ = cell_size;
        grid_w_ = static_cast<std::uint32_t>(std::ceil(world_size / cell_size));
        cells_.clear();
        cells_.resize(grid_w_ * grid_w_);
        entries_ = entries;
        for (std::size_t i = 0; i < entries_.size(); ++i) {
            auto& e = entries_[i];
            if (e.is_dead) continue;
            int cx = std::clamp(static_cast<int>(e.x / cell_size_), 0, static_cast<int>(grid_w_) - 1);
            int cz = std::clamp(static_cast<int>(e.z / cell_size_), 0, static_cast<int>(grid_w_) - 1);
            cells_[cz * grid_w_ + cx].push_back(static_cast<std::uint32_t>(i));
        }
    }

    void QueryRadius(float cx, float cz, float radius,
                     std::vector<const SpatialEntry*>& out) const {
        out.clear();
        float r_sq = radius * radius;
        int min_x = std::max(0, static_cast<int>((cx - radius) / cell_size_));
        int max_x = std::min(static_cast<int>(grid_w_) - 1, static_cast<int>((cx + radius) / cell_size_));
        int min_z = std::max(0, static_cast<int>((cz - radius) / cell_size_));
        int max_z = std::min(static_cast<int>(grid_w_) - 1, static_cast<int>((cz + radius) / cell_size_));

        for (int gz = min_z; gz <= max_z; ++gz) {
            for (int gx = min_x; gx <= max_x; ++gx) {
                for (auto idx : cells_[gz * grid_w_ + gx]) {
                    auto& e = entries_[idx];
                    float dx = e.x - cx;
                    float dz = e.z - cz;
                    if (dx * dx + dz * dz <= r_sq) {
                        out.push_back(&e);
                    }
                }
            }
        }
    }

private:
    float cell_size_ = 10.f;
    std::uint32_t grid_w_ = 0;
    std::vector<SpatialEntry> entries_;
    std::vector<std::vector<std::uint32_t>> cells_;
};
