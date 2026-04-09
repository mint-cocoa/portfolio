cmake_minimum_required(VERSION 3.22)
project(FactionClash LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Protobuf via vcpkg
find_package(protobuf CONFIG REQUIRED)

add_executable(FactionClash WIN32
    src/main.cpp
    src/dx12_renderer.cpp
    src/camera.cpp
    src/terrain.cpp
    src/unit_renderer.cpp
    src/network.cpp
    src/bot.cpp
    src/bot_manager.cpp
    src/particle_system.cpp
    src/battle.pb.cc
)

target_include_directories(FactionClash PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_definitions(FactionClash PRIVATE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)

target_link_libraries(FactionClash PRIVATE
    d3d12 dxgi d3dcompiler dxguid
    ws2_32
    protobuf::libprotobuf
)
