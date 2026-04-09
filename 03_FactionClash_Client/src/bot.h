#pragma once

#include "network.h"
#include "battle.pb.h"
#include <cstdint>

struct SpatialEntry;

struct BotUnitState {
    std::uint32_t unit_id = 0;
    battle::Faction faction = battle::RED;
    battle::UnitType unit_type = battle::INFANTRY;
    float x = 0, z = 0;
    float vx = 0, vz = 0;
    std::int32_t morale = 10;
    float hp_ratio = 1.0f;
    bool is_dead = false;
    bool is_routing = false;
    float speed = 1.0f;

    // Macro command from supervisor
    battle::MacroType current_command = battle::ADVANCE;
    float target_x = 100.f, target_z = 100.f;
    bool joined = false;
    bool battle_ended = false;
};

class Bot {
public:
    Bot(battle::Faction faction, battle::UnitType unit_type);

    bool Connect(const char* ip, std::uint16_t port);
    void Update(float dt, const std::vector<const SpatialEntry*>& neighbors);
    void Disconnect();

    const BotUnitState& State() const { return state_; }
    bool IsConnected() const { return net_.IsConnected(); }
    bool HasJoined() const { return state_.joined; }

private:
    void OnPacket(std::uint16_t msg_id, const std::uint8_t* data, std::uint32_t len);
    void HandleBattleInit(const std::uint8_t* data, std::uint32_t len);
    void HandleSpawn(const std::uint8_t* data, std::uint32_t len);
    void HandleMacroCommand(const std::uint8_t* data, std::uint32_t len);
    void HandleMoraleUpdate(const std::uint8_t* data, std::uint32_t len);
    void HandleDamage(const std::uint8_t* data, std::uint32_t len);
    void HandleDeath(const std::uint8_t* data, std::uint32_t len);
    void HandleMove(const std::uint8_t* data, std::uint32_t len);
    void RunLocalAI(float dt, const std::vector<const SpatialEntry*>& neighbors);
    void SendMove();

    Network net_;
    BotUnitState state_;
    float move_timer_ = 0;
    static constexpr float kMoveInterval = 0.05f; // 20Hz
    static constexpr float kMaxSpeed = 5.0f;
};
