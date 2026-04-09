#pragma once

#include "bot.h"
#include "spatial_hash.h"
#include "unit_renderer.h"
#include <vector>
#include <thread>
#include <atomic>
#include <mutex>
#include <cstdint>

class BotManager {
public:
    void Start(const char* ip, std::uint16_t port,
               std::uint32_t red_count, std::uint32_t blue_count);
    void Stop();

    // Called from render thread — copies current unit states to instances
    void GetInstances(std::vector<UnitInstance>& out);

    bool IsRunning() const { return running_; }

private:
    void BotThread(const char* ip, std::uint16_t port,
                   std::uint32_t red_count, std::uint32_t blue_count);

    std::vector<Bot> bots_;
    std::thread thread_;
    std::atomic<bool> running_{false};

    // Double-buffer: bot thread writes to back_, render thread reads front_
    std::vector<UnitInstance> front_;
    std::vector<UnitInstance> back_;
    std::mutex swap_mutex_;
};
