#include "network.h"
#include <cstring>

Network::Network() {
    recv_buf_.resize(kRecvBufSize);
}

Network::~Network() {
    Disconnect();
}

bool Network::Connect(const char* ip, std::uint16_t port) {
    sock_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock_ == INVALID_SOCKET) return false;

    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, ip, &addr.sin_addr);

    if (connect(sock_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCKET_ERROR) {
        closesocket(sock_);
        sock_ = INVALID_SOCKET;
        return false;
    }

    // Set non-blocking
    u_long mode = 1;
    ioctlsocket(sock_, FIONBIO, &mode);

    connected_ = true;
    recv_len_ = 0;
    return true;
}

void Network::Disconnect() {
    if (sock_ != INVALID_SOCKET) {
        closesocket(sock_);
        sock_ = INVALID_SOCKET;
    }
    connected_ = false;
}

void Network::Poll() {
    if (!connected_) return;

    while (true) {
        int space = static_cast<int>(recv_buf_.size() - recv_len_);
        if (space <= 0) break;

        int n = recv(sock_, reinterpret_cast<char*>(recv_buf_.data() + recv_len_), space, 0);
        if (n > 0) {
            recv_len_ += n;
        } else if (n == 0) {
            Disconnect();
            return;
        } else {
            int err = WSAGetLastError();
            if (err != WSAEWOULDBLOCK) {
                Disconnect();
                return;
            }
            break;
        }
    }

    // Parse packets
    while (recv_len_ >= kHeaderSize) {
        std::uint16_t pkt_size;
        std::memcpy(&pkt_size, recv_buf_.data(), 2);

        if (pkt_size < kHeaderSize || pkt_size > 8192) {
            Disconnect();
            return;
        }

        if (recv_len_ < pkt_size) break;

        std::uint16_t msg_id;
        std::memcpy(&msg_id, recv_buf_.data() + 2, 2);

        if (handler_) {
            handler_(msg_id, recv_buf_.data() + kHeaderSize, pkt_size - kHeaderSize);
        }

        // Shift remaining data
        std::size_t remaining = recv_len_ - pkt_size;
        if (remaining > 0) {
            std::memmove(recv_buf_.data(), recv_buf_.data() + pkt_size, remaining);
        }
        recv_len_ = remaining;
    }
}

void Network::SendPacket(std::uint16_t msg_id, const std::uint8_t* data, std::uint32_t len) {
    if (!connected_) return;

    std::uint16_t total = static_cast<std::uint16_t>(kHeaderSize + len);
    std::vector<std::uint8_t> packet(total);
    std::memcpy(packet.data(), &total, 2);
    std::memcpy(packet.data() + 2, &msg_id, 2);
    if (len > 0) std::memcpy(packet.data() + 4, data, len);

    // Blocking send (small packets, bot thread)
    int sent = 0;
    while (sent < total) {
        int n = send(sock_, reinterpret_cast<const char*>(packet.data() + sent), total - sent, 0);
        if (n == SOCKET_ERROR) {
            Disconnect();
            return;
        }
        sent += n;
    }
}
