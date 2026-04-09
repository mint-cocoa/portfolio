#include "bot.h"
#include "boids.h"
#include "spatial_hash.h"
#include <cmath>
#include <algorithm>

// MsgId values matching server
enum class MsgId : std::uint16_t {
    C_JOIN_BATTLE  = 1,
    C_MOVE         = 2,
    C_ATTACK       = 3,
    C_SCENE_READY  = 5,
    S_BATTLE_INIT    = 101,
    S_SPAWN          = 102,
    S_DESPAWN        = 103,
    S_MOVE           = 104,
    S_MACRO_COMMAND  = 105,
    S_MORALE_UPDATE  = 106,
    S_DAMAGE         = 107,
    S_DEATH          = 108,
    S_BATTLE_END     = 109,
};

Bot::Bot(battle::Faction faction, battle::UnitType unit_type) {
    state_.faction = faction;
    state_.unit_type = unit_type;
    switch (unit_type) {
    case battle::INFANTRY: state_.speed = 1.0f; break;
    case battle::ARCHER:   state_.speed = 0.8f; break;
    case battle::CAVALRY:  state_.speed = 2.0f; break;
    default: break;
    }
}

bool Bot::Connect(const char* ip, std::uint16_t port) {
    net_.SetHandler([this](std::uint16_t id, const std::uint8_t* data, std::uint32_t len) {
        OnPacket(id, data, len);
    });
    if (!net_.Connect(ip, port)) return false;

    // Send C_JoinBattle immediately
    battle::C_JoinBattle join;
    join.set_faction(state_.faction);
    join.set_unit_type(state_.unit_type);
    net_.SendProto(static_cast<std::uint16_t>(MsgId::C_JOIN_BATTLE), join);
    return true;
}

void Bot::Disconnect() {
    net_.Disconnect();
}

void Bot::Update(float dt, const std::vector<const SpatialEntry*>& neighbors) {
    net_.Poll();
    if (!state_.joined || state_.is_dead) return;

    RunLocalAI(dt, neighbors);

    move_timer_ += dt;
    if (move_timer_ >= kMoveInterval) {
        move_timer_ -= kMoveInterval;
        SendMove();
    }
}

void Bot::OnPacket(std::uint16_t msg_id, const std::uint8_t* data, std::uint32_t len) {
    switch (static_cast<MsgId>(msg_id)) {
    case MsgId::S_BATTLE_INIT:   HandleBattleInit(data, len); break;
    case MsgId::S_SPAWN:         HandleSpawn(data, len); break;
    case MsgId::S_MACRO_COMMAND: HandleMacroCommand(data, len); break;
    case MsgId::S_MORALE_UPDATE: HandleMoraleUpdate(data, len); break;
    case MsgId::S_DAMAGE:        HandleDamage(data, len); break;
    case MsgId::S_DEATH:         HandleDeath(data, len); break;
    case MsgId::S_MOVE:          HandleMove(data, len); break;
    case MsgId::S_BATTLE_END:    state_.battle_ended = true; break;
    default: break;
    }
}

void Bot::HandleBattleInit(const std::uint8_t* data, std::uint32_t len) {
    battle::S_BattleInit init;
    if (!init.ParseFromArray(data, static_cast<int>(len))) return;
    state_.unit_id = init.unit_id();
    state_.x = init.spawn_x();
    state_.z = init.spawn_z();
    state_.joined = true;

    // Notify server that client is ready to receive game state
    net_.SendPacket(static_cast<std::uint16_t>(MsgId::C_SCENE_READY), nullptr, 0);
}

void Bot::HandleSpawn(const std::uint8_t* data, std::uint32_t len) {
    battle::S_Spawn spawn;
    if (!spawn.ParseFromArray(data, static_cast<int>(len))) return;
    // Existing unit info received — bot client doesn't track others individually
}

