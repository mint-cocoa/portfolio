#pragma once

#include "spatial_hash.h"
#include <vector>
#include <cstdint>
#include <cmath>
#include <algorithm>

struct BoidsConfig {
    float cohesion_w   = 0.3f;
    float separation_w = 0.3f;
    float alignment_w  = 0.3f;
    float seek_w       = 0.4f;
    float flee_w       = 0.0f;
    float neighbor_radius   = 10.0f;
    float separation_radius = 2.0f;
};

struct BoidsResult {
    float fx = 0, fz = 0;
};

inline BoidsResult ComputeBoids(
    float my_x, float my_z,
    float my_vx, float my_vz,
    std::uint32_t my_faction,
    float target_x, float target_z,
    bool fleeing,
    const std::vector<const SpatialEntry*>& neighbors,
    const BoidsConfig& cfg)
{
    float coh_x = 0, coh_z = 0;
    float sep_x = 0, sep_z = 0;
    float ali_x = 0, ali_z = 0;
    std::uint32_t ally_count = 0;

    for (auto* n : neighbors) {
        float dx = n->x - my_x;
        float dz = n->z - my_z;
        float dist = std::sqrt(dx * dx + dz * dz);
        if (dist < 0.001f) continue;

        if (n->faction == my_faction) {
            // Cohesion + Alignment (allies only)
            coh_x += n->x;
            coh_z += n->z;
            ali_x += n->vx;
            ali_z += n->vz;
            ally_count++;
        }

        // Separation (all units)
        if (dist < cfg.separation_radius) {
            float inv = 1.0f / dist;
            sep_x -= dx * inv;
            sep_z -= dz * inv;
        }
    }

    float fx = 0, fz = 0;

    // Cohesion
    if (ally_count > 0) {
        coh_x = coh_x / static_cast<float>(ally_count) - my_x;
        coh_z = coh_z / static_cast<float>(ally_count) - my_z;
        fx += coh_x * cfg.cohesion_w;
        fz += coh_z * cfg.cohesion_w;

        ali_x /= static_cast<float>(ally_count);
        ali_z /= static_cast<float>(ally_count);
        fx += ali_x * cfg.alignment_w;
        fz += ali_z * cfg.alignment_w;
    }

    // Separation
    fx += sep_x * cfg.separation_w;
    fz += sep_z * cfg.separation_w;

    // Seek or Flee
    float dx_t = target_x - my_x;
    float dz_t = target_z - my_z;
    if (fleeing) {
        fx -= dx_t * cfg.flee_w;
        fz -= dz_t * cfg.flee_w;
    } else {
        fx += dx_t * cfg.seek_w;
        fz += dz_t * cfg.seek_w;
    }

    return {fx, fz};
}
