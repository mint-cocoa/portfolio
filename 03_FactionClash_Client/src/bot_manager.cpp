#include "bot_manager.h"
#include <chrono>
#include <string>

// Initialize Winsock once
static bool InitWinsock() {
    static bool done = false;
    if (done) return true;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return false;
    done = true;
    return true;
}

void BotManager::Start(const char* ip, std::uint16_t port,
                       std::uint32_t red_count, std::uint32_t blue_count) {
    if (running_) return;
    running_ = true;

    // Copy ip to avoid dangling
    std::string ip_copy(ip);
    thread_ = std::thread([this, ip_copy, port, red_count, blue_count]() {
        BotThread(ip_copy.c_str(), port, red_count, blue_count);
    });
}

void BotManager::Stop() {
    running_ = false;
    if (thread_.joinable()) thread_.join();
    for (auto& bot : bots_) bot.Disconnect();
}

void BotManager::BotThread(const char* ip, std::uint16_t port,
                           std::uint32_t red_count, std::uint32_t blue_count) {
    InitWinsock();

    // Create bots: 60% infantry, 25% archer, 15% cavalry
    auto make_bots = [&](battle::Faction faction, std::uint32_t count) {
        std::uint32_t inf = static_cast<std::uint32_t>(count * 0.6f);
        std::uint32_t arc = static_cast<std::uint32_t>(count * 0.25f);
        std::uint32_t cav = count - inf - arc;
        for (std::uint32_t i = 0; i < inf; ++i)
            bots_.emplace_back(faction, battle::INFANTRY);
        for (std::uint32_t i = 0; i < arc; ++i)
            bots_.emplace_back(faction, battle::ARCHER);
        for (std::uint32_t i = 0; i < cav; ++i)
            bots_.emplace_back(faction, battle::CAVALRY);
    };

    make_bots(battle::RED, red_count);
    make_bots(battle::BLUE, blue_count);

    // Connect all bots (staggered to avoid overwhelming server)
    for (std::size_t i = 0; i < bots_.size() && running_; ++i) {
        bots_[i].Connect(ip, port);
        if ((i + 1) % 10 == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    // Main bot loop at ~60Hz
    SpatialHash spatial;
    std::vector<SpatialEntry> entries;
    std::vector<const SpatialEntry*> neighbors;
    auto last_time = std::chrono::high_resolution_clock::now();

    while (running_) {
        auto now = std::chrono::high_resolution_clock::now();
        float dt = std::chrono::duration<float>(now - last_time).count();
        last_time = now;
        dt = std::min(dt, 0.1f); // Clamp

        // Build spatial hash from all bots
        entries.clear();
        for (auto& bot : bots_) {
            auto& s = bot.State();
            entries.push_back({s.unit_id, s.x, s.z, s.vx, s.vz,
                              static_cast<std::uint32_t>(s.faction),
                              s.is_dead, s.is_routing});
        }
        spatial.Rebuild(entries, 10.f, 200.f);

        // Update each bot
        for (auto& bot : bots_) {
            if (!bot.IsConnected()) continue;
            spatial.QueryRadius(bot.State().x, bot.State().z, 10.f, neighbors);
            bot.Update(dt, neighbors);
        }

        // Build render instances into back buffer
        back_.clear();
        for (auto& bot : bots_) {
            auto& s = bot.State();
            if (!s.joined) continue;
            UnitInstance inst;
            inst.world_pos = {s.x, 1.5f, s.z};
            inst.scale = 2.5f;
            inst.faction = static_cast<std::uint32_t>(s.faction);
            inst.unit_type = static_cast<std::uint32_t>(s.unit_type);
            inst.morale = static_cast<float>(s.morale);
            inst.hp_ratio = s.hp_ratio;
            if (s.is_dead) inst.hp_ratio = 0.f;
            back_.push_back(inst);
        }

        // Swap to front
        {
            std::lock_guard lock(swap_mutex_);
            std::swap(front_, back_);
        }

        // Check if battle ended — reconnect all bots
        bool any_ended = false;
        for (auto& bot : bots_) {
            if (bot.State().battle_ended) {
                any_ended = true;
                break;
            }
        }
        if (any_ended) {
            std::this_thread::sleep_for(std::chrono::seconds(3));
            for (auto& bot : bots_) {
                bot.Disconnect();
            }
            bots_.clear();
            // Recreate bots
            // (For simplicity, just stop the thread — the battle server will auto-reset)
            // A proper implementation would recreate and reconnect bots here.
        }

        // Sleep to target ~60Hz
        auto elapsed = std::chrono::high_resolution_clock::now() - now;
        auto target = std::chrono::microseconds(16667); // ~60Hz
        if (elapsed < target) {
            std::this_thread::sleep_for(target - elapsed);
        }
    }
}

void BotManager::GetInstances(std::vector<UnitInstance>& out) {
    std::lock_guard lock(swap_mutex_);
    out = front_;
}