void Bot::HandleMacroCommand(const std::uint8_t* data, std::uint32_t len) {
    battle::S_MacroCommand cmd;
    if (!cmd.ParseFromArray(data, static_cast<int>(len))) return;
    if (cmd.faction() != state_.faction) return;
    state_.current_command = cmd.command();
    state_.target_x = cmd.target_x();
    state_.target_z = cmd.target_z();
}

void Bot::HandleMoraleUpdate(const std::uint8_t* data, std::uint32_t len) {
    battle::S_MoraleUpdate update;
    if (!update.ParseFromArray(data, static_cast<int>(len))) return;
    for (auto& u : update.units()) {
        if (u.unit_id() == state_.unit_id) {
            state_.morale = u.morale();
            state_.is_routing = (u.morale() <= 3);
            break;
        }
    }
}

void Bot::HandleDamage(const std::uint8_t* data, std::uint32_t len) {
    battle::S_Damage dmg;
    if (!dmg.ParseFromArray(data, static_cast<int>(len))) return;
    if (dmg.target_id() == state_.unit_id) {
        float max_hp = 100.f;
        switch (state_.unit_type) {
        case battle::INFANTRY: max_hp = 100.f; break;
        case battle::ARCHER:   max_hp = 60.f; break;
        case battle::CAVALRY:  max_hp = 80.f; break;
        default: break;
        }
        state_.hp_ratio = std::max(0.f, static_cast<float>(dmg.remaining_hp()) / max_hp);
    }
}

void Bot::HandleDeath(const std::uint8_t* data, std::uint32_t len) {
    battle::S_Death death;
    if (!death.ParseFromArray(data, static_cast<int>(len))) return;
    if (death.unit_id() == state_.unit_id) {
        state_.is_dead = true;
    }
}

void Bot::HandleMove(const std::uint8_t* data, std::uint32_t len) {
    // We could update other bots' positions here for more accurate neighbor info,
    // but for simplicity each bot uses its own local position.
}

void Bot::RunLocalAI(float dt, const std::vector<const SpatialEntry*>& neighbors) {
    BoidsConfig cfg;
    if (state_.is_routing) {
        cfg = {0.0f, 0.5f, 0.0f, 0.0f, 1.0f, 10.f, 2.f};
    } else if (state_.current_command == battle::ADVANCE) {
        cfg = {0.3f, 0.3f, 0.3f, 0.4f, 0.0f, 10.f, 2.f};
    } else if (state_.current_command == battle::ENCIRCLE) {
        cfg = {0.2f, 0.4f, 0.2f, 0.5f, 0.0f, 10.f, 2.f};
    } else if (state_.current_command == battle::RETREAT) {
        cfg = {0.1f, 0.3f, 0.1f, 0.0f, 0.8f, 10.f, 2.f};
    } else {
        cfg = {0.1f, 0.4f, 0.1f, 0.5f, 0.0f, 10.f, 2.f};
    }

    bool fleeing = state_.is_routing || state_.current_command == battle::RETREAT;
    auto result = ComputeBoids(state_.x, state_.z, state_.vx, state_.vz,
                               static_cast<std::uint32_t>(state_.faction),
                               state_.target_x, state_.target_z,
                               fleeing, neighbors, cfg);

    float speed = state_.speed * kMaxSpeed;
    float len = std::sqrt(result.fx * result.fx + result.fz * result.fz);
    if (len > 0.001f) {
        state_.vx = (result.fx / len) * speed;
        state_.vz = (result.fz / len) * speed;
    }
    state_.x += state_.vx * dt;
    state_.z += state_.vz * dt;
    state_.x = std::clamp(state_.x, 1.f, 199.f);
    state_.z = std::clamp(state_.z, 1.f, 199.f);
}

void Bot::SendMove() {
    battle::C_Move move;
    move.set_x(state_.x);
    move.set_z(state_.z);
    move.set_vx(state_.vx);
    move.set_vz(state_.vz);
    net_.SendProto(static_cast<std::uint16_t>(MsgId::C_MOVE), move);
}
