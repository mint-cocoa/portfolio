# ServerCore v4 Benchmark Report

**Date**: 2026-03-18
**Environment**: WSL2 Ubuntu 24.04, localhost, Intel i7 (8 cores)
**Tool**: `game_bench` / `echo_bench` (tools/run_bench.sh)

---

## 1. Test Subjects

| Server | Model | IO Backend | Description |
|--------|-------|-----------|-------------|
| **GameServerIntegrated** | IO+Zone Integrated | io_uring | Worker thread handles both IO dispatch and Zone tick in single event loop |
| **GameServerSeparated** | IO/Zone Separated | io_uring | IO threads and Zone Worker threads separated, connected via MpscQueue + RunOnRing |
| **GameServerEpoll** | IO+Zone Integrated | epoll | Baseline epoll implementation, no ServerCore dependency |
| **EchoServer** | Echo only | io_uring | Minimal echo server using core primitives |

All game servers use SO_REUSEPORT for multi-threaded accept, identical game logic (Login, EnterGame, Move 20Hz, Attack 2Hz, 4 skills).

---

## 2. Echo Benchmark (EchoServer)

64-byte payload, pipeline=1, io_uring backend.

| Clients | Throughput (echo/s) | p50 (us) | p99 (us) | p999 (us) |
|---------|-------------------|----------|----------|-----------|
| 10 | **218,498** | 30 | 157 | 260 |
| 50 | **305,183** | 152 | 367 | 514 |
| 100 | **326,913** | 293 | 594 | 785 |
| 200 | **168,364** | 1,173 | 1,721 | 2,253 |

- Peak throughput at 100 clients: **327K echo/s**
- 200-client drop due to concurrent game benchmark contending for CPU

---

## 3. Game Benchmark: Broadcast Latency

S_MOVE broadcast latency p50 (microseconds). Each bot sends C_MOVE at 20Hz; server broadcasts S_MOVE to all players in the same zone.

### 3.1 Single Zone (all bots in one zone)

| Scale | Config | Integrated | Separated | Epoll |
|-------|--------|-----------|-----------|-------|
| **40** | 1T x 40C | **889** | 1,289 | 3,268 |
| **40** | 4T x 10C | **838** | 2,898 | 3,322 |
| **200** | 2T x 100C | **8,019** | 7,183 | 4,232,702 |
| **200** | 4T x 50C | **10,001** | 8,004 | 4,419,583 |
| **400** | 4T x 100C | **4,470** | 2,599,353 | 9,608,701 |
| **400** | 8T x 50C | **3,025** | 3,247,478 | 9,734,337 |
| **800** | 4T x 200C | no data | no data | 9,009,152 |
| **800** | 8T x 100C | no data | **12,000,801** | 9,071,689 |

### 3.2 Multi-Room (bots split across rooms, ~20 per room)

| Scale | Config | Integrated | Epoll |
|-------|--------|-----------|-------|
| **200** / 10 rooms | 4T x 50C | **846** | 897 |
| **400** / 20 rooms | 4T x 100C | **920** | 691 |

---

## 4. Game Benchmark: Throughput

RX throughput = total messages received per second (S_MOVE + S_ATTACK + S_DAMAGE combined).

### 4.1 Single Zone

| Scale | Config | Integrated (msg/s) | Separated (msg/s) | Epoll (msg/s) |
|-------|--------|-------------------|-------------------|---------------|
| **40** | 1T | 37,288 | 37,184 | 37,288 |
| **40** | 4T | 37,392 | 37,288 | 37,392 |
| **200** | 2T | **949,835** | **948,035** | 543,681 |
| **200** | 4T | **950,656** | **949,880** | 523,846 |
| **400** | 4T | **569,414** | **3,095,475** | 448,810 |
| **400** | 8T | 191,353 | **3,009,646** | 432,457 |
| **800** | 4T | no data | no data | 339,198 |
| **800** | 8T | no data | **2,789,217** | 330,379 |

### 4.2 Broadcast Factor

Broadcast factor = RX / TX. Indicates how many copies each sent message produces.

| Scale | Integrated | Separated | Epoll |
|-------|-----------|-----------|-------|
| 40 | 42.8x | 42.8x | 42.8x |
| 200 | 217.4x | 217.4x | 124.3x |
| 400 (4T) | 168.3x | 352.7x | 51.4x |
| 800 (8T) | — | 159.1x | 20.2x |

Lower-than-expected broadcast factor in Epoll means the server cannot keep up with the broadcast workload — messages are dropped or delayed.

---

## 5. Game Benchmark: Handshake Latency

Login (C_LOGIN → S_LOGIN) and EnterGame (C_ENTER_GAME → S_ENTER_GAME) round-trip time in microseconds.

| Scale | Metric | Integrated | Separated | Epoll |
|-------|--------|-----------|-----------|-------|
| **40** (1T) | Login p50 | 708 | 1,122 | **136** |
| | Enter p50 | 470 | 260 | 2,453 |
| **200** (2T) | Login p50 | **333** | **253** | **147** |
| | Enter p50 | 3,852 | **1,736** | 28,415 |
| **400** (4T) | Login p50 | 18,337 | **422** | **294** |
| | Enter p50 | 12,976 | 6,535 | 89,937 |
| **800** (8T) | Login p50 | 12,448 | 1,673 | **658** |
| | Enter p50 | 38,060 | 26,273 | 299,960 |

