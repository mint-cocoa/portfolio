#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <WinSock2.h>
#include <WS2tcpip.h>

#include <cstdint>
#include <vector>
#include <functional>

#pragma comment(lib, "ws2_32.lib")

class Network {
public:
    using PacketHandler = std::function<void(std::uint16_t msg_id,
                                             const std::uint8_t* data,
                                             std::uint32_t len)>;

    Network();
    ~Network();

    bool Connect(const char* ip, std::uint16_t port);
    void Disconnect();
    void SetHandler(PacketHandler handler) { handler_ = std::move(handler); }

    void Poll();
    void SendPacket(std::uint16_t msg_id, const std::uint8_t* data, std::uint32_t len);

    template<typename T>
    void SendProto(std::uint16_t msg_id, const T& proto) {
        std::vector<std::uint8_t> buf(proto.ByteSizeLong());
        proto.SerializeToArray(buf.data(), static_cast<int>(buf.size()));
        SendPacket(msg_id, buf.data(), static_cast<std::uint32_t>(buf.size()));
    }

    bool IsConnected() const { return connected_; }

private:
    SOCKET sock_ = INVALID_SOCKET;
    bool connected_ = false;
    std::vector<std::uint8_t> recv_buf_;
    std::size_t recv_len_ = 0;
    PacketHandler handler_;
    static constexpr std::size_t kRecvBufSize = 65536;
    static constexpr std::uint32_t kHeaderSize = 4;
};