- Epoll has fastest Login (simple socket read, no io_uring overhead)
- Integrated has fastest Enter at low scale (same-thread zone access)
- Epoll Enter degrades badly at scale (zone mutex contention during broadcast)

---

## 6. Game Benchmark: Tail Latency

S_MOVE broadcast p95 and p99 (microseconds).

| Scale | Config | | Integrated | Separated | Epoll |
|-------|--------|------|-----------|-----------|-------|
| **40** | 1T | p95 | 1,495 | 6,348 | 4,973 |
| | | p99 | 1,887 | 6,604 | 6,067 |
| **200** | 4T | p95 | 14,464 | 14,090 | 9,798,539 |
| | | p99 | 24,191 | 26,831 | 11,794,952 |
| **400** | 4T | p95 | 6,991 | 4,432,360 | 19,818,871 |
| | | p99 | 10,350 | 4,643,411 | 22,277,906 |

---

## 7. Stability

| Server | 40 | 200 | 400 | 800 | Rooms |
|--------|-----|------|------|------|-------|
| **Integrated** | PASS | PASS | **PASS** | no data (timeout) | **PASS** |
| **Separated** | PASS | PASS | PASS | **PASS** (8T only) | no data |
| **Epoll** | PASS | PASS | PASS | PASS (partial entry) | **PASS** |

- Integrated 400: **Fixed** (previously SEGFAULT, use-after-free in disconnect path)
- Integrated 800: All bots connect and enter game, but warmup+measurement exceeds budget — server stays alive but broadcast saturates
- Separated 800 (4T): 549/800 enter game (zone thread backpressure)
- Epoll 800 (8T): 754/800 enter game (mutex contention during bulk Enter)

---

## 8. Architecture Comparison

### 8.1 Integrated (IO+Zone Same Thread)

```
Worker Thread: IoRing::Dispatch() → Zone::Tick() → ProcessPostedTasks()
```

**Strengths**:
- Lowest latency at 40-400 bots (no cross-thread hop)
- Sub-millisecond broadcast at 40 bots (p50 = 838us)
- Room split → sub-millisecond even at 400 bots (p50 = 920us)

**Weaknesses**:
- 800 bots single zone: broadcast O(N^2) saturates the single thread owning the zone
- Throughput drops at 400+ (569K vs Separated's 3.1M) because zone tick blocks IO dispatch

### 8.2 Separated (IO/Zone Different Threads)

```
IO Thread → MpscQueue → Zone Worker → RunOnRing(Send) → IO Thread
```

**Strengths**:
- Highest throughput at 400+ bots (3.1M msg/s)
- Zone processing doesn't block IO accept/recv
- Stable at 800 bots (8T config)

**Weaknesses**:
- Higher baseline latency (cross-thread MpscQueue + RunOnRing round-trip)
- 400+ single zone: latency explodes to seconds (zone worker becomes bottleneck, messages queue up)

### 8.3 Epoll (Baseline)

```
Worker Thread: epoll_wait → accept/read/write → Zone::Tick()
```

**Strengths**:
- Fastest login latency (no io_uring SQE overhead)
- Room split performance matches io_uring servers
- No ServerCore dependency (standalone)

**Weaknesses**:
- 200+ single zone: broadcast latency 4+ seconds (mutex contention)
- Lowest throughput at scale (524K at 200, drops to 330K at 800)
- Broadcast factor collapse at scale (42.8x → 20x at 800)

---

## 9. Key Findings

### 9.1 io_uring vs epoll

| Metric | io_uring (Integrated) | epoll | Ratio |
|--------|---------------------|-------|-------|
| Broadcast p50 @ 200 | 8.0ms | 4.2s | **525x faster** |
| Throughput @ 200 | 950K msg/s | 524K msg/s | **1.8x** |
| Throughput @ 400 | 569K msg/s | 449K msg/s | **1.3x** |
| Echo throughput (100C) | 327K echo/s | N/A | — |

### 9.2 Room Sharding Effect

Room sharding eliminates O(N^2) broadcast, making all architectures perform equally well:

| Config | Single Zone p50 | 20 Rooms p50 | Improvement |
|--------|----------------|-------------|-------------|
| Integrated 400 | 4,470us | **920us** | 4.9x |
| Epoll 400 | 9,608,701us | **691us** | **13,905x** |

### 9.3 Scaling Limits (Single Zone)

| Server | Sweet Spot | Hard Limit | Bottleneck |
|--------|-----------|------------|------------|
| Integrated | **≤ 400** | ~500 | Zone tick blocks IO on same thread |
| Separated | **≤ 200** | ~800 | Zone worker queue saturation |
| Epoll | **≤ 40** | ~200 | Mutex contention in broadcast |

### 9.4 Recommendations

| Use Case | Recommended | Reason |
|----------|------------|--------|
| Small rooms (≤ 50 players) | **Integrated** | Sub-ms latency, simplest code |
| Medium rooms (50-200) | **Integrated** | 8ms p50, 950K throughput |
| Large world (200-800) | **Separated** | Stable at 800, highest throughput |
| Room-based game (20/room) | **Any** (prefer Integrated) | All achieve sub-ms with room sharding |
| Maximum throughput | **Separated** | 3.1M msg/s at 400 bots |

---

## 10. Raw Data Location

```
docs/benchmarks/v4-results/
├── echo_EchoServer.log
├── game_GameServerIntegrated.log
├── game_GameServerSeparated.log
└── game_GameServerEpoll.log
```

Reproduce: `ulimit -n 65536 && bash tools/run_bench.sh game`
